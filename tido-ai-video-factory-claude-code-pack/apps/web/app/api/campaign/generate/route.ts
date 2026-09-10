import { NextRequest, NextResponse } from "next/server";
import { CampaignOrchestratorService } from "@/lib/image-engine/campaign/CampaignOrchestratorService";
import {
  ALL_CAMPAIGN_ASSET_TYPES,
  CampaignAssetType,
  CampaignBriefInput,
  CampaignReferenceImage,
} from "@/lib/image-engine/campaign/campaign.types";

export const runtime = "nodejs";

/**
 * One brief in, one campaign package out.
 *
 * Accepts JSON (no reference images) or multipart/form-data (with them).
 *
 * `dryRun` defaults to TRUE. A five-asset campaign is five paid renders, so the
 * planning pass — concept, adaptation, prompts and package structure — is the
 * default and rendering is opt-in. Set dryRun=false only when the plan has been
 * reviewed.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const contentType = req.headers.get("content-type") || "";
    let brief: CampaignBriefInput;
    let dryRun = true;
    let includePrompts = false;
    // Phase 3.1 — undefined means "use CIOS_REASONING_ENABLED". Only an explicit
    // value in the request overrides the environment flag.
    let ciosReasoning: boolean | undefined;

    const parseAssetTypes = (raw: unknown): CampaignAssetType[] | undefined => {
      if (!raw) return undefined;
      const list = Array.isArray(raw) ? raw : String(raw).split(",");
      const cleaned = list
        .map((v) => String(v).trim())
        .filter((v): v is CampaignAssetType => (ALL_CAMPAIGN_ASSET_TYPES as string[]).includes(v));
      return cleaned.length > 0 ? cleaned : undefined;
    };

    if (contentType.includes("application/json")) {
      const body = await req.json();
      dryRun = body.dryRun !== false;
      includePrompts = body.includePrompts === true;
      if (typeof body.ciosReasoning === "boolean") ciosReasoning = body.ciosReasoning;
      brief = {
        brand: body.brand,
        product: body.product,
        audience: body.audience,
        objective: body.objective,
        channel: body.channel,
        tone: body.tone,
        industry: body.industry,
        concept: body.concept,
        brandInfo: body.brandInfo,
        copyItems: body.copyItems,
        hardRequirements: body.hardRequirements,
        assetTypes: parseAssetTypes(body.assetTypes),
        ratioOverrides: body.ratioOverrides,
        campaignId: body.campaignId,
      };
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const str = (k: string) => {
        const v = form.get(k);
        return typeof v === "string" && v.trim() ? v.trim() : undefined;
      };
      dryRun = str("dryRun") !== "false";
      includePrompts = str("includePrompts") === "true";
      const ciosRaw = str("ciosReasoning");
      if (ciosRaw === "true" || ciosRaw === "false") ciosReasoning = ciosRaw === "true";

      const references: CampaignReferenceImage[] = [];
      const pushFiles = async (key: string, role: CampaignReferenceImage["role"]) => {
        for (const item of form.getAll(key)) {
          if (item instanceof File) {
            const buf = Buffer.from(await item.arrayBuffer());
            references.push({
              reference_id: `REF_${String(references.length + 1).padStart(2, "0")}`,
              buffer: buf,
              mimeType: item.type || "image/png",
              filename: item.name,
              role,
            });
          }
        }
      };
      // Product first, then logo, then inspiration: reference order is positional
      // downstream, and the adapter expects that sequence.
      await pushFiles("images", "PRODUCT");
      await pushFiles("logoImages", "LOGO");
      await pushFiles("inspirationImages", "INSPIRATION_REFERENCE");

      let copyItems: string[] | undefined;
      try {
        const raw = str("copyItems");
        if (raw) copyItems = JSON.parse(raw);
      } catch {
        /* copy is optional; a malformed list simply means no authorised copy */
      }

      brief = {
        brand: str("brand") || "",
        product: str("product") || "",
        audience: str("audience"),
        objective: str("objective"),
        channel: str("channel"),
        tone: str("tone"),
        industry: str("industry"),
        concept: str("concept"),
        brandInfo: str("brandInfo"),
        copyItems,
        assetTypes: parseAssetTypes(str("assetTypes")),
        campaignId: str("campaignId"),
        references,
      };
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: "Content-Type must be application/json or multipart/form-data.",
          },
        },
        { status: 400 }
      );
    }

    if (!brief.brand?.trim() || !brief.product?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CAMPAIGN_BRIEF",
            message: "Both 'brand' and 'product' are required.",
          },
        },
        { status: 400 }
      );
    }

    // A full five-asset render can outrun a default serverless budget, so the
    // ceiling is generous but explicit rather than open-ended.
    const timeoutMs = dryRun ? 120000 : 600000;
    let timeoutId: any;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Campaign run timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    const orchestrator = new CampaignOrchestratorService();
    let result;
    try {
      result = await Promise.race([orchestrator.run(brief, { dryRun, ciosReasoning }), timeout]);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, campaign: result.campaign, error: result.error, diagnostics: result.diagnostics },
        { status: result.error?.code === "INVALID_CAMPAIGN_BRIEF" ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      campaign: result.campaign,
      // The marketing reasoning is returned so a caller can see why the concept
      // is what it is, not just what it concluded.
      strategy: result.strategy,
      // Prompts are ~21 KB each and five of them make a heavy response, so they
      // are omitted by default and always written to the delivery package. The
      // internal test harness asks for them explicitly, because inspecting the
      // exact text sent to the model is the whole point of that page.
      assets: result.assets.map((a) => ({
        ...a,
        final_prompt: includePrompts ? a.final_prompt : undefined,
        prompt_available_at: a.error ? undefined : `${result.delivery?.package_root ?? ""}`,
      })),
      delivery: result.delivery,
      diagnostics: result.diagnostics,
      // Phase 3.1 — the parallel CIOS reasoning trace. Observation only: nothing
      // above was produced from it. Carries `{ enabled: false }` when the flag is
      // off, so a caller can tell "not run" from "ran and found nothing".
      cios_reasoning: result.cios_reasoning,
    });
  } catch (err: any) {
    console.error("[CAMPAIGN][ERROR]", { message: err?.message, stack: err?.stack });
    return NextResponse.json(
      {
        success: false,
        error: { code: "CAMPAIGN_RUN_FAILED", message: err?.message || "Campaign generation failed." },
        diagnostics: { duration_ms: Date.now() - startedAt },
      },
      { status: 500 }
    );
  }
}
