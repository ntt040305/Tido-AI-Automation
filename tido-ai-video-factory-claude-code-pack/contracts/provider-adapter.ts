export type ProviderJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type NormalizedProviderErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "CONTENT_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "OUTPUT_EXPIRED"
  | "UNKNOWN";

export interface ProviderCapabilities {
  provider: string;
  model: string;
  methods: Array<
    | "text_to_image"
    | "image_edit"
    | "text_to_video"
    | "image_to_video"
    | "text_to_speech"
    | "speech_to_speech"
  >;
  aspectRatios: string[];
  maxDurationSeconds?: number;
  supportsStartFrame?: boolean;
  supportsEndFrame?: boolean;
  supportsReferenceImages?: boolean;
  supportsNativeAudio?: boolean;
}

export interface CostEstimate {
  currency: "USD";
  estimatedAmount: number;
  pricingSnapshotId: string;
  assumptions: Record<string, unknown>;
}

export interface SubmitResult {
  providerJobId: string;
  acceptedAt: string;
  estimatedCost?: CostEstimate;
}

export interface ProviderJobResult {
  status: ProviderJobStatus;
  progress?: number;
  outputUrls?: string[];
  actualCost?: CostEstimate;
  rawMetadata?: Record<string, unknown>;
  error?: {
    code: NormalizedProviderErrorCode;
    retryable: boolean;
    message: string;
  };
}

export interface ProviderAdapter<TRequest> {
  getCapabilities(): Promise<ProviderCapabilities>;
  validateRequest(request: TRequest): Promise<void>;
  estimateCost(request: TRequest): Promise<CostEstimate>;
  submitGeneration(request: TRequest, idempotencyKey: string): Promise<SubmitResult>;
  getJobStatus(providerJobId: string): Promise<ProviderJobResult>;
  cancelJob(providerJobId: string): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }>;
}
