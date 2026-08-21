import { NextResponse } from "next/server";
import { LocalKnowledgeRepository } from "@/lib/image-engine/repository/LocalKnowledgeRepository";
import { KnowledgeEmbeddingIndexService } from "@/lib/image-engine/retrieval/KnowledgeEmbeddingIndexService";

export async function GET() {
  try {
    const repository = new LocalKnowledgeRepository();
    const activeBlocks = repository.getActiveBlocks();
    const statusInfo = KnowledgeEmbeddingIndexService.evaluateStatus(activeBlocks);

    return NextResponse.json({
      success: true,
      index: statusInfo,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "KNOWLEDGE_INDEX_ERROR",
          message: err.message || String(err),
        },
      },
      { status: 500 }
    );
  }
}
