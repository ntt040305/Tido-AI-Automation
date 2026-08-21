import { NextRequest, NextResponse } from "next/server";
import { defaultKnowledgeRouterService } from "@/lib/image-engine/service/KnowledgeRouterService";
import { RouterImageInput, RouterInput } from "@/lib/image-engine/types";


/**
 * POST /api/image/router/analyze
 * Accepts multipart/form-data with product reference images and contextual briefs.
 * Returns normalized structured Knowledge Routing Result V1.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_IMAGE_INPUT",
            message: "Content-Type must be multipart/form-data",
          },
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();

    // Extract product reference images
    const imageFiles: File[] = [];

    // Support multiple field naming conventions (productImages, productImages[], image, images)
    const allEntries = Array.from(formData.entries());
    for (const [key, value] of allEntries) {
      if (
        (key === "productImages" ||
          key === "productImages[]" ||
          key === "images" ||
          key === "image") &&
        value instanceof File
      ) {
        imageFiles.push(value);
      }
    }

    if (imageFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_IMAGE",
            message: "No product reference image files found in request.",
          },
        },
        { status: 400 }
      );
    }

    // Convert uploaded Files to RouterImageInput buffers
    const images: RouterImageInput[] = [];
    for (const file of imageFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      images.push({
        buffer,
        mimeType: file.type || "image/jpeg",
        filename: file.name,
      });
    }

    // Parse optional text context fields
    const brief = formData.get("brief")?.toString() || undefined;
    const brandName = formData.get("brandName")?.toString() || undefined;
    const brandInfo = formData.get("brandInfo")?.toString() || undefined;
    const useCase = formData.get("useCase")?.toString() || undefined;

    const rawProductCount = formData.get("productCount")?.toString();
    const productCount = rawProductCount ? parseInt(rawProductCount, 10) : undefined;

    const rawCopy = formData.get("copyItems")?.toString();
    let copyItems: string[] | undefined;
    if (rawCopy) {
      try {
        copyItems = JSON.parse(rawCopy);
      } catch {
        copyItems = [rawCopy];
      }
    }

    const rawHardReqs = formData.get("hardRequirements")?.toString();
    let hardRequirements: string[] | undefined;
    if (rawHardReqs) {
      try {
        hardRequirements = JSON.parse(rawHardReqs);
      } catch {
        hardRequirements = [rawHardReqs];
      }
    }

    const routerInput: RouterInput = {
      images,
      brief,
      brandName,
      brandInfo,
      productCount,
      copyItems,
      hardRequirements,
      useCase,
    };

    // Execute Router Service
    const result = await defaultKnowledgeRouterService.analyzeProductReferences(routerInput);

    if (!result.success) {
      const statusCode =
        result.error?.code === "CONFIG_ERROR"
          ? 500
          : result.error?.code === "ROUTER_TIMEOUT"
          ? 504
          : 400;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[Router API] Unexpected internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ROUTER_API_ERROR",
          message: error.message || "An unexpected error occurred during knowledge routing analysis.",
        },
      },
      { status: 500 }
    );
  }
}
