import { NextRequest, NextResponse } from "next/server";
import { ConceptProfessionalizerService } from "@/lib/image-engine/service/ConceptProfessionalizerService";

export const runtime = "nodejs";

/**
 * Whether the manual "ý tưởng hóa" step is still worth offering.
 *
 * With `PROMPT_ENGINE=v2` the creative director runs on every render, so the
 * button would pay for a second opinion nobody reads. The UI asks this once and
 * hides the button on `false`. Server-side, so the flag has one source of truth.
 */
export async function GET() {
  const { isV2 } = await import("@/lib/image-engine/prompt-v2/engine-selector");
  return NextResponse.json({ available: !isV2(), engine: isV2() ? "v2" : "v1" });
}

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
      // Only present when the model actually returned structured thinking.
      // Older clients read the paragraph and are unaffected.
      ...(result.brief ? { brief: result.brief } : {}),
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
