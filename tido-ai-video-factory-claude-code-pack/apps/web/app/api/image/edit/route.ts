import { NextRequest, NextResponse } from "next/server";
import { defaultImageEditService } from "@/lib/image-engine/service/ImageEditService";
import {
  CompiledEditPackageV1,
  EditCategory,
  EditPromptCompilerInput,
  ReferenceImageInput,
} from "@/lib/image-engine/types";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let parentImageId: string = "";
    let parentImageBuffer: Buffer | undefined;
    let parentMimeType: string = "image/png";
    let rootGenerationId: string | undefined;
    let editInstruction: string = "";
    let editCategory: EditCategory | undefined;
    let supportingReferences: ReferenceImageInput[] = [];
    let copyItems: string[] = [];
    let brandName: string | undefined;
    let brandInfo: string | undefined;
    let aspectRatio: string | undefined;
    let compiledEditPackage: CompiledEditPackageV1 | undefined;
    let editCompilerInput: EditPromptCompilerInput | undefined;
    let requestId: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      parentImageId = (formData.get("parentImageId") as string) || "";
      rootGenerationId = (formData.get("rootGenerationId") as string) || undefined;
      editInstruction = (formData.get("editInstruction") as string) || "";
      editCategory = (formData.get("editCategory") as EditCategory) || undefined;
      brandName = (formData.get("brandName") as string) || undefined;
      brandInfo = (formData.get("brandInfo") as string) || undefined;
      aspectRatio = (formData.get("aspectRatio") as string) || undefined;
      requestId = (formData.get("requestId") as string) || undefined;

      const copyItemsStr = formData.get("copyItems") as string;
      if (copyItemsStr) {
        try {
          copyItems = JSON.parse(copyItemsStr);
        } catch (_) {}
      }

      const compiledEditPackageStr = formData.get("compiledEditPackage") as string;
      if (compiledEditPackageStr) {
        try {
          compiledEditPackage = JSON.parse(compiledEditPackageStr);
        } catch (_) {}
      }

      const editCompilerInputStr = formData.get("editCompilerInput") as string;
      if (editCompilerInputStr) {
        try {
          editCompilerInput = JSON.parse(editCompilerInputStr);
        } catch (_) {}
      }

      // Read parent image & supporting reference files
      let suppIdx = 0;
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === "object" && "arrayBuffer" in value) {
          const file = value as File;
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (key === "parentImage" || key === "parent_image") {
            parentImageBuffer = buffer;
            parentMimeType = file.type || "image/png";
          } else if (key.startsWith("supporting_") || key.startsWith("ref_") || key === "images") {
            suppIdx++;
            supportingReferences.push({
              reference_id: `REF_${String(suppIdx).padStart(2, "0")}`,
              product_id: `PRODUCT_${String(suppIdx).padStart(2, "0")}`,
              input_index: suppIdx,
              mimeType: file.type || "image/png",
              buffer,
              filename: file.name,
            });
          }
        }
      }
    } else {
      // JSON body
      const body = await req.json();
      parentImageId = body.parentImageId || "";
      rootGenerationId = body.rootGenerationId;
      editInstruction = body.editInstruction || "";
      editCategory = body.editCategory;
      brandName = body.brandName;
      brandInfo = body.brandInfo;
      aspectRatio = body.aspectRatio;
      requestId = body.requestId;
      copyItems = body.copyItems || [];
      compiledEditPackage = body.compiledEditPackage;
      editCompilerInput = body.editCompilerInput;

      if (body.parentImageBase64) {
        parentImageBuffer = Buffer.from(body.parentImageBase64, "base64");
        parentMimeType = body.parentMimeType || "image/png";
      }

      if (body.supportingReferences && Array.isArray(body.supportingReferences)) {
        supportingReferences = body.supportingReferences.map((r: any, idx: number) => ({
          reference_id: r.reference_id || `REF_${String(idx + 1).padStart(2, "0")}`,
          product_id: r.product_id || `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
          input_index: idx + 1,
          mimeType: r.mimeType || "image/png",
          buffer: typeof r.base64 === "string" ? Buffer.from(r.base64, "base64") : Buffer.from(r.buffer || []),
          filename: r.filename,
        }));
      }
    }

    if (!parentImageId || !parentImageBuffer || parentImageBuffer.length === 0) {
      return NextResponse.json(
        {
          edit_version: "1.0",
          edit_id: `edit_err_${Date.now()}`,
          parent_image_id: parentImageId || "unknown",
          root_generation_id: rootGenerationId || parentImageId || "unknown",
          status: "FAILED",
          provider: { name: "imgstudio", model: "flow-nano-banana-2" },
          trace: { template_version: "1.0.0", template_hash: "", edit_prompt_hash: "", edit_fingerprint: "", supporting_reference_hashes: {} },
          timing: { edit_duration_ms: 0 },
          warnings: [],
          error: {
            code: "INVALID_REFERENCE_IMAGE",
            message: "Parent generated image (parentImage) buffer and parentImageId are required.",
          },
        },
        { status: 400 }
      );
    }

    if (!editInstruction || !editInstruction.trim()) {
      return NextResponse.json(
        {
          edit_version: "1.0",
          edit_id: `edit_err_${Date.now()}`,
          parent_image_id: parentImageId,
          root_generation_id: rootGenerationId || parentImageId,
          status: "FAILED",
          provider: { name: "imgstudio", model: "flow-nano-banana-2" },
          trace: { template_version: "1.0.0", template_hash: "", edit_prompt_hash: "", edit_fingerprint: "", supporting_reference_hashes: {} },
          timing: { edit_duration_ms: 0 },
          warnings: [],
          error: {
            code: "INVALID_COMPILER_INPUT",
            message: "editInstruction is required for targeted image edit.",
          },
        },
        { status: 400 }
      );
    }

    const result = await defaultImageEditService.editImage({
      requestId,
      parentImageId,
      parentImageBuffer,
      parentMimeType,
      rootGenerationId,
      editInstruction,
      editCategory,
      supportingReferences,
      copyItems,
      brandName,
      brandInfo,
      aspectRatio,
      compiledEditPackage,
      editCompilerInput,
    });

    const statusCode = result.status === "SUCCEEDED" ? 200 : 500;
    return NextResponse.json(result, { status: statusCode });
  } catch (err: any) {
    return NextResponse.json(
      {
        edit_version: "1.0",
        edit_id: `edit_err_${Date.now()}`,
        parent_image_id: "unknown",
        root_generation_id: "unknown",
        status: "FAILED",
        provider: { name: "imgstudio", model: "flow-nano-banana-2" },
        trace: { template_version: "1.0.0", template_hash: "", edit_prompt_hash: "", edit_fingerprint: "", supporting_reference_hashes: {} },
        timing: { edit_duration_ms: 0 },
        warnings: [],
        error: {
          code: "GENERATION_FAILED",
          message: `Internal error handling image edit route: ${err.message || String(err)}`,
        },
      },
      { status: 500 }
    );
  }
}
