/**
 * The Brief Compiler — the client's request, gathered. No model call.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Everything the director is told comes from here, and everything here comes from a
 * field the client actually filled in. No inference, no defaults dressed up as
 * client intent, no paraphrase: the concept and the copy go in between `"""` fences
 * exactly as typed, and a field the client left empty is reported as absent so the
 * director knows to assume rather than to invent silently.
 *
 * WHY VERBATIM MATTERS MORE THAN IT SOUNDS
 * ----------------------------------------
 * v1 reached the renderer with `BUSINESS GOAL: in beauty_skincare` -- a sentence
 * whose subject was an empty variable -- and with the client's concept restated four
 * times in four different registers. Both come from the same habit: assembling prose
 * around fields instead of handing the fields over. This module hands them over.
 *
 * THE ONE PIECE OF REAL WORK
 * --------------------------
 * `clientPreferences`. The visual direction panel is the only place the client states
 * taste in a structured way, and v1 consumes it while v2 did not. A control the
 * client set is binding: it outranks the director's own judgement and has to arrive
 * as the professional instruction the panel already carries, not as an option id.
 *
 * Pure. Reads no environment, makes no call, touches no disk except through
 * `templates.ts`.
 */
import { CONTROL_KEYS, optionFor, specFor, type ControlKey } from "../director/visual-controls.types";

export type CopyPolicy = "exact" | "adapt";

/** The fields of the request this engine reads. A subset, named so the gap is visible. */
export interface BriefInput {
  assetType: string;
  aspectRatio: string;
  concept: string;
  /** What the client typed into the text field, one per line, exactly as typed. */
  copy: string[];
  brand?: string;
  /** Option ids from the visual direction panel. Absent or "auto" means not chosen. */
  visualControls?: Record<string, string> | null;
  /** The free-text direction fields of the same panel. */
  visualStyle?: string | null;
  emotionalTone?: string | null;
  compositionLayout?: string | null;
  /** Lines the client marked as non-negotiable. v1 reads these; v2 now does too. */
  hardRequirements?: string[] | null;
  /**
   * EVERY reference the provider will receive, in the order it receives them.
   *
   * All of them, not just the products. A supplied LOGO was reaching the renderer as an
   * attached image while the prompt said "no extra logos or brand marks", so the one
   * instruction that mentioned it told the model to leave it out. The director has to be
   * told what each photo IS.
   */
  references: BriefReference[];
}

export interface BriefReference {
  /** 1-based, and the same order the provider appends the files in. */
  index: number;
  /** PRODUCT, LOGO, or whatever the repo's own classifier decided. */
  role: string;
  filename?: string;
}

export interface CompiledBrief {
  /** Slot values for `request.v{N}.md`. Every one of them traceable to a field. */
  slots: Record<string, string>;
  policy: CopyPolicy;
  /** What the engine itself wants to say, before the director adds its own. */
  warnings: string[];
  /** Which controls the client set. For telemetry, not for the prompt. */
  preferencesUsed: string[];
}

const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");
const trim = (s: unknown): string => nfc(s).trim();

/**
 * The text's language, named only when it can be told.
 *
 * Vietnamese is identifiable from its diacritics and its two extra letters, which is
 * a real signal rather than a guess. Anything else is reported as "the same language
 * as the client's copy" -- true by construction, and better than naming a language
 * the client did not write in.
 */
export function textLanguage(copy: string[], concept: string): string {
  const sample = nfc([...copy, concept].join(" "));
  if (!sample.trim()) return "same language as the client's copy";
  // Vietnamese-ONLY evidence. Grave and acute are shared with French and Spanish, and
  // tilde with Spanish and Portuguese, so none of those may count: "Crème hydratante"
  // was being reported as Vietnamese. What is distinctive is the seven extra letters,
  // and the hook-above and dot-below marks.
  const decomposed = sample.normalize("NFD");
  // The marks are written as escapes: a combining mark pasted literally into a
  // character class is invisible in an editor and gets deleted by accident.
  if (/[ăâêôơưđĂÂÊÔƠƯĐ]/.test(sample) || /[\u0309\u0323]/.test(decomposed)) return "Vietnamese";
  if (/^[\x00-\x7F\s]*$/.test(sample)) return "English";
  return "same language as the client's copy";
}

/** The copy-policy rules, stated for the director in the words the author specified. */
export const COPY_POLICY_RULES: Record<CopyPolicy, string> = {
  exact:
    "use the client's words unchanged, character for character, every accent and punctuation mark; only assign roles and order; if over budget, keep them and warn",
  adapt:
    "keep meaning and every factual claim, shorten to fit the budget, keep perfect accents; add no new claims, numbers or promises",
};

/**
 * CLIENT PREFERENCES — what the client chose, and nothing else.
 *
 * Only `user_selected` evidence belongs here. A control the system inferred from the
 * concept, or recommended in the panel and the client merely did not object to, is
 * not a preference: presenting it as one would let the engine's own guess outrank the
 * director's judgement while claiming the client's authority for it.
 *
 * The panel's own `instruction` is used verbatim, because it is already written in
 * the professional, executable language the renderer needs -- and because a second
 * translation of it here would be a second place to keep in step.
 */
export function clientPreferences(input: BriefInput): { block: string; used: string[] } {
  const lines: string[] = [];
  const used: string[] = [];

  for (const key of CONTROL_KEYS) {
    const id = input.visualControls?.[key];
    if (!id || id === "auto") continue;
    const option = optionFor(key as ControlKey, id);
    if (!option) continue;
    lines.push(`- ${specFor(key as ControlKey).label} — ${option.label}: ${option.instruction}`);
    used.push(`${key}=${id}`);
  }

  // The free-text direction fields of the same panel. Verbatim: these are the
  // client's own words about taste.
  const free: Array<[string, string]> = [
    ["Phong cách hình ảnh", trim(input.visualStyle)],
    ["Cảm xúc", trim(input.emotionalTone)],
    ["Bố cục", trim(input.compositionLayout)],
  ];
  for (const [label, value] of free) {
    if (!value || value.toLowerCase() === "auto") continue;
    lines.push(`- ${label}: ${value}`);
    used.push(label);
  }

  for (const req of input.hardRequirements || []) {
    const value = trim(req);
    if (!value) continue;
    lines.push(`- Yêu cầu cứng: ${value}`);
    used.push("hard_requirement");
  }

  if (!lines.length) return { block: "", used: [] };

  return {
    block: [
      "# CLIENT PREFERENCES (the client explicitly chose these; respect them, they outrank your",
      "# own taste but never override the product identity or the text rules)",
      ...lines,
    ].join("\n"),
    used,
  };
}

/**
 * What the copy actually measures.
 *
 * This replaces the playbook's copy budget under the `exact` policy. The budget was a
 * reason to CUT, and the client's text is not the engine's to cut; the measurement is a
 * reason to DESIGN. A director told "61 words, 4 sentences" lays out a text-forward
 * piece; one told "at most 3 lines, headline at most 8 words" deletes two sentences.
 */
export function measureCopy(copy: string[]): { words: number; sentences: number; chars: number } {
  const joined = copy.map(nfc).join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return { words: 0, sentences: 0, chars: 0 };
  // A sentence ends at . ! ? or at a line the client chose to break. Vietnamese copy is
  // often written as separate lines with no terminal punctuation at all, so a count of
  // zero would be wrong on the most common input.
  const terminators = (joined.match(/[.!?]+/g) || []).length;
  const sentences = Math.max(terminators, copy.filter((c) => nfc(c).trim()).length);
  return {
    words: joined.split(" ").filter(Boolean).length,
    sentences,
    chars: [...joined].length,
  };
}

/** The threshold above which the text drives the layout rather than decorating it. */
export const LONG_COPY_WORDS = 25;

/**
 * What to do about long text. Empty when the copy is short enough not to need saying.
 *
 * Per-ratio because "give the text half the frame" means different geometry in a square
 * and in a 9:16, and a director given one sentence for all three ratios picks the wrong
 * one twice.
 */
export function textLayoutNote(words: number): string {
  if (words <= LONG_COPY_WORDS) return "";
  return (
    "The client's text is long and fixed. Build the layout around it: in 1:1 give the text " +
    "block about two fifths to one half of the frame; in 9:16 the top half; in 16:9 one side " +
    "up to about half the width."
  );
}

/** The reference list, exactly as the director must read it. */
export function renderReferences(refs: BriefReference[]): string {
  if (!refs.length) return "  (none attached)";
  return refs
    .map((r) => `  photo ${r.index}: ${r.role}${r.filename ? ` (${r.filename})` : ""}`)
    .join("\n");
}

export interface CompileOptions {
  playbook: string;
  /** The gold example's text, or empty when the file is missing or still a TODO. */
  goldExample?: string;
  policy: CopyPolicy;
  policyWarnings?: string[];
}

export function compileBrief(input: BriefInput, options: CompileOptions): CompiledBrief {
  const copy = input.copy.map(nfc).filter((c) => c.trim());
  const prefs = clientPreferences(input);
  const measured = measureCopy(copy);

  const slots: Record<string, string> = {
    asset_type: trim(input.assetType) || "poster",
    aspect_ratio: trim(input.aspectRatio),
    text_language: textLanguage(copy, input.concept),
    brand: trim(input.brand) || "(not stated by the client)",
    references: renderReferences(input.references),
    n_products: String(input.references.filter((r) => /PRODUCT/i.test(r.role)).length),
    // Verbatim, inside the fences the template provides. Not squashed, not trimmed
    // of its internal line breaks: how the client laid their copy out is information.
    concept: nfc(input.concept).trim() || "(not stated)",
    copy: copy.length ? copy.join("\n") : "(none — this frame carries no words)",
    client_preferences_block: prefs.block,
    copy_policy: options.policy,
    copy_policy_rules: COPY_POLICY_RULES[options.policy],
    n_words: String(measured.words),
    n_sentences: String(measured.sentences),
    n_chars: String(measured.chars),
    text_layout_note: textLayoutNote(measured.words),
    playbook_for_asset_and_ratio: options.playbook.trim(),
    gold_example_block: goldExampleBlock(options.goldExample),
  };

  const warnings = [...(options.policyWarnings || []), ...claimWarnings(copy)];
  if (measured.words > LONG_COPY_WORDS) {
    warnings.push(
      `the copy runs to ${measured.words} words in ${measured.sentences} sentence(s); long text raises ` +
        `rendering risk, and under the exact policy all of it is rendered rather than cut`,
    );
  }

  return { slots, policy: options.policy, warnings, preferencesUsed: prefs.used };
}

/**
 * The gold example, or nothing.
 *
 * A placeholder is worse than an absence: a director shown `TODO: paste a proven
 * prompt here` under the heading "quality bar" has been given a quality bar made of
 * the word TODO.
 */
export function goldExampleBlock(text: string | null | undefined): string {
  const body = nfc(text).trim();
  if (!body) return "";
  if (/^TODO\b/im.test(body)) return "";
  return `# GOLD EXAMPLE (quality bar; do not copy its content)\n${body}`;
}

/** Claims a regulator may want evidence for. Reported, never edited. */
export function claimWarnings(copy: string[]): string[] {
  const out: string[] = [];
  for (const line of copy) {
    if (/\b(sau|trong|within|in)\s*\d+\s*(ngày|day|days|tuần|week|weeks|giờ|hour|hours)\b/i.test(line)) {
      out.push(`"${trim(line).slice(0, 40)}" states a time-bound result and may need advertising-claim review`);
    }
    if (/(100\s?%|\bhoàn toàn\b|\bcompletely\b|\bguaranteed\b|\bcam kết\b|\bkhỏi hẳn\b|\bcures?\b)/i.test(line)) {
      out.push(`"${trim(line).slice(0, 40)}" states an absolute result and may need advertising-claim review`);
    }
  }
  return [...new Set(out)];
}

/** Names and counts. Never the concept, never the copy. */
export function briefTelemetry(b: CompiledBrief | null | undefined) {
  if (!b) return { brief: false };
  return {
    brief: true,
    policy: b.policy,
    preferences: b.preferencesUsed,
    gold_example: Boolean(b.slots.gold_example_block),
    language: b.slots.text_language,
    copy_words: Number(b.slots.n_words),
    refs: b.slots.references.split("\n").length,
    warnings: b.warnings.length,
  };
}
