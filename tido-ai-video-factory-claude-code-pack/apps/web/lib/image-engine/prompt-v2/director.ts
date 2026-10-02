/**
 * SUPERSEDED, NOT DELETED. The render path no longer imports this file.
 *
 * Replaced by: `templates/meta-prompt.v1.txt` and `build-simple.ts`
 *
 * Why: the simplified engine returns four tags instead of JSON and runs three
 * checks instead of eleven lint rules. The system prompt now lives in a text
 * file that can be edited without a deploy.
 *
 * Evidence that nothing in production reaches this file (2026-10-02):
 *
 *   grep -rn "prompt-v2/director" --include=*.ts lib app
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
 * The Creative Director call — the one LLM call v2 makes.
 *
 * WHAT IT REPLACES
 * ----------------
 * On the v2 path this stands in for every LLM step the image route used to make:
 * the Marketing Brain, the Creative Director judgment, the blueprint, and the
 * optional "ý tưởng hóa" button. One call, plus at most one repair call when the
 * linter refuses the result. The point of the exercise is cost, so a v2 that adds
 * a call on top of v1 would have failed whatever else it improved.
 *
 * WHY THE FIELD ORDER MATTERS
 * ---------------------------
 * A model writes in sequence. Asking for `master_prompt` first would make the rest
 * of the JSON a description of a prompt already written. The order in `spec.ts`
 * makes it state what it is looking at, what the products ARE, the idea, the
 * reading order and the layout before it writes a word of the prompt -- so the
 * prompt is the conclusion of that chain rather than a paragraph with reasons
 * attached afterwards.
 *
 * WHAT THE PROMPT RULES ARE FOR
 * -----------------------------
 * Every prohibition below is something the audit found in a prompt that was really
 * sent to the renderer and really produced a bad frame: technical parameters the
 * model ignores, verdict words that produce the generic gloss, a copy string
 * written twice and drawn twice, campaign copy printed onto a product label,
 * optional phrasing ("or") that leaves the renderer to choose.
 *
 * Pure: builds messages and reads nothing. The call itself is made by `build.ts`.
 */
import type { LLMChatMessage, LLMContentPart } from "../llm/llm-provider.service";
import type { AspectRatio, Playbook } from "./playbooks";
import { renderPlaybook } from "./playbooks";

export type CopyPolicy = "exact" | "adapt";

export interface DirectorProduct {
  /** 1-based, and the same order the provider receives the files in. */
  ref_index: number;
  /** What the client said this product is. Never the campaign concept. */
  description?: string;
  /** A data URL or https URL the LLM client can read. */
  imageUrl?: string;
}

export interface DirectorInput {
  assetType: string;
  aspectRatio: AspectRatio;
  concept: string;
  /** The brand. The thing on the label. */
  brand: string;
  /** The product line, which is not the brand. "SKIN1004" is a brand, "Centella" is a line. */
  productLine?: string;
  /** The client's strings, in the order they were given. */
  copy: string[];
  copyPolicy: CopyPolicy;
  products: DirectorProduct[];
  notes?: string;
  /** Whether the prompt should copy the lettering it reads on the label. */
  includeLabelText: boolean;
}

/** NFC, because two strings that look identical must compare identical. */
const nfc = (s: string) => String(s ?? "").normalize("NFC");
const clean = (s: unknown) => nfc(typeof s === "string" ? s : "").replace(/\s+/g, " ").trim();

/**
 * How many words each string may run to, and whether the copy fits at all.
 *
 * `exact` is the default and is only given up when the copy cannot fit: the
 * client's words are the client's. When it does not fit, `adapt` shortens and the
 * job carries a warning -- the user is told, not corrected silently.
 */
export function decideCopyPolicy(
  copy: string[],
  playbook: Playbook,
  requested: CopyPolicy = "exact",
): { policy: CopyPolicy; warnings: string[] } {
  const warnings: string[] = [];
  const lines = copy.map(clean).filter(Boolean);
  const b = playbook.copy_budget;
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  const overBudget =
    lines.length > b.max_strings ||
    (lines[0] ? words(lines[0]) > b.headline_max_words : false) ||
    lines.slice(1).some((l, i) => words(l) > (i === lines.length - 2 ? Math.max(b.cta_max_words, b.subline_max_words) : b.subline_max_words));

  if (requested === "adapt") return { policy: "adapt", warnings };
  if (!overBudget) return { policy: "exact", warnings };

  warnings.push(
    `the copy is longer than a ${playbook.id} at ${playbook.ratio} carries (${lines.length} strings, ` +
      `${lines.reduce((n, l) => n + words(l), 0)} words against a budget of ${b.max_strings} strings): ` +
      `shortened to fit, and the original is kept on the job`,
  );
  return { policy: "adapt", warnings };
}

/** Claims a regulator may want evidence for. Reported, never edited. */
export function claimWarnings(copy: string[]): string[] {
  const out: string[] = [];
  for (const line of copy) {
    if (/\b(sau|trong|within|in)\s*\d+\s*(ngày|day|days|tuần|week|weeks|giờ|hour|hours)\b/i.test(line)) {
      out.push(`"${clean(line).slice(0, 40)}" states a time-bound result and may need advertising-claim review`);
    }
    if (/\b(100%|hoàn toàn|completely|guaranteed|cam kết|khỏi hẳn|cures?)\b/i.test(line)) {
      out.push(`"${clean(line).slice(0, 40)}" states an absolute result and may need advertising-claim review`);
    }
  }
  return [...new Set(out)];
}

/** How the frame is described at the end of the prompt, per ratio. */
const RATIO_SENTENCE: Record<AspectRatio, string> = {
  "1:1": "Square 1:1 frame.",
  "9:16": "Vertical 9:16 frame.",
  "16:9": "Wide 16:9 frame.",
};

export function ratioSentence(ratio: AspectRatio): string {
  return RATIO_SENTENCE[ratio];
}

/**
 * The system prompt.
 *
 * Long, but every line is a refusal of something observed. It is also the only
 * place the writing rules live, so a change to how prompts read is one edit here
 * rather than a hunt through eight block writers.
 */
export function buildSystemPrompt(playbook: Playbook, input: DirectorInput): string {
  const b = playbook.copy_budget;
  return [
    "You are a creative director at an advertising agency, writing the brief a photographer and a retoucher will execute. You are briefing an image model that renders the whole frame in one pass, including every word that appears in it.",
    "",
    renderPlaybook(playbook),
    "",
    "RETURN JSON ONLY. No prose outside the object. The fields must appear in this order, because each one is the thinking the next one rests on:",
    "  asset_analysis  what this asset has to do and who sees it, in one or two sentences",
    "  products        one entry per attached photo: { ref_index, look, label_text }",
    "                  look       what it IS, physically, in words — never the campaign idea",
    `                  label_text ${input.includeLabelText ? "the lettering you can READ on the label, copied character for character. If you cannot read it, omit the field. Never guess a brand name." : "omit this field entirely"}`,
    "  big_idea        ONE idea, one sentence, that a viewer could repeat after looking away. Not a mood, not a list of materials. Avoid the obvious cliché of this category: for skincare, a water droplet on a leaf; for coffee, steam and burlap; for tech, a blue grid.",
    "  hierarchy       what the eye reads first, second, third",
    "  layout          where each element sits, in words, following the layout rule above",
    "  copy            one entry per string: { role, text, position }",
    "  warnings        anything the client should know: a claim that may need review, copy that had to be shortened, a product you could not read",
    "  master_prompt   the brief itself, written as described below",
    "",
    "HOW TO WRITE master_prompt",
    "- 250 to 450 words of plain English prose, present tense, concrete nouns and verbs.",
    "- In this order: what this is; the products; the scene and the idea; the light, described by what it DOES to the subject; the composition and where each element sits; the typography; the mood and finish; a short closing set of rules.",
    "- NEVER use technical parameters. No millimetres, no f-numbers, no Kelvin, no ISO, no ratios, no percentages, no stops. Describe what is SEEN: 'the shadow stretches away to the right and softens as it goes', not an angle and a ratio.",
    "- NEVER use words that grade a picture: premium, luxury, cinematic, stunning, beautiful, striking, sophisticated. Describe the thing that would earn the word.",
    "- Positions and sizes in words: 'the upper third', 'about half the height of the frame', 'a little right of centre'.",
    `- Each product: say "exactly as in attached photo N", keep its label unchanged, and add no words to it that are not already on it.${input.includeLabelText ? " Where you read the label, quote it so the renderer reproduces rather than invents it." : ""}`,
    `- Every copy string in double quotes, each one EXACTLY ONCE in the whole prompt, each with its role, relative size, where it sits and how it relates to the scene. At most ${b.max_strings} string(s) for this asset.`,
    "- Campaign copy never appears on the product itself: not on the label, the cap, the box or any packaging.",
    "- No contradictions, no 'or', no optional parts, no alternatives for the renderer to choose between.",
    `- End with: no other text, no extra logos or brand marks${input.products.length ? ", no people unless the scene needs them" : ""}, and the frame: "${ratioSentence(playbook.ratio)}"`,
    "",
    input.copyPolicy === "exact"
      ? "COPY POLICY: exact. Reproduce every string character for character, including Vietnamese diacritics. You may decide the role, the order and the placement. You may not change a character."
      : `COPY POLICY: adapt. The copy is longer than this asset carries. Shorten it to fit the budget above, keep the meaning and keep Vietnamese diacritics correct. Put every string you ended up using in \`copy\`, and say in \`warnings\` what you shortened.`,
  ].join("\n");
}

/** The user message: the brief, plus the product photos in reference order. */
export function buildUserMessage(input: DirectorInput): LLMChatMessage {
  const parts: LLMContentPart[] = [];
  const lines = [
    `ASSET TYPE: ${clean(input.assetType)}`,
    `ASPECT RATIO: ${input.aspectRatio}`,
    `BRAND: ${clean(input.brand) || "(not given)"}`,
    input.productLine ? `PRODUCT LINE: ${clean(input.productLine)}` : "",
    `CONCEPT (the client's own words): ${clean(input.concept)}`,
    input.notes ? `NOTES: ${clean(input.notes)}` : "",
    "",
    input.copy.length
      ? `COPY (${input.copy.length} string(s), in the order the client gave them):\n${input.copy.map((c, i) => `  ${i + 1}. ${nfc(c)}`).join("\n")}`
      : "COPY: none. This frame carries no words.",
    "",
    input.products.length
      ? `PRODUCTS (${input.products.length} photo(s) attached, in this order):\n${input.products
          .map((p) => `  photo ${p.ref_index}: ${clean(p.description) || "(no description given — describe what you see)"}`)
          .join("\n")}`
      : "PRODUCTS: none attached.",
  ].filter(Boolean);

  parts.push({ type: "text", text: lines.join("\n") });
  for (const p of input.products) {
    if (p.imageUrl) parts.push({ type: "image_url", image_url: { url: p.imageUrl, detail: "high" } });
  }
  return { role: "user", content: parts };
}

/**
 * The repair message: the same spec, the linter's complaints, one more attempt.
 *
 * Deliberately not a fresh brief. Re-briefing would spend a second full call and
 * usually produce a different picture; this asks for the same picture, legal.
 */
export function buildRepairMessage(previous: string, errors: string[]): LLMChatMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "Your JSON was rejected by the validator. Fix exactly these problems and return the WHOLE JSON object again, unchanged except for the fixes:",
          ...errors.map((e) => `- ${e}`),
          "",
          "Keep the same idea, the same layout and the same copy strings. Do not add new text and do not restate anything twice.",
          "",
          "Your previous reply:",
          previous.slice(0, 6000),
        ].join("\n"),
      },
    ],
  };
}
