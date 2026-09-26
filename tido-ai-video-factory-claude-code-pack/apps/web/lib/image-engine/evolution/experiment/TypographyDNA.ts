import type { CreativeBlueprint } from "./CreativeBlueprint";
import { BLUEPRINT_SECTIONS, SECTION_FIELDS } from "./CreativeBlueprint";
import type { CompositionMap } from "./CompositionMap";
import type { BrandKit } from "./BrandKit";
import { colorFor, contrastRatio, normalizeHex } from "./BrandKit";

/**
 * Phase 5.6.3 — typography as art direction, not as text placement.
 *
 * FontIntelligence answers "which face can draw these words". This answers the
 * question a designer actually asks first: what should the words FEEL like, and
 * how do they belong to this picture rather than sit on top of it.
 *
 * WHERE THE DECISION COMES FROM
 * -----------------------------
 * Not from a new model call, and not from a user control. The Creative Director
 * has already decided the things that determine it and written them into the
 * blueprint -- `emotional_hook`, `atmosphere`, `color_story`,
 * `lighting_behavior`, `typographic_voice`, `font_character`, the big idea. This
 * reads those decisions and resolves them into treatment the compositor can
 * actually draw. Deterministic, free, and auditable: every field carries the
 * blueprint phrase it came from.
 *
 * WHY MATERIAL IS LIMITED TO WHAT RENDERS
 * ---------------------------------------
 * Each material below was verified against the real renderer before it was
 * offered: gradient fills, Gaussian blur, drop shadow, merge-based glow,
 * convolution emboss, stroke and fill-opacity all produce distinct output.
 * Nothing here is a description of an effect the compositor cannot produce --
 * a vocabulary the renderer ignores is worse than no vocabulary, because it
 * reads in the record as though something happened.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It never changes a word, never invents copy, and never overrides legibility:
 * a treatment that would drop the text under its contrast floor is refused and
 * the refusal is recorded. Decoration loses to being readable, every time.
 */

/**
 * The treatments this can ask for, and no others.
 *
 * There was an `organic` here. Measured against the rasteriser it produced
 * 9,003 lit pixels and total ink within 0.002% of plain text -- a name in the
 * record for something nobody could see -- and no direction selected it anyway,
 * because a craft direction is better served by `paper`. It was removed rather
 * than kept as a word that means nothing.
 */
export type Material = "plain" | "glow" | "metallic" | "glass" | "paper" | "mist" | "embossed";

export type ShapeLanguage = "geometric" | "humanist" | "rounded" | "angular" | "organic";

export type Movement = "still" | "rising" | "floating" | "driving" | "settling";

export interface TypographyDNA {
  /** The voice, carried from the director's own word where it gave one. */
  personality: string;
  /** How the letterforms should behave, in one sentence. */
  font_character: string;
  /** Relative weight for the leading line, 300-900. */
  weight: number;
  /** Letter spacing in ems for the leading line. */
  spacing: number;
  shape_language: ShapeLanguage;
  movement: Movement;
  material: Material;
  /** How the type sits against the picture. */
  scene_relationship: string;
  /** Every decision above, traced to the blueprint phrase that produced it. */
  because: Record<string, string>;
  /** Treatments considered and refused, with the reason. */
  refused: string[];
  /**
   * The colour a metallic treatment is built from: the brand's accent where it
   * has one. Resolved with the design rather than at render time, so the
   * contrast check and the gradient read the same colour.
   */
  accent?: string | null;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A blueprint decision's value, whatever shape the decision took. */
function decisionText(d: unknown): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  const o = d as { value?: unknown; choice?: unknown; because?: unknown };
  return clean(o.value) || clean(o.choice) || "";
}

/**
 * Everything the director decided, flattened.
 *
 * The blueprint is six named sections of `Decision | null`; this walks them in
 * `SECTION_FIELDS` order so the lookup is by field name regardless of which
 * section holds it, and the haystack is every decided value in one string.
 * Field names are unique across sections, so nothing is shadowed.
 */
function signals(bp: CreativeBlueprint | null | undefined): { text: string; field: (k: string) => string } {
  const flat = new Map<string, string>();
  if (bp) {
    for (const section of BLUEPRINT_SECTIONS) {
      const held = (bp as unknown as Record<string, Record<string, unknown> | null>)[section] || {};
      for (const key of SECTION_FIELDS[section]) {
        const v = decisionText(held[key]);
        if (v) flat.set(key, v);
      }
    }
    const story = decisionText((bp as unknown as { story?: unknown }).story);
    if (story) flat.set("story", story);
  }
  // Only the fields that describe MOOD, MATERIAL and LIGHT. Layout decisions
  // are read separately below, and the concept's own wording is included
  // because "a glass of iced coffee in morning fog" is the direction whether or
  // not the atmosphere field repeats it.
  const moodFields = [
    "story", "big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook",
    "visual_world", "environment_logic", "color_story", "visual_metaphor", "styling", "atmosphere",
    "lighting_behavior", "depth_feeling", "material_rendering",
    "font_character", "typographic_voice",
    "visual_language", "material_language", "emotional_direction",
  ];
  const text = moodFields.map((k) => flat.get(k) || "").join(" ").toLowerCase();
  return { text, field: (k: string) => flat.get(k) || "" };
}

/**
 * The commercial category, read from the director's own words.
 *
 * `FontIntelligence` scores faces by category, and nothing upstream produces a
 * category: this engine deliberately has no category table, because a table is
 * the fastest route back to a house style. So the category is not decided here
 * either -- it is RECOGNISED, from the vocabulary the director already used,
 * and only for the six the font catalogue distinguishes. No match means no
 * category, and the selector falls back to personality alone.
 */
export function categoryHint(bp: CreativeBlueprint | null | undefined): string | null {
  const { text } = signals(bp);
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

interface Rule {
  /** What the director's language has to contain. */
  when: RegExp;
  material: Material;
  shape: ShapeLanguage;
  movement: Movement;
  /** Nudges applied to the personality's base weight and spacing. */
  weight?: number;
  spacing?: number;
  character: string;
}

/**
 * Read in order; the first match wins, so the more specific moods come first.
 * Each rule exists because a designer would reach for that treatment given
 * that direction -- not because the effect is available.
 */
const RULES: Rule[] = [
  {
    when: /\b(dream|dreamy|cloud|mist|fog|ethereal|weightless|float|airy|soft light|haze)\b/,
    material: "mist", shape: "rounded", movement: "floating", weight: -100, spacing: 0.04,
    character: "light strokes with open spacing, edges softened so the words sit inside the air rather than on top of it",
  },
  {
    when: /\b(glow|luminous|radiant|neon|backlit|shine|shimmer|light source|illuminat)\b/,
    material: "glow", shape: "geometric", movement: "still", spacing: 0.02,
    character: "clean strokes carrying their own light, so the type reads as part of the scene's illumination",
  },
  {
    when: /\b(metal|metallic|gold|golden|brass|chrome|foil|premium finish|polish)\b/,
    material: "metallic", shape: "geometric", movement: "still", weight: 100,
    character: "weighted strokes with a graded surface, catching light the way the product's own finish does",
  },
  {
    when: /\b(glass|transparent|translucent|crystal|clear|ice|water|liquid)\b/,
    material: "glass", shape: "geometric", movement: "settling", weight: -100, spacing: 0.03,
    character: "thin strokes you can see the scene through, so nothing is hidden behind the words",
  },
  {
    when: /\b(craft|handmade|artisan|rustic|paper|print|letterpress|organic|natural|earth)\b/,
    material: "paper", shape: "humanist", movement: "settling",
    character: "ink-on-stock weight with a pressed edge, the way a printed label sits on a surface",
  },
  {
    when: /\b(energy|energetic|dynamic|explosive|burst|splash|motion|bold|impact|power|spicy|cay)\b/,
    material: "embossed", shape: "angular", movement: "driving", weight: 200, spacing: -0.01,
    character: "heavy tight strokes with a raised edge, the words hitting as hard as the picture does",
  },
  {
    when: /\b(luxur|elegan|refined|restrain|premium|sophisticat|quiet|minimal|calm|editorial)\b/,
    material: "plain", shape: "geometric", movement: "still", weight: -100, spacing: 0.06,
    character: "high-contrast strokes with generous spacing; restraint does the work that decoration would spoil",
  },
  {
    when: /\b(fresh|clean|bright|crisp|pure|clinical|trust|honest|simple)\b/,
    material: "plain", shape: "geometric", movement: "still",
    character: "even unmodulated strokes, nothing decorative, so the message is read before the styling is noticed",
  },
  {
    when: /\b(warm|cosy|cozy|comfort|home|morning|gentle|friendly)\b/,
    material: "paper", shape: "humanist", movement: "settling", spacing: 0.01,
    character: "softened humanist strokes that feel written rather than specified",
  },
];

/** Base weight and spacing per typographic personality. */
const BASE: Record<string, { weight: number; spacing: number; shape: ShapeLanguage }> = {
  editorial: { weight: 600, spacing: 0.02, shape: "geometric" },
  technical: { weight: 500, spacing: 0, shape: "geometric" },
  crafted: { weight: 500, spacing: 0.01, shape: "humanist" },
  direct: { weight: 700, spacing: 0, shape: "geometric" },
  quiet: { weight: 300, spacing: 0.05, shape: "humanist" },
  assertive: { weight: 800, spacing: -0.01, shape: "angular" },
};

const clampWeight = (n: number) => Math.max(300, Math.min(900, Math.round(n / 100) * 100));
const clampSpacing = (n: number) => Math.max(-0.02, Math.min(0.08, Math.round(n * 1000) / 1000));

export interface TypographyDNAInput {
  blueprint?: CreativeBlueprint | null;
  /** The personality already resolved by the typography plan, when there is one. */
  personality?: string | null;
  category?: string | null;
  brandKit?: BrandKit | null;
  /** The rendered scene, once it exists: its light decides what survives on it. */
  map?: CompositionMap | null;
}

/**
 * Resolves the creative treatment. Pure and total.
 *
 * Order matters: the director's own language decides the mood, the personality
 * supplies the baseline, the brand narrows it, and the rendered scene gets the
 * last word -- a treatment that will not read against the actual pixels is
 * refused no matter how well it suits the idea.
 */
export function buildTypographyDNA(input: TypographyDNAInput): TypographyDNA {
  const { text, field } = signals(input.blueprint);
  const personality = clean(input.personality) || clean(field("typographic_voice")) || "direct";
  const base = BASE[personality] || BASE.direct;
  const refused: string[] = [];
  const because: Record<string, string> = {};

  const rule = RULES.find((r) => r.when.test(text)) || null;
  const matched = rule ? (text.match(rule.when) || [""])[0] : "";

  let material: Material = rule?.material ?? "plain";
  const shape: ShapeLanguage = rule?.shape ?? base.shape;
  const movement: Movement = rule?.movement ?? "still";
  let weight = clampWeight(base.weight + (rule?.weight ?? 0));
  const spacing = clampSpacing(base.spacing + (rule?.spacing ?? 0));

  because.personality = clean(field("typographic_voice"))
    ? `the director's typographic voice: "${clean(field("typographic_voice"))}"`
    : `no voice was stated, so the plan's "${personality}" was used`;
  because.material = rule
    ? `the direction says "${matched}", which a designer would set as ${material}`
    : "nothing in the direction asks for a material, so the type is left plain";
  because.weight = `${personality} sets ${base.weight}${rule?.weight ? `, ${rule.weight > 0 ? "heavier" : "lighter"} for "${matched}"` : ""}`;
  because.shape_language = `${shape} letterforms follow the ${rule ? `"${matched}"` : personality} direction`;
  because.movement = rule ? `"${matched}" wants the words to feel ${movement}` : "the frame is still, so the type is too";

  // ── the brand narrows it ────────────────────────────────────────────────
  const kit = input.brandKit || null;
  if (kit?.style?.forbidden?.length) {
    const forbids = kit.style.forbidden.map((f) => f.toLowerCase());
    const conflict = forbids.find((f) => material.includes(f) || f.includes(material));
    if (conflict && material !== "plain") {
      refused.push(`${material}: the brand forbids "${conflict}"`);
      material = "plain";
      because.material = `the brand forbids "${conflict}", so the type is set plain`;
    }
  }

  // ── the rendered scene gets the last word ───────────────────────────────
  //
  // These are the cases where a treatment that suits the idea would still fail
  // on the actual picture. Refusals are recorded rather than silently applied,
  // because "the glow was dropped" is a design decision somebody may query.
  //
  // The thresholds are measured, not chosen. `mean_detail` is normalised to the
  // frame's own maximum, so it says how UNIFORMLY busy a frame is, and on this
  // engine's own fixtures it reads: a product against a plain ground 0.06, the
  // same product with noise across the whole frame 0.16, dots everywhere 0.27,
  // dense dots 0.35. BUSY_EVERYWHERE sits below the second of those and above
  // the first, so a normal product shot keeps its treatment and a frame with no
  // quiet area anywhere loses it.
  const BUSY_EVERYWHERE = 0.15;
  const map = input.map || null;
  if (map) {
    if (material === "glow" && map.mean_luminance > 0.62) {
      refused.push("glow: the frame is already bright, so a glow would read as a smudge rather than as light");
      material = "plain";
      because.material = "the render came back bright, so the type carries no glow";
    }
    if (material === "glass" && map.mean_detail > BUSY_EVERYWHERE) {
      refused.push("glass: the frame is busy, and type you can see through stops being readable over detail");
      material = "plain";
      because.material = "the render is busy, so the type is solid rather than transparent";
    }
    if (material === "mist" && map.mean_detail > BUSY_EVERYWHERE + 0.03) {
      refused.push("mist: softened edges disappear against a busy frame");
      material = "plain";
      because.material = "the render is busy, so the type keeps its hard edges";
    }
    // A dark frame needs more weight behind the letterforms to hold up.
    if (map.mean_luminance < 0.25 && weight < 500) {
      weight = 500;
      because.weight = `${because.weight}; raised to 500 because the render is dark and light strokes would disappear`;
    }
  }

  const scene_relationship = sceneRelationship(material, movement, map, field);
  because.scene_relationship = map
    ? `read from the render: mean luminance ${map.mean_luminance.toFixed(2)}, mean detail ${map.mean_detail.toFixed(2)}`
    : "no render was available, so the relationship is stated from the direction alone";

  return {
    personality,
    accent: colorFor(input.brandKit || null, "accent", "primary"),
    font_character: rule?.character ?? "even strokes, normal spacing, legible before it is styled",
    weight,
    spacing,
    shape_language: shape,
    movement,
    material,
    scene_relationship,
    because,
    refused,
  };
}

function sceneRelationship(material: Material, movement: Movement, map: CompositionMap | null, field: (k: string) => string): string {
  const light = clean(field("lighting_behavior"));
  const atmosphere = clean(field("atmosphere"));
  const parts: string[] = [];
  if (map?.product) parts.push("set clear of the product, in the quietest area the render left");
  if (map && map.mean_luminance < 0.35) parts.push("light type on a dark frame");
  else if (map && map.mean_luminance > 0.65) parts.push("dark type on a light frame");
  if (material === "glow" || material === "mist") parts.push("sharing the scene's own light rather than sitting above it");
  if (material === "metallic" && light) parts.push(`catching the light the director described as ${light.toLowerCase()}`);
  if (movement !== "still") parts.push(`weighted so the words feel ${movement}`);
  if (!parts.length) parts.push(atmosphere ? `holding the ${atmosphere.toLowerCase()} the scene establishes` : "sitting quietly within the frame");
  return parts.join(", ");
}

// ── rendering the material ─────────────────────────────────────────────────

/** The type size the offsets and blurs below were measured at. */
const REFERENCE_SIZE = 64;

export interface MaterialPaint {
  /** SVG `<defs>` content this material needs, already id-scoped. */
  defs: string;
  /** Attributes to place on the `<text>` element. */
  attrs: Record<string, string>;
}

/**
 * The SVG a material needs, scoped to one text layer.
 *
 * Every branch was verified against the renderer: a material that produced
 * output identical to plain text would be a lie in the design record.
 */
export function materialPaint(
  dna: TypographyDNA,
  id: string,
  color: string,
  opts: { accent?: string | null; size?: number } = {},
): MaterialPaint {
  const safe = normalizeHex(color) || "#111111";
  // Metal is built from the brand's own colour where there is one, so a gold
  // brand's metal is its gold rather than a generic one.
  const accent = normalizeHex(opts.accent) || safe;
  // Every offset and blur below is scaled from the type's own size.
  //
  // This was fixed pixels at first, and fixed pixels are wrong: a 3px relief
  // that reads on a 64px probe is invisible on a 240px production headline,
  // where the effect would be recorded and never seen. `k` is the ratio to the
  // 64px the numbers were measured at, clamped so a caption does not lose its
  // treatment entirely and a huge headline does not turn into a blur.
  const k = Math.max(0.6, Math.min(6, (opts.size && opts.size > 0 ? opts.size : REFERENCE_SIZE) / REFERENCE_SIZE));
  const n = (v: number) => Math.round(v * k * 100) / 100;

  switch (dna.material) {
    case "glow": {
      const gid = `glow_${id}`;
      return {
        defs:
          `<filter id="${gid}" x="-60%" y="-60%" width="220%" height="220%">` +
          `<feGaussianBlur stdDeviation="${n(6)}" result="g"/>` +
          `<feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
        attrs: { filter: `url(#${gid})`, fill: safe },
      };
    }
    case "metallic": {
      const gid = `metal_${id}`;
      // A vertical three-stop ramp is what reads as metal: highlight, body,
      // shadow. Built from the brand's accent so it is the brand's metal.
      const hi = lighten(accent, 0.55);
      const lo = darken(accent, 0.45);
      return {
        defs:
          `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="${hi}"/><stop offset="0.5" stop-color="${accent}"/>` +
          `<stop offset="1" stop-color="${lo}"/></linearGradient>`,
        attrs: { fill: `url(#${gid})` },
      };
    }
    case "glass": {
      const gid = `glass_${id}`;
      return {
        defs: `<filter id="${gid}"><feDropShadow dx="0" dy="${n(1)}" stdDeviation="${n(1)}" flood-color="#000" flood-opacity="0.35"/></filter>`,
        attrs: { fill: safe, "fill-opacity": "0.55", stroke: safe, "stroke-width": `${n(1)}`, filter: `url(#${gid})` },
      };
    }
    case "mist": {
      const gid = `mist_${id}`;
      return {
        defs: `<filter id="${gid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n(0.9)}"/></filter>`,
        attrs: { fill: safe, "fill-opacity": "0.9", filter: `url(#${gid})` },
      };
    }
    case "embossed": {
      const gid = `emboss_${id}`;
      // A light edge above and a dark edge below: the cheapest honest relief.
      // Sized to be SEEN -- a one-pixel edge measured 1% away from plain text,
      // which is a claim in the record and nothing on the picture.
      return {
        defs:
          `<filter id="${gid}" x="-25%" y="-25%" width="150%" height="150%">` +
          `<feDropShadow dx="0" dy="${n(-2.5)}" stdDeviation="${n(0.8)}" flood-color="${lighten(safe, 0.8)}" flood-opacity="0.95"/>` +
          `<feDropShadow dx="0" dy="${n(4)}" stdDeviation="${n(2.5)}" flood-color="${darken(safe, 0.9)}" flood-opacity="0.65"/></filter>`,
        attrs: { fill: safe, filter: `url(#${gid})` },
      };
    }
    case "paper": {
      const gid = `paper_${id}`;
      // Ink on a surface, lifted slightly off it: a soft wide contact shadow
      // rather than a hard offset, which is what printing on stock looks like
      // and what separates the words from the surface without looking cheap.
      return {
        defs:
          `<filter id="${gid}" x="-35%" y="-35%" width="170%" height="170%">` +
          `<feDropShadow dx="0" dy="${n(4)}" stdDeviation="${n(4)}" flood-color="#000" flood-opacity="0.5"/></filter>`,
        attrs: { fill: safe, filter: `url(#${gid})` },
      };
    }
    default:
      return { defs: "", attrs: { fill: safe } };
  }
}

function mix(hex: string, target: number, amount: number): string {
  const h = normalizeHex(hex) || "#808080";
  const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.round(c + (target - c) * amount));
  return `#${out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}
const lighten = (hex: string, amount: number) => mix(hex, 255, amount);
const darken = (hex: string, amount: number) => mix(hex, 0, amount);

/**
 * Whether a material is safe for this line against this background.
 *
 * Glass and mist reduce effective contrast, so a line already close to its
 * floor must not wear them. Returns the material to actually use.
 */
export function materialForContrast(
  material: Material,
  color: string,
  background: string,
  accent?: string | null,
): { material: Material; refused?: string } {
  // Metal does not tint the chosen ink -- it REPLACES it with a ramp built
  // from the brand's colour, so the contrast the layout engine verified no
  // longer applies. Rendered without this check, a dark green brand set
  // "Pure Gold" in dark green on a near-black frame: unreadable, and every
  // other check passed because they were all looking at the discarded colour.
  if (material === "metallic") {
    const metal = normalizeHex(accent) || normalizeHex(color) || "#111111";
    const ratio = contrastRatio(metal, background);
    // The ramp runs from a lightened to a darkened form of the accent, so its
    // darkest stop is worse than the accent itself: the floor is raised.
    if (ratio < 6) {
      return {
        material: "plain",
        refused: `metallic: the brand's metal reads ${ratio.toFixed(1)}:1 against this area, and a gradient's darkest stop is worse than that`,
      };
    }
    return { material };
  }
  if (material !== "glass" && material !== "mist") return { material };
  const ratio = contrastRatio(color, background);
  // A translucent fill costs roughly half the contrast; 4.5 is the AA floor.
  if (ratio / 2 < 4.5) {
    return { material: "plain", refused: `${material}: it would drop this line from ${ratio.toFixed(1)}:1 to about ${(ratio / 2).toFixed(1)}:1, under the 4.5:1 floor` };
  }
  return { material };
}

/** Counts and names only. Never the copy. */
export function typographyDnaTelemetry(d: TypographyDNA | null | undefined) {
  if (!d) return { typography_dna: false };
  return {
    typography_dna: true,
    personality: d.personality,
    material: d.material,
    shape: d.shape_language,
    movement: d.movement,
    weight: d.weight,
    spacing: d.spacing,
    refused: d.refused.length,
  };
}

/**
 * One short line for the IMAGE prompt, or nothing.
 *
 * What the reserved area has to BE so the typography can live in it -- never
 * the words, never a typeface, never a size: the model still draws no text. It
 * returns undefined for a plain treatment, because "set the type plainly" asks
 * nothing of the picture, and this prompt has around a hundred characters of
 * headroom left. A line that changes nothing is not worth any of it.
 *
 * Every line below is kept under 95 characters for the same reason: the last
 * healthy render measured 31,892 of the provider's 32,000, and the first draft
 * of these ran to 123. A prompt addition that pushes the render over the limit
 * costs the whole image, which no typographic nicety is worth.
 *
 * Built before the render, so it carries the INTENTION. The compositor rebuilds
 * the DNA against the returned pixels and may refuse the same treatment there;
 * that is not a contradiction -- the prompt asks the frame to be ready for a
 * glow, and the measurement afterwards decides whether one survived.
 */
export function renderDnaForImagePrompt(d: TypographyDNA | null | undefined): string | undefined {
  if (!d || d.material === "plain") return undefined;
  const need: Partial<Record<Material, string>> = {
    glow: "keep the copy area darker than the frame so luminous lettering reads",
    metallic: "light the copy area evenly and directionally for a polished treatment",
    glass: "keep the copy area free of fine pattern so translucent type stays readable",
    mist: "keep the copy area soft, with no hard edge crossing it",
    paper: "keep the copy area matte and even, like a printed surface",
    embossed: "keep the copy area plain so raised lettering reads",
  };
  const n = need[d.material];
  return n ? `Typography: ${n}.` : undefined;
}
