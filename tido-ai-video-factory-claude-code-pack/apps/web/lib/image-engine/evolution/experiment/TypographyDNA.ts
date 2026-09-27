import type { CreativeBlueprint } from "./CreativeBlueprint";
import { BLUEPRINT_SECTIONS, SECTION_FIELDS } from "./CreativeBlueprint";
import type { CompositionMap } from "./CompositionMap";
import type { CompositionPlan } from "./CompositionPlan";
import type { BrandKit } from "./BrandKit";
import { colorFor, contrastRatio, normalizeHex } from "./BrandKit";

/**
 * Phase 5.6.3 — typography as art direction, not text placement.
 *
 * FontIntelligence answers "which typeface can draw these words". This answers
 * what a designer asks first: what job do the words do in THIS picture, what
 * should they make a viewer feel, and how should they behave so they belong to
 * the frame rather than sit on top of it.
 *
 * WHAT THIS REPLACED, AND WHY
 * ---------------------------
 * The first version was a preset library wearing a reasoning coat:
 *
 *     concept keyword -> named material -> fixed weight, spacing and prose
 *
 * Nine regexes, first match wins, one named look each. Three things were wrong
 * with it, and the third shipped:
 *
 *   1. ONE WORD DECIDED EVERYTHING. First-match meant the earliest rule beat
 *      all other evidence, however much of it there was.
 *   2. WHERE THE WORD APPEARED DID NOT COUNT. "airy" in a colour description
 *      weighed the same as "airy" in the atmosphere.
 *   3. SO A LIVE RENDER GOT IT WRONG. A juice-splash brief -- motion, freshness,
 *      a promotion to shout about -- was set in soft floating type because the
 *      director's COLOUR note said "an airy, daylight-bright white background".
 *      The same fault would give a racing car dreamlike typography for the same
 *      reason, which is the failure this rebuild exists to remove.
 *
 * WHAT IT DOES INSTEAD
 * --------------------
 * Every reading in the brief contributes, weighted by the field it came from
 * and by how much that field says about typography. Readings push and PULL: an
 * idea about precision actively suppresses soft edges, so a racing car with an
 * airy atmosphere comes out hard, tight and bright rather than dreamlike. The
 * result is a point in a continuous space of independent behaviours, not one of
 * seven names -- "misty" is what you call a treatment that came out soft and
 * nothing else, not a preset that was selected.
 *
 * WHERE THE CREATIVE REASONING ACTUALLY COMES FROM
 * ------------------------------------------------
 * The Creative Director. It has already reasoned about this brief with a model
 * and written the result into the blueprint -- including six decisions about
 * typography specifically (`typographic_voice`, `font_character`,
 * `hierarchy_logic`, `spacing_behavior`, `placement_reason`,
 * `contrast_strategy`) plus the idea, the tension, the emotional direction and
 * the world. That is per-brief reasoning already paid for, and it was being
 * thrown away. This layer READS it: the prose fields below quote the
 * director's own words, so they are as open-ended as the brief is, and the
 * numeric behaviours are resolved from all of it at once.
 *
 * WHAT IS AUTHORED HERE, STATED PLAINLY
 * -------------------------------------
 * The VOCABULARY of qualities below is authored -- a fixed list of things a
 * brief can be about, each with a direction on each behaviour. What is NOT
 * authored is the combination: the qualities compose, cancel and scale, so the
 * space of outcomes is continuous and a brief's own words decide where in it
 * this artwork lands. A truly generative vocabulary would need a model call of
 * its own; this one spends nothing and is auditable, and every decision records
 * the phrase that produced it.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * Never changes a word, never invents copy, and never lets decoration beat
 * legibility: a behaviour that would drop a line under its contrast floor is
 * attenuated or dropped, and the reason is recorded.
 */

// ── what the letterforms physically do ─────────────────────────────────────

/**
 * The behaviours the renderer can actually produce, as independent amounts.
 *
 * NOT a style list. Each axis is continuous and they combine freely, so type
 * can be softly luminous, or metallic AND raised, or transparent with a contact
 * shadow -- combinations no named material could express. Every axis was
 * verified against the real rasteriser before it was offered here, because a
 * behaviour the renderer ignores would read in the record as though something
 * happened when nothing did.
 */
export interface TypographyTreatment {
  /** Edge diffusion: how much the letterforms melt into the air around them. */
  softness: number;
  /** Light the type emits of its own, spilling past its edges. */
  luminosity: number;
  /** How much of the picture behind shows through the strokes. */
  translucency: number;
  /** Raised or pressed relief: a lit edge and a shadowed one. */
  relief: number;
  /** A graded surface across the stroke, the way a polished face takes light. */
  sheen: number;
  /** A shadow separating the words from a surface they sit on. */
  contact: number;
  /** Stroke weight, 300-900. */
  weight: number;
  /** Letter spacing, in ems. */
  tracking: number;
}

export const TREATMENT_AXES = ["softness", "luminosity", "translucency", "relief", "sheen", "contact"] as const;
export type TreatmentAxis = (typeof TREATMENT_AXES)[number];

/** Nothing applied: solid ink, nothing added. A real answer, not a missing one. */
export const NEUTRAL_TREATMENT: TypographyTreatment = {
  softness: 0, luminosity: 0, translucency: 0, relief: 0, sheen: 0, contact: 0,
  weight: 700, tracking: 0,
};

export interface TypographyDNA {
  // ── creative reasoning: what typography is FOR in this artwork ──────────
  /**
   * The job typography does here, in this brief's own terms.
   *
   * Deliberately a sentence and not an enum: "the hero statement" and "a quiet
   * signature" are two of the jobs it can name, but the job is composed from
   * what the director decided, so a brief that needs a role nobody listed gets
   * one described rather than forced into the nearest label.
   */
  typography_role: string;
  /** What the words should make a viewer feel, quoting the direction. */
  emotional_purpose: string;
  /** How the type serves the product rather than competing with it. */
  relationship_to_product: string;
  /** How the type exists inside the picture: its light, depth and quiet areas. */
  relationship_to_scene: string;
  /** How the letterforms behave visually, described from what was resolved. */
  visual_behavior: string;
  /** Why THIS direction, for THIS concept -- including what it beat. */
  uniqueness_reason: string;

  // ── what the compositor draws ───────────────────────────────────────────
  treatment: TypographyTreatment;
  /** The typographic voice, carried from the director where it named one. */
  personality: string;
  /** What the letterforms must do, in one sentence. */
  font_character: string;
  /** What FontIntelligence should look for. Reasoning precedes the typeface. */
  font_need: FontNeed;

  /** Every decision above, traced to the phrase that produced it. */
  because: Record<string, string>;
  /** Behaviours reduced or dropped, and why. */
  refused: string[];
  /** The colour a graded surface is built from: the brand's, where it has one. */
  accent?: string | null;
}

/**
 * What the typeface has to be able to express, decided BEFORE a face is chosen.
 *
 * The order matters and used to be wrong: the face was picked from a
 * personality label, then the creative treatment was resolved around whatever
 * face came back. A designer decides what the letters must do, then finds one
 * that does it.
 */
export interface FontNeed {
  /** Stroke contrast wanted, 0 (even) to 1 (high modulation). */
  contrast: number;
  /** Built geometrically, or with a human hand in it. */
  humanist: boolean;
  /** Needs presence at display size rather than legibility at small size. */
  display: boolean;
  because: string;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A blueprint decision's value, whatever shape the decision took. */
function decisionText(d: unknown): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  const o = d as { value?: unknown; choice?: unknown };
  return clean(o.value) || clean(o.choice) || "";
}

/**
 * How much each blueprint field says about how the TYPE should behave.
 *
 * This is the fix for the defect that shipped. The director's decisions are not
 * equally about typography: `typographic_voice` is a decision about the words
 * themselves, `atmosphere` is about the world they live in, and `color_story`
 * is about the palette -- so "airy" in a palette note is weak evidence that the
 * LETTERS should be airy, and it used to be conclusive.
 *
 * Fields absent from this table are read at `DEFAULT_FIELD_WEIGHT`.
 */
const FIELD_WEIGHT: Record<string, number> = {
  // Decisions about the type itself.
  typographic_voice: 1, font_character: 1, contrast_strategy: 0.9, spacing_behavior: 0.9,
  hierarchy_logic: 0.7, placement_reason: 0.5,
  // What the world is made of and how it is lit: strong evidence about surface.
  atmosphere: 0.9, lighting_behavior: 0.85, material_rendering: 0.85, material_language: 0.6,
  // What the work is ABOUT: strong evidence about force, pace and restraint.
  emotional_hook: 0.8, emotional_direction: 0.8, creative_tension: 0.7,
  big_idea: 0.7, campaign_concept: 0.65, message_strategy: 0.6, story: 0.6, visual_story: 0.6,
  // The world's furniture: weaker.
  visual_world: 0.5, environment_logic: 0.45, styling: 0.45, visual_metaphor: 0.45,
  visual_language: 0.4, depth_feeling: 0.4,
  // A palette note. The live failure lived exactly here.
  color_story: 0.25, color_system: 0.25,
};
const DEFAULT_FIELD_WEIGHT = 0.4;

/** Every decision the director made, by field name. */
function flatten(bp: CreativeBlueprint | null | undefined): Map<string, string> {
  const flat = new Map<string, string>();
  if (!bp) return flat;
  for (const section of BLUEPRINT_SECTIONS) {
    const held = (bp as unknown as Record<string, Record<string, unknown> | null>)[section] || {};
    for (const key of SECTION_FIELDS[section]) {
      const v = decisionText(held[key]);
      if (v) flat.set(key, v);
    }
  }
  const story = decisionText((bp as unknown as { story?: unknown }).story);
  if (story) flat.set("story", story);
  return flat;
}

/** Everything the director said, lowercased, for recognising a category. */
function allText(flat: Map<string, string>): string {
  return [...flat.values()].join(" ").toLowerCase();
}

/**
 * The commercial category, read from the director's own words.
 *
 * `FontIntelligence` scores faces by category, and nothing upstream produces
 * one: this engine has no category table on purpose, because a table is the
 * fastest route back to a house style. So the category is not decided here
 * either -- it is RECOGNISED, from vocabulary the director already used, and
 * only for the six the font catalogue distinguishes. No match means no category.
 */
export function categoryHint(bp: CreativeBlueprint | null | undefined): string | null {
  const text = allText(flatten(bp));
  const table: Array<[string, RegExp]> = [
    // A `\b` after a Vietnamese vowel never matches -- `ê` is not a word
    // character in a non-unicode regex -- so the Vietnamese terms are matched
    // without word boundaries instead of silently never matching.
    ["beverage", /\b(coffee|tea|juice|drink|beverage|soda|cocktail|brew|espresso|latte)\b|cà phê|trà sữa|nước ép/],
    ["food", /\b(food|dish|meal|snack|bread|noodle|sauce|flavour|flavor|appetite|kitchen|recipe|savoury|savory)\b|bánh|phở|món ăn/],
    ["beauty", /\b(skin|skincare|serum|cosmetic|beauty|moistur|fragrance|perfume|lipstick)\b|mỹ phẩm|dưỡng da/],
    ["technology", /\b(device|phone|laptop|app|software|tech|digital|processor|electric|circuit)\b/],
    ["fashion", /\b(fashion|apparel|garment|fabric|outfit|shoe|handbag|jewel|wristwatch|tailor)\b/],
    ["fmcg", /\b(detergent|household|hygiene|cleaning|supermarket|fmcg)\b|everyday essential|packaged good/],
  ];
  for (const [name, re] of table) if (re.test(text)) return name;
  return null;
}

// ── the vocabulary of qualities ────────────────────────────────────────────

/**
 * One thing a brief can be ABOUT, and what it asks the letterforms to do.
 *
 * Each quality pushes several behaviours at once, and may push some NEGATIVE:
 * that is what lets evidence argue. `precision` suppressing `softness` is why a
 * racing car with an airy atmosphere does not get dreamlike type -- the old
 * table had no way to express disagreement, so the first match simply won.
 *
 * `pull` values are per unit of evidence; the resolver sums them across every
 * field that mentions the quality, weighted by what that field is about.
 */
interface Quality {
  name: string;
  when: RegExp;
  /** Signed contributions. Surface axes are 0-1 scale; weight is in font units. */
  pull: Partial<Record<TreatmentAxis, number>> & { weight?: number; tracking?: number; contrast?: number };
  /** Whether the letterforms should feel made by a hand. */
  humanist?: number;
  /** How this quality would describe the letterforms, used to build prose. */
  reads: string;
}

const QUALITIES: Quality[] = [
  {
    name: "diffusion", when: /\b(dream|dreamy|haze|hazy|mist|misty|fog|cloud|airy|weightless|float|floating|ethereal|drift|soft light|softly lit)\b/,
    pull: { softness: 1, tracking: 0.03, weight: -120, contrast: -0.2 },
    reads: "edges that dissolve into the air rather than cut against it",
  },
  {
    name: "emitted light", when: /\b(glow|glowing|luminous|radiant|neon|backlit|shimmer|illuminat|lit from within|light source|halo)\b/,
    pull: { luminosity: 1, tracking: 0.01 },
    reads: "letterforms carrying light of their own",
  },
  {
    name: "polished surface", when: /\b(metal|metallic|chrome|gold|golden|brass|foil|polish|polished|mirror|gloss|lacquer|sheen)\b/,
    pull: { sheen: 1, weight: 80, contrast: 0.2 },
    reads: "a graded surface that takes the light the way the product's finish does",
  },
  {
    name: "transparency", when: /\b(glass|transparent|translucent|crystal|clear|ice|icy|water|liquid|see-through)\b/,
    pull: { translucency: 1, tracking: 0.02, weight: -60 },
    reads: "strokes you can see the picture through",
  },
  {
    // "label" and "packaging" were here and had to go: they describe the
    // PRODUCT, not a treatment for the words. A luxury brief that said "no
    // highlights competing with the label" was read as asking for ink-on-paper
    // typography, which is the product's own label talking, not the director.
    name: "printed surface", when: /\b(paper|print|printed|letterpress|stock|ink|stamp)\b/,
    pull: { contact: 0.8, relief: 0.3 }, humanist: 0.4,
    reads: "ink lying on a surface, lifted just off it",
  },
  {
    name: "the hand", when: /\b(handmade|hand-made|artisan|craft|crafted|hand-|rustic|imperfect|uneven|homemade|small batch)\b/,
    pull: { contact: 0.4, softness: 0.2, weight: -40, contrast: -0.1 }, humanist: 1,
    reads: "weight that varies as a hand would vary it",
  },
  {
    name: "the natural world", when: /\b(organic|natural|earth|earthy|soil|botanic|leaf|wood|grain|harvest|farm|garden|plant)\b/,
    pull: { contact: 0.3, softness: 0.15, sheen: -0.4 }, humanist: 0.7,
    reads: "nothing machined about it",
  },
  {
    name: "force", when: /\b(explosive|explosion|impact|power|powerful|punch|slam|aggressive|hit|hits|strength|strong)\b/,
    pull: { relief: 0.7, weight: 180, tracking: -0.015, softness: -0.4 },
    reads: "strokes heavy enough to land as hard as the picture does",
  },
  {
    name: "motion", when: /\b(motion|movement|dynamic|speed|fast|rush|burst|splash|splashing|kinetic|velocity|race|racing|accelerat)\b/,
    pull: { weight: 100, tracking: -0.01, softness: -0.5, sheen: 0.3 },
    reads: "tight and forward-leaning, nothing loose about it",
  },
  {
    name: "precision", when: /\b(precision|precise|engineer|engineered|technical|exact|calibrat|machined|clinical|accuracy|performance|specification)\b/,
    pull: { contrast: 0.5, tracking: -0.005, softness: -0.7, relief: -0.2 },
    reads: "edges cut exactly, nothing blurred or approximate",
  },
  {
    name: "restraint", when: /\b(restraint|restrained|understated|minimal|minimalist|quiet|refined|elegan|sophisticat|discreet|subtle|calm|stillness)\b/,
    pull: { tracking: 0.05, weight: -120, luminosity: -0.4, relief: -0.4, sheen: -0.2, contrast: 0.2 },
    reads: "space doing the work decoration would spoil",
  },
  {
    name: "status", when: /\b(luxur|luxury|premium|exclusive|prestige|couture|fine|reserve|heritage|crafted for|connoisseur)\b/,
    pull: { contrast: 0.4, tracking: 0.03, sheen: 0.2, weight: -40 },
    reads: "high stroke contrast, confident about being read slowly",
  },
  {
    name: "warmth", when: /\b(warm|warmth|cosy|cozy|comfort|home|homely|gentle|tender|nurtur|friendly|familiar|welcoming)\b/,
    pull: { softness: 0.25, contact: 0.3, weight: -40 }, humanist: 0.6,
    reads: "softened enough to feel spoken rather than specified",
  },
  {
    name: "freshness", when: /\b(fresh|freshness|crisp|clean|bright|pure|cool|chilled|zest|vibrant|juicy)\b/,
    pull: { softness: -0.2, contrast: 0.2, weight: -20 },
    reads: "clean and unfussy",
  },
  {
    name: "plain dealing", when: /\b(trust|trusted|honest|reliable|safe|straightforward|everyday|practical|no-nonsense|value)\b/,
    pull: { softness: -0.4, luminosity: -0.4, translucency: -0.4, relief: -0.3, sheen: -0.3 },
    reads: "read before the styling is noticed",
  },
  {
    name: "the near future", when: /\b(futur|futuristic|digital|interface|tech|technolog|cyber|holograph|sci-fi|synthetic|screen|data|smart)\b/,
    pull: { luminosity: 0.5, tracking: 0.04, weight: -40, sheen: 0.3, softness: -0.3 },
    reads: "spaced like an interface, lit like a screen",
  },
  {
    name: "play", when: /\b(playful|play|fun|joyful|cheerful|bounc|lively|party|celebrat|delight|silly)\b/,
    pull: { weight: 80, tracking: -0.005, relief: 0.3, softness: -0.1 },
    reads: "solid and up-front, pleased with itself",
  },
  {
    // The counterpart to "polished surface". A director who writes "matte
    // glass, no highlights" is describing the absence of shine, and without
    // this the word "glass" alone made the type glossy and transparent.
    name: "matte", when: /\b(matte|unpolished|satin|brushed|diffused finish|no highlight|no shine|non-reflective)\b/,
    // Suppresses transparency as hard as it suppresses shine: "matte glass" is
    // glass you cannot see through, and reading it as a request for
    // see-through type was how a brief about restraint got a decoration.
    pull: { sheen: -0.9, luminosity: -0.3, translucency: -0.8 },
    reads: "a surface that absorbs light rather than bouncing it",
  },
  {
    name: "cinema", when: /\b(cinematic|dramatic|chiaroscuro|moody|noir|deep shadow|theatrical)\b/,
    pull: { contact: 0.5, contrast: 0.4, relief: 0.2 },
    reads: "separated from the picture by its own shadow",
  },
  {
    name: "heat", when: /\b(spicy|fiery|fire|flame|heat|burn|burning|sizzl|smok)\b|\bcay\b/,
    pull: { relief: 0.5, weight: 120, luminosity: 0.3, tracking: -0.01 },
    reads: "raised and hot-edged",
  },
];

// ── reading the brief ──────────────────────────────────────────────────────

interface Reading {
  quality: Quality;
  /** Summed field weight: how much of the brief, and which parts, said this. */
  strength: number;
  /** The field that said it most strongly, and the phrase, for the record. */
  field: string;
  phrase: string;
}

/**
 * Every quality the brief exhibits, with how strongly and from where.
 *
 * Nothing short-circuits. A brief that is about six things produces six
 * readings, and they all get a vote in proportion to how much of the brief --
 * and which parts of it -- said so.
 */
function read(flat: Map<string, string>): Reading[] {
  const found = new Map<string, Reading>();
  for (const [field, value] of flat) {
    const weight = FIELD_WEIGHT[field] ?? DEFAULT_FIELD_WEIGHT;
    const lower = value.toLowerCase();
    for (const q of QUALITIES) {
      const m = q.when.exec(lower);
      if (!m) continue;
      // "no highlights", "without any glow", "never metallic": the word is
      // present and the brief is asking for its ABSENCE. Reading it as evidence
      // for the thing is how "matte glass and stone, no highlights" produced
      // glossy transparent type on a brief whose whole point was restraint.
      // Dropped rather than inverted: the opposite of a quality is not
      // reliably another quality, and inventing one would be worse.
      if (negated(lower, m.index)) continue;
      const prev = found.get(q.name);
      if (!prev) {
        found.set(q.name, { quality: q, strength: weight, field, phrase: m[0] });
      } else {
        prev.strength += weight;
        // The record names the field that argued hardest for it.
        if (weight > (FIELD_WEIGHT[prev.field] ?? DEFAULT_FIELD_WEIGHT)) {
          prev.field = field;
          prev.phrase = m[0];
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => b.strength - a.strength || a.quality.name.localeCompare(b.quality.name));
}

/** Whether the match at `at` is preceded by something that denies it. */
function negated(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 22), at);
  return /\b(no|not|never|without|free of|devoid of|avoid|avoiding|anti|un)\b[^.,;]*$/.test(before);
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clampWeight = (n: number) => Math.max(300, Math.min(900, Math.round(n / 100) * 100));
const clampTracking = (n: number) => Math.max(-0.02, Math.min(0.08, Math.round(n * 1000) / 1000));

/** Where the personality starts before the brief argues with it. */
const VOICE_BASE: Record<string, { weight: number; tracking: number; contrast: number; humanist: boolean }> = {
  editorial: { weight: 600, tracking: 0.02, contrast: 0.7, humanist: false },
  technical: { weight: 500, tracking: 0, contrast: 0.1, humanist: false },
  crafted: { weight: 500, tracking: 0.01, contrast: 0.3, humanist: true },
  direct: { weight: 700, tracking: 0, contrast: 0.2, humanist: false },
  quiet: { weight: 300, tracking: 0.05, contrast: 0.3, humanist: true },
  assertive: { weight: 800, tracking: -0.01, contrast: 0.1, humanist: false },
};

export interface TypographyDNAInput {
  blueprint?: CreativeBlueprint | null;
  /** The typographic voice the plan resolved, when there is one. */
  personality?: string | null;
  category?: string | null;
  brandKit?: BrandKit | null;
  /** The rendered scene, once it exists: its light decides what survives. */
  map?: CompositionMap | null;
  /**
   * Phase 5.6.4 — the composition, decided before the render.
   *
   * Where it exists it is AUTHORITATIVE about typography's relationship to the
   * frame: the composition already reasoned about where the words live and what
   * they are protecting, and a second opinion computed here from the same
   * blueprint is how two modules end up describing one frame differently.
   */
  compositionPlan?: CompositionPlan | null;
  /** Whether the copy is one line or several: a role depends on how much there is. */
  copyLines?: number;
}

/**
 * Resolves what typography should do here, and how it should behave. Pure.
 *
 * Reasoning first: read the brief, decide the ROLE, and only then resolve the
 * behaviours that serve that role. The brand narrows it, and the rendered
 * picture gets the last word -- a behaviour that will not survive the actual
 * pixels is attenuated however well it suits the idea.
 */
export function buildTypographyDNA(input: TypographyDNAInput): TypographyDNA {
  const flat = flatten(input.blueprint);
  const field = (k: string) => flat.get(k) || "";
  const readings = read(flat);
  const because: Record<string, string> = {};
  const refused: string[] = [];

  const personality = clean(input.personality) || voiceWord(field("typographic_voice")) || "direct";
  const base = VOICE_BASE[personality] || VOICE_BASE.direct;
  because.personality = field("typographic_voice")
    ? `the director's typographic voice: "${field("typographic_voice")}"`
    : `no voice was stated, so the plan's "${personality}" was used`;

  // ── behaviours: every reading votes, in proportion to its strength ──────
  //
  // Strength is divided by a soft constant rather than normalised to the
  // strongest reading: a brief that says one thing weakly should produce a
  // weak treatment, not a full-strength one by default.
  const VOTE = 1.6;
  const sum = { softness: 0, luminosity: 0, translucency: 0, relief: 0, sheen: 0, contact: 0 };
  let weight = base.weight;
  let tracking = base.tracking;
  let contrast = base.contrast;
  let humanist = base.humanist ? 0.6 : 0;
  for (const r of readings) {
    const v = r.strength / VOTE;
    for (const axis of TREATMENT_AXES) sum[axis] += (r.quality.pull[axis] ?? 0) * v;
    weight += (r.quality.pull.weight ?? 0) * v;
    tracking += (r.quality.pull.tracking ?? 0) * v;
    contrast += (r.quality.pull.contrast ?? 0) * v;
    humanist += (r.quality.humanist ?? 0) * v;
  }

  const treatment: TypographyTreatment = {
    softness: clamp01(sum.softness),
    luminosity: clamp01(sum.luminosity),
    translucency: clamp01(sum.translucency),
    relief: clamp01(sum.relief),
    sheen: clamp01(sum.sheen),
    contact: clamp01(sum.contact),
    weight: clampWeight(weight),
    tracking: clampTracking(tracking),
  };

  // ── one behaviour leads ─────────────────────────────────────────────────
  //
  // A brief that is about several things resolved into several behaviours at
  // full strength -- one futuristic coffee brief came out luminous AND graded
  // AND transparent at once, which is not art direction, it is three effects
  // fighting. A designer lets one behaviour carry the idea and keeps the rest
  // in support, so everything after the strongest is scaled down rather than
  // dropped: it still shows, and it no longer competes.
  const ranked = TREATMENT_AXES.filter((a) => treatment[a] >= 0.2).sort((a, b) => treatment[b] - treatment[a]);
  if (ranked.length > 1) {
    const led: string[] = [];
    ranked.slice(1).forEach((axis, i) => {
      const scale = i === 0 ? 0.45 : 0.25;
      const was = treatment[axis];
      treatment[axis] = Math.round(was * scale * 100) / 100;
      led.push(`${axis} ${was.toFixed(2)} → ${treatment[axis].toFixed(2)}`);
    });
    because.dominance = `${ranked[0]} leads at ${treatment[ranked[0]].toFixed(2)}; ${led.join(", ")} kept in support so they do not compete with it`;
  }

  because.treatment = readings.length
    ? `resolved from ${readings.length} reading${readings.length === 1 ? "" : "s"}: ` +
      readings.slice(0, 4).map((r) => `${r.quality.name} (${r.field}, "${r.phrase}")`).join(", ")
    : "nothing in the direction asks the letterforms to do anything, so they do nothing";

  // What the brief argued about. This is the part the old table could not say.
  const contested = contestedAxes(readings);
  because.uniqueness = contested.length
    ? contested.map((c) => c.note).join("; ")
    : "no two readings pulled the same behaviour in opposite directions";

  // ── the brand narrows it ────────────────────────────────────────────────
  const kit = input.brandKit || null;
  for (const forbidden of kit?.style?.forbidden ?? []) {
    const f = forbidden.toLowerCase();
    for (const axis of TREATMENT_AXES) {
      if (treatment[axis] > 0 && FORBIDDEN_WORDS[axis].test(f)) {
        refused.push(`${axis}: the brand forbids "${forbidden}"`);
        treatment[axis] = 0;
      }
    }
  }

  // ── the rendered picture gets the last word ─────────────────────────────
  //
  // Attenuation rather than refusal where the behaviour can survive in a
  // smaller amount: dropping a treatment to nothing because the frame is
  // slightly busy throws away a decision that was still right.
  //
  // The thresholds are measured. `mean_detail` is normalised to the frame's own
  // maximum, so it says how UNIFORMLY busy a frame is, and on this engine's own
  // fixtures it reads: a product on a plain ground 0.06, the same product with
  // noise across the whole frame 0.16, dots everywhere 0.27, dense dots 0.35.
  const BUSY_EVERYWHERE = 0.15;
  const map = input.map || null;
  if (map) {
    if (treatment.luminosity > 0 && map.mean_luminance > 0.62) {
      refused.push(`luminosity ${treatment.luminosity.toFixed(2)}: the frame came back bright, so emitted light would read as a smudge`);
      treatment.luminosity = 0;
    }
    if (map.mean_detail > BUSY_EVERYWHERE) {
      // Over detail, transparency and soft edges are the first things to go.
      const keep = Math.max(0, 1 - (map.mean_detail - BUSY_EVERYWHERE) * 4);
      for (const axis of ["translucency", "softness"] as const) {
        if (treatment[axis] > 0.02) {
          const was = treatment[axis];
          treatment[axis] = Math.round(was * keep * 100) / 100;
          refused.push(`${axis} ${was.toFixed(2)} → ${treatment[axis].toFixed(2)}: the frame is busy everywhere (detail ${map.mean_detail.toFixed(2)}) and this is what stops reading first`);
        }
      }
    }
    if (map.mean_luminance < 0.25 && treatment.weight < 500) {
      treatment.weight = 500;
      because.weight = "raised to 500: the render came back dark and light strokes disappear on it";
    }
  }

  const accent = colorFor(kit, "accent", "primary");
  const role = decideRole({ flat, readings, map: map, copyLines: input.copyLines ?? 0 });
  because.typography_role = role.because;

  const font_need: FontNeed = {
    contrast: clamp01(contrast),
    humanist: humanist > 0.5,
    display: treatment.weight >= 700 || role.hero,
    because:
      `${clamp01(contrast) > 0.5 ? "modulated strokes" : "even strokes"}, ` +
      `${humanist > 0.5 ? "with a hand in them" : "built rather than written"}, ` +
      `${treatment.weight >= 700 || role.hero ? "carrying the frame at display size" : "legible before it is noticed"}`,
  };

  return {
    typography_role: role.role,
    emotional_purpose: emotionalPurpose(field, readings),
    relationship_to_product: role.toProduct,
    relationship_to_scene: sceneRelationship(treatment, map, field, input.compositionPlan ?? null),
    visual_behavior: describe(treatment, readings),
    uniqueness_reason: uniqueness(readings, contested, role),
    treatment,
    personality,
    font_character: characterOf(treatment, readings, base),
    font_need,
    because,
    refused,
    accent,
  };
}

/** Words that mean "do not do this to my type", per behaviour. */
const FORBIDDEN_WORDS: Record<TreatmentAxis, RegExp> = {
  softness: /soft|blur|fuzzy|mist|haze|dreamy/,
  luminosity: /glow|neon|luminous|halo|shine/,
  translucency: /transparent|translucent|see-through|ghost/,
  relief: /emboss|3d|bevel|raised|extrud/,
  sheen: /metallic|gradient|chrome|gold|shiny|gloss/,
  contact: /shadow|drop shadow|drop-shadow/,
};

/** The single word the plan uses for a voice, if the director's prose names one. */
function voiceWord(prose: string): string {
  const p = prose.toLowerCase();
  for (const v of Object.keys(VOICE_BASE)) if (p.includes(v)) return v;
  return "";
}

/** Behaviours two readings pulled in opposite directions, and who won. */
function contestedAxes(readings: Reading[]): Array<{ axis: string; note: string }> {
  const out: Array<{ axis: string; note: string }> = [];
  for (const axis of [...TREATMENT_AXES, "weight" as const, "tracking" as const]) {
    const pushes = readings.filter((r) => (r.quality.pull[axis as TreatmentAxis] ?? 0) > 0);
    const pulls = readings.filter((r) => (r.quality.pull[axis as TreatmentAxis] ?? 0) < 0);
    if (!pushes.length || !pulls.length) continue;
    const forSide = pushes.reduce((n, r) => n + r.strength * (r.quality.pull[axis as TreatmentAxis] ?? 0), 0);
    const againstSide = pulls.reduce((n, r) => n + r.strength * -(r.quality.pull[axis as TreatmentAxis] ?? 0), 0);
    const winner = forSide >= againstSide ? pushes[0] : pulls[0];
    const loser = forSide >= againstSide ? pulls[0] : pushes[0];
    out.push({
      axis,
      note:
        `${axis} was contested — ${loser.quality.name} (${loser.field}) argued against ` +
        `${winner.quality.name} (${winner.field}), and ${winner.quality.name} won`,
    });
  }
  return out;
}

interface RoleDecision {
  role: string;
  toProduct: string;
  because: string;
  hero: boolean;
}

/**
 * What job typography does in THIS artwork.
 *
 * Reasoned from how much the picture is already carrying, how much copy there
 * is, and what the director said the words are for -- not from a label. The
 * sentence is composed, so a brief whose job nobody anticipated gets it
 * described rather than rounded to the nearest enum.
 */
function decideRole(ctx: {
  flat: Map<string, string>;
  readings: Reading[];
  map: CompositionMap | null;
  copyLines: number;
}): RoleDecision {
  const f = (k: string) => ctx.flat.get(k) || "";
  const hook = f("emotional_hook") || f("emotional_direction");
  const idea = f("big_idea") || f("campaign_concept") || f("visual_story");
  const hierarchy = f("hierarchy_logic");
  const space = f("negative_space") || f("text_area");
  const productPos = f("product_position");

  // How much the PICTURE is already doing. A frame with a strong product and a
  // lot going on does not need the words to carry the idea as well.
  const pictureCarries =
    (ctx.map?.product ? 1 : 0) +
    (ctx.map && ctx.map.mean_detail > 0.12 ? 1 : 0) +
    (ctx.readings.some((r) => ["cinema", "emitted light", "polished surface", "motion"].includes(r.quality.name)) ? 1 : 0);

  // Whether the layout left typography room to be anything. A director who
  // reserved a large quiet area has decided the words matter here; one who
  // gave them a margin has decided they do not, and no amount of idea in the
  // brief makes a hero statement out of a strip down one edge.
  const roomy = /generous|large|wide|ample|dominant|majority|half the frame|upper third|significant/i.test(space);
  const cramped = /tight|minimal|narrow|small|strip|margin|corner|little room/i.test(space);

  const verbal = Boolean(idea) && ctx.copyLines > 0 && ctx.copyLines <= 2;
  const dense = ctx.copyLines >= 4;

  // Order matters, and was wrong first time: `pictureCarries` was gated behind
  // `!verbal`, and almost every brief is verbal (one or two lines against a
  // stated idea), so a frame already doing all the work still got hero type.
  // What the PICTURE is doing outranks how much copy there is.
  if (dense) {
    return {
      role: "information the viewer has to be able to act on, ordered so the offer is read before the detail",
      toProduct: "kept clear of the product and subordinate to it: several lines competing with a hero shot would lose to it anyway",
      because: `${ctx.copyLines} lines of copy: at that length the job is order and clarity, not voice`,
      hero: false,
    };
  }
  if (pictureCarries >= 2 || cramped) {
    return {
      role: hook
        ? `a quiet signature under a picture that is already saying it: the words name who is speaking, not what is felt — the frame is carrying "${shorten(hook)}"`
        : "a quiet signature: the picture is carrying the idea and the words only need to name who is speaking",
      toProduct: productPos
        ? `set so the product keeps the position the director gave it — ${shorten(productPos)}`
        : "set clear of the product, which is the thing being sold",
      because: cramped && pictureCarries < 2
        ? `the layout reserved little room for copy — "${shorten(space, 70)}" — so typography cannot be the hero whatever the idea says`
        : `the picture is doing the work (${pictureCarries} of 3 signals: product present, frame busy, strong visual treatment), so typography steps back`,
      hero: false,
    };
  }
  if (verbal) {
    return {
      role:
        `the hero statement: ${shorten(idea)} is an idea the picture cannot say on its own, so the words say it and the frame supports them` +
        (hierarchy ? `. The director set the reading order: ${shorten(hierarchy, 80)}` : ""),
      toProduct: "sized and placed so the product is what the eye lands on second, immediately — the line wins the first read, the product wins the decision",
      because:
        `${ctx.copyLines} line${ctx.copyLines === 1 ? "" : "s"} of copy against a stated idea, and a frame not already carrying it` +
        (roomy ? `; the layout reserved real space for it — "${shorten(space, 60)}"` : ""),
      hero: true,
    };
  }
  return {
    role: hook
      ? `to hold the feeling the picture establishes — "${shorten(hook)}" — without adding a second voice to it`
      : "to say what has to be said and stay out of the picture's way",
    toProduct: "subordinate to the product, which is the reason the frame exists",
    because: hook ? "no strong visual treatment and no single idea to carry, so the type holds the mood the picture sets" : "nothing in the brief gives typography a larger job than being read",
    hero: false,
  };
}

const shorten = (s: string, n = 90) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

function emotionalPurpose(field: (k: string) => string, readings: Reading[]): string {
  const hook = field("emotional_hook");
  const direction = field("emotional_direction");
  if (hook || direction) return shorten(hook || direction, 140);
  if (readings.length) return `to feel ${readings.slice(0, 2).map((r) => r.quality.name).join(" and ")}`;
  return "nothing was stated, so the words aim only to be read";
}

function sceneRelationship(
  t: TypographyTreatment,
  map: CompositionMap | null,
  field: (k: string) => string,
  plan: CompositionPlan | null,
): string {
  const light = clean(field("lighting_behavior"));
  const atmosphere = clean(field("atmosphere"));
  const parts: string[] = [];
  // The composition's own account comes first and is not recomputed here. What
  // follows adds only what the composition could not know: facts measured on
  // the returned pixels, which did not exist when the plan was made.
  if (plan && plan.typography_relationship.value && plan.typography_relationship.value !== "no typography in this frame") {
    parts.push(plan.typography_relationship.value);
  }
  if (map?.product && !parts.length) parts.push("set clear of the product, in the quietest area the render left");
  if (map && map.mean_luminance < 0.35) parts.push("light type on a dark frame");
  else if (map && map.mean_luminance > 0.65) parts.push("dark type on a light frame");
  if (t.luminosity > 0.2 || t.softness > 0.2) parts.push("sharing the scene's own light rather than sitting above it");
  if (t.sheen > 0.2 && light) parts.push(`taking the light the director described as ${shorten(light.toLowerCase(), 60)}`);
  if (t.contact > 0.2) parts.push("lifted off the surface by its own shadow");
  if (t.translucency > 0.2) parts.push("letting the picture through rather than covering it");
  if (!parts.length) parts.push(atmosphere ? `holding the ${shorten(atmosphere.toLowerCase(), 60)} the scene establishes` : "sitting quietly within the frame");
  return parts.join(", ");
}

/**
 * What the resolved behaviours look like, in words.
 *
 * Generated from the numbers rather than picked from a list, so a combination
 * nobody anticipated is still described accurately instead of being labelled
 * with the nearest preset's name.
 */
function describe(t: TypographyTreatment, readings: Reading[]): string {
  const amount = (v: number) => (v >= 0.66 ? "strongly" : v >= 0.33 ? "" : "slightly");
  const said: string[] = [];
  const add = (v: number, phrase: string) => {
    if (v < 0.12) return;
    const a = amount(v);
    said.push(a ? `${a} ${phrase}` : phrase);
  };
  add(t.softness, "softened at the edges");
  add(t.luminosity, "lit from within");
  add(t.translucency, "transparent");
  add(t.relief, "raised off the surface");
  add(t.sheen, "graded across the stroke");
  add(t.contact, "shadowed against what it sits on");
  const typo =
    `${t.weight >= 800 ? "very heavy" : t.weight >= 700 ? "heavy" : t.weight >= 500 ? "medium" : "light"} strokes, ` +
    `${t.tracking >= 0.04 ? "widely spaced" : t.tracking > 0.01 ? "open" : t.tracking < -0.005 ? "tight" : "normally spaced"}`;
  if (!said.length) return `${typo}; nothing applied to the surface — solid ink, which is what this brief asked for`;
  return `${typo}; ${said.join(", ")}${readings.length ? ` — ${readings[0].quality.reads}` : ""}`;
}

function characterOf(t: TypographyTreatment, readings: Reading[], base: { contrast: number }): string {
  if (!readings.length) return "even strokes, normal spacing, legible before it is styled";
  const lead = readings[0].quality.reads;
  const second = readings[1]?.quality.reads;
  const contrastPart = base.contrast > 0.5 ? "high stroke contrast" : "even stroke weight";
  return second ? `${lead}, and ${second}; ${contrastPart}` : `${lead}; ${contrastPart}`;
}

function uniqueness(readings: Reading[], contested: Array<{ note: string }>, role: RoleDecision): string {
  if (!readings.length) return "nothing in the brief asked typography to be anything in particular, so it is plain — a decision, not an omission";
  const top = readings.slice(0, 3).map((r) => `${r.quality.name} (from ${r.field})`).join(", ");
  const argued = contested.length ? ` It was not unanimous: ${contested[0].note}.` : "";
  return `This brief reads as ${top}, which is why the letterforms behave as they do rather than as another brief's would. Typography's job here is ${shorten(role.role, 120)}.${argued}`;
}

// ── rendering the behaviours ───────────────────────────────────────────────

/** The type size the offsets and blurs below were measured at. */
const REFERENCE_SIZE = 64;

export interface TreatmentPaint {
  /** SVG `<defs>` content, already scoped to one layer's id. */
  defs: string;
  /** Attributes for the `<text>` element. */
  attrs: Record<string, string>;
}

/**
 * The SVG one layer's behaviours need, composed rather than selected.
 *
 * Each axis contributes its own filter primitive, chained in one filter, so any
 * combination renders -- softly luminous, metallic and raised, transparent with
 * a contact shadow. There is no branch on a material name because there is no
 * material name.
 *
 * Offsets and blurs scale with the type's size. Fixed pixels were wrong: a
 * relief measured on a 64px probe is invisible on a 240px headline, where it
 * would be recorded and never seen.
 */
export function treatmentPaint(
  dna: Pick<TypographyDNA, "treatment" | "accent">,
  id: string,
  color: string,
  opts: { accent?: string | null; size?: number } = {},
): TreatmentPaint {
  const t = dna.treatment;
  const safe = normalizeHex(color) || "#111111";
  const accent = normalizeHex(opts.accent ?? dna.accent) || safe;
  const k = Math.max(0.6, Math.min(6, (opts.size && opts.size > 0 ? opts.size : REFERENCE_SIZE) / REFERENCE_SIZE));
  const n = (v: number) => Math.round(v * k * 100) / 100;

  const defs: string[] = [];
  const attrs: Record<string, string> = {};
  const steps: string[] = [];
  let last = "SourceGraphic";

  // A graded surface REPLACES the ink, so it needs a higher threshold than the
  // filters: those add to what is there, this discards it. A sheen that only
  // survived in support turned a luminous headline's ink into a dark-bottomed
  // gold ramp and the glow read as mush -- two behaviours fighting over the
  // same pixels. Below this it is not the leading behaviour and does not get
  // to decide the colour.
  const SHEEN_TAKES_THE_FILL = 0.25;
  if (t.sheen >= SHEEN_TAKES_THE_FILL) {
    const gid = `sheen_${id}`;
    const hi = mix(accent, 255, 0.2 + 0.45 * t.sheen);
    const lo = mix(accent, 0, 0.2 + 0.35 * t.sheen);
    defs.push(
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${hi}"/><stop offset="0.5" stop-color="${accent}"/>` +
        `<stop offset="1" stop-color="${lo}"/></linearGradient>`,
    );
    attrs.fill = `url(#${gid})`;
  } else {
    attrs.fill = safe;
  }

  // Transparency thins the fill and keeps an outline, so the shape survives.
  if (t.translucency >= 0.12) {
    attrs["fill-opacity"] = String(Math.round((1 - 0.5 * t.translucency) * 100) / 100);
    attrs.stroke = safe;
    attrs["stroke-width"] = String(n(0.5 + t.translucency));
  }

  if (t.softness >= 0.12) {
    steps.push(`<feGaussianBlur in="${last}" stdDeviation="${n(0.3 + 1.4 * t.softness)}" result="soft"/>`);
    last = "soft";
  }
  if (t.luminosity >= 0.12) {
    // Tightened from `2 + 6a` after looking at a render: at full strength that
    // spread the halo far enough to soften the core of a large headline, and a
    // lit sign has a crisp face with light around it, not a blurred one.
    steps.push(`<feGaussianBlur in="${last}" stdDeviation="${n(1.5 + 4 * t.luminosity)}" result="halo"/>`);
    // Merging the halo with itself is how it gains intensity: one pass is a
    // grey smear, two or three read as light.
    const passes = t.luminosity >= 0.66 ? 3 : t.luminosity >= 0.33 ? 2 : 1;
    steps.push(
      `<feMerge result="lit">${Array.from({ length: passes }, () => `<feMergeNode in="halo"/>`).join("")}` +
        `<feMergeNode in="${last}"/></feMerge>`,
    );
    last = "lit";
  }
  if (t.relief >= 0.12) {
    // A light edge above and a dark edge below: relief, at the cheapest honest
    // price. Built from the ink so a light face reliefs against itself.
    steps.push(...shadow(last, 0, n(-1 - 2 * t.relief), n(0.4 + 0.6 * t.relief), mix(safe, 255, 0.8), round2(0.5 + 0.45 * t.relief), "rhi", `${id}_a`));
    steps.push(...shadow("rhi", 0, n(1.5 + 3 * t.relief), n(0.8 + 2 * t.relief), mix(safe, 0, 0.85), round2(0.3 + 0.4 * t.relief), "relief", `${id}_b`));
    last = "relief";
  }
  if (t.contact >= 0.12) {
    steps.push(...shadow(last, 0, n(1 + 4 * t.contact), n(1 + 4 * t.contact), "#000", round2(0.2 + 0.35 * t.contact), "contact", `${id}_c`));
    last = "contact";
  }

  if (steps.length) {
    const fid = `fx_${id}`;
    // Room for the largest halo or shadow to exist in: an under-sized filter
    // region clips the effect and silently produces a different picture.
    const pad = Math.round(20 + 60 * Math.max(t.luminosity, t.softness, t.contact, t.relief));
    defs.push(`<filter id="${fid}" x="-${pad}%" y="-${pad}%" width="${100 + pad * 2}%" height="${100 + pad * 2}%">${steps.join("")}</filter>`);
    attrs.filter = `url(#${fid})`;
  }

  return { defs: defs.join(""), attrs };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * A shadow behind `input`, as five portable primitives.
 *
 * NOT `feDropShadow`, although that is one element instead of five: measured on
 * this renderer, `feDropShadow` IGNORES its `in` attribute and always shadows
 * the SourceGraphic. In a chain that silently discards everything computed
 * before it -- a treatment that was soft and luminous and shadowed rendered as
 * plain type with a shadow, and the record still claimed all three. `feOffset`,
 * `feGaussianBlur`, `feFlood` and `feComposite` all honour `in`.
 */
function shadow(
  input: string, dx: number, dy: number, blur: number,
  color: string, opacity: number, out: string, uid: string,
): string[] {
  const o = `o_${uid}`;
  const b = `b_${uid}`;
  const c = `c_${uid}`;
  const s = `s_${uid}`;
  return [
    `<feOffset in="${input}" dx="${dx}" dy="${dy}" result="${o}"/>`,
    `<feGaussianBlur in="${o}" stdDeviation="${Math.max(0.01, blur)}" result="${b}"/>`,
    `<feFlood flood-color="${color}" flood-opacity="${opacity}" result="${c}"/>`,
    `<feComposite in="${c}" in2="${b}" operator="in" result="${s}"/>`,
    `<feMerge result="${out}"><feMergeNode in="${s}"/><feMergeNode in="${input}"/></feMerge>`,
  ];
}

function mix(hex: string, target: number, amount: number): string {
  const h = normalizeHex(hex) || "#808080";
  const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.round(c + (target - c) * amount));
  return `#${out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The behaviours this line can wear against what it actually sits on.
 *
 * Transparency and soft edges cost contrast, and a graded surface REPLACES the
 * ink with the brand's colour, so the contrast the layout engine verified no
 * longer applies to it. Each is reduced to the largest amount that still clears
 * the floor, rather than dropped: a treatment that works at half strength
 * should be applied at half strength.
 */
export function treatmentForContrast(
  treatment: TypographyTreatment,
  color: string,
  background: string,
  accent?: string | null,
): { treatment: TypographyTreatment; refused: string[] } {
  const out = { ...treatment };
  const refused: string[] = [];
  const FLOOR = 4.5;

  if (out.sheen >= 0.12) {
    const metal = normalizeHex(accent) || normalizeHex(color) || "#111111";
    const ratio = contrastRatio(metal, background);
    // The ramp's darkest stop is worse than the accent itself, so the floor is
    // raised. A dark-green brand set "Pure Gold" in dark green on a near-black
    // frame and every other check passed: they were all inspecting the ink the
    // gradient had already discarded.
    if (ratio < 6) {
      refused.push(`sheen ${out.sheen.toFixed(2)}: the brand's surface colour reads ${ratio.toFixed(1)}:1 here, and a gradient's darkest stop is worse than that`);
      out.sheen = 0;
    }
  }

  if (out.translucency >= 0.12) {
    const ratio = contrastRatio(color, background);
    // Thinning the fill to `1 - 0.5a` costs roughly that share of the contrast.
    const affordable = ratio > 0 ? clamp01(((ratio - FLOOR) / ratio) * 2) : 0;
    if (affordable < out.translucency) {
      const was = out.translucency;
      out.translucency = Math.round(affordable * 100) / 100;
      refused.push(
        out.translucency < 0.12
          ? `translucency ${was.toFixed(2)}: at ${ratio.toFixed(1)}:1 there is nothing to spend, and ${FLOOR}:1 is the floor`
          : `translucency ${was.toFixed(2)} → ${out.translucency.toFixed(2)}: as much as ${ratio.toFixed(1)}:1 affords above the ${FLOOR}:1 floor`,
      );
      if (out.translucency < 0.12) out.translucency = 0;
    }
  }

  return { treatment: out, refused };
}

/** Counts and names only. Never the copy. */
export function typographyDnaTelemetry(d: TypographyDNA | null | undefined) {
  if (!d) return { typography_dna: false };
  const t = d.treatment;
  return {
    typography_dna: true,
    role: shorten(d.typography_role, 60),
    personality: d.personality,
    // The behaviours, as the numbers they are.
    behaviour: Object.fromEntries(TREATMENT_AXES.filter((a) => t[a] >= 0.12).map((a) => [a, t[a]])),
    weight: t.weight,
    tracking: t.tracking,
    font_need: `${d.font_need.contrast >= 0.5 ? "modulated" : "even"}/${d.font_need.humanist ? "humanist" : "geometric"}${d.font_need.display ? "/display" : ""}`,
    refused: d.refused.length,
  };
}

/**
 * One short line for the IMAGE prompt, or nothing.
 *
 * What the reserved area has to BE so the typography can live in it -- never
 * the words, never a typeface, never a size: the model still draws no text.
 * Nothing is added when the type asks nothing of the picture.
 *
 * Kept under 95 characters: the last healthy render measured 31,892 of the
 * provider's 32,000, and a prompt addition that pushes a render over the limit
 * costs the whole image.
 *
 * Built before the render, so it carries the INTENTION. The compositor resolves
 * the DNA again against the returned pixels and may attenuate the same
 * behaviour there; that is not a contradiction -- the prompt asks the frame to
 * be ready for light, and the measurement afterwards decides what survived.
 */
export function renderDnaForImagePrompt(d: TypographyDNA | null | undefined): string | undefined {
  if (!d) return undefined;
  const t = d.treatment;
  // The strongest behaviour is the one the frame has to accommodate; asking for
  // all of them would cost more prompt than the render can spare.
  const ranked: Array<[number, string]> = [
    [t.luminosity, "keep the copy area darker than the frame so luminous lettering reads"],
    [t.translucency, "keep the copy area free of fine pattern so translucent type stays readable"],
    [t.sheen, "light the copy area evenly and directionally for a polished treatment"],
    [t.softness, "keep the copy area soft, with no hard edge crossing it"],
    [t.relief, "keep the copy area plain so raised lettering reads"],
    [t.contact, "keep the copy area matte and even, like a surface something sits on"],
  ];
  ranked.sort((a, b) => b[0] - a[0]);
  if (ranked[0][0] < 0.25) return undefined;
  return `Typography: ${ranked[0][1]}.`;
}
