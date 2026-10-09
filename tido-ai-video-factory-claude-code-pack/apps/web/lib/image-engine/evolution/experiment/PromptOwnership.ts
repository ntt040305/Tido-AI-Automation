/**
 * Phase 5.6.5 — who owns each sentence in the prompt.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fifteen modules can write into the image prompt. Each was added because it
 * had something true to say, and none of them knew what the others were
 * saying. The failure that produces is not verbosity -- it is CONTRADICTION: two
 * sections describing the same camera differently, and a renderer that follows
 * whichever it read last.
 *
 * The fix is not to delete writers. It is to give every TOPIC exactly one
 * owner, and to make a section that strays into someone else's topic visible
 * instead of invisible. `auditSections` reads the assembled text and reports
 * who wrote about what, so the claim "camera is owned by the composition" is
 * measured on the real prompt rather than asserted in a comment.
 *
 * WHAT OWNERSHIP MEANS
 * --------------------
 * The owner is the module whose DECISION the sentence expresses -- not the
 * module that happens to hold the string. The composition owns the camera
 * because the composition resolved it, even though the Creative Director
 * originally decided it and the composition is quoting: one artifact speaks for
 * that topic, and everything else stays quiet about it.
 *
 * Pure, no model call, no I/O.
 */

/** A subject the prompt can talk about. Exactly one module owns each. */
export type PromptTopic =
  | "product_truth"
  | "creative_idea"
  | "scene_environment"
  | "camera"
  | "lighting"
  | "composition"
  | "visual_style"
  | "supporting_elements"
  | "typography_intent"
  | "typography_copy"
  | "brand"
  | "memory"
  | "render_constraints"
  /**
   * What KIND of photograph this is: tonality, highlight behaviour, black level,
   * grain, corner falloff, optical signature.
   *
   * A fourteenth topic rather than a corner of `visual_style`, because nothing in
   * the system decided it before `FinishLayer` existed -- measured at 0 of 12
   * prompts saying anything about it -- and a topic with no owner is how a subject
   * ends up with three.
   */
  | "finish";

/** The one module entitled to speak for each topic. */
export const TOPIC_OWNER: Record<PromptTopic, string> = {
  product_truth: "AssetDNA",
  creative_idea: "CreativeDirector",
  // Transferred from `CompositionPlan` when `CinematographyLayer` shipped, and the
  // transfer is a measurement rather than a preference: across the twelve-case
  // benchmark the plan's prose for these three topics produced a physical
  // parameter in at most 1 case of 12 -- no focal length, no aperture, no ratio,
  // no colour temperature, no source size. The plan keeps `composition`, where it
  // measures L3 on 12 of 12, and its prose about light and camera now feeds the
  // layer as evidence instead of reaching the renderer as instruction.
  scene_environment: "CinematographyLayer",
  camera: "CinematographyLayer",
  lighting: "CinematographyLayer",
  composition: "CompositionPlan",
  visual_style: "DesignSystem",
  supporting_elements: "CompositionPlan",
  typography_intent: "TypographyDNA",
  typography_copy: "ExactCopyIntegrityValidator",
  brand: "BrandKit",
  memory: "CreativeMemory",
  render_constraints: "Renderer",
  finish: "FinishLayer",
};

export interface PromptSection {
  topic: PromptTopic;
  /** The module that produced it. Must match `TOPIC_OWNER[topic]`. */
  owner: string;
  text: string;
}

/**
 * The vocabulary each topic is recognised by.
 *
 * Used only to DETECT a section straying into another's topic, never to decide
 * anything creative. Deliberately narrow: words that can only be about that
 * subject, so a passing mention does not read as a second opinion.
 */
const TOPIC_WORDS: Partial<Record<PromptTopic, RegExp>> = {
  camera: /\b(camera angle|camera distance|close-?up|macro|wide shot|establishing shot|medium shot|eye level|low angle|high angle|from above|from below|three-?quarter|focal length|\d{2}mm|aperture|f\/\d)\b/gi,
  lighting: /\b(back ?lit|backlight|side ?lit|rim ?light|key light|fill light|top ?light|under ?lit|golden hour|light direction|lit from)\b/gi,
  composition: /\b(rule of thirds|negative space|foreground|background|midground|visual hierarchy|off-?cent(re|er)|left third|right third|keep clear)\b/gi,
  typography_intent: /\b(letterform|stroke weight|letter ?spacing|tracking|typeface|font)\b/gi,
};

export interface OwnershipFinding {
  topic: PromptTopic;
  /** The section that strayed. */
  section: PromptTopic;
  owner: string;
  /** The phrases it used that belong to another owner. */
  phrases: string[];
}

export interface OwnershipAudit {
  sections: Array<{ topic: PromptTopic; owner: string; chars: number }>;
  /** Topics claimed by more than one owner. Each is a contradiction waiting. */
  contested: OwnershipFinding[];
  /** Sections whose declared owner is not the topic's owner. */
  misowned: Array<{ topic: PromptTopic; declared: string; expected: string }>;
  total_chars: number;
}

/**
 * Who wrote about what, measured on the assembled text.
 *
 * A section may always talk about its OWN topic. Anything else it says about
 * another topic's vocabulary is reported, because that is where two accounts of
 * one frame come from. `allow` names pairs that are legitimate: the render
 * constraints must be able to say "no text", which is typography's vocabulary,
 * without that counting as a second typographic opinion.
 */
export function auditSections(
  sections: PromptSection[],
  allow: Array<[PromptTopic, PromptTopic]> = DEFAULT_ALLOWANCES,
): OwnershipAudit {
  const allowed = new Set(allow.map(([a, b]) => `${a}>${b}`));
  const contested: OwnershipFinding[] = [];
  const misowned: OwnershipAudit["misowned"] = [];

  for (const s of sections) {
    if (s.owner !== TOPIC_OWNER[s.topic]) {
      misowned.push({ topic: s.topic, declared: s.owner, expected: TOPIC_OWNER[s.topic] });
    }
    for (const [topic, re] of Object.entries(TOPIC_WORDS) as Array<[PromptTopic, RegExp]>) {
      // A module may speak for every topic it OWNS. The composition owns the
      // camera, the light and the arrangement, so one section covering all
      // three is one owner speaking once -- which is the point -- not three
      // opinions. Ownership is per MODULE; the section's topic is its label.
      if (TOPIC_OWNER[topic] === s.owner) continue;
      if (allowed.has(`${s.topic}>${topic}`)) continue;
      const found = [...new Set((s.text.match(new RegExp(re.source, "gi")) || []).map((m) => m.toLowerCase()))];
      if (found.length) contested.push({ topic, section: s.topic, owner: s.owner, phrases: found });
    }
  }

  return {
    sections: sections.map((s) => ({ topic: s.topic, owner: s.owner, chars: s.text.length })),
    contested,
    misowned,
    total_chars: sections.reduce((n, s) => n + s.text.length, 0),
  };
}

/**
 * Cross-topic mentions that are not second opinions.
 *
 * Each is here because the sentence cannot be written without the word, and the
 * section is not making a competing decision by using it.
 */
export const DEFAULT_ALLOWANCES: Array<[PromptTopic, PromptTopic]> = [
  // "Reserve clean space, render no letterforms" is a rendering rule about
  // typography, not a typographic decision.
  ["render_constraints", "typography_intent"],
  ["render_constraints", "composition"],
  // The typographic intention asks the frame for a quiet area: it has to name
  // the area it needs, which is composition vocabulary.
  ["typography_intent", "composition"],
  // The observed product is described where it sits and how it is lit, because
  // that is what was observed -- it is evidence, not direction.
  ["product_truth", "lighting"],
  ["product_truth", "composition"],
];

/** The sections joined, in the order given. */
export function assemble(sections: PromptSection[]): string {
  return sections.map((s) => s.text).filter(Boolean).join("\n\n");
}

/** Counts and owners only. Never the client's copy. */
export function ownershipTelemetry(a: OwnershipAudit | null | undefined) {
  if (!a) return { prompt_ownership: false };
  return {
    prompt_ownership: true,
    sections: a.sections.length,
    chars: a.total_chars,
    owners: [...new Set(a.sections.map((s) => s.owner))].length,
    contested: a.contested.length,
    misowned: a.misowned.length,
    // Named so a contested topic is visible in a log without reading the prompt.
    contested_topics: [...new Set(a.contested.map((c) => `${c.section}→${c.topic}`))],
  };
}
