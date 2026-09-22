import { NextRequest, NextResponse } from "next/server";
import { PipelineRouter } from "@/lib/image-engine/evolution/PipelineRouter";
import { getIdentityProvider } from "@tido/infrastructure";
import { fileKitStore } from "@/lib/user-kit/kit-store";
import { preferenceDecisions } from "@/lib/image-engine/evolution/experiment/UserKit";
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
      // `PipelineRouter.run` has the same signature as the orchestrator call it
      // replaces and, with default flags, does exactly one extra thing: it reads
      // a small JSON file, finds active_pipeline is "stable", and calls the same
      // orchestrator with the same argument. Routing failures fall back to
      // stable rather than propagating, so the worst case of this indirection is
      // the behaviour that existed before it.
      //
      // The tester id comes from a header rather than from any account field:
      // internal routing must not depend on who a user is, and the value is
      // written to the comparison log where personal identifiers do not belong.
      const testerId = req.headers.get("x-tido-tester-id") || undefined;

      // What this person keeps asking for, resolved here rather than in the
      // engine. The lookup needs an account; the engine must never have one,
      // so it is done on this side of the boundary and only the resulting
      // sentences cross it.
      //
      // Only preferences that already passed the kit's own threshold are
      // included, so nothing here is a single render being mistaken for a
      // taste. Signing out simply yields none.
      let standingPreferences: string[] | undefined;
      try {
        // Firebase is the only thing that decides who this is. A verified
        // token or nobody -- an id in a header or a body is a claim, not an
        // identity.
        const identity = await getIdentityProvider().identify(req);
        if (identity) {
          const kit = fileKitStore.load(identity.firebaseUid);
          const active = preferenceDecisions(kit);
          if (active.length) standingPreferences = active.map((p) => p.decision.value);
        }
      } catch (e) {
        // Memory is an assist. A failure to read it is never a failure to render.
        console.warn(
          "[USER_KIT] preferences unavailable:",
          e instanceof Error ? e.message : String(e),
        );
      }
      result = await Promise.race([
        PipelineRouter.run(simpleRequest, undefined, { testerId, standingPreferences }),
        timeoutPromise,
      ]);
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
