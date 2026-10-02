/**
 * Which prompt engine this render uses.
 *
 * `PROMPT_ENGINE=v1|v2`, **default `v1`**. One place reads the variable so the
 * answer cannot differ between two call sites, and so a reader can find every
 * consequence of the flag by finding the callers of this file.
 *
 * WHAT v1 AND v2 ARE
 * ------------------
 *   v1  the eight-block script assembled in code: `MasterPromptCompilerService`
 *       then `OpticalCompiler`, with `CinematographyLayer`, `FinishLayer`,
 *       `IdeaLayer` and `AssetProfile` supplying blocks. Deterministic, ~25,000
 *       characters, carries physical parameters.
 *   v2  one LLM call that acts as creative director and writes the prompt itself:
 *       250-450 words of prose, no technical parameters, one idea. Validated by a
 *       linter, and on failure it falls back to v1.
 *
 * v1 IS NOT DEPRECATED BY THIS FLAG
 * ---------------------------------
 * It is the fallback for every v2 failure -- a timeout, broken JSON, a schema
 * violation, a linter failure that one repair attempt did not fix -- so it has to
 * keep working. Nothing in the v1 path reads this file.
 *
 * Pure: reads the environment, decides nothing else.
 */

/** Just enough of an environment to read. Keeps the tests free of casts. */
export type EnvLike = Record<string, string | undefined>;

export type PromptEngineVersion = "v1" | "v2";

/** The default, stated once. Changing this line changes production behaviour. */
export const DEFAULT_PROMPT_ENGINE: PromptEngineVersion = "v1";

/**
 * The engine this process uses.
 *
 * Anything other than exactly `v2` is `v1`, including typos: a misspelt flag on a
 * deploy should keep the known-good engine rather than silently pick a new one.
 */
export function promptEngineVersion(env: EnvLike = process.env): PromptEngineVersion {
  return String(env.PROMPT_ENGINE || "").trim().toLowerCase() === "v2" ? "v2" : DEFAULT_PROMPT_ENGINE;
}

export function isV2(env: EnvLike = process.env): boolean {
  return promptEngineVersion(env) === "v2";
}

/**
 * Whether the v2 prompt copies the lettering it can read on the product's label.
 *
 * Default ON. Off, the prompt says only "exactly as in attached photo N" and
 * leaves the label to the reference pixels. The reason this is a flag and not a
 * decision: copying the label text is the better instruction when the model reads
 * the label correctly and the worse one when it misreads it, and which of those is
 * true for this provider is UNVERIFIED. The eval runs both so it can be measured
 * rather than argued.
 *
 * Both modes always state "exactly as in attached photo N".
 */
export function includeLabelText(env: EnvLike = process.env): boolean {
  return String(env.V2_INCLUDE_LABEL_TEXT || "").trim().toLowerCase() !== "false";
}

/**
 * Whether the post-render product-label comparison runs. Default OFF.
 *
 * It costs a vision call per render and it is new, so it is opt-in: the render
 * path must behave identically for anyone who has not asked for it.
 */
export function labelCheckEnabled(env: EnvLike = process.env): boolean {
  return String(env.V2_LABEL_CHECK || "").trim().toLowerCase() === "true";
}

/** Counts and names only. Never a key, never a prompt. */
export function engineTelemetry(env: EnvLike = process.env) {
  return {
    prompt_engine: promptEngineVersion(env),
    v2_include_label_text: includeLabelText(env),
    v2_label_check: labelCheckEnabled(env),
  };
}
