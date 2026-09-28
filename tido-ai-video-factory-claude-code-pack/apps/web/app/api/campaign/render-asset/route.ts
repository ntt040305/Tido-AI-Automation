import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider } from "@tido/infrastructure";
import { chargeRender } from "@/lib/security/render-rate-limit";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { ImgStudioImageGenerationProvider } from "@/lib/image-engine/provider/ImgStudioImageGenerationProvider";
import { ProviderReferenceImage } from "@/lib/image-engine/provider/ImageGenerationProvider";
import { LocalGeneratedImageStorage } from "@/lib/image-engine/storage/LocalGeneratedImageStorage";
import {
  assetDownloadName,
  buildAssetExportMetadata,
  extensionForMime,
} from "@/lib/image-engine/delivery/export-metadata";

export const runtime = "nodejs";

/**
 * Renders ONE already-compiled asset prompt.
 *
 * The campaign run is a planning pass by default: it produces five prompts and
 * spends nothing. This endpoint is what turns a single one of those prompts into
 * pixels, so a reviewer can render the asset they are unsure about instead of
 * paying for all five.
 *
 * It deliberately does no creative work. The prompt arrives already compiled by
 * the campaign pipeline; re-deriving it here would mean a second, divergent
 * source of truth for what was actually sent to the model.
 *
 * Alongside the image it returns an export metadata record — dimensions, prompt,
 * generation settings and layout regions — so the render can later be rebuilt as
 * an editable document. See delivery/export-metadata.ts.
 *
 * Stateless by design: the caller re-sends its reference images. Storing campaign
 * state between requests would mean a database, which this phase does not need.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  // Phase 10.3 — a ceiling on paid renders per caller.
  //
  // Anonymous rendering is deliberate here, so this does not authenticate:
  // it only stops one caller spending without limit. A verified subject gets
  // its own bucket so a signed-in person is not starved by anonymous traffic.
  {
    const identity = await getIdentityProvider().identify(req).catch(() => null);
    const rate = chargeRender(req, identity?.firebaseUid ?? null);
    if (!rate.ok) {
      console.warn("[RATE_LIMIT] paid render refused", { bucket: rate.bucket, retry_after_s: rate.retryAfter });
      return NextResponse.json(
        { error: "Too many renders in a short time. Wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
      );
    }
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let prompt = "";
    let aspectRatio = "1:1";
    let assetType = "asset";
    let assetLabel = "";
    let useCase = "";
    let assetGoal = "";
    let campaignId = "campaign";
    let campaignName = "";
    let brand = "";
    let layoutZones: { role: string; x: number; y: number; width: number; height: number }[] = [];
    const references: ProviderReferenceImage[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const str = (k: string, fallback = "") => {
        const v = form.get(k);
        return typeof v === "string" && v.trim() ? v.trim() : fallback;
      };

      prompt = str("prompt");
      aspectRatio = str("aspectRatio", "1:1");
      assetType = str("assetType", "asset");
      assetLabel = str("assetLabel", assetType);
      useCase = str("useCase");
      assetGoal = str("assetGoal");
      campaignId = str("campaignId", "campaign");
      campaignName = str("campaignName");
      brand = str("brand");

      try {
        const raw = str("layoutZones");
        if (raw) layoutZones = JSON.parse(raw);
      } catch {
        /* Layout geometry is optional; a malformed list simply means no layers. */
      }

      let index = 0;
      for (const item of form.getAll("images")) {
        if (item instanceof File) {
          index++;
          references.push({
            reference_id: `REF_${String(index).padStart(2, "0")}`,
            product_id: "PRODUCT_01",
            role: "PRODUCT",
            mimeType: item.type || "image/png",
            buffer: Buffer.from(await item.arrayBuffer()),
            filename: item.name || `ref_${index}.png`,
          });
        }
      }
    } else {
      const body = await req.json();
      prompt = String(body.prompt || "");
      aspectRatio = String(body.aspectRatio || "1:1");
      assetType = String(body.assetType || "asset");
      assetLabel = String(body.assetLabel || assetType);
      useCase = String(body.useCase || "");
      assetGoal = String(body.assetGoal || "");
      campaignId = String(body.campaignId || "campaign");
      campaignName = String(body.campaignName || "");
      brand = String(body.brand || "");
      if (Array.isArray(body.layoutZones)) layoutZones = body.layoutZones;
    }

    if (!prompt.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_PROMPT", message: "A compiled prompt is required." } },
        { status: 400 }
      );
    }

    if (!IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_ASPECT_RATIO",
            message: `Aspect ratio ${aspectRatio} is not renderable. Supported: ${IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS.join(", ")}.`,
          },
        },
        { status: 400 }
      );
    }

    // A fresh id per attempt: reusing one across retries makes the provider
    // reject the retry on its idempotency key.
    const generationId = `gen_${campaignId}_${assetType}_${Date.now()}`;
    const model = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
    const imageSize = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "2K";

    const provider = new ImgStudioImageGenerationProvider();
    const res = await provider.generateImage({
      model,
      prompt,
      references,
      aspectRatio,
      imageSize,
      mimeType: "image/png",
      generationId,
      idempotencyKey: generationId,
    });

    if (!res.success) {
      return NextResponse.json(
        {
          success: false,
          error: res.error || { code: "GENERATION_FAILED", message: "Provider render failed." },
          duration_ms: Date.now() - startedAt,
        },
        { status: res.error?.code === "PROVIDER_TIMEOUT" ? 504 : 502 }
      );
    }

    // The extension follows the bytes the provider actually returned. This path
    // emits WebP, so hardcoding ".png" would hand designers a file whose name
    // lies about its contents — the kind of mismatch Photoshop rejects on open.
    const renderedMime = res.mimeType || "image/png";
    const downloadFilename = assetDownloadName({
      brand: brand || campaignId,
      assetLabel: assetLabel || assetType,
      campaignName: campaignName || campaignId,
      extension: extensionForMime(renderedMime),
    });

    const exportMetadata = buildAssetExportMetadata({
      assetName: downloadFilename.replace(/\.[a-z0-9]+$/i, ""),
      assetType,
      useCase: useCase || undefined,
      assetGoal: assetGoal || undefined,
      campaignId,
      campaignName: campaignName || campaignId,
      brand: brand || "",
      aspectRatio,
      generationId,
      provider: "imgstudio",
      model,
      imageSize,
      mimeType: renderedMime,
      prompt,
      referenceCount: references.length,
      durationMs: Date.now() - startedAt,
      imageBuffer: res.imageBuffer,
      layoutZones,
    });

    let imageUrl = res.imageUrl || res.remoteDetails?.url;
    if (res.imageBuffer) {
      try {
        const saved = await new LocalGeneratedImageStorage().saveAsset({
          generation_id: generationId,
          imageBuffer: res.imageBuffer,
          mimeType: res.mimeType || "image/png",
          masterPrompt: prompt,
          // The export record is persisted with the asset so a file recovered
          // from disk still knows its dimensions, settings and layout regions.
          metadata: {
            generation_id: generationId,
            campaign_id: campaignId,
            asset_type: assetType,
            aspect_ratio: aspectRatio,
            download_filename: downloadFilename,
            export_metadata: exportMetadata,
          },
        });
        imageUrl = saved.url;
      } catch (err: any) {
        console.warn("[CAMPAIGN_RENDER][STORAGE_WARN]", err?.message || err);
      }
    }

    return NextResponse.json({
      success: true,
      generation_id: generationId,
      asset_type: assetType,
      aspect_ratio: aspectRatio,
      image_url: imageUrl,
      /** Suggested browser download name, e.g. Skin1004_Poster_CampaignName.png */
      download_filename: downloadFilename,
      export_metadata: exportMetadata,
      provider: res.remoteDetails,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.error("[CAMPAIGN_RENDER][ERROR]", { message: err?.message });
    return NextResponse.json(
      {
        success: false,
        error: { code: "RENDER_FAILED", message: err?.message || "Asset render failed." },
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
