import { GenerationErrorCode } from "../types";

export interface ProviderReferenceImage {
  reference_id: string; // e.g. REF_01
  product_id?: string;  // e.g. PRODUCT_01 (optional for non-product references)
  role?: "PRODUCT" | "LOGO" | "SUPPORT_REFERENCE" | "AMBIGUOUS" | "UNKNOWN";
  mimeType: string;
  buffer: Buffer;
  filename?: string;
}

export interface ProviderImageGenerationInput {
  model: string;
  prompt: string;
  references: ProviderReferenceImage[];
  aspectRatio: string;
  imageSize: string;
  mimeType: string;
  generationId?: string;
  idempotencyKey?: string;
}

export interface ProviderImageGenerationOutput {
  success: boolean;
  imageUrl?: string;
  imageBuffer?: Buffer;
  mimeType?: string;
  remoteDetails?: {
    remote_image_id?: string;
    cost_vnd?: number;
    balance_vnd?: number;
    provider_name?: string;
    model?: string;
    url?: string;
    [key: string]: any;
  };
  error?: {
    code: GenerationErrorCode;
    message: string;
    details?: any;
  };
}

export interface ImageGenerationProvider {
  generateImage(input: ProviderImageGenerationInput): Promise<ProviderImageGenerationOutput>;
}
