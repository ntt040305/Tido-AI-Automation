/**
 * The v2 build, simplified: gather, call once, check three things, send.
 *
 * THE WHOLE FLOW
 * --------------
 *   1. the Brief Compiler gathers the input verbatim -- nothing paraphrased,
 *      nothing inferred, and the client's own visual-direction choices carried
 *      through as binding preferences
 *   2. load `system.v{N}.md`, `request.v{N}.md`, the playbook and the gold example
 *      from disk; fill the request's slots
 *   3. ONE model call: system = the standing instructions, user = the brief and the
 *      product photos
 *   4. parse five tags, tolerantly
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
import { briefTelemetry, compileBrief, type BriefInput, type CompiledBrief } from "./brief-compiler";
import {
  LAYOUT_BY_RATIO,
  RATIO_SENTENCE,
  fillSlots,
  loadTemplates,
  templateVersion,
  type AspectRatio,
  type LoadedTemplates,
} from "./templates";

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
   * The visual direction panel, as the client left it. Option ids; "auto" or absent
   * means they did not choose.
   *
   * v1 has consumed this since the panel shipped and v2 did not, which meant a client
   * who picked "Góc thấp" got whatever angle the director felt like. A control the
   * client set is binding.
   */
  visualControls?: Record<string, string> | null;
  visualStyle?: string | null;
  emotionalTone?: string | null;
  compositionLayout?: string | null;
  /** Lines the client marked non-negotiable. v1 reads these; so does v2 now. */
  hardRequirements?: string[] | null;
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
  /**
   * What the director filled in that the client never said.
   *
   * On the job because it is the one output a human may want to overrule: the client
   * gave a topic and some copy, and audience, occasion and tone were decided for them.
   */
  assumptions: string[];
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

/**
 * The two messages the director is sent.
 *
 * system = `system.v{N}.md`, unchanged. It has no slots, which is the point: the
 * standing instructions are identical on every job, so a reader comparing two jobs
 * sees only what actually differed.
 *
 * user = `request.v{N}.md` with this job's slots filled, then the product photos in
 * reference order. The brief goes in the USER turn rather than the system turn
 * because that is what it is: this request, not a standing rule.
 */
export function buildDirectorMessages(
  input: SimpleInput,
  policy: CopyPolicy,
  policyWarnings: string[],
): { system: string; user: { role: "user"; content: unknown }; templates: LoadedTemplates; brief: CompiledBrief } {
  const templates = loadTemplates(input.assetType, input.templateVersion ?? templateVersion());

  const playbook = fillSlots(templates.playbook, {
    ASPECT_RATIO: input.aspectRatio,
    LAYOUT: LAYOUT_BY_RATIO[input.aspectRatio],
  });

  const brief = compileBrief(briefInputFrom(input), {
    playbook,
    goldExample: templates.goldExample,
    policy,
    policyWarnings,
  });

  const requestText = fillSlots(templates.request, brief.slots);

  const parts: Array<Record<string, unknown>> = [{ type: "text", text: requestText }];
  for (const product of input.products) {
    if (product.imageUrl) parts.push({ type: "image_url", image_url: { url: product.imageUrl, detail: "high" } });
  }
  if (input.products.length) {
    parts.push({
      type: "text",
      text: `The ${input.products.length} photo(s) above are, in order, photo 1 to photo ${input.products.length}. Return the five tags now.`,
    });
  }

  return { system: templates.system, user: { role: "user", content: parts }, templates, brief };
}

/** The request's fields, narrowed to what the Brief Compiler reads. */
function briefInputFrom(input: SimpleInput): BriefInput {
  return {
    assetType: input.assetType,
    aspectRatio: input.aspectRatio,
    concept: input.concept,
    copy: input.copy,
    brand: input.brand,
    visualControls: input.visualControls ?? null,
    visualStyle: input.visualStyle ?? null,
    emotionalTone: input.emotionalTone ?? null,
    compositionLayout: input.compositionLayout ?? null,
    hardRequirements: input.hardRequirements ?? null,
    productCount: input.products.length,
  };
}

/** The repair turn: the same reply, the failures, one more attempt. */
function repairMessage(previous: string, failures: string[]): { role: "user"; content: unknown } {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "Your reply was rejected. Fix exactly these problems and return all five tags again, unchanged except for the fixes:",
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
  let brief: CompiledBrief | undefined;
  let system: string;
  let user: { role: "user"; content: unknown };
  let policyDecision: { policy: CopyPolicy; warnings: string[] };

  try {
    const probe = loadTemplates(input.assetType, input.templateVersion ?? templateVersion());
    policyDecision = decidePolicy(copy_original, probe.playbook, input.copyPolicy ?? "exact");
    const built = buildDirectorMessages(input, policyDecision.policy, policyDecision.warnings);
    system = built.system;
    user = built.user;
    templates = built.templates;
    brief = built.brief;
  } catch (e) {
    return {
      ok: false,
      reason: `the templates did not load: ${(e as Error).message.slice(0, 160)}`,
      warnings: [],
      assumptions: [],
      llmCalls: 0,
      copyPolicy: input.copyPolicy ?? "exact",
      copy_original,
      copy_final: copy_original,
    };
  }

  // The compiler already folded the policy warnings and the claim warnings together.
  const warnings = [...(brief?.warnings || [])];
  const base = {
    warnings,
    assumptions: [] as string[],
    llmCalls: 0,
    copyPolicy: policyDecision.policy,
    copy_original,
    copy_final: copy_original,
    templates,
  };

  const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
    { role: "system", content: system },
    user,
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
    return {
      ...base,
      ok: false,
      llmCalls: calls,
      warnings: allWarnings,
      assumptions: reply.assumptions,
      copy_final,
      reply,
      checks,
      reason: "the reply carried no <image_prompt> after one repair",
    };
  }
  if (!checks.ok) {
    return {
      ...base,
      ok: false,
      llmCalls: calls,
      warnings: allWarnings,
      assumptions: reply.assumptions,
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
    assumptions: reply.assumptions,
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
  assumptions?: number;
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
