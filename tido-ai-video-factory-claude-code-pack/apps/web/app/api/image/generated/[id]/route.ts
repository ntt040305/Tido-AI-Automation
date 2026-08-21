import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { LocalGeneratedImageStorage } from "@/lib/image-engine/storage/LocalGeneratedImageStorage";

const storage = new LocalGeneratedImageStorage();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params;

    if (!generationId || generationId.includes("..") || generationId.includes("/") || generationId.includes("\\")) {
      return NextResponse.json({ error: "Invalid generation asset ID" }, { status: 400 });
    }

    const assetPath = storage.getAssetPath(generationId);
    if (!assetPath || !fs.existsSync(assetPath)) {
      return NextResponse.json({ error: "Generated image asset not found" }, { status: 404 });
    }

    const ext = path.extname(assetPath).toLowerCase();
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") {
      mimeType = "image/jpeg";
    } else if (ext === ".webp") {
      mimeType = "image/webp";
    } else if (ext === ".svg") {
      mimeType = "image/svg+xml";
    }

    const searchParams = req.nextUrl.searchParams;
    const isDownload = searchParams.get("download") === "1" || searchParams.get("dl") === "1";

    const fileBuffer = fs.readFileSync(assetPath);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="tido-${generationId}${ext || ".png"}"`;
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to retrieve asset: ${err.message}` }, { status: 500 });
  }
}
