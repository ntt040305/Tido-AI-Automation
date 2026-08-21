import { NextRequest, NextResponse } from "next/server";
import { SmartKnowledgeRetriever } from "@/lib/image-engine/retrieval/SmartKnowledgeRetriever";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const routingInput = body.routingResult || body.routing || body;

    const result = await SmartKnowledgeRetriever.retrieve(routingInput);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.code === "INVALID_ROUTING_INPUT" ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      knowledge: result.package,
      knowledgePackage: result.package,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "KNOWLEDGE_SELECTION_ERROR",
          message: err.message || String(err),
        },
      },
      { status: 500 }
    );
  }
}
