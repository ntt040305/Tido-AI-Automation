import { NextRequest, NextResponse } from "next/server";
import { SimpleImageGenerationOrchestratorService } from "@/lib/image-engine/service/SimpleImageGenerationOrchestratorService";
import { SimpleInputRequestV1, AssetRoleV1 } from "@/lib/image-engine/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let simpleRequest: SimpleInputRequestV1;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      simpleRequest = {
        images: body.images || body.references || [],
        concept: body.concept || "",
        useCase: body.useCase || "Poster",
        aspectRatio: body.aspectRatio || "4:5",
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
      const concept = (formData.get("concept") as string) || "";
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
          const arrayBuffer = await item.arrayBuffer();
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
          const arrayBuffer = await item.arrayBuffer();
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
        useCase,
        aspectRatio,
        brandName,
        copyItems,
        marketingContext,
        creativeDirection,
        salesContext,
      };
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
      result = await Promise.race([
        SimpleImageGenerationOrchestratorService.generateSimpleImage(simpleRequest),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutId);
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
        },
        { status: httpStatus }
      );
    }

    return NextResponse.json({
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
    });
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
