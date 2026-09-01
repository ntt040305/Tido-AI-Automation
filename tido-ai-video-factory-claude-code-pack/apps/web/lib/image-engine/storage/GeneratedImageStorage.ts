export interface SaveGenerationAssetParams {
  generation_id: string;
  imageBuffer: Buffer;
  mimeType: string;
  masterPrompt: string;
  metadata: Record<string, any>;
}

export interface SaveAssetResult {
  url: string;
  assetPath: string;
}

export interface GeneratedImageStorage {
  saveAsset(params: SaveGenerationAssetParams): Promise<SaveAssetResult>;
  getAssetPath(generationId: string): string | null;
  getMetadata(generationId: string): Record<string, any> | null;
  getMasterPrompt(generationId: string): string | null;
}
