import { NextRequest, NextResponse } from "next/server";
import { PipelineRouter } from "@/lib/image-engine/evolution/PipelineRouter";
import { getIdentityProvider, getInfrastructure } from "@tido/infrastructure";
import { loadKitForIdentity } from "@/lib/user-kit/kit-memory";
import { recallForBrief } from "@/lib/persistence/recall-memory";
import { preferenceDecisions } from "@/lib/image-engine/evolution/experiment/UserKit";
import { recordGeneration } from "@/lib/persistence/record-generation";
import { loadBrandKitForRender, type LoadedBrandKit } from "@/lib/brand-kit/brand-kit-store";
import { SimpleInputRequestV1, AssetRoleV1 } from "@/lib/image-engine/types";

export const runtime = "nodejs";

/**
 * Where the wall clock goes at the API boundary.
 *
 * Measured across three renders: the orchestrator reported 112,877ms of a
 * 147,474ms request, and the 34,597ms difference lived somewhere between the
 * socket and the pipeline call with nothing watching it. The gap grew with the
 * number of attachments — 255ms at one image, 19,358ms at two, 34,597ms at
 * three — which is the shape of work done per image, not of a fixed overhead.
 *
 * Timestamps only. Nothing here changes what the route does or what it returns.
 */
export async function POST(req: NextRequest) {
  const T_received = Date.now();
  // Phase 5.4. The Brand Kit the client asked for. An id, not a kit: what it
  // resolves to is decided below, against the verified person's workspaces.
  let brandKitId: string | null = null;
  // Phase 5.5. Editable mode was asked for. Honoured only for a verified
  // person, below: the layered files it produces are account-scoped exports.
  let editableRequested = false;
  let tFormDone = T_received;
  let tExtractDone = T_received;
  let tBuffersDone = T_received;
  let tRequestBuilt = T_received;
  let tPipelineDone = T_received;
  let attachmentBytes = 0;
  let attachmentCount = 0;
  let bufferMs = 0;

  try {
    const contentType = req.headers.get("content-type") || "";

    let simpleRequest: SimpleInputRequestV1;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      brandKitId = typeof body.brandKitId === "string" && body.brandKitId ? body.brandKitId : null;
      editableRequested = body.editableExport === true;
      simpleRequest = {
        images: body.images || body.references || [],
        concept: body.concept || "",
        contentMessage: body.contentMessage || "",
        useCase: body.useCase || "Poster",
        aspectRatio: body.aspectRatio || "1:1",
        brandName: body.brandName,
        brandInfo: body.brandInfo,
        copyItems: body.copyItems,
        hardRequirements: body.hardRequirements,
        requestId: body.requestId,
        marketingContext: body.marketingContext,
        creativeDirection: body.creativeDirection,
        salesContext: body.salesContext,
      };
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      tFormDone = Date.now();
      const concept = (formData.get("concept") as string) || "";
      const contentMessage = (formData.get("contentMessage") as string) || "";
      const useCase = (formData.get("useCase") as string) || "Poster";
      const aspectRatio = (formData.get("aspectRatio") as string) || "1:1";
      const brandName = (formData.get("brandName") as string) || undefined;
      brandKitId = (formData.get("brandKitId") as string) || null;
      editableRequested = formData.get("editableExport") === "1";

      let marketingContext: any;
      let creativeDirection: any;
      let salesContext: any;
      let copyItems: any;

      // Authorized visible copy travels on the multipart branch too. Without this
      // the compiler saw an empty copy list on every request that carried an image
      // and emitted "do NOT render words" into the prompt.
      try {
        const copyRaw = formData.get("copyItems") as string;
        if (copyRaw) {
          const parsed = JSON.parse(copyRaw);
          if (Array.isArray(parsed) && parsed.length > 0) copyItems = parsed;
        }
      } catch (e) { }

      try {
        const mcRaw = formData.get("marketingContext") as string;
        if (mcRaw) marketingContext = JSON.parse(mcRaw);
      } catch (e) { }

      try {
        const cdRaw = formData.get("creativeDirection") as string;
        if (cdRaw) creativeDirection = JSON.parse(cdRaw);
      } catch (e) { }

      try {
        const scRaw = formData.get("salesContext") as string;
        if (scRaw) salesContext = JSON.parse(scRaw);
      } catch (e) { }

      console.log("[SIMPLE RATIO][ROUTE]", {
        rawAspectRatio: formData.get("aspectRatio"),
        parsedAspectRatio: aspectRatio,
        length: aspectRatio ? aspectRatio.length : 0,
        charCodes: aspectRatio ? [...aspectRatio].map((c) => c.charCodeAt(0)) : [],
      });

      const rawImages = formData.getAll("images");
      const rawInspirationImages = formData.getAll("inspirationImages");
      // Phase 5.4: a logo arrives under its own key with an explicit role. In
      // "images" it defaulted to PRODUCT and could be read as the product.
      const rawLogoImages = formData.getAll("logoImages");
      tExtractDone = Date.now();
      const parsedImages: {
        reference_id: string;
        buffer: Buffer;
        mimeType: string;
        filename: string;
        role?: AssetRoleV1;
      }[] = [];

      for (let i = 0; i < rawImages.length; i++) {
        const item = rawImages[i];
        if (item instanceof File) {
          const bStart = Date.now();
          const arrayBuffer = await item.arrayBuffer();
          bufferMs += Date.now() - bStart;
          attachmentBytes += arrayBuffer.byteLength;
          parsedImages.push({
            reference_id: `REF_${String(i + 1).padStart(2, "0")}`,
            buffer: Buffer.from(arrayBuffer),
            mimeType: item.type || "image/png",
            filename: item.name || `ref_${i + 1}.png`,
          });
        }
      }

      // Inspiration references are appended AFTER product references and keep the SAME
      // positional REF_NN id scheme. Several stages (notably the router fallback in
      // KnowledgeRouterService) rebuild reference ids positionally from the image array.
      // A decorated id such as REF_02_INSPIRATION does not match what those stages
      // generate, which produced a phantom REF_02 classified as a second PRODUCT and
      // inflated the product count. The role field alone carries the distinction.
      for (let i = 0; i < rawInspirationImages.length; i++) {
        const item = rawInspirationImages[i];
        if (item instanceof File) {
          const bStart = Date.now();
          const arrayBuffer = await item.arrayBuffer();
          bufferMs += Date.now() - bStart;
          attachmentBytes += arrayBuffer.byteLength;
          const index = parsedImages.length + 1;
          parsedImages.push({
            reference_id: `REF_${String(index).padStart(2, "0")}`,
            buffer: Buffer.from(arrayBuffer),
            mimeType: item.type || "image/png",
            filename: item.name || `inspiration_${i + 1}.png`,
            role: "INSPIRATION_REFERENCE",
          });
        }
      }

      for (const item of rawLogoImages) {
        if (item instanceof File) {
          const arrayBuffer = await item.arrayBuffer();
          attachmentBytes += arrayBuffer.byteLength;
          parsedImages.push({
            reference_id: `REF_${String(parsedImages.length + 1).padStart(2, "0")}`,
            buffer: Buffer.from(arrayBuffer),
            mimeType: item.type || "image/png",
            filename: item.name || "logo.png",
            role: "LOGO",
          });
        }
      }

      tBuffersDone = Date.now();
      attachmentCount = parsedImages.length;

      console.log("[INSPIRATION_TRANSPORT][ROUTE]", {
        received_product_images: rawImages.length,
        received_inspiration_images: rawInspirationImages.length,
        attachments: parsedImages.map((p) => ({
          reference_id: p.reference_id,
          filename: p.filename,
          role: p.role || "PRODUCT (default)",
          bytes: p.buffer.length,
        })),
      });

      simpleRequest = {
        images: parsedImages,
        concept,
        contentMessage,
        useCase,
        aspectRatio,
        brandName,
        copyItems,
        marketingContext,
        creativeDirection,
        salesContext,
      };
      tRequestBuilt = Date.now();
    } else {
      return NextResponse.json(
        {
          success: false,
          status: "INVALID_REQUEST",
          error: {
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: "Content-Type must be application/json or multipart/form-data.",
          },
        },
        { status: 400 }
      );
    }

    const timeoutMs = 180000;
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Generation pipeline execution timed out after 180s")), timeoutMs);
    });

    let result: any;
    try {
      // The only line this phase changes in the stable request path.
      //
      // Phase 5.5.5: every request is served by the one creative pipeline.
      // There is no tester id and no rollout mode to consult; the old
      // `x-tido-tester-id` header is ignored if a client still sends it.

      // What this person keeps asking for, resolved here rather than in the
      // engine. The lookup needs an account; the engine must never have one,
      // so it is done on this side of the boundary and only the resulting
      // sentences cross it.
      //
      // Only preferences that already passed the kit's own threshold are
      // included, so nothing here is a single render being mistaken for a
      // taste. Signing out simply yields none.
      // Held for the persistence step below. Resolved from a verified token
      // or null -- never from anything the client asserted.
      let verifiedIdentity: Awaited<ReturnType<ReturnType<typeof getIdentityProvider>["identify"]>> = null;
      let standingPreferences: string[] | undefined;
      // Phase 3.5. What this workspace's own kept work suggests, resolved on
      // this side of the engine boundary like the preferences above it.
      let creativeMemory: string[] | undefined;
      // Phase 4.2. How each creative route has gone for this account, for the
      // Creative Director's selection and the evaluator. Numbers only.
      let routeEvidence: import("@/lib/image-engine/evolution/experiment/DirectionEvaluator").RouteEvidence[] | undefined;
      // Phase 5.4: the Brand Kit, resolved for a verified person only, through
      // the projects repository's membership check. Anonymous renders and ids
      // the person cannot see resolve to nothing, silently: a kit is an
      // assist, never a reason to fail a render.
      let brandKit: LoadedBrandKit | null = null;
      try {
        // Firebase is the only thing that decides who this is. A verified
        // token or nobody -- an id in a header or a body is a claim, not an
        // identity.
        const identity = await getIdentityProvider().identify(req);
        verifiedIdentity = identity;
        if (identity) {
          // Phase 3.1 moved where this is stored, not what it does. The read
          // was already here and is preserved exactly: the same threshold, the
          // same sentences, the same `standingPreferences` field. Leaving it
          // pointed at the JSON files after the migration would have made every
          // migrated profile invisible to generation, which is a silent
          // regression of a shipped feature rather than a deferral of a new one.
          const kit = await loadKitForIdentity(identity);
          const active = preferenceDecisions(kit);
          if (active.length) standingPreferences = active.map((p) => p.decision.value);

          // Assets already seen, and patterns this workspace's kept work shows.
          // Capped and diversified before it crosses the boundary; an empty
          // result means "render from the brief alone", which is what the
          // system did for its whole life before it had a memory.
          const recalled = await recallForBrief({
            identity,
            brief: simpleRequest.concept,
            attachments: (simpleRequest.images || []) as { buffer?: Buffer }[],
            kit,
          });
          if (recalled.sentences.length) creativeMemory = recalled.sentences;
          if (recalled.routeEvidence.length) routeEvidence = recalled.routeEvidence;

          if (brandKitId) {
            const actor = await getInfrastructure().identity.resolveActor(identity);
            brandKit = actor.ok ? await loadBrandKitForRender(actor.data, brandKitId) : null;
            // The kit's logo goes to the renderer as the real mark, with an
            // explicit role -- unless the person attached a logo themselves.
            const images = (simpleRequest.images || []) as { role?: string }[];
            if (brandKit?.logo && !images.some((i) => i.role === "LOGO")) {
              simpleRequest.images = [
                ...(simpleRequest.images || []),
                {
                  reference_id: `REF_${String(images.length + 1).padStart(2, "0")}`,
                  buffer: brandKit.logo.buffer,
                  mimeType: brandKit.logo.mimeType,
                  filename: "brand-logo.png",
                  role: "LOGO",
                } as never,
              ];
            }
            console.log("[BRAND_KIT]", { requested: true, resolved: Boolean(brandKit), logo_attached: Boolean(brandKit?.logo) });
          }
          console.log("[RECALL]", recalled.telemetry);
        }
      } catch (e) {
        // Memory is an assist. A failure to read it is never a failure to render.
        console.warn(
          "[USER_KIT] preferences unavailable:",
          e instanceof Error ? e.message : String(e),
        );
      }
      const startedAt = Date.now();
      result = await Promise.race([
        PipelineRouter.run(simpleRequest, undefined, {
          standingPreferences,
          creativeMemory,
          routeEvidence,
          brand: brandKit?.summary.kit ?? null,
          editable: editableRequested && Boolean(verifiedIdentity),
          // The same deadline this route enforces below. Handing it down lets
          // the vision review decline a correction it cannot finish, instead
          // of the race timing out and discarding a picture that already
          // succeeded.
          deadlineAt: Date.now() + timeoutMs,
        }),
        timeoutPromise,
      ]);

      // The picture exists by now. Everything past this line is a record of
      // how it was made, and is not permitted to affect whether it is
      // returned -- hence no await on a value and no branch on the outcome.
      void recordGeneration({
        request: simpleRequest,
        result,
        // The whole verified identity, so the profile keeps its email and name.
        identity: verifiedIdentity,
        // Phase 5.4: the run belongs to the brand it was made for.
        ...(brandKit ? { projectId: brandKit.summary.id, orgId: brandKit.summary.org_id } : {}),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      clearTimeout(timeoutId);
      tPipelineDone = Date.now();
    }

    if (!result.success) {
      const httpStatus =
        result.status === "VALIDATION_FAILED" || result.status === "NO_PRODUCT_REFERENCE"
          ? 400
          : result.status === "PROMPT_BUDGET_EXCEEDED" || result.status === "EXACT_COPY_FAILED"
            ? 422
            : result.status === "PROVIDER_TIMEOUT"
              ? 504
              : 500;

      console.error("[SIMPLE][ERROR]", {
        stage: "SERVER_ROUTE",
        code: result.error?.code || result.status,
        message: result.error?.message || "Generation request failed.",
        status: result.status,
        generationId: result.generationId,
      });

      return NextResponse.json(
        {
          success: false,
          generationId: result.generationId,
          status: result.status,
          useCase: result.useCase,
          aspectRatio: result.aspectRatio,
          error: result.error,
          diagnostics: result.diagnostics,
      // What the creative system decided, in human language. Absent when the
      // experiment pipeline did not run or the brain produced nothing, so a
      // consumer that ignores it sees exactly the response it always saw.
      ...(result.creativeIntelligence ? { creativeIntelligence: result.creativeIntelligence } : {}),
      ...(result.visionAnalysis ? { visionAnalysis: result.visionAnalysis } : {}),
      ...(result.visionReview ? { visionReview: result.visionReview } : {}),
      ...(result.designDecisions ? { designDecisions: result.designDecisions } : {}),
      ...(result.designComparison ? { designComparison: result.designComparison } : {}),
      ...(result.renderComparison ? { renderComparison: result.renderComparison } : {}),
        },
        { status: httpStatus }
      );
    }

    const response = NextResponse.json({
      success: true,
      generationId: result.generationId,
      status: result.status,
      imageUrl: result.imageUrl,
      useCase: result.useCase,
      aspectRatio: result.aspectRatio,
      project: result.project,
      renderJob: result.renderJob,
      contractAsset: result.contractAsset,
      strategy: result.strategy,
      diagnostics: result.diagnostics,
      // What the creative system decided, in human language. Absent when the
      // experiment pipeline did not run or the brain produced nothing, so a
      // consumer that ignores it sees exactly the response it always saw.
      ...(result.creativeIntelligence ? { creativeIntelligence: result.creativeIntelligence } : {}),
      ...(result.visionAnalysis ? { visionAnalysis: result.visionAnalysis } : {}),
      ...(result.visionReview ? { visionReview: result.visionReview } : {}),
      ...(result.designDecisions ? { designDecisions: result.designDecisions } : {}),
      ...(result.designComparison ? { designComparison: result.designComparison } : {}),
      ...(result.renderComparison ? { renderComparison: result.renderComparison } : {}),
      // Phase 5.5. Whether this render has separate layers to export. False
      // whenever Editable mode was not used or could not run (no director, no
      // design document) -- the client then offers the PNG only.
      editableExport: Boolean(
        ((result as unknown as Record<string, unknown>).designDocument as { editable?: unknown } | undefined)?.editable,
      ),
    });
    const tSent = Date.now();

    // One line, at the boundary, so the wall clock can be attributed instead of
    // inferred. Durations and counts only — the payload itself is never logged.
    console.log("[API_TIMING]", {
      generation_id: result.generationId,
      attachments: attachmentCount,
      attachment_bytes: attachmentBytes,
      form_parse_ms: tFormDone - T_received,
      image_extract_ms: tExtractDone - tFormDone,
      image_buffer_ms: bufferMs,
      image_stage_ms: tBuffersDone - tExtractDone,
      request_build_ms: tRequestBuilt - tBuffersDone,
      pipeline_run_ms: tPipelineDone - tRequestBuilt,
      serialize_ms: tSent - tPipelineDone,
      route_total_ms: tSent - T_received,
    });

    return response;
  } catch (err: any) {
    console.error("[SIMPLE][ERROR]", {
      stage: "SERVER_ROUTE",
      code: "SERVER_ERROR",
      message: err.message || "Internal server error occurred during simple generation.",
      name: err.name,
      stack: err.stack,
    });
    return NextResponse.json(
      {
        success: false,
        status: "GENERATION_FAILED",
        error: {
          code: "SERVER_ERROR",
          message: err.message || "Internal server error occurred during simple generation.",
        },
      },
      { status: 500 }
    );
  }
}
