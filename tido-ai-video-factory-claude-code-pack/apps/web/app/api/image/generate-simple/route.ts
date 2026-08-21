import { NextRequest, NextResponse } from "next/server";
import { SimpleImageGenerationOrchestratorService } from "@/lib/image-engine/service/SimpleImageGenerationOrchestratorService";
import { SimpleInputRequestV1 } from "@/lib/image-engine/types";

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
      };
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const concept = (formData.get("concept") as string) || "";
      const useCase = (formData.get("useCase") as string) || "Poster";
      const aspectRatio = (formData.get("aspectRatio") as string) || "1:1";
      const brandName = (formData.get("brandName") as string) || undefined;

      console.log("[SIMPLE RATIO][ROUTE]", {
        rawAspectRatio: formData.get("aspectRatio"),
        parsedAspectRatio: aspectRatio,
        length: aspectRatio ? aspectRatio.length : 0,
        charCodes: aspectRatio ? [...aspectRatio].map((c) => c.charCodeAt(0)) : [],
      });

      const rawImages = formData.getAll("images");
      const parsedImages: { reference_id: string; buffer: Buffer; mimeType: string; filename: string }[] = [];

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

      simpleRequest = {
        images: parsedImages,
        concept,
        useCase,
        aspectRatio,
        brandName,
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

    const result = await SimpleImageGenerationOrchestratorService.generateSimpleImage(simpleRequest);

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
