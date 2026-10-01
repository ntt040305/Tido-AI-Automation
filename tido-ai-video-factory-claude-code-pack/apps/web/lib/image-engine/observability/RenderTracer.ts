import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * TIDO Runtime Observability Tracer
 * 
 * Activated strictly when TIDO_RENDER_TRACE=1.
 * OFF by default. Zero behavior modification. Zero secret exposure.
 */

export interface CheckpointRecord {
  checkpoint: string;
  name: string;
  trace_id: string;
  generation_id: string;
  prompt_chars: number;
  prompt_bytes: number;
  sha256: string;
  timestamp: string;
  prompt_text: string;
}

export interface StageLogParams {
  stageNum: string;
  name: string;
  file: string;
  func: string;
  startedAt?: number;
  durationMs?: number;
  input?: any;
  decision?: any;
  output?: any;
  nextStage?: string;
  branchesEvaluated?: Array<{
    candidate: string;
    accepted: boolean;
    reason: string;
  }>;
}

export class RenderTracer {
  private static traceId: string | null = null;
  private static traceStartTime: number = 0;
  private static stagesExecuted: string[] = [];
  private static modelCalls: number = 0;
  private static imageRenders: number = 0;
  private static checkpoints: CheckpointRecord[] = [];

  public static isTraceEnabled(): boolean {
    return process.env.TIDO_RENDER_TRACE === "1";
  }

  public static getTraceId(): string {
    return this.traceId || "trace_default";
  }

  public static recordCheckpoint(checkpoint: string, name: string, promptText: string, metadata?: any): void {
    if (!this.isTraceEnabled()) return;
    const prompt_chars = promptText.length;
    const prompt_bytes = Buffer.byteLength(promptText, "utf8");
    const sha256 = crypto.createHash("sha256").update(promptText, "utf8").digest("hex");
    const trace_id = this.getTraceId();
    const generation_id = metadata?.generationId || "unknown";
    const timestamp = new Date().toISOString();

    const record: CheckpointRecord = {
      checkpoint,
      name,
      trace_id,
      generation_id,
      prompt_chars,
      prompt_bytes,
      sha256,
      timestamp,
      prompt_text: promptText,
    };

    this.checkpoints.push(record);

    console.log(`\n============================================================`);
    console.log(`[CHECKPOINT ${checkpoint}] ${name}`);
    console.log(`trace_id: ${trace_id}`);
    console.log(`generation_id: ${generation_id}`);
    console.log(`prompt_chars: ${prompt_chars}`);
    console.log(`prompt_bytes: ${prompt_bytes}`);
    console.log(`sha256: ${sha256}`);
    console.log(`timestamp: ${timestamp}`);
    console.log(`============================================================\n`);

    try {
      const scratchDir = path.join(process.cwd(), "scratch");
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      fs.writeFileSync(
        path.join(scratchDir, "healthy_checkpoints.json"),
        JSON.stringify(this.checkpoints, null, 2),
        "utf8"
      );
      if (checkpoint === "F" || checkpoint === "F_DISPATCH") {
        fs.writeFileSync(
          path.join(scratchDir, "healthy_final_provider_prompt.txt"),
          promptText,
          "utf8"
        );
      }
    } catch (e) {
      console.warn("[RenderTracer] Could not write checkpoint to file:", e);
    }
  }

  public static getCheckpoints(): CheckpointRecord[] {
    return this.checkpoints;
  }

  /** Recursively redact secrets, API keys, tokens, auth headers and binary base64 */
  public static sanitize(obj: any, depth = 0): any {
    if (depth > 8) return "[MAX_DEPTH]";
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
      // Secret key pattern matching
      if (/AIzaSy[A-Za-z0-9_-]{33}/.test(obj)) return "[REDACTED_SECRET]";
      if (/gsk_[A-Za-z0-9]{40,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/sk-proj-[A-Za-z0-9_-]{20,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/img_[a-f0-9]{40,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/cfut_[A-Za-z0-9_-]{20,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(obj)) return "[REDACTED_SECRET]";
      if (/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/.test(obj)) return "[REDACTED_SECRET]";
      if (obj.includes("BEGIN PRIVATE KEY")) return "[REDACTED_SECRET]";
      // Check for base64 image data
      if (obj.startsWith("data:image/") || (obj.length > 500 && /^[A-Za-z0-9+/=]+$/.test(obj.slice(0, 100)))) {
        return `[IMAGE_BINARY_DATA length=${obj.length} chars]`;
      }
      return obj;
    }

    if (Buffer.isBuffer(obj)) {
      return {
        type: "Buffer",
        byteLength: obj.length,
        sha256: crypto.createHash("sha256").update(obj).digest("hex").slice(0, 16),
      };
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item, depth + 1));
    }

    if (typeof obj === "object") {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("key") ||
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("authorization") ||
          lowerKey.includes("password") ||
          lowerKey.includes("credential")
        ) {
          sanitized[key] = "[REDACTED_SECRET]";
        } else if (lowerKey === "imagebuffer" || lowerKey === "buffer") {
          sanitized[key] = Buffer.isBuffer(val)
            ? { type: "Buffer", bytes: val.length, hash: crypto.createHash("sha256").update(val).digest("hex").slice(0, 16) }
            : "[BINARY_BUFFER]";
        } else {
          sanitized[key] = this.sanitize(val, depth + 1);
        }
      }
      return sanitized;
    }

    return obj;
  }

  public static startTrace(requestId: string, initialPayload?: any): void {
    if (!this.isTraceEnabled()) return;
    this.traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.traceStartTime = Date.now();
    this.stagesExecuted = [];
    this.modelCalls = 0;
    this.imageRenders = 0;

    console.log("\n============================================================");
    console.log("[TIDO RENDER TRACE]");
    console.log(`trace_id: ${this.traceId}`);
    console.log(`request_id: ${requestId}`);
    console.log(`started_at: ${new Date().toISOString()}`);
    console.log("============================================================\n");

    if (initialPayload) {
      console.log("[INITIAL USER REQUEST PAYLOAD]");
      console.log(JSON.stringify(this.sanitize(initialPayload), null, 2));
      console.log("------------------------------------------------------------\n");
    }
  }

  public static stage(params: StageLogParams): void {
    if (!this.isTraceEnabled()) return;
    this.stagesExecuted.push(`[${params.stageNum}] ${params.name}`);

    console.log("------------------------------------------------------------");
    console.log(`[STAGE ${params.stageNum}] ${params.name}`);
    console.log("------------------------------------------------------------");
    console.log(`file: ${params.file}`);
    console.log(`function: ${params.func}`);
    if (params.durationMs !== undefined) {
      console.log(`duration_ms: ${params.durationMs}ms`);
    }

    if (params.input !== undefined) {
      console.log("\n[INPUT OBJECT]");
      console.log(JSON.stringify(this.sanitize(params.input), null, 2));
    }

    if (params.decision !== undefined) {
      console.log("\n[DECISION / TRANSFORMATION]");
      console.log(JSON.stringify(this.sanitize(params.decision), null, 2));
    }

    if (params.branchesEvaluated && params.branchesEvaluated.length > 0) {
      console.log("\n[BRANCHES / CANDIDATES EVALUATED]");
      for (const branch of params.branchesEvaluated) {
        console.log(`  candidate: "${branch.candidate}" | accepted: ${branch.accepted} | reason: ${branch.reason}`);
      }
    }

    if (params.output !== undefined) {
      console.log("\n[OUTPUT OBJECT]");
      console.log(JSON.stringify(this.sanitize(params.output), null, 2));
    }

    if (params.nextStage) {
      console.log(`\nnext_stage: ${params.nextStage}`);
    }
    console.log("\n");
  }

  public static logPrompt(stageName: string, promptText: string, modelName?: string): void {
    if (!this.isTraceEnabled()) return;
    this.modelCalls++;
    console.log(`\n<<< PROMPT START [${stageName}] model=${modelName || "default"} chars=${promptText.length} >>>`);
    console.log(this.sanitize(promptText));
    console.log(`<<< PROMPT END [${stageName}] >>>\n`);
  }

  public static logResponse(stageName: string, responseText: string): void {
    if (!this.isTraceEnabled()) return;
    console.log(`\n<<< RESPONSE START [${stageName}] chars=${responseText.length} >>>`);
    console.log(this.sanitize(responseText));
    console.log(`<<< RESPONSE END [${stageName}] >>>\n`);
  }

  public static recordImageRender(): void {
    if (!this.isTraceEnabled()) return;
    this.imageRenders++;
  }

  public static summary(params: {
    productionEntryPoint: string;
    correctionTriggered: boolean;
    secondRenderCreated: boolean;
    finalImage?: string;
    editableAsset?: any;
    compiledPromptChars?: number;
    errors?: any[];
    warnings?: any[];
  }): void {
    if (!this.isTraceEnabled()) return;
    const totalLatency = Date.now() - this.traceStartTime;

    console.log("============================================================");
    console.log("[TIDO RENDER TRACE SUMMARY]");
    console.log("============================================================");
    console.log(`trace_id: ${this.traceId}`);
    console.log(`production_entry_point: ${params.productionEntryPoint}`);
    console.log(`stages_executed (${this.stagesExecuted.length}):`);
    this.stagesExecuted.forEach((s) => console.log(`  - ${s}`));
    console.log(`model_calls: ${this.modelCalls}`);
    console.log(`image_renders: ${this.imageRenders}`);
    console.log(`correction_triggered: ${params.correctionTriggered}`);
    console.log(`second_render_created: ${params.secondRenderCreated}`);
    console.log(`final_image: ${params.finalImage || "none"}`);
    console.log(`editable_asset: ${params.editableAsset ? JSON.stringify(this.sanitize(params.editableAsset)) : "none"}`);
    console.log(`compiled_prompt_chars: ${params.compiledPromptChars ?? 0}`);
    console.log(`total_latency_ms: ${totalLatency}ms`);
    console.log(`estimated_cost: ~$0.04 (Nano Banana 2 render + Gemini LLM tokens)`);
    console.log(`errors: ${params.errors && params.errors.length ? JSON.stringify(params.errors) : "none"}`);
    console.log(`warnings: ${params.warnings && params.warnings.length ? JSON.stringify(params.warnings) : "none"}`);
    console.log("============================================================\n");
  }
}
