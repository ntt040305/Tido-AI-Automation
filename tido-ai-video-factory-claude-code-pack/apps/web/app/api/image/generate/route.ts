import { NextRequest, NextResponse } from "next/server";
import { defaultImageGenerationService } from "@/lib/image-engine/service/ImageGenerationService";
import {
  CompiledGenerationPackageV1,
  KnowledgePackageV1,
  MasterPromptCompilerInput,
  ReferenceImageInput,
  RoutingResultSchema,
} from "@/lib/image-engine/types";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let productReferences: ReferenceImageInput[] = [];
    let routingResult: RoutingResultSchema | undefined;
    let knowledgePackage: KnowledgePackageV1 | undefined;
    let masterPromptPackage: CompiledGenerationPackageV1 | undefined;
    let compilerInput: MasterPromptCompilerInput | undefined;
    let requestId: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      // Read JSON fields
      const routingStr = formData.get("routingResult") as string;
      const knowledgeStr = formData.get("knowledgePackage") as string;
      const masterPromptStr = formData.get("masterPromptPackage") as string;
      const compilerInputStr = formData.get("compilerInput") as string;
      requestId = (formData.get("requestId") as string) || undefined;

      if (routingStr) {
        try {
          routingResult = JSON.parse(routingStr);
        } catch {
          return NextResponse.json(
            { success: false, error: { code: "INVALID_INPUT", message: "Failed to parse routingResult JSON." } },
            { status: 400 }
          );
        }
      }

      if (knowledgeStr) {
        try {
          knowledgePackage = JSON.parse(knowledgeStr);
        } catch {
          return NextResponse.json(
            { success: false, error: { code: "INVALID_INPUT", message: "Failed to parse knowledgePackage JSON." } },
            { status: 400 }
          );
        }
      }

      if (masterPromptStr) {
        try {
          masterPromptPackage = JSON.parse(masterPromptStr);
        } catch {
          return NextResponse.json(
            { success: false, error: { code: "INVALID_INPUT", message: "Failed to parse masterPromptPackage JSON." } },
            { status: 400 }
          );
        }
      }

      if (compilerInputStr) {
        try {
          compilerInput = JSON.parse(compilerInputStr);
        } catch {
          // Optional
        }
      }

      // Read image files (ref_01, ref_02, ... or images[])
      let imgIdx = 0;
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === "object" && "arrayBuffer" in value && (key.startsWith("ref_") || key.startsWith("image") || key === "files")) {
          const file = value as File;
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          imgIdx++;
          const refId = `REF_${String(imgIdx).padStart(2, "0")}`;
          // Find matching product_id from masterPromptPackage references or routingResult
          let prodId = "PRODUCT_01";
          if (masterPromptPackage?.references) {
            const matchedRef = masterPromptPackage.references.find((r) => r.reference_id === refId || r.input_index === imgIdx - 1);
            if (matchedRef) prodId = matchedRef.product_id;
          }

          productReferences.push({
            reference_id: refId,
            product_id: prodId,
            input_index: imgIdx - 1,
            mimeType: file.type || "image/png",
            buffer,
            filename: file.name,
          });
        }
      }
    } else {
      // JSON body
      const body = await req.json();
      routingResult = body.routingResult;
      knowledgePackage = body.knowledgePackage;
      masterPromptPackage = body.masterPromptPackage;
      compilerInput = body.compilerInput;
      requestId = body.requestId;

      if (body.productReferences && Array.isArray(body.productReferences)) {
        productReferences = body.productReferences.map((r: any, idx: number) => ({
          reference_id: r.reference_id || `REF_${String(idx + 1).padStart(2, "0")}`,
          product_id: r.product_id || "PRODUCT_01",
          input_index: r.input_index ?? idx,
          mimeType: r.mimeType || "image/png",
          buffer: typeof r.base64 === "string" ? Buffer.from(r.base64, "base64") : Buffer.from(r.buffer || []),
          filename: r.filename,
        }));
      }
    }

    if (!routingResult || !knowledgePackage || !masterPromptPackage) {
      return NextResponse.json(
        {
          generation_version: "1.0",
          generation_id: `imggen_err_${Date.now()}`,
          status: "FAILED",
          provider: { name: "google-gemini", model: "gemini-3.1-flash-image" },
          trace: { template_version: "2.0.0", template_hash: "", compiled_prompt_hash: "", input_fingerprint: "", knowledge_versions: {}, reference_hashes: {} },
          timing: { generation_duration_ms: 0 },
          warnings: [],
          error: {
            code: "MASTER_PROMPT_STALE",
            message: "Missing required inputs: routingResult, knowledgePackage, and masterPromptPackage are required.",
          },
        },
        { status: 400 }
      );
    }

    // Call server-side ImageGenerationService
    const result = await defaultImageGenerationService.generateImage({
      requestId,
      productReferences,
      routingResult,
      knowledgePackage,
      masterPromptPackage,
      compilerInput,
    });

    const statusCode =
      result.status === "SUCCEEDED"
        ? 200
        : result.error?.code === "MASTER_PROMPT_STALE"
        ? 409
        : result.error?.code === "RENDER_BLOCKED"
        ? 400
        : 200; // Return structured JSON failure response cleanly

    return NextResponse.json(result, { status: statusCode });
  } catch (err: any) {
    return NextResponse.json(
      {
        generation_version: "1.0",
        generation_id: `imggen_err_${Date.now()}`,
        status: "FAILED",
        provider: { name: "google-gemini", model: "gemini-3.1-flash-image" },
        trace: { template_version: "2.0.0", template_hash: "", compiled_prompt_hash: "", input_fingerprint: "", knowledge_versions: {}, reference_hashes: {} },
        timing: { generation_duration_ms: 0 },
        warnings: [],
        error: {
          code: "GENERATION_FAILED",
          message: `Unexpected server error: ${err.message}`,
        },
      },
      { status: 500 }
    );
  }
}
