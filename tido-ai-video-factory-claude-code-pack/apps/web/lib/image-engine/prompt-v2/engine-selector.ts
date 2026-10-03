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
 * It is free -- it reads the observation the review pass already made rather than
 * paying for a second vision call -- but it is new, so it is opt-in: the render path
 * must behave identically for anyone who has not asked for it.
 */
export function labelCheckEnabled(env: EnvLike = process.env): boolean {
  return String(env.V2_LABEL_CHECK || "").trim().toLowerCase() === "true";
}

/**
 * What happens when v2 fails. Default: render through v1.
 *
 * `V2_FALLBACK=off` lets the failure surface instead, which is what you want while
 * tuning the meta-prompt -- a silent fallback hides exactly the failures you are
 * trying to see. The default is the other way round because in production a render
 * that falls back costs the user a worse prompt, and one that errors costs them the
 * job.
 *
 * The simplified build stops after one repair either way; this only decides who
 * reports the failure.
 */
export function fallbackToV1(env: EnvLike = process.env): boolean {
  return String(env.V2_FALLBACK || "").trim().toLowerCase() !== "off";
}

/**
 * What may happen to the client's copy. Default: nothing.
 *
 * `exact` -- the default -- means the copy is never shortened, whatever the playbook's
 * budget says. The engine used to flip to `adapt` on its own when the copy ran over,
 * and a measured render came back with the client's words silently cut: they typed one
 * thing and got a shorter thing, with the only trace in a warning nobody printed.
 * Worse, the post-render gate then compared the image against the SHORTENED list and
 * reported it compliant.
 *
 * Long copy is a layout problem. The old behaviour is still available as
 * `adapt_when_over_budget` for whoever wants it, and it has to be asked for.
 */
export type CopyPolicyMode = "exact" | "adapt_when_over_budget";

export interface CopyPolicyChoice {
  mode: CopyPolicyMode;
  /** Where the value came from. Logged, so a surprising policy is traceable. */
  source: "default" | "env";
}

export function copyPolicyMode(env: EnvLike = process.env): CopyPolicyChoice {
  const raw = String(env.V2_COPY_POLICY || "").trim().toLowerCase();
  if (raw === "adapt_when_over_budget") return { mode: "adapt_when_over_budget", source: "env" };
  // Anything else, including a typo, is the policy that does not touch the copy.
  if (raw === "exact") return { mode: "exact", source: "env" };
  return { mode: "exact", source: "default" };
}

/**
 * Whether the templates are re-read from disk on every job.
 *
 * Off by default: the files do not change while a server runs, and a read per job is a
 * syscall per job for nothing. `V2_TEMPLATE_RELOAD=true` turns it on, which is what you
 * want while editing a meta-prompt — otherwise an edit needs a server restart to take
 * effect and it is very easy to spend an afternoon testing the previous version.
 */
export function templateReload(env: EnvLike = process.env): boolean {
  return String(env.V2_TEMPLATE_RELOAD || "").trim().toLowerCase() === "true";
}

/**
 * The model that writes the prompt. Empty means "whatever the provider defaults to".
 *
 * A separate variable because this one call has a different job from every other call
 * in the system: it is a creative director, not a classifier or a judge, and the model
 * that is best at writing a brief is not necessarily the one configured for vision
 * review. Changing it must not change any other call, which is exactly what reusing
 * `LLM_MODEL` would do.
 *
 * It selects a model within the provider already configured. It is NOT a provider
 * switch, and nothing here may become one.
 */
export function directorModel(env: EnvLike = process.env): string | undefined {
  const raw = String(env.V2_DIRECTOR_MODEL || "").trim();
  return raw || undefined;
}

/** Counts and names only. Never a key, never a prompt. */
export function engineTelemetry(env: EnvLike = process.env) {
  return {
    prompt_engine: promptEngineVersion(env),
    v2_director_model: directorModel(env) || "(provider default)",
    v2_copy_policy: `${copyPolicyMode(env).mode}(${copyPolicyMode(env).source})`,
    v2_template_reload: templateReload(env),
    v2_include_label_text: includeLabelText(env),
    v2_label_check: labelCheckEnabled(env),
    v2_fallback_to_v1: fallbackToV1(env),
  };
}
