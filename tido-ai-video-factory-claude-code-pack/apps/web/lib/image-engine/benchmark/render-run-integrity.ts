import fs from "fs";
import path from "path";

/**
 * Phase 1.1D — was this benchmark run real?
 *
 * Why this is its own module
 * --------------------------
 * The failure it exists to catch is a run that did not genuinely re-render.
 * Two consecutive runs once produced twelve byte-identical images while the
 * provider was separately measured as stochastic — identical prompts give
 * different pictures — and because each run overwrote the last there was no
 * evidence left to diagnose it with.
 *
 * A detector that could only be exercised by a live render would share exactly
 * the blind spot it is meant to remove, so it lives here: no gateway, no
 * provider, no spend, and testable on fixtures. The benchmark imports it; it
 * imports nothing from the benchmark.
 */

/** One row per generated image, written to a run's `hashes.json`. */
export interface RenderHashRow {
  scenario_id: string;
  arm: string;
  timestamp: string;
  /** The brief as the request carried it, before any compilation. */
  prompt_hash: string;
  /** The master prompt the provider actually received, when it was persisted. */
  compiled_prompt_hash: string | null;
  /** What the provider said about the result, independent of the bytes. */
  provider_response_hash: string | null;
  image_md5: string | null;
}

export interface DuplicateRender {
  scenario: string;
  arm: string;
  image_hash: string;
  previous_run: string;
  /**
   * True when the compiled prompt ALSO matched.
   *
   * The distinction that matters. Same prompt and same image is a provider
   * returning a cached asset, which is ordinary. A different prompt with the
   * same image is not something a stochastic generator does, and is the shape
   * of the original defect.
   */
  same_compiled_prompt: boolean;
}

export interface IntegrityResult {
  duplicates: DuplicateRender[];
  unique_images: number;
  total_images: number;
  /** Runs that were read for comparison. Empty on the first run ever. */
  compared_against: string[];
}

/**
 * Compares one run's hashes against every previous run's `hashes.json`.
 *
 * Reports, never judges. A provider returning a cached asset is a legitimate
 * explanation for a repeat; so is a harness that skipped the render. The point
 * is that neither passes unnoticed, and `same_compiled_prompt` is what lets a
 * reader tell them apart without a third investigation.
 */
export function detectDuplicates(
  rows: RenderHashRow[],
  benchRoot: string,
  currentRunId: string
): IntegrityResult {
  /** image hash -> { run, compiled prompt hash seen with it } */
  const seen = new Map<string, { run: string; compiled: string | null }>();
  const compared: string[] = [];

  const dirs = fs.existsSync(benchRoot)
    ? fs.readdirSync(benchRoot).filter((d) => d !== currentRunId).sort()
    : [];

  for (const dir of dirs) {
    const file = path.join(benchRoot, dir, "hashes.json");
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      compared.push(dir);
      for (const row of parsed.images || []) {
        // First appearance wins, so a repeat is attributed to the earliest run
        // rather than to whichever directory happened to sort last.
        if (row?.image_md5 && !seen.has(row.image_md5)) {
          seen.set(row.image_md5, { run: dir, compiled: row.compiled_prompt_hash ?? null });
        }
      }
    } catch {
      // An unreadable or half-written previous run is not this run's problem,
      // and refusing to report on that account would be worse than skipping it.
    }
  }

  const duplicates: DuplicateRender[] = [];
  for (const h of rows) {
    if (!h.image_md5) continue;
    const previous = seen.get(h.image_md5);
    if (!previous) continue;
    duplicates.push({
      scenario: h.scenario_id,
      arm: h.arm,
      image_hash: h.image_md5,
      previous_run: previous.run,
      same_compiled_prompt:
        previous.compiled !== null &&
        h.compiled_prompt_hash !== null &&
        previous.compiled === h.compiled_prompt_hash,
    });
  }

  return {
    duplicates,
    unique_images: new Set(rows.map((r) => r.image_md5).filter(Boolean)).size,
    total_images: rows.filter((r) => r.image_md5).length,
    compared_against: compared,
  };
}
