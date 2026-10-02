/**
 * The v2 build, simplified: gather, call once, check three things, send.
 *
 * THE WHOLE FLOW
 * --------------
 *   1. gather the input verbatim -- nothing paraphrased, nothing inferred
 *   2. load the meta-prompt and the asset's playbook from disk, fill the slots
 *   3. ONE model call, with the product photos attached
 *   4. parse four tags, tolerantly
 *   5. three checks
 *   6. at most ONE repair call, then stop
 *
 * WHAT CHANGED FROM THE FIRST v2
 * ------------------------------
 * The JSON contract, the nine-field schema validator and the eleven-rule linter are
 * gone from this path. They are still in the tree (`spec.ts`, `director.ts`,
 * `linter.ts`, `build.ts`) and still tested, marked superseded rather than deleted.
 * What replaced them: tags, a tolerant parser, and three checks whose failure cannot
 * be recovered downstream.
 *
 * ON FAILURE
 * ----------
 * `ok: false` with the reason and the failures. What the caller does with that is
 * configuration, not policy: `V2_FALLBACK=v1` (the default) renders through v1,
 * `V2_FALLBACK=off` lets the error surface. The default is the safe one because a
 * render that fails costs the user their job; a render that falls back costs them a
 * worse prompt and says so in the log.
 *
 * No I/O except reading the template files. The model call arrives as a dependency.
 */
import {
  FORBIDDEN_WORDS,
  checkPrompt,
  type CheckResult,
  type CopyPolicy,
} from "./checks";
import { parseTaggedReply, type TaggedReply } from "./tags";
import {
  LAYOUT_BY_RATIO,
  RATIO_SENTENCE,
  fillSlots,
  loadTemplates,
  templateVersion,
  type AspectRatio,
  type LoadedTemplates,
} from "./templates";

/** Word bounds, in one place because both the meta-prompt and the check read them. */
export const WORD_MIN = 200;
export const WORD_MAX = 500;

export interface SimpleProduct {
  /** 1-based, and the same order the provider receives the files in. */
  ref_index: number;
  /** What the client said this product is. Verbatim; never the campaign concept. */
  description?: string;
  /** A data URL or https URL the LLM client can read. */
  imageUrl?: string;
}

export interface SimpleInput {
  assetType: string;
  aspectRatio: AspectRatio;
  concept: string;
  brand: string;
  productLine?: string;
  /** The client's strings, exactly as typed, in order. */
  copy: string[];
  /** `exact` unless the caller already decided otherwise. */
  copyPolicy?: CopyPolicy;
  products: SimpleProduct[];
  notes?: string;
  /** Whether the prompt should quote the lettering read off the label. */
  includeLabelText: boolean;
  /**
   * Which template version to read. Defaults to the environment's.
   *
   * Passed in rather than read here so that comparing two versions is a parameter
   * and not a mutation of `process.env`: the eval builds both in the same process.
   */
  templateVersion?: string;
}

export interface SimpleDeps {
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>;
}

export interface SimpleResult {
  ok: boolean;
  /** The prompt to send, when ok. */
  prompt?: string;
  /** The model's own thinking. Kept for the record, never sent to the renderer. */
  plan?: string;
  reply?: TaggedReply;
  checks?: CheckResult;
  reason?: string;
  warnings: string[];
  llmCalls: number;
  copyPolicy: CopyPolicy;
  copy_original: string[];
  copy_final: string[];
  templates?: LoadedTemplates;
}

const nfc = (s: string) => String(s ?? "").normalize("NFC");
const clean = (s: unknown) => nfc(typeof s === "string" ? s : "").replace(/\s+/g, " ").trim();

/** Words a string runs to. Used only to decide whether the copy can fit. */
const words = (s: string) => nfc(s).split(/\s+/).filter(Boolean).length;

/**
 * The copy budget a playbook states, read back out of the playbook text.
 *
 * Parsed rather than duplicated in code: the playbook file is where somebody edits
 * the budget, and a number held in both places drifts. The patterns match the way
 * the shipped playbooks are written, and a playbook that states no budget yields no
 * limit rather than a wrong one.
 */
export function budgetFromPlaybook(playbook: string): { maxStrings: number | null; headlineMaxWords: number | null } {
  // Squashed first: these sentences are hard-wrapped in the files, and a budget that
  // happens to break across two lines is still the same budget.
  const text = clean(playbook);
  const one = /at most ONE line of text,? no longer than (\d+) words/i.exec(text);
  if (one) return { maxStrings: 1, headlineMaxWords: Number(one[1]) };
  const many = /at most (\d+) separate lines of text/i.exec(text);
  const headline = /(?:headline|hook) of at most (\d+) words/i.exec(text);
  return {
    maxStrings: many ? Number(many[1]) : null,
    headlineMaxWords: headline ? Number(headline[1]) : null,
  };
}

/**
 * exact unless the copy cannot fit.
 *
 * The client's words are the client's: the only reason to shorten them is that the
 * channel physically cannot carry them, and when that happens the job says so.
 */
export function decidePolicy(
  copy: string[],
  playbook: string,
  requested: CopyPolicy = "exact",
): { policy: CopyPolicy; warnings: string[] } {
  if (requested === "adapt") return { policy: "adapt", warnings: [] };
  const lines = copy.map((c) => nfc(c).trim()).filter(Boolean);
  const { maxStrings, headlineMaxWords } = budgetFromPlaybook(playbook);
  const tooMany = maxStrings !== null && lines.length > maxStrings;
  const tooLong = headlineMaxWords !== null && lines.some((l) => words(l) > headlineMaxWords);
  if (!tooMany && !tooLong) return { policy: "exact", warnings: [] };
  return {
    policy: "adapt",
    warnings: [
      `the copy is longer than this asset carries (${lines.length} string(s), ${lines.reduce((n, l) => n + words(l), 0)} words` +
        `${maxStrings !== null ? `, budget ${maxStrings} string(s)` : ""}): it was shortened to fit and the original is kept on the job`,
    ],
  };
}

/** Claims a regulator may want evidence for. Reported, never edited. */
export function claimWarnings(copy: string[]): string[] {
  const out: string[] = [];
  for (const line of copy) {
    if (/\b(sau|trong|within|in)\s*\d+\s*(ngày|day|days|tuần|week|weeks|giờ|hour|hours)\b/i.test(line)) {
      out.push(`"${clean(line).slice(0, 40)}" states a time-bound result and may need advertising-claim review`);
    }
    // `100%` deliberately has no trailing `\b`: a percent sign is not a word
    // character, so `\b` after it demands a letter and "Hết mụn 100%" would pass.
    if (/(100\s?%|\bhoàn toàn\b|\bcompletely\b|\bguaranteed\b|\bcam kết\b|\bkhỏi hẳn\b|\bcures?\b)/i.test(line)) {
      out.push(`"${clean(line).slice(0, 40)}" states an absolute result and may need advertising-claim review`);
    }
  }
  return [...new Set(out)];
}

/** The system prompt: the meta-prompt file with the playbook and the brief in it. */
export function buildMetaPrompt(input: SimpleInput, policy: CopyPolicy): { system: string; templates: LoadedTemplates } {
  const templates = loadTemplates(input.assetType, input.templateVersion ?? templateVersion());
  const playbook = fillSlots(templates.playbook, {
    ASPECT_RATIO: input.aspectRatio,
    LAYOUT: LAYOUT_BY_RATIO[input.aspectRatio],
  });

  const system = fillSlots(templates.metaPrompt, {
    PLAYBOOK: playbook,
    ASSET_TYPE: clean(input.assetType) || "poster",
    ASPECT_RATIO: input.aspectRatio,
    BRAND: clean(input.brand) || "(not given)",
    PRODUCT_LINE: clean(input.productLine) || "(none — the brand name is not a product line)",
    CONCEPT: clean(input.concept) || "(not given)",
    NOTES: clean(input.notes) || "(none)",
    COPY_COUNT: String(input.copy.length),
    COPY: input.copy.length ? input.copy.map((c, i) => `  ${i + 1}. ${nfc(c)}`).join("\n") : "  (none — this frame carries no words)",
    COPY_POLICY: policy,
    PRODUCT_COUNT: String(input.products.length),
    PRODUCTS: input.products.length
      ? input.products.map((p) => `  photo ${p.ref_index}: ${clean(p.description) || "(no description given — describe what you see)"}`).join("\n")
      : "  (none attached)",
    LABEL_TEXT_RULE: input.includeLabelText
      ? "Where you can READ the lettering on a label, quote it in the prompt so the renderer reproduces it rather than inventing it. If you cannot read it, say nothing about it and never guess a brand name."
      : "Do not quote any label lettering. Say only \"exactly as in attached photo N\" and let the reference carry the label.",
    WORD_MIN: String(WORD_MIN),
    WORD_MAX: String(WORD_MAX),
    FORBIDDEN_WORDS: FORBIDDEN_WORDS.join(", "),
    RATIO_SENTENCE: `"${RATIO_SENTENCE[input.aspectRatio]}"`,
  });

  return { system, templates };
}

/** The user turn: the photos, in reference order. The brief is in the system prompt. */
function userMessage(input: SimpleInput): { role: "user"; content: unknown } {
  const parts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: input.products.length
        ? `The ${input.products.length} attached photo(s) are, in order, photo 1 to photo ${input.products.length}. Write the four tags now.`
        : "No product photos are attached. Write the four tags now.",
    },
  ];
  for (const p of input.products) {
    if (p.imageUrl) parts.push({ type: "image_url", image_url: { url: p.imageUrl, detail: "high" } });
  }
  return { role: "user", content: parts };
}

/** The repair turn: the same reply, the failures, one more attempt. */
function repairMessage(previous: string, failures: string[]): { role: "user"; content: unknown } {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "Your reply was rejected. Fix exactly these problems and return all four tags again, unchanged except for the fixes:",
          ...failures.map((f) => `- ${f}`),
          "",
          "Keep the same idea, the same layout and the same copy strings. Add no new text.",
          "",
          "Your previous reply:",
          previous.slice(0, 6000),
        ].join("\n"),
      },
    ],
  };
}

export async function buildSimplePrompt(input: SimpleInput, deps: SimpleDeps): Promise<SimpleResult> {
  const copy_original = input.copy.map(nfc).filter((c) => c.trim());
  let templates: LoadedTemplates | undefined;
  let system: string;
  let policyDecision: { policy: CopyPolicy; warnings: string[] };

  try {
    const probe = loadTemplates(input.assetType, input.templateVersion ?? templateVersion());
    policyDecision = decidePolicy(copy_original, probe.playbook, input.copyPolicy ?? "exact");
    const built = buildMetaPrompt(input, policyDecision.policy);
    system = built.system;
    templates = built.templates;
  } catch (e) {
    return {
      ok: false,
      reason: `the templates did not load: ${(e as Error).message.slice(0, 160)}`,
      warnings: [],
      llmCalls: 0,
      copyPolicy: input.copyPolicy ?? "exact",
      copy_original,
      copy_final: copy_original,
    };
  }

  const warnings = [...policyDecision.warnings, ...claimWarnings(copy_original)];
  const base = {
    warnings,
    llmCalls: 0,
    copyPolicy: policyDecision.policy,
    copy_original,
    copy_final: copy_original,
    templates,
  };

  const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
    { role: "system", content: system },
    userMessage(input),
  ];

  let raw: string;
  try {
    raw = await deps.chat(messages, "prompt_v2_meta");
  } catch (e) {
    return { ...base, ok: false, llmCalls: 1, reason: `the model call failed: ${(e as Error).message.slice(0, 160)}` };
  }
  let calls = 1;

  let reply = parseTaggedReply(raw);
  let checks = runChecks(reply, input, policyDecision.policy, copy_original);

  // One repair, then stop. A second repair is a third call, and the point of v2 is
  // that calls cost money.
  if (!checks.ok || !reply.image_prompt) {
    const failures = [
      ...(reply.image_prompt ? [] : ["the <image_prompt> tag was missing or empty"]),
      ...checks.failures.map((f) => f.message),
    ];
    try {
      const repaired = await deps.chat([...messages, { role: "assistant", content: raw }, repairMessage(raw, failures)], "prompt_v2_repair");
      calls = 2;
      const reparsed = parseTaggedReply(repaired);
      if (reparsed.image_prompt) {
        reply = reparsed;
        checks = runChecks(reparsed, input, policyDecision.policy, copy_original);
      }
    } catch (e) {
      return { ...base, ok: false, llmCalls: 2, reply, checks, reason: `the repair call failed: ${(e as Error).message.slice(0, 160)}` };
    }
  }

  const copy_final = reply.copy_final.length ? reply.copy_final : copy_original;
  const allWarnings = [...warnings, ...reply.warnings];

  if (!reply.image_prompt) {
    return { ...base, ok: false, llmCalls: calls, warnings: allWarnings, copy_final, reply, checks, reason: "the reply carried no <image_prompt> after one repair" };
  }
  if (!checks.ok) {
    return {
      ...base,
      ok: false,
      llmCalls: calls,
      warnings: allWarnings,
      copy_final,
      reply,
      checks,
      reason: `the prompt still failed the checks after one repair: ${[...new Set(checks.failures.map((f) => f.code))].join(", ")}`,
    };
  }

  return {
    ok: true,
    prompt: reply.image_prompt,
    plan: reply.plan,
    reply,
    checks,
    warnings: allWarnings,
    llmCalls: calls,
    copyPolicy: policyDecision.policy,
    copy_original,
    copy_final,
    templates,
  };
}

function runChecks(reply: TaggedReply, input: SimpleInput, policy: CopyPolicy, original: string[]): CheckResult {
  return checkPrompt(reply.image_prompt, {
    copyOriginal: original,
    copyFinal: reply.copy_final.length ? reply.copy_final : original,
    policy,
    aspectRatio: input.aspectRatio,
    minWords: WORD_MIN,
    maxWords: WORD_MAX,
  });
}

/**
 * The shape declared rather than inferred.
 *
 * Inferred, this is a union of two object types, and a caller cannot read
 * `template_version` off it without a cast -- which is how a cast ends up in a log
 * line and then in a test. One shape with optional fields costs nothing.
 */
export interface SimpleTelemetry {
  prompt_v2_simple: boolean;
  ok?: boolean;
  llm_calls?: number;
  template_version?: string;
  playbook?: string;
  copy_policy?: CopyPolicy;
  copy_strings?: number;
  copy_adapted?: boolean;
  prompt_words?: number;
  missing_tags?: string[];
  check_codes?: string[];
  warnings?: number;
  failed_because?: string;
}

/** Counts, codes and verdicts. Never the prompt, never the copy. */
export function simpleTelemetry(r: SimpleResult | null | undefined): SimpleTelemetry {
  if (!r) return { prompt_v2_simple: false };
  return {
    prompt_v2_simple: true,
    ok: r.ok,
    llm_calls: r.llmCalls,
    template_version: r.templates?.version,
    playbook: r.templates?.playbookName,
    copy_policy: r.copyPolicy,
    copy_strings: r.copy_final.length,
    copy_adapted: r.copy_original.join("\u0001") !== r.copy_final.join("\u0001"),
    prompt_words: r.checks?.stats.words ?? 0,
    missing_tags: r.reply?.missing ?? [],
    check_codes: [...new Set((r.checks?.failures || []).map((f) => f.code))],
    warnings: r.warnings.length,
    ...(r.reason ? { failed_because: r.reason.slice(0, 120) } : {}),
  };
}
