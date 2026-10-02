/**
 * SUPERSEDED, NOT DELETED. The render path no longer imports this file.
 *
 * Replaced by: `build-simple.ts`
 *
 * Why: the simplified engine returns four tags instead of JSON and runs three
 * checks instead of eleven lint rules. Same shape -- one call, one repair,
 * then stop -- without the schema layer.
 *
 * Evidence that nothing in production reaches this file (2026-10-02):
 *
 *   grep -rn "prompt-v2/build" --include=*.ts lib app
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
 * The v2 build — one LLM call, one linter, one repair, then v1 if it still fails.
 *
 * COST IS THE POINT
 * -----------------
 * v1 makes four to five model calls on the image path (Marketing Brain, the
 * director's judgment, the blueprint, the vision review, sometimes a second
 * render). v2 makes ONE, and a second only when the linter refuses the first. A
 * version of this that added a call would have missed the brief however much it
 * improved the prose, so the call count is returned on every result and logged.
 *
 * FAILURE IS A RETURN VALUE
 * -------------------------
 * Nothing here throws. A timeout, a refusal, broken JSON, a schema violation, a
 * linter failure that the repair did not fix -- each one returns `ok: false` with a
 * reason, and the caller runs v1. The worst outcome of a v2 bug is a v1 render.
 *
 * WHAT IT HANDS BACK ABOUT COPY
 * -----------------------------
 * `copy_original` and `copy_final`, both NFC. Under `exact` they are the same
 * list. Under `adapt` they differ, and the difference is what the job's warnings
 * and the integrity gate are told about -- the gate compares the FINAL copy,
 * because that is what the renderer was asked to draw.
 *
 * No I/O of its own: the model call arrives as a dependency so tests can stub it.
 */
import type { AspectRatio } from "./playbooks";
import { playbookFor } from "./playbooks";
import {
  buildRepairMessage,
  buildSystemPrompt,
  buildUserMessage,
  claimWarnings,
  decideCopyPolicy,
  type CopyPolicy,
  type DirectorInput,
} from "./director";
import { lintMasterPrompt, type LintResult } from "./linter";
import { parseCreativeSpec, type CreativeSpec } from "./spec";

export interface V2BuildInput {
  assetType: string;
  aspectRatio: AspectRatio;
  concept: string;
  brand: string;
  productLine?: string;
  /** The client's strings, exactly as typed. */
  copy: string[];
  /** `exact` unless the caller insists; the budget may still force `adapt`. */
  copyPolicy?: CopyPolicy;
  products: Array<{ ref_index: number; description?: string; imageUrl?: string }>;
  notes?: string;
  includeLabelText: boolean;
}

/** The one dependency: something that can hold a chat with a model. */
export interface V2Deps {
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>;
}

export interface V2BuildResult {
  ok: boolean;
  /** The prompt to send, when `ok`. */
  prompt?: string;
  spec?: CreativeSpec;
  lint?: LintResult;
  /** Why v1 should take over. Absent when `ok`. */
  reason?: string;
  /** Everything the user should be told, including claim and shortening notices. */
  warnings: string[];
  /** Model calls this build actually made. 1 normally, 2 after a repair. */
  llmCalls: number;
  copyPolicy: CopyPolicy;
  copy_original: string[];
  copy_final: string[];
}

const nfc = (s: string) => String(s ?? "").normalize("NFC");

/** The strings the spec ended up using, in its own order. Falls back to the originals. */
function finalCopy(spec: CreativeSpec | undefined, original: string[]): string[] {
  const fromSpec = (spec?.copy || []).map((c) => nfc(c.text)).filter((t) => t.trim());
  return fromSpec.length ? fromSpec : original;
}

export async function buildV2Prompt(input: V2BuildInput, deps: V2Deps): Promise<V2BuildResult> {
  const copy_original = input.copy.map(nfc).filter((c) => c.trim());
  const playbook = playbookFor(input.assetType, input.aspectRatio);
  const policy = decideCopyPolicy(copy_original, playbook, input.copyPolicy ?? "exact");
  const warnings = [...policy.warnings, ...claimWarnings(copy_original)];

  const directorInput: DirectorInput = {
    assetType: input.assetType,
    aspectRatio: input.aspectRatio,
    concept: input.concept,
    brand: input.brand,
    productLine: input.productLine,
    copy: copy_original,
    copyPolicy: policy.policy,
    products: input.products,
    notes: input.notes,
    includeLabelText: input.includeLabelText,
  };

  const base = {
    warnings,
    llmCalls: 0,
    copyPolicy: policy.policy,
    copy_original,
    copy_final: copy_original,
  };

  const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
    { role: "system", content: buildSystemPrompt(playbook, directorInput) },
    buildUserMessage(directorInput) as { role: "user"; content: unknown },
  ];

  let raw = "";
  try {
    raw = await deps.chat(messages, "prompt_v2_creative_director");
  } catch (e) {
    return { ...base, ok: false, llmCalls: 1, reason: `the model call failed: ${(e as Error).message.slice(0, 160)}` };
  }
  let calls = 1;

  let parsed = parseCreativeSpec(raw, { productCount: input.products.length });
  let lint: LintResult | undefined = parsed.spec
    ? lintMasterPrompt(parsed.spec.master_prompt, {
        copy: finalCopy(parsed.spec, copy_original),
        aspectRatio: input.aspectRatio,
        playbook,
        labelText: parsed.spec.products.map((p) => p.label_text || "").filter(Boolean),
      })
    : undefined;

  // One repair, and only one: a second repair is a third call, and the whole
  // reason v2 exists is that calls cost money.
  const problems = [...parsed.errors, ...(lint?.errors || []).map((e) => `${e.code}: ${e.message}`)];
  if (problems.length) {
    try {
      const repaired = await deps.chat([...messages, { role: "assistant", content: raw }, buildRepairMessage(raw, problems) as { role: "user"; content: unknown }], "prompt_v2_repair");
      calls = 2;
      const reparsed = parseCreativeSpec(repaired, { productCount: input.products.length });
      if (reparsed.spec) {
        const relint = lintMasterPrompt(reparsed.spec.master_prompt, {
          copy: finalCopy(reparsed.spec, copy_original),
          aspectRatio: input.aspectRatio,
          playbook,
          labelText: reparsed.spec.products.map((p) => p.label_text || "").filter(Boolean),
        });
        parsed = reparsed;
        lint = relint;
      }
    } catch (e) {
      return {
        ...base,
        ok: false,
        llmCalls: 2,
        reason: `the repair call failed: ${(e as Error).message.slice(0, 160)}`,
        spec: parsed.spec,
        lint,
      };
    }
  }

  const copy_final = finalCopy(parsed.spec, copy_original);
  const specWarnings = parsed.spec?.warnings || [];
  const allWarnings = [...warnings, ...specWarnings];

  if (!parsed.ok || !parsed.spec) {
    return { ...base, ok: false, llmCalls: calls, warnings: allWarnings, copy_final, spec: parsed.spec, lint, reason: `the spec did not validate: ${parsed.errors.slice(0, 3).join("; ")}` };
  }
  if (!lint || !lint.ok) {
    return {
      ...base,
      ok: false,
      llmCalls: calls,
      warnings: allWarnings,
      copy_final,
      spec: parsed.spec,
      lint,
      reason: `the prompt did not pass the linter: ${(lint?.errors || []).map((e) => e.code).slice(0, 4).join(", ")}`,
    };
  }

  return {
    ok: true,
    prompt: parsed.spec.master_prompt,
    spec: parsed.spec,
    lint,
    warnings: [...allWarnings, ...lint.warnings],
    llmCalls: calls,
    copyPolicy: policy.policy,
    copy_original,
    copy_final,
  };
}

/** Counts, codes and verdicts. Never the prompt, never the copy. */
export function v2Telemetry(r: V2BuildResult | null | undefined) {
  if (!r) return { prompt_v2: false };
  return {
    prompt_v2: true,
    ok: r.ok,
    llm_calls: r.llmCalls,
    copy_policy: r.copyPolicy,
    copy_strings: r.copy_final.length,
    copy_adapted: r.copy_original.join("\u0001") !== r.copy_final.join("\u0001"),
    prompt_words: r.lint?.stats.words ?? 0,
    prompt_chars: r.lint?.stats.chars ?? 0,
    lint_codes: (r.lint?.errors || []).map((e) => e.code),
    warnings: r.warnings.length,
    ...(r.reason ? { fell_back_because: r.reason.slice(0, 120) } : {}),
  };
}
