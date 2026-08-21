import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { GeneratedImageStorage, SaveAssetResult, SaveGenerationAssetParams } from "./GeneratedImageStorage";

export class LocalGeneratedImageStorage implements GeneratedImageStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || IMAGE_ENGINE_CONFIG.GENERATED_DIR;
  }

  public async saveAsset(params: SaveGenerationAssetParams): Promise<SaveAssetResult> {
    const targetDir = path.join(this.baseDir, params.generation_id);

    // Security path traversal check
    if (!path.resolve(targetDir).startsWith(path.resolve(this.baseDir))) {
      throw new Error(`Security Violation: Path traversal detected in generation_id '${params.generation_id}'`);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Determine extension
    let ext = ".png";
    if (params.mimeType === "image/jpeg" || params.mimeType === "image/jpg") {
      ext = ".jpg";
    } else if (params.mimeType === "image/webp") {
      ext = ".webp";
    } else if (params.mimeType === "image/svg+xml") {
      ext = ".svg";
    }

    const imageFilename = `output${ext}`;
    const imagePath = path.join(targetDir, imageFilename);
    const metadataPath = path.join(targetDir, "metadata.json");
    const promptPath = path.join(targetDir, "master_prompt.md");

    // Sanitized Safe Metadata Copy (Ensure no API key or raw base64)
    const safeMetadata = { ...params.metadata };
    delete safeMetadata.GEMINI_API_KEY;
    delete safeMetadata.apiKey;
    delete safeMetadata.base64;
    delete safeMetadata.imageBuffer;

    // Write files synchronously or atomically
    fs.writeFileSync(imagePath, params.imageBuffer);
    fs.writeFileSync(metadataPath, JSON.stringify(safeMetadata, null, 2), "utf-8");
    fs.writeFileSync(promptPath, params.masterPrompt, "utf-8");

    const url = `/api/image/generated/${params.generation_id}`;

    return {
      url,
      assetPath: imagePath,
    };
  }

  public getAssetPath(generationId: string): string | null {
    if (!generationId || generationId.includes("..") || generationId.includes("/") || generationId.includes("\\")) {
      return null;
    }

    const targetDir = path.join(this.baseDir, generationId);
    if (!fs.existsSync(targetDir)) {
      return null;
    }

    // Search for output image file
    const possibleFiles = ["output.png", "output.jpg", "output.jpeg", "output.webp", "output.svg"];
    for (const f of possibleFiles) {
      const p = path.join(targetDir, f);
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  public getMetadata(generationId: string): Record<string, any> | null {
    if (!generationId || generationId.includes("..") || generationId.includes("/") || generationId.includes("\\")) {
      return null;
    }

    const metadataPath = path.join(this.baseDir, generationId, "metadata.json");
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  public getMasterPrompt(generationId: string): string | null {
    if (!generationId || generationId.includes("..") || generationId.includes("/") || generationId.includes("\\")) {
      return null;
    }

    const promptPath = path.join(this.baseDir, generationId, "master_prompt.md");
    if (!fs.existsSync(promptPath)) {
      return null;
    }

    try {
      return fs.readFileSync(promptPath, "utf-8");
    } catch {
      return null;
    }
  }
}
