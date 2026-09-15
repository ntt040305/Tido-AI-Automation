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
  /**
   * Per-stage durations, copied from the diagnostics the orchestrator already
   * produces.
   *
   * They were computed on every render and printed to a console nobody keeps, so
   * "where do the 200 seconds go" had no answer that survived the terminal
   * scrollback. Durations only — the policy above still holds, and a number of
   * milliseconds carries no customer content.
   */
  pipeline_timing?: Record<string, number>;
  /** Provider sub-stages, where the adapter reported them. */
  provider_timing?: Record<string, number>;
}

const LOG_PATH = process.env.TIDO_EVOLUTION_LOG_PATH
  ? path.resolve(process.env.TIDO_EVOLUTION_LOG_PATH)
  : path.join(process.cwd(), "data", "evolution", "generation-log.jsonl");

/**
 * The adapter's own measurements, when it reported any.
 *
 * Read defensively: `remoteDetails` is an open shape and a provider that never
 * heard of these keys is normal, not an error.
 */
function pickProviderTiming(
  result: SimpleImageGenerationResultV1
): Record<string, number> | undefined {
  // The adapter's details reach the result under several names depending on the
  // path that produced it, and are also written to the render's metadata file.
  // All the candidates are checked rather than the first one guessed: a lookup
  // that silently missed is what made the first instrumented run report nothing
  // while the numbers sat in metadata.json the whole time.
  const r = result as any;
  const d =
    r?.remoteDetails ||
    r?.remote_details ||
    r?.diagnostics?.remoteDetails ||
    r?.project?.output?.remote_details ||
    r?.project?.output?.metadata?.remote_details;
  if (!d) return undefined;
  const out: Record<string, number> = {};
  for (const k of ["api_request_ms", "download_ms", "download_bytes", "attempts"]) {
    if (typeof d[k] === "number") out[k] = d[k];
  }
  return Object.keys(out).length ? out : undefined;
}

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
    pipeline_timing: result.diagnostics?.pipeline_timing,
    provider_timing: pickProviderTiming(result),
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
