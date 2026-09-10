/**
 * Multimodal message parts, in the OpenAI /v1/chat/completions shape. Sending an image
 * requires the array form; a plain string stays valid for text-only calls.
 */
export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
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

    // "CONFIGURED", not "CONNECTED".
    //
    // This line used to print status: "CONNECTED" unconditionally, at
    // construction, before any socket was opened. It said CONNECTED for every
    // phase in which the gateway was in fact unreachable, and a Phase 4.0.7
    // check very nearly recorded the LLM path as live on the strength of it.
    // A constructor cannot know whether a host is up; only `probe()` can.
    console.log("[LLM_PROVIDER]", {
      provider: this.model,
      baseUrl: this.baseUrl,
      status: "CONFIGURED",
      note: "configuration only — call probe() for reachability",
    });
  }

  /**
   * Whether the gateway is actually there.
   *
   * `isConfigured()` answers a different and much weaker question: whether a URL
   * and a model name are non-empty strings, which they always are because both
   * have defaults. Anything that needs to know if the model can be *reached* has
   * to make a request, so this makes the smallest one it can and reports what
   * happened rather than what was hoped.
   *
   * Never throws. An unreachable gateway is an expected state in this codebase,
   * not an error.
   */
  public async probe(timeoutMs = 8000): Promise<{
    reachable: boolean;
    status: "LLM_ACTIVE" | "LLM_FALLBACK_MODE";
    baseUrl: string;
    model: string;
    detail: string;
  }> {
    const base = {
      baseUrl: this.baseUrl,
      model: this.model,
    };
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          ...base,
          reachable: false,
          status: "LLM_FALLBACK_MODE",
          detail: `gateway answered HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
        };
      }
      const data = (await response.json().catch(() => null)) as { choices?: unknown[] } | null;
      if (!data || !Array.isArray(data.choices)) {
        return {
          ...base,
          reachable: false,
          status: "LLM_FALLBACK_MODE",
          detail: "gateway answered but the body was not a chat completion",
        };
      }
      return { ...base, reachable: true, status: "LLM_ACTIVE", detail: "gateway answered a chat completion" };
    } catch (err: any) {
      return {
        ...base,
        reachable: false,
        status: "LLM_FALLBACK_MODE",
        detail: `no answer from the gateway (${err?.message || String(err)})`,
      };
    }
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
    options?: { temperature?: number; max_tokens?: number; timeoutMs?: number }
  ): Promise<string> {
    const startTime = Date.now();

    let inputLength = 0;
    let imageParts = 0;
    for (const m of messages) {
      if (typeof m.content === "string") {
        inputLength += m.content.length;
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "text") inputLength += part.text.length;
          else if (part.type === "image_url") imageParts++;
        }
      }
    }

    console.log("[LLM_REQUEST]", {
      model: this.model,
      inputLength,
      imageParts,
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
        // Vision calls carry an encoded image and need more headroom than a text call.
        signal: AbortSignal.timeout(options?.timeoutMs ?? (imageParts > 0 ? 45000 : 15000)),
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
