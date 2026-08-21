import { NextResponse } from "next/server";
import { defaultKnowledgeService } from "@/lib/image-engine/service/KnowledgeService";

/**
 * Internal Dev Endpoint: GET /api/image/knowledge/status
 * Returns current status of local knowledge repository, block counts, and validation errors.
 */
export async function GET() {
  try {
    const status = await defaultKnowledgeService.getRepositoryStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to inspect knowledge repository",
      },
      { status: 500 }
    );
  }
}
