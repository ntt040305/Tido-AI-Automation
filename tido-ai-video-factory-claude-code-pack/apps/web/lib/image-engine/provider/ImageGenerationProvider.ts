import { GenerationErrorCode, ReferenceManifest } from "../types";

export interface ProviderReferenceImage {
  reference_id: string; // e.g. REF_01
  product_id?: string;  // e.g. PRODUCT_01 (optional for non-product references)
  role?: "PRODUCT" | "LOGO" | "SUPPORT_REFERENCE" | "INSPIRATION_REFERENCE" | "AMBIGUOUS" | "UNKNOWN";
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
  reference_manifest?: ReferenceManifest;
}

export interface ProviderImageGenerationOutput {
  success: boolean;
  /**
   * The prompt the provider was ACTUALLY sent, when a wrapper changed it.
   *
   * Phase 5.6.5. A wrapper may append sections after the orchestrator has
   * compiled the prompt -- the composition, the typographic intention, the
   * render constraints. The orchestrator stored what it compiled, so the
   * recorded prompt was short by everything the wrapper added: 22,064 chars on
   * disk against 23,804 actually sent. Every downstream reader of that file --
   * the vision loop, the memory loop, the benchmark's own prompt accounting --
   * was reading a prompt that was never used. A wrapper that modifies the
   * prompt MUST return it here.
   */
  finalPrompt?: string;
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
