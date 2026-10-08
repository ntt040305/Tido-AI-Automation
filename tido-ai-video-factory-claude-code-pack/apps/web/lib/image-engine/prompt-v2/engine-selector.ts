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
import { activeProfile, type PromptDialect } from "../models/image-model-profiles";

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

/**
 * Which prompt dialect the ACTIVE MODEL requires — not which engine a flag asked for.
 *
 * The distinction matters because the two are different kinds of decision.
 * `PROMPT_ENGINE` is a preference about how to write a Gemini prompt; the dialect is
 * a fact about the model that will read it. A GPT-Image model cannot be sent a
 * Gemini-dialect prompt just because a flag says `v1`.
 */
export function promptDialect(env: EnvLike = process.env): PromptDialect {
  return activeProfile(env).promptDialect;
}

/**
 * Raised when a render needs the GPT dialect and it does not exist yet.
 *
 * Deliberately a hard failure. The two silent alternatives are both worse than
 * stopping: falling back to engine v1 would send Sunburst a ~26,000-character
 * Gemini-dialect prompt built for a different model, and falling back to the Gemini
 * v2 would send it a shorter prompt built for the same wrong model. Either produces
 * an image that looks like a result, costs 150-250 VND, and tells nobody that the
 * dialect the model needed was never written. That is exactly how the `__dirname`
 * failure stayed invisible for a whole phase.
 */
export class PromptDialectNotBuiltError extends Error {
  readonly code = "PROMPT_DIALECT_NOT_BUILT";
  readonly dialect: PromptDialect;
  readonly model: string;

  constructor(dialect: PromptDialect, model: string) {
    super(
      `GPT dialect not built yet: the active model is ${model}, which requires the ` +
        `"${dialect}" prompt dialect, and Phase 3 has not been built. Refusing to send a ` +
        `prompt written for a different model. Roll back by setting ` +
        `IMGSTUDIO_PROVIDER_ID=flow-nano-banana-2 and restarting.`,
    );
    this.name = "PromptDialectNotBuiltError";
    this.dialect = dialect;
    this.model = model;
  }
}

/**
 * Whether the GPT dialect exists.
 *
 * One place, so the day Phase 3 lands this flips once and every caller follows.
 * Checked by file presence rather than a flag: a flag can be on while the files are
 * missing, which is the state that produced a silent v1 fallback before.
 */
export function gptDialectAvailable(): boolean {
  // Phase 3 is built: `gpt-brief.ts`, `gpt-checks.ts`, `gpt-fallback.ts`, `build-gpt.ts`
  // and `templates/gpt/` all exist, and `build-gpt.ts` refuses rather than guessing on
  // the one thing that is still unverified (see `labelLockVerified`).
  return true;
}

/**
 * Whether Sunburst's label-lock has been CONFIRMED at a packed panel size.
 *
 * Default FALSE, and that is the point.
 *
 * `03-provider-capabilities.md` measured the provider; it did not measure this. The
 * allocation table's "panels <512px" column is arithmetic — 496px is what a 2x2 grid of a
 * 1024px sheet produces — and whether a product's LABEL still reads correctly at 496px is
 * an observation nobody has made against the real model. A mocked render cannot answer it
 * either: a stub returns a stub image.
 *
 * While this is false, `build-gpt.ts` REFUSES a payload whose product panels fall below
 * the floor, with a Vietnamese message telling the user to send fewer images — mirroring
 * the way the allocator already refuses nine distinct products. The alternative is to
 * send it anyway and hope, which is a silent quality regression on exactly the renders
 * someone cares most about.
 *
 * Flip it with `GPT_LABEL_LOCK_VERIFIED=true` ONLY after real Sunburst renders at n=5 and
 * n=8 have been inspected and the labels are right.
 */
export function labelLockVerified(env: EnvLike = process.env): boolean {
  return String(env.GPT_LABEL_LOCK_VERIFIED || "").trim().toLowerCase() === "true";
}

/**
 * Whether the GPT checks refuse verdict words ("stunning", "breathtaking").
 *
 * Off by default: it is a taste rule rather than a correctness one, and a check that
 * fails a prompt for enthusiasm costs a repair call for nothing.
 */
/**
 * What to do about a packed product panel below the model's identity floor.
 *
 * `"warn"` by DEFAULT, and this is a change from how it first shipped. It used to
 * refuse, and refusing was right while the brief said nothing about panel size: the
 * prompt would have claimed a 466px panel was label-lockable and the user would have
 * got invented lettering on a real product with no warning anywhere.
 *
 * That is no longer the situation. Three things now stand between a small panel and a
 * wrong render, and all three are visible:
 *   1. section C of the brief states which panels are not large enough to read and tells
 *      the director to take shape and colour from them and the WORDING from the product
 *      facts instead;
 *   2. `gpt-checks` fails a prompt that asks for a small panel's lettering anyway
 *      (LABEL_LOCK_ON_SMALL_PANEL), so the claim cannot reach the model;
 *   3. the panel sizes and the floor ride back on the render in
 *      `remoteDetails.reference_packing.warnings`.
 *
 * So the risk is declared, enforced and reported — not silent. Refusing on top of that
 * blocks the one thing that can actually settle the question, which is looking at a real
 * render of five products.
 *
 * `GPT_SMALL_PANEL_POLICY=refuse` restores the strict behaviour.
 */
export type SmallPanelPolicy = "warn" | "refuse";

export function smallPanelPolicy(env: EnvLike = process.env): SmallPanelPolicy {
  return String(env.GPT_SMALL_PANEL_POLICY || "").trim().toLowerCase() === "refuse" ? "refuse" : "warn";
}

export function gptBanVerdictWords(env: EnvLike = process.env): boolean {
  return String(env.GPT_BAN_VERDICT_WORDS || "").trim().toLowerCase() === "true";
}

/**
 * Whether the Art Direction Sheet writes the Sunburst brief. Default OFF.
 *
 * ONE flag for the whole upgrade, and that is deliberate. The work spans the pipeline
 * adapter, the brief compiler, a new template set, five new deterministic checks and the
 * code-built fallback; splitting it across five flags would produce combinations nobody
 * has looked at — an adapter populating fields a v1 template has no slot for, checks
 * refusing a prompt the brief could not have written differently. Either the sheet is
 * driving or it is not.
 *
 * With it off the GPT dialect behaves exactly as it does today, which is the rollback.
 * `run-gpt-golden-tests` pins that byte for byte over fourteen briefs, so the claim is a
 * file comparison rather than an assurance. Rollback is unsetting one variable.
 */
export function gptArtDirector(env: EnvLike = process.env): boolean {
  return String(env.GPT_ART_DIRECTOR || "").trim().toLowerCase() === "true";
}

/**
 * The template version the GPT dialect reads.
 *
 * The art-director brief needs slots the v1 request template does not have, so the flag
 * selects the v2 files. Read here rather than at the two call sites so a reader cannot
 * find one of them having its own opinion.
 *
 * `PROMPT_V2_TEMPLATE_VERSION` still wins when it is set, which is what makes a third
 * version possible later without touching this function. It does NOT affect the Gemini
 * set: that path keeps calling `templateVersion()` directly.
 */
export function gptTemplateVersion(env: EnvLike = process.env): string {
  const explicit = String(env.PROMPT_V2_TEMPLATE_VERSION || "").trim().toLowerCase();
  if (/^v\d+$/.test(explicit)) return explicit;
  return gptArtDirector(env) ? "v2" : "v1";
}

/**
 * How precisely layout may be stated in words. Default `words_only`.
 *
 * D1 keeps the ban on digits and units in a master prompt, which the D8/K12 migration
 * measured: a numeral in a prompt reaches the image as a numeral, and a parameter dump
 * degrades the render. Layout precision is therefore spelled out — "about thirty percent
 * of the canvas height", "a seven percent safe margin".
 *
 * But whether spelled-out percentages HELP is a hypothesis, not a measured fact. The two
 * modes exist so it can be A/B'd rather than argued:
 *
 *   words_only          relative language only — "the top third", "a narrow margin"
 *   words_plus_percent  spelled-out percentages as well, in the layout sections
 *
 * Nothing in this round runs that A/B; it costs real renders. `scripts/eval-gpt-density.ts`
 * is the guarded script for it.
 */
export type NumericWordsDensity = "words_only" | "words_plus_percent";

export function numericWordsDensity(env: EnvLike = process.env): NumericWordsDensity {
  return String(env.GPT_NUMERIC_WORDS || "").trim().toLowerCase() === "words_plus_percent"
    ? "words_plus_percent"
    : "words_only";
}

/**
 * The engine to use for the active model, or a thrown error rather than a guess.
 *
 * Gemini models keep today's behaviour exactly — `PROMPT_ENGINE` decides, v1 by
 * default — so the rollback path is untouched.
 */
export function engineForActiveModel(env: EnvLike = process.env):
  | { dialect: "gemini"; engine: PromptEngineVersion }
  | { dialect: "gpt-image"; engine: "v2-gpt" } {
  const dialect = promptDialect(env);
  if (dialect === "gemini") return { dialect, engine: promptEngineVersion(env) };
  // Kept, rather than deleted, for the next dialect that is named before it is written.
  // It cannot fire for "gpt-image" any more.
  if (!gptDialectAvailable()) {
    throw new PromptDialectNotBuiltError(dialect, activeProfile(env).displayName);
  }
  return { dialect, engine: "v2-gpt" };
}

/** Counts and names only. Never a key, never a prompt. */
export function engineTelemetry(env: EnvLike = process.env) {
  return {
    prompt_engine: promptEngineVersion(env),
    prompt_dialect: promptDialect(env),
    gpt_dialect_available: gptDialectAvailable(),
    gpt_label_lock_verified: labelLockVerified(env),
    gpt_small_panel_policy: smallPanelPolicy(env),
    gpt_art_director: gptArtDirector(env),
    gpt_template_version: gptTemplateVersion(env),
    gpt_numeric_words: numericWordsDensity(env),
    v2_director_model: directorModel(env) || "(provider default)",
    v2_copy_policy: `${copyPolicyMode(env).mode}(${copyPolicyMode(env).source})`,
    v2_template_reload: templateReload(env),
    v2_include_label_text: includeLabelText(env),
    v2_label_check: labelCheckEnabled(env),
    v2_fallback_to_v1: fallbackToV1(env),
  };
}
