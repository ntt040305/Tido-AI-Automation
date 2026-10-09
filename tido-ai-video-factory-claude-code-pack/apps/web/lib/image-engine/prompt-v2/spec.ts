/**
 * SUPERSEDED, NOT DELETED. The render path no longer imports this file.
 *
 * Replaced by: `tags.ts` (parsing) and `checks.ts` (validation)
 *
 * Why: the simplified engine returns four tags instead of JSON and runs three
 * checks instead of eleven lint rules. A nine-field JSON schema is no longer
 * the contract, so there is nothing to parse into.
 *
 * Evidence that nothing in production reaches this file (2026-10-02):
 *
 *   grep -rn "prompt-v2/spec" --include=*.ts lib app
 *
 * answers only with other files in this list and with the test and eval runners
 * `run-prompt-engine-v2-tests.ts`, `run-prompt-v2-eval.ts` and
 * `run-prompt-v2-eval-live.ts`. `ExperimentPipeline.ts` imports `build-
 * simple.ts`.
 *
 * It is kept, and kept passing its tests, for two reasons: the eval compares the
 * two engines against the same briefs, and the JSON path is the fallback if the
 * tag path turns out worse on real renders -- which has NOT yet been measured.
 * Deleting it before that measurement would throw away the comparison.
 */
/**
 * The Creative Spec — what the one LLM call returns, and how it is checked.
 *
 * FIELD ORDER IS THE DESIGN
 * -------------------------
 * The order below is the order the model must emit, and it is not cosmetic: a
 * model writes in sequence, so making it state the analysis, then the products,
 * then the idea, then the hierarchy, then the layout BEFORE it writes
 * `master_prompt` is what makes the prompt the conclusion of a chain of thought
 * rather than a paragraph with the reasoning bolted on afterwards.
 *
 * NO NEW DEPENDENCY
 * -----------------
 * Validated by hand rather than with Zod. The repo has no schema library on the
 * image path, and adding one for nine fields would be a dependency decision taken
 * for convenience. Every check here states which field failed, which is the only
 * thing Zod would have given us.
 *
 * WHAT IT REFUSES
 * ---------------
 * A spec that quietly loses the client's words. `copy[].text` must be non-empty,
 * `ref_index` must point at a photo that was actually attached, and nothing here
 * invents a value to fill a hole: a missing field is an error, not a default.
 *
 * Pure. No model call, no I/O.
 */

export type CopyRole = "headline" | "subline" | "cta" | "detail";

export interface SpecProduct {
  /** 1-based index into the attached photos, in the order they were supplied. */
  ref_index: number;
  /** What it looks like, in words. Never a brand claim. */
  look: string;
  /**
   * The lettering the model can read on the label, copied, not invented.
   *
   * Optional: with `V2_INCLUDE_LABEL_TEXT=false` the prompt does not ask for it.
   */
  label_text?: string;
}

export interface SpecCopy {
  role: CopyRole | string;
  /** The client's string. Exact under `copy_policy: "exact"`. */
  text: string;
  /** Where it sits, in words. */
  position?: string;
}

export interface CreativeSpec {
  asset_analysis: string;
  products: SpecProduct[];
  big_idea: string;
  hierarchy: string[];
  layout: string;
  copy: SpecCopy[];
  warnings: string[];
  master_prompt: string;
}

export interface ParseResult {
  ok: boolean;
  spec?: CreativeSpec;
  errors: string[];
}

export interface ParseOptions {
  /** How many photos were attached. `ref_index` may not exceed it. */
  productCount?: number;
}

/**
 * The JSON inside whatever the model actually sent.
 *
 * Three shapes seen in practice: bare JSON, a fenced block, and a fenced block
 * with prose on both sides. Taking the span between the first `{` and the last `}`
 * handles all three and does not need the model to behave.
 */
function extractJson(raw: string): string | null {
  const text = String(raw || "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Parses and validates. Never throws: a model's output is input, not code. */
export function parseCreativeSpec(raw: string, opts: ParseOptions = {}): ParseResult {
  const errors: string[] = [];
  const json = extractJson(raw);
  if (!json) return { ok: false, errors: ["no JSON object found in the model's reply"] };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, errors: [`JSON did not parse: ${(e as Error).message.slice(0, 120)}`] };
  }

  const asset_analysis = str(parsed.asset_analysis);
  const big_idea = str(parsed.big_idea);
  const layout = str(parsed.layout);
  const master_prompt = str(parsed.master_prompt);
  if (!asset_analysis) errors.push("asset_analysis is missing or empty");
  if (!big_idea) errors.push("big_idea is missing or empty");
  if (!layout) errors.push("layout is missing or empty");
  if (!master_prompt) errors.push("master_prompt is missing or empty");

  if (!Array.isArray(parsed.products)) {
    errors.push("products must be an array");
  }
  const products: SpecProduct[] = (Array.isArray(parsed.products) ? parsed.products : []).map((p, i) => {
    const row = (p || {}) as Record<string, unknown>;
    const ref = Number(row.ref_index);
    const look = str(row.look);
    if (!Number.isFinite(ref) || ref < 1) errors.push(`products[${i}].ref_index must be a 1-based photo number`);
    else if (typeof opts.productCount === "number" && ref > opts.productCount) {
      errors.push(`products[${i}].ref_index ${ref} points past the ${opts.productCount} photo(s) supplied`);
    }
    if (!look) errors.push(`products[${i}].look is missing or empty`);
    const label = str(row.label_text);
    return { ref_index: ref, look, ...(label ? { label_text: label } : {}) };
  });

  if (!Array.isArray(parsed.copy)) errors.push("copy must be an array");
  const copy: SpecCopy[] = (Array.isArray(parsed.copy) ? parsed.copy : []).map((c, i) => {
    const row = (c || {}) as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text : "";
    if (!text.trim()) errors.push(`copy[${i}].text is missing or empty`);
    return {
      role: str(row.role) || "detail",
      // NOT trimmed into oblivion: the client's string is kept as the model
      // returned it, and the linter is what compares it to what was asked for.
      text,
      ...(str(row.position) ? { position: str(row.position) } : {}),
    };
  });

  const spec: CreativeSpec = {
    asset_analysis,
    products,
    big_idea,
    hierarchy: strArray(parsed.hierarchy),
    layout,
    copy,
    warnings: strArray(parsed.warnings),
    master_prompt,
  };

  return errors.length ? { ok: false, spec, errors } : { ok: true, spec, errors: [] };
}

/** Counts only. Never the client's copy, never the prompt. */
export function specTelemetry(spec: CreativeSpec | null | undefined) {
  if (!spec) return { creative_spec: false };
  return {
    creative_spec: true,
    products: spec.products.length,
    labelled_products: spec.products.filter((p) => p.label_text).length,
    copy_strings: spec.copy.length,
    hierarchy_steps: spec.hierarchy.length,
    warnings: spec.warnings.length,
    prompt_chars: spec.master_prompt.length,
    prompt_words: spec.master_prompt.split(/\s+/).filter(Boolean).length,
  };
}
