import { NextRequest, NextResponse } from "next/server";
import { MasterPromptCompilerService } from "@/lib/image-engine/compiler/MasterPromptCompilerService";
import { MasterPromptCompilerInput } from "@/lib/image-engine/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input: MasterPromptCompilerInput = {
      productReferences: body.productReferences || body.references,
      brief: body.brief,
      productCount: body.productCount,
      copyItems: body.copyItems || body.copy,
      brandName: body.brandName,
      brandInfo: body.brandInfo,
      hardRequirements: body.hardRequirements,
      useCase: body.useCase,
      aspectRatio: body.aspectRatio,
      routingResult: body.routingResult || body.routing,
      knowledgePackage: body.knowledgePackage || body.knowledge,
    };

    const compiler = new MasterPromptCompilerService();
    const result = await compiler.compile(input);

    if (!result.success) {
      const isBadRequest = [
        "INVALID_COMPILER_INPUT",
        "ROUTING_VERSION_MISMATCH",
        "KNOWLEDGE_PACKAGE_MISMATCH",
        "UNIVERSAL_CORE_MISSING",
        "PRODUCT_INSTANCE_CONFLICT",
        "EXACT_COPY_INTEGRITY_FAILED",
      ].includes(result.error?.code || "");

      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: isBadRequest ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      package: result.package,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "PROMPT_COMPILATION_FAILED",
          message: err.message || String(err),
        },
      },
      { status: 500 }
    );
  }
}
