import fs from "fs";
import path from "path";
import { SimpleImageGenerationResultV1 } from "../types";
import type { RoutingDecision } from "./PipelineRouter";

/**
 * One line per generation, so stable and experiment can be compared later.
 *
 * What is recorded is deliberately narrow: which pipeline ran, which component
 * builds it used, which flags were on, and how the attempt ended. That is enough
 * to answer "did the experiment change anything, and was the change good", and
 * it is the whole reason the routing layer exists.
 *
 * What is NOT recorded, and must not be added: the brief, the prompt, uploaded
 * image bytes, brand text, or any identifier belonging to a person. A comparison
 * log accumulates for months and is read by whoever is debugging; it is the
 * wrong place for customer content. Diagnostics are reduced to counts and
 * durations here for the same reason. If a future comparison genuinely needs
 * prompt text, it belongs in a separate opt-in store with its own retention,
 * not appended to this file by default.
 *
 * Failures are swallowed. A logger that can fail a render is a worse problem
 * than a missing log line.
 */

export interface GenerationLogEntry {
  ts: string;
  generation_id: string;
  pipeline: string;
  pipeline_version: string;
  routing_reason: string;
  component_versions: Record<string, string>;
  features_enabled: string[];
  rollout_mode: string;
  status: string;
  success: boolean;
  duration_ms: number;
  prompt_chars?: number;
  reference_count?: number;
  error_code?: string;
}

const LOG_PATH = process.env.TIDO_EVOLUTION_LOG_PATH
  ? path.resolve(process.env.TIDO_EVOLUTION_LOG_PATH)
  : path.join(process.cwd(), "data", "evolution", "generation-log.jsonl");

export function logGeneration(
  decision: RoutingDecision,
  result: SimpleImageGenerationResultV1,
  durationMs: number
): GenerationLogEntry | null {
  const entry: GenerationLogEntry = {
    ts: new Date().toISOString(),
    generation_id: result.generationId,
    pipeline: decision.pipeline,
    pipeline_version: decision.pipeline_version,
    routing_reason: decision.reason,
    component_versions: decision.component_versions,
    features_enabled: decision.features_enabled,
    rollout_mode: decision.flags.rollout_mode,
    status: String(result.status),
    success: Boolean(result.success),
    duration_ms: durationMs,
    prompt_chars: result.diagnostics?.promptChars,
    reference_count: result.diagnostics?.referenceCount,
    error_code: result.error?.code,
  };

  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err: any) {
    console.warn("[EVOLUTION][LOG] write failed", { error: err?.message || String(err) });
    return entry;
  }
  return entry;
}

/** Reads back the log for comparison. Newest last, as written. */
export function readLog(limit = 500): GenerationLogEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l) as GenerationLogEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as GenerationLogEntry[];
  } catch {
    return [];
  }
}

/**
 * Stable against experiment, on what the log can actually see.
 *
 * Success rate, latency and prompt size — not image quality, which no line of
 * JSON can report. Treat this as the signal that says whether an experiment is
 * safe to keep running, and judge whether it is any *good* somewhere that can
 * look at pictures.
 */
export function comparePipelines(entries: GenerationLogEntry[] = readLog()) {
  const group = (id: string) => {
    const rows = entries.filter((e) => e.pipeline === id);
    const ok = rows.filter((e) => e.success);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      runs: rows.length,
      success_rate: rows.length ? Number((ok.length / rows.length).toFixed(3)) : null,
      mean_duration_ms: Math.round(mean(rows.map((e) => e.duration_ms || 0))),
      mean_prompt_chars: Math.round(mean(rows.map((e) => e.prompt_chars || 0).filter(Boolean))),
      errors: rows.filter((e) => !e.success).map((e) => e.error_code || e.status),
    };
  };
  return {
    stable: group("stable"),
    experiment: group("experiment"),
    note: "Success, latency and prompt size only. Image quality is not in this file and cannot be inferred from it.",
  };
}

export function logPath(): string {
  return LOG_PATH;
}
