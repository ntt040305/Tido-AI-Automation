import { NextResponse } from "next/server";
import { defaultKnowledgeService } from "@/lib/image-engine/service/KnowledgeService";

/**
 * Internal Dev Endpoint: GET /api/image/knowledge/blocks
 * Returns list of registered knowledge blocks metadata.
 */
export async function GET() {
  try {
    const blocks = await defaultKnowledgeService.listBlocks();
    return NextResponse.json({ total: blocks.length, blocks });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to list knowledge blocks",
      },
      { status: 500 }
    );
  }
}
