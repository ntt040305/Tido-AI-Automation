import { NextRequest, NextResponse } from "next/server";
import { ConceptProfessionalizerService } from "@/lib/image-engine/service/ConceptProfessionalizerService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userConcept = body.concept || body.userConcept || "";
    const outputType = body.outputType || body.useCase || "poster";
    const productCategory = body.productCategory || body.category || "general";
    const brandName = body.brandName || "";
    const productName = body.productName || "";
    const identityContext = body.identityContext;
    const referenceManifest = body.referenceManifest;
    const productManifest = body.productManifest;
    const images = body.images || body.references || [];

    // Auto-detect identity context if images exist
    let effectiveIdentityContext = identityContext;
    if (!effectiveIdentityContext && Array.isArray(images) && images.length > 0) {
      effectiveIdentityContext = {
        referenceAvailable: true,
        detectedCategory: productCategory !== "general" ? productCategory : undefined,
        detectedBrand: brandName || undefined,
        detectedProductType: productName || undefined,
        identityLocks: ["Preserve uploaded product reference identity, shape, packaging, and logo"],
        preservationRules: ["Keep original packaging, logo, labels, and colors unchanged"],
      };
    }

    const service = new ConceptProfessionalizerService();
    const result = await service.professionalize({
      userConcept,
      outputType,
      productCategory,
      brandName,
      productName,
      identityContext: effectiveIdentityContext,
      referenceManifest,
      productManifest,
    });

    return NextResponse.json({
      originalConcept: result.originalConcept,
      professionalConcept: result.professionalConcept,
      wasOptimized: result.wasOptimized ?? false,
    });
  } catch (err: any) {
    console.error("[POST /api/image/concept-professionalize] Unexpected error:", err);
    return NextResponse.json(
      {
        originalConcept: "",
        professionalConcept: "",
        wasOptimized: false,
        error: err?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
