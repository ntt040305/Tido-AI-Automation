/**
 * The Prompt Grader — how specific is this prompt, measured rather than felt.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every quality claim this engine has made so far had to wait for a vision model
 * to score a render: 100 VND, ninety seconds, and a judge that cannot separate
 * ±0.3 on twelve samples. That is an unusable feedback loop for prompt work,
 * where the whole question is whether the text got more specific.
 *
 * This file answers that question deterministically and for nothing. It does not
 * judge whether the work is good — no syntactic measure can — it judges whether
 * the prompt made DECISIONS or passed them to the renderer.
 *
 * THE LADDER IT MEASURES
 * ----------------------
 *   L0  a verdict      "premium, cinematic, stunning"
 *   L1  a category     "editorial advertising", "authentic product texture"
 *   L2  a description  "warm low-raking light from the side-rear"
 *   L3  a parameter    "120x180cm scrim, 35deg camera-left, key:fill 5:1, 3200K"
 *   L4  + consequence  "...5:1 so the amber reads translucent"
 *
 * An agency brief sits at L3 on every optical domain and at L4 where the idea
 * lives. A renderer handed L0 and L1 fills the gap with the average of its
 * training data, which is the generic gloss every brand already has.
 *
 * WHAT IT CANNOT DO, STATED SO NOBODY OVERREADS IT
 * -----------------------------------------------
 * It counts words, units and sentence overlap. It cannot tell whether 5:1 was the
 * RIGHT ratio, whether the idea is any good, or whether the picture will work. A
 * prompt could score every gate and still be bad art direction. What it catches
 * is the opposite and more common failure: a prompt that reads like art direction
 * and contains no decisions.
 *
 * Pure. No model call, no I/O, no clock.
 */

// ── the domains a commercial image prompt has to settle ──────────────────────

export type PromptDomain =
  | "idea"
  | "product_truth"
  | "staging"
  | "light"
  | "optics"
  | "surface"
  | "finish"
  | "type"
  | "guardrails";

export const PROMPT_DOMAINS: readonly PromptDomain[] = [
  "idea",
  "product_truth",
  "staging",
  "light",
  "optics",
  "surface",
  "finish",
  "type",
  "guardrails",
] as const;

/**
 * The six domains whose decisions are physically measurable, and therefore the
 * only ones a parameter count can grade.
 *
 * `idea`, `product_truth` and `guardrails` are deliberately excluded: an idea
 * stated in numbers would be a worse idea, product truth is a fidelity rule, and
 * a guardrail is a prohibition. They are graded by their own metrics below.
 */
export const MEASURABLE_DOMAINS: readonly PromptDomain[] = [
  "staging",
  "light",
  "optics",
  "surface",
  "finish",
  "type",
] as const;

/** What vocabulary marks a line as being about a domain. */
const DOMAIN_WORDS: Record<PromptDomain, RegExp> = {
  idea: /\b(idea|concept|insight|tension|territory|story|says|meaning|metaphor|because|rather than|instead of)\b/i,
  product_truth: /\b(product|label|packaging|cap|bottle|jar|reference|identity|proportions|geometry|unaltered|faithful)\b/i,
  staging:
    /\b(composition|frame|framing|placement|negative space|third|thirds|grid|axis|balance|hierarchy|prop|props|surface it sits|arrangement|margin|zone|depth)\b/i,
  light:
    /\b(light|lighting|lit|key|fill|rim|backlight|shadow|highlight|specular|diffus|scrim|softbox|bounce|flag|gobo|kelvin|exposure|falloff|ratio)\b/i,
  optics:
    /\b(camera|lens|focal|mm|aperture|f\/|depth of field|bokeh|focus|angle|eye level|vantage|perspective|distance|tilt|crop|sensor)\b/i,
  surface:
    /\b(material|surface|texture|finish|gloss|matte|glossy|roughness|translucen|transparen|reflectiv|grain of|polish|patina|condensation|wet|dry)\b/i,
  finish:
    /\b(grade|grading|contrast curve|rolloff|roll-off|black level|blacks|highlights clip|film|emulsion|transparency|negative stock|grain|halation|vignette|flare|colour space|color space|saturation)\b/i,
  type: /\b(typograph|headline|letterform|cap[- ]height|tracking|stroke|ledger|glyph|accent|diacritic|ink|copy)\b/i,
  guardrails: /\b(forbid|forbidden|never|do not|must not|no other|avoid|prohibited|exclusion)\b/i,
};

/**
 * Units that make a statement reconstructible, per domain.
 *
 * Per domain rather than one global list, because a number is only a parameter
 * for the thing it measures: `85/100` is a real decision about attention and says
 * nothing about the light, and counting it under `light` would let an attention
 * budget certify a lighting plot that does not exist.
 */
const DOMAIN_PARAMS: Record<PromptDomain, RegExp[]> = {
  idea: [],
  product_truth: [/\b\d+\s*(unit|units|product|products)\b/i],
  staging: [
    // Shares, boxes, attention weights and named thirds are placement decisions.
    // A bare aspect ratio is NOT: "1:1" is the format the client asked for, and
    // counting it would let every prompt certify a composition it never made.
    /\b\d{1,3}(\.\d+)?\s?%/,
    /\bx\s?\d{1,3}%?,?\s?y\s?\d{1,3}%?/i,
    /\b\d{1,3}\s?\/\s?100\b/,
    /\b(lower|upper)\s+(left|right|centre|center)\s+third\b/i,
  ],
  light: [
    /\b\d{3,5}\s?K\b/,
    /\bkey\s*[:to]\s*fill\s*\d+\s*:\s*\d+/i,
    /\b\d+\s*:\s*\d+\s*(ratio|key|fill)/i,
    /\b\d{1,3}\s?(°|deg\b|degrees\b)/i,
    /\b\d{2,4}\s?(x|×)\s?\d{2,4}\s?(cm|mm)\b/i,
    /\b\d+(\.\d+)?\s?(m|cm)\b.{0,24}\b(from|above|behind|left|right|source|panel|scrim)\b/i,
    // Stops, but only as an EXPOSURE statement. A bare "3 stops" also appears in
    // the finish layer's highlight rolloff, and counting that here would let the
    // finish certify a lighting plot that was never written -- the measurement
    // congratulating one layer for another's work.
    /\b\d+(\.\d+)?\s?(stop|stops)\b.{0,28}\b(key|fill|ratio|under|over|exposure|shadow side)\b/i,
  ],
  optics: [
    /\b\d{2,3}\s?mm\b/,
    /\bf\/\d+(\.\d+)?/,
    /\bISO\s?\d{2,5}\b/i,
    /\b\d+(\.\d+)?\s?(m|cm)\b.{0,24}\b(from the|subject|product|lens|camera)\b/i,
    /\b\d{1,2}(\.\d+)?\s?(°|deg\b|degrees\b)\b.{0,30}\b(above|below|camera|axis|level)\b/i,
    /\bdepth of field.{0,30}\b\d+(\.\d+)?\s?(cm|mm|m)\b/i,
  ],
  surface: [
    /\b\d{1,3}\s?%\s?(gloss|matte|rough|reflectiv|translucen|transparen)/i,
    /\b(gloss|matte|roughness|translucency)\b.{0,20}\b\d{1,3}\s?%/i,
    /\b\d+(\.\d+)?\s?(mm|micron|microns)\b.{0,30}\b(grain|pit|pits|texture|bevel|relief)\b/i,
  ],
  finish: [
    /\b\d{1,3}\s?\/\s?255\b/,
    /\b(blacks?|shadows?)\b.{0,20}\b\d{1,3}\b.{0,10}\/\s?255\b/i,
    /\b\d+(\.\d+)?\s?(stop|stops)\b.{0,24}\b(rolloff|roll-off|highlight|latitude)\b/i,
    /\b(4\s?x\s?5|8\s?x\s?10|6\s?x\s?7|35\s?mm)\b.{0,30}\b(transparency|negative|film|stock|emulsion)\b/i,
    /\bgrain\b.{0,24}\b\d+(\.\d+)?\s?(%|px|micron)\b/i,
  ],
  type: [
    /\bcap[- ]height\b.{0,24}\d+(\.\d+)?\s?%/i,
    /\b\d+(\.\d+)?\s?%\s?of the frame'?s? height\b/i,
    /\b\d{1,2}\s?graphemes?\b/i,
    /\bluminance of \d(\.\d+)?/i,
    /\b\d{1,2}(\.\d+)?\s?:\s?1\b.{0,20}\b(contrast|ratio)\b/i,
  ],
  // A prohibition is graded by its own metrics -- count, duplication, and whether
  // it is specific to this brief -- never by whether it carries a number.
  guardrails: [],
};

/**
 * A line the finish layer wrote.
 *
 * Needed because its vocabulary overlaps two other domains: it says "frame" (which
 * is staging vocabulary) and "stops" (which was lighting vocabulary), so without
 * this a finish statement would certify two domains it never addressed.
 */
const FINISH_LINE = /^\s*(FINISH\b|Tonality:|Grain:|Corner falloff:|Colour:|Color:|Optical signature:)/i;

/** Words that grade a finished picture instead of specifying one. */
const VERDICT_WORDS =
  /\b(premium|luxur(y|ious)|cinematic|beautiful|stunning|gorgeous|exquisite|breathtaking|eye-?catching|high-?end|sophisticated|elegant|striking|professional-?looking|world-?class|top-?notch|aesthetic(ally)?\s+pleasing)\b/gi;

/**
 * A line that is naming a verdict word in order to forbid it is not using it.
 *
 * The compiler's own ROLE block does exactly this -- "words like premium, luxury,
 * cinematic are verdicts, not instructions" -- and counting those five would make
 * the prompt's best paragraph its worst score.
 */
const PROHIBITION =
  /\b(forbid|forbidden|do not|don't|never|avoid|not instructions|are verdicts|rather than|instead of|no\s)\b/i;

/** Category labels that sound like direction and carry no consequence. */
const CATEGORY_LABELS = [
  "editorial advertising",
  "commercial photography",
  "commercial visual",
  "product photography",
  "lifestyle photography",
  "studio lighting",
  "authentic product texture",
  "premium design",
  "product hero",
  "hero shot",
  "a photograph with a point of view",
  "professional advertising",
  "high production value",
];

/** Lines that talk about the prompt rather than about the picture. */
const META_LINE =
  /\b(this prompt|the sections? (above|below)|stated (above|below)|listed elsewhere|when instructions conflict|resolve strictly|before rendering, verify|outranks|priority order|non-visible instruction|the block above)\b/i;

/** Phrases that point at a named section, which may or may not exist. */
const SECTION_REFERENCE = /\b(?:in|see|per|stated in|defined in|from) the ([A-Z][A-Z &'—-]{3,40}?) (?:section|block)\b/g;
/** Promises about content that has to be somewhere in the prompt. */
const CONTENT_PROMISES: Array<[RegExp, RegExp]> = [
  // [the promise, what has to exist for the promise to be true]
  [/knowledge supplied below|knowledge supplied in this prompt/i, /^(#{0,3}\s*)?(relevant |universal |specialist |professional )?knowledge\b/im],
  [/professional knowledge physical principles/i, /^(#{0,3}\s*)?(relevant |universal |specialist |professional )?knowledge\b/im],
];

// ── the report ───────────────────────────────────────────────────────────────

export interface DomainReading {
  domain: PromptDomain;
  /** Lines in the prompt that are about this domain. */
  lines: number;
  /** Of those, how many carry a parameter for this domain. */
  parameterised: number;
  /** Example parameters found, for a reader who wants to see the evidence. */
  examples: string[];
  /** True when this domain states at least one physical parameter. */
  l3: boolean;
}

export interface GateResult {
  id: string;
  value: number;
  threshold: string;
  ok: boolean;
  /** What the number means, in one line. */
  because: string;
}

export interface PromptGrade {
  chars: number;
  domains: DomainReading[];
  /** How many of the six measurable domains reach L3. */
  l3_slot_coverage: number;
  metrics: {
    verdict_words: number;
    verdict_words_raw: number;
    physical_params: number;
    category_labels: number;
    dangling_refs: number;
    restated_sentences: number;
    meta_lines: number;
    meta_share: number;
    guardrails: number;
    duplicate_guardrails: number;
    /** A line that states a consequence for a decision: the L4 marker. */
    consequence_lines: number;
    /** Is there a labelled idea statement at all. */
    idea_stated: boolean;
    /** Does that statement carry a mechanism, or say what the idea beat. */
    idea_mechanism: boolean;
  };
  gates: GateResult[];
  /** Gates passed out of gates checked. Never rescaled into a score out of 100. */
  passed: number;
  of: number;
  /** Evidence a reader can check by eye. */
  found: {
    verdicts: string[];
    labels: string[];
    dangling: string[];
    restated: string[];
  };
}

const squash = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Sentences long enough that a repeat of one is a real repeat. */
function longSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.;!?])\s+|\n/)
    .map(squash)
    .filter((s) => s.length >= 60);
}

/** Token overlap, 0-1. Used only to recognise a restatement, never to rewrite one. */
function jaccard(a: string, b: string): number {
  const A = new Set(a.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((w) => w.length > 3));
  const B = new Set(b.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Headings the prompt actually carries, upper-cased for comparison. */
function headings(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^(?:#{1,3}\s+|\[)?([A-Z][A-Z0-9 &'()–—-]{3,60}?)\]?\s*:?\s*$/.exec(line.trim());
    if (m) out.add(squash(m[1]).toUpperCase());
  }
  return out;
}

/**
 * Grades one prompt.
 *
 * `thresholds` are the agency targets. They are REASONED, not measured against a
 * corpus of real agency briefs -- there is no such corpus in this repository --
 * so they are a standard this project is choosing, not a discovered truth. They
 * live in one place so raising the bar is one edit.
 */
export function gradePrompt(prompt: string, thresholds = AGENCY_THRESHOLDS): PromptGrade {
  const text = String(prompt || "");
  const lines = text.split(/\r?\n/);
  const present = headings(text);

  // ── domains ──────────────────────────────────────────────────────────────
  const domains: DomainReading[] = PROMPT_DOMAINS.map((domain) => {
    const words = DOMAIN_WORDS[domain];
    const params = DOMAIN_PARAMS[domain];
    let count = 0;
    let parameterised = 0;
    const examples: string[] = [];
    for (const line of lines) {
      if (!words.test(line)) continue;
      // A finish line mentions the frame and carries percentages, which would let
      // grain and corner falloff count as placement decisions. The finish states
      // its own domain and no other.
      if (domain !== "finish" && FINISH_LINE.test(line)) continue;
      count++;
      const hit = params.map((re) => re.exec(line)).find(Boolean);
      if (hit) {
        parameterised++;
        if (examples.length < 3) examples.push(squash(hit[0]).slice(0, 48));
      }
    }
    return { domain, lines: count, parameterised, examples, l3: parameterised > 0 };
  });

  const l3Coverage = domains.filter((d) => MEASURABLE_DOMAINS.includes(d.domain) && d.l3).length;
  const physicalParams = domains
    .filter((d) => MEASURABLE_DOMAINS.includes(d.domain))
    .reduce((n, d) => n + d.parameterised, 0);

  // ── verdict words, excluding the lines that forbid them ──────────────────
  const verdicts: string[] = [];
  let verdictRaw = 0;
  for (const line of lines) {
    const hits = line.match(VERDICT_WORDS) || [];
    verdictRaw += hits.length;
    if (hits.length && !PROHIBITION.test(line)) {
      for (const h of hits) if (verdicts.length < 12) verdicts.push(h.toLowerCase());
    }
  }

  // ── category labels standing alone ───────────────────────────────────────
  const labels: string[] = [];
  for (const line of lines) {
    const low = line.toLowerCase();
    for (const label of CATEGORY_LABELS) {
      if (!low.includes(label)) continue;
      const parameterised = Object.values(DOMAIN_PARAMS).some((res) => res.some((re) => re.test(line)));
      if (!parameterised && labels.length < 12) labels.push(label);
    }
  }

  // ── references to sections and content that are not there ────────────────
  const dangling: string[] = [];
  for (const m of text.matchAll(SECTION_REFERENCE)) {
    const name = squash(m[1]).toUpperCase();
    const found = [...present].some((h) => h.includes(name) || name.includes(h));
    if (!found && !dangling.includes(name)) dangling.push(name);
  }
  for (const [promise, required] of CONTENT_PROMISES) {
    if (promise.test(text) && !required.test(text)) {
      const label = squash(promise.source.split("|")[0]).slice(0, 40);
      if (!dangling.includes(label)) dangling.push(label);
    }
  }

  // ── restatement ──────────────────────────────────────────────────────────
  const sentences = longSentences(text);
  const restated: string[] = [];
  const seen = new Map<string, number>();
  for (const s of sentences) seen.set(s, (seen.get(s) ?? 0) + 1);
  for (const [s, n] of seen) if (n > 1 && restated.length < 8) restated.push(`${n}x ${s.slice(0, 70)}`);
  const unique = [...seen.keys()];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      if (jaccard(unique[i], unique[j]) >= 0.8 && restated.length < 8) {
        restated.push(`~ ${unique[i].slice(0, 50)} || ${unique[j].slice(0, 50)}`);
      }
    }
  }

  // ── meta text, guardrails, consequences, idea ────────────────────────────
  const nonEmpty = lines.filter((l) => l.trim());
  const metaLines = nonEmpty.filter((l) => META_LINE.test(l)).length;
  const guardrailLines = nonEmpty.filter((l) => DOMAIN_WORDS.guardrails.test(l));
  const guardLoose = guardrailLines.map((l) => squash(l).toLowerCase().replace(/[^a-z0-9 ]/g, ""));
  const duplicateGuardrails = guardLoose.length - new Set(guardLoose).size;
  const consequenceLines = nonEmpty.filter((l) =>
    /\b(so that|so the|because|which keeps|which lets|in order to|the effect is|reads as)\b/i.test(l),
  ).length;
  // ── the idea, measured on a labelled statement rather than on a stray phrase ──
  //
  // The first version of this gate passed on 12 of 12 baseline prompts, which
  // contradicted the finding it was built to catch: those prompts contain no idea
  // at all. It was matching `rather than` anywhere near the word "concept" --
  // "premium rather than mass-market" in a strategy paragraph counted as a
  // mechanism. A false pass on the weakest dimension the judge scores is worse
  // than no gate: it reports the gap as closed.
  //
  // What counts now: a line that announces the idea, and either a mechanism inside
  // the statement or an explicit statement of what the idea beat. Both are things
  // only a module that decided an idea can produce.
  const ideaLine = nonEmpty.findIndex((l) => /^\s*THE IDEA\b/i.test(l));
  const ideaBlock = ideaLine < 0 ? "" : nonEmpty.slice(ideaLine, ideaLine + 4).join(" ");
  const ideaStated = ideaLine >= 0 && squash(ideaBlock).length > 40;
  // A mechanism only. Naming what the idea beat is valuable and is NOT a
  // mechanism: a mood that beat two other moods is still a mood, and accepting it
  // here would be the same false pass in a second costume. This gate stays failed
  // until a brief actually contains an idea, which is the thing it is for.
  const ideaMechanism =
    ideaStated &&
    /\b(rather than|instead of|in place of|as if|as though|turns? into|becomes?|stands? in for|reads? as|the way a|without ever)\b/i.test(
      ideaBlock,
    );

  const metrics: PromptGrade["metrics"] = {
    verdict_words: verdicts.length,
    verdict_words_raw: verdictRaw,
    physical_params: physicalParams,
    category_labels: labels.length,
    dangling_refs: dangling.length,
    restated_sentences: restated.length,
    meta_lines: metaLines,
    meta_share: nonEmpty.length ? Math.round((metaLines / nonEmpty.length) * 1000) / 1000 : 0,
    guardrails: guardrailLines.length,
    duplicate_guardrails: duplicateGuardrails,
    consequence_lines: consequenceLines,
    idea_stated: ideaStated,
    idea_mechanism: ideaMechanism,
  };

  const gates: GateResult[] = [
    gate("l3_slot_coverage", l3Coverage, `>= ${thresholds.l3_slot_coverage} of ${MEASURABLE_DOMAINS.length}`, l3Coverage >= thresholds.l3_slot_coverage, "measurable domains that state at least one physical parameter"),
    gate("physical_params", physicalParams, `>= ${thresholds.physical_params}`, physicalParams >= thresholds.physical_params, "parameterised lines across the measurable domains"),
    gate("verdict_words", metrics.verdict_words, `= ${thresholds.verdict_words}`, metrics.verdict_words <= thresholds.verdict_words, "words that grade a picture instead of specifying one"),
    gate("category_labels", metrics.category_labels, `= ${thresholds.category_labels}`, metrics.category_labels <= thresholds.category_labels, "genre labels standing in for a decision"),
    gate("dangling_refs", metrics.dangling_refs, `= ${thresholds.dangling_refs}`, metrics.dangling_refs <= thresholds.dangling_refs, "references to sections or content the prompt does not contain"),
    gate("restated_sentences", metrics.restated_sentences, `<= ${thresholds.restated_sentences}`, metrics.restated_sentences <= thresholds.restated_sentences, "sentences repeated verbatim or restated at >= 0.8 overlap"),
    gate("meta_share", metrics.meta_share, `<= ${thresholds.meta_share}`, metrics.meta_share <= thresholds.meta_share, "share of lines that talk about the prompt rather than the picture"),
    gate("duplicate_guardrails", metrics.duplicate_guardrails, `= ${thresholds.duplicate_guardrails}`, metrics.duplicate_guardrails <= thresholds.duplicate_guardrails, "prohibitions stated twice"),
    gate("idea_mechanism", metrics.idea_mechanism ? 1 : 0, "= 1", metrics.idea_mechanism, "the idea is stated as a mechanism, not only as a mood"),
  ];

  return {
    chars: text.length,
    domains,
    l3_slot_coverage: l3Coverage,
    metrics,
    gates,
    passed: gates.filter((g) => g.ok).length,
    of: gates.length,
    found: { verdicts, labels, dangling, restated },
  };
}

function gate(id: string, value: number | boolean, threshold: string, ok: boolean, because: string): GateResult {
  return { id, value: typeof value === "boolean" ? (value ? 1 : 0) : value, threshold, ok, because };
}

/**
 * The standard this project is choosing.
 *
 * Reasoned from what a shot could be rebuilt from, not calibrated against real
 * agency briefs -- there is no corpus of those here, and pretending otherwise
 * would make a chosen bar look like a measured one.
 */
export const AGENCY_THRESHOLDS = {
  l3_slot_coverage: 5,
  physical_params: 18,
  verdict_words: 0,
  category_labels: 0,
  dangling_refs: 0,
  restated_sentences: 2,
  meta_share: 0.05,
  duplicate_guardrails: 0,
};

export type AgencyThresholds = typeof AGENCY_THRESHOLDS;

/** Counts and verdicts only. Never the client's copy. */
export function promptGradeTelemetry(g: PromptGrade | null | undefined) {
  if (!g) return { prompt_grade: false };
  return {
    prompt_grade: true,
    chars: g.chars,
    gates: `${g.passed}/${g.of}`,
    l3: `${g.l3_slot_coverage}/${MEASURABLE_DOMAINS.length}`,
    params: g.metrics.physical_params,
    verdicts: g.metrics.verdict_words,
    labels: g.metrics.category_labels,
    dangling: g.metrics.dangling_refs,
    restated: g.metrics.restated_sentences,
    meta_share: g.metrics.meta_share,
    failed: g.gates.filter((x) => !x.ok).map((x) => x.id),
  };
}
