export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export class LLMProviderService {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config?: LLMProviderConfig) {
    this.baseUrl = (config?.baseUrl || process.env.LLM_BASE_URL || "http://127.0.0.1:8317/v1").replace(/\/$/, "");
    this.apiKey = config?.apiKey || process.env.LLM_API_KEY || "marketing-test-key-2026";
    this.model = config?.model || process.env.LLM_MODEL || "claude-sonnet-4-6";

    console.log("[LLM_PROVIDER]", {
      provider: this.model,
      baseUrl: this.baseUrl,
      status: "CONNECTED",
    });
  }

  public getModelName(): string {
    return this.model;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.model);
  }

  public async generateChatCompletion(
    messages: LLMChatMessage[],
    purpose: string = "marketing_brain",
    options?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const startTime = Date.now();
    const inputLength = messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);

    console.log("[LLM_REQUEST]", {
      model: this.model,
      inputLength,
      purpose,
    });

    const endpoint = `${this.baseUrl}/chat/completions`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          ...(options?.max_tokens ? { max_tokens: options.max_tokens } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown HTTP error");
        throw new Error(`LLM provider returned HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const content = data?.choices?.[0]?.message?.content || "";

      const durationMs = Date.now() - startTime;
      const outputLength = content.length;

      console.log("[LLM_RESPONSE]", {
        model: this.model,
        duration: `${durationMs}ms`,
        outputLength,
      });

      return content;
    } catch (err: any) {
      console.warn(`[LLMProviderService] Chat completion request failed (${err.message})`);
      throw {
        code: "LLM_PROVIDER_UNAVAILABLE",
        message: `Marketing brain unavailable: ${err.message}`,
        originalError: err,
      };
    }
  }
}

export const defaultLLMProviderService = new LLMProviderService();
