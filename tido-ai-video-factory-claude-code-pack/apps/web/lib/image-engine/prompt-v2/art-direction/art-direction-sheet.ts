/**
 * The Art Direction Sheet: every decision this render makes, as one reviewable object.
 *
 * WHAT IT IS FOR
 * --------------
 * Today a Sunburst prompt is the only record of what a render decided, and a prompt is a
 * bad record: it states conclusions in prose, it cannot be compared with the next
 * render's, and it cannot say WHY. The sheet is the decisions themselves — concrete
 * values, each with the tier that produced it — and the prompt is written from it.
 *
 * So a reviewer can ask "why is the background not the brand colour" and get the answer
 * from `conflicts_resolved` rather than from a guess. And two renders of the same brief
 * can be diffed field by field, which is what makes an A/B possible at all.
 *
 * NO MODEL CALL
 * -------------
 * `buildArtDirectionSheet` is pure and deterministic: same input, same sheet, byte for
 * byte. Everything in it comes from layers that have already run — AssetProfile, the
 * brand kit, the allocation, the creative approach, the client's own concept — plus the
 * derivation rules below. Adding an LLM call here would make the sheet unreviewable
 * (nondeterministic) and would pay twice for one brief.
 *
 * THE RULE THAT SHAPES EVERY DERIVATION
 * -------------------------------------
 * **No creative value may be keyed on industry, product type or occasion.** Not a focal
 * length, not a Kelvin value, not a colour, not a prop, not a surface, not a festival
 * motif. The industry reaches this file twice only: as a spelling, and as exclusions.
 *
 * Everything else is derived from things the client actually gave us:
 *   - product COUNT and the asset type       → lens, aperture, camera height, props
 *   - canvas geometry                        → zones, safe margins, key direction
 *   - total text volume                      → how much of the frame type may claim
 *   - the emotion of the CONCEPT text        → colour temperature, contrast, surface
 *   - the brand kit                          → palette, type families
 *   - the creative approach                  → negative space, tilt, prop density
 *
 * `run-art-direction-tests` has a static test that reads this file and fails if a
 * creative constant ever appears inside an industry-keyed structure.
 *
 * NUMBERS LIVE HERE AND NOWHERE ELSE
 * ----------------------------------
 * The sheet holds 85, f/2.8, 3200K, forty-two percent. `art-direction-brief.ts`
 * translates them to words on the way into the prompt, through `words.ts`. A number that
 * reaches a Sunburst prompt is a defect the checks refuse.
 */
import { z } from "zod";

import { profileFor, countCopyWords, type AssetProfile } from "../../evolution/experiment/AssetProfile";
import type { Allocation } from "../../provider/reference-packing/reference-allocation";
import type { NumericWordsDensity } from "../engine-selector";
import { exclusionsFor, industryLabel } from "./industry-label";
import { extractConceptSpecs, conceptWithoutSpecs, type ConceptSpecs } from "./concept-specs";
import { printRuleFor, type PrintRule } from "./print-rule";
import { resolvePrecedence } from "./precedence";
import { COLOUR_HEX, colourWords, type CameraHeight, type KeyDirection } from "./words";

// ──────────────────────────────────────────────────────────────────────────
// The schema
// ──────────────────────────────────────────────────────────────────────────

const UNVERIFIED = "unverified" as const;

/** A fact the system does not know. Phase 3's vision pass is what replaces these. */
const unverifiable = <T extends z.ZodTypeAny>(inner: T) => z.union([inner, z.literal(UNVERIFIED)]);

export const ZoneSchema = z.object({
  top_pct: z.number(),
  left_pct: z.number(),
  width_pct: z.number(),
  height_pct: z.number(),
});

export const ArtDirectionSheetSchema = z.object({
  /** The one thing the picture says, in a sentence. */
  big_idea: z.string(),
  mood: z.string(),
  audience_tone: z.string(),

  products: z.array(
    z.object({
      id: z.string(),
      material: unverifiable(z.string()),
      size_class: unverifiable(z.string()),
      colours: z.array(z.string()),
      printed_branding: unverifiable(z.string()),
      /** What the client said this is. Verbatim. */
      description: z.string(),
    }),
  ),
  hero: z.object({ id: z.string(), reason: z.string() }),

  canvas_zones: z.object({
    safe_margin_pct: z.number(),
    /** Only on a canvas whose platform draws its own interface over the image. */
    platform_ui: z.object({ top_pct: z.number(), bottom_pct: z.number() }).nullable(),
    subject: ZoneSchema,
    text: ZoneSchema,
    negative_space_pct: z.number(),
  }),

  arrangement: z.object({
    depth_layers: z.number(),
    overlaps: z.boolean(),
    hero_scale_pct: z.number(),
  }),

  /** Internal and numeric. Never printed as digits. */
  camera: z.object({
    height: z.string(),
    tilt_deg: z.number(),
    lens_mm: z.number(),
    aperture: z.number(),
    focus_rule: z.string(),
  }),

  /** Internal and numeric. Never printed as digits. */
  lighting: z.object({
    key_direction: z.string(),
    kelvin: z.number(),
    rim: z.boolean(),
    fill_ratio: z.number(),
    shadow_rule: z.string(),
  }),

  set: z.object({
    surface: z.string(),
    background: z.string(),
    props: z.array(z.string()),
    culture_signals: z.array(z.string()),
    exclusions: z.array(z.string()),
  }),

  palette: z.object({
    sixty: z.string(),
    thirty: z.string(),
    ten: z.string(),
    /**
     * The product's own dominant colour, as a hex, or null when nothing named one.
     *
     * Recorded rather than recomputed because the one hard rule of the palette — the field
     * is never the product's colour — has to be CHECKABLE, and a checker that re-derives
     * the product's colour from the description can disagree with the deriver that set the
     * field. One value, written once, compared by equality.
     */
    product_dominant: z.string().nullable(),
    /** Why this palette, including whatever it had to avoid. */
    reason: z.string(),
  }),

  typography: z.object({
    families: z.array(z.string()).max(2),
    hierarchy: z.string(),
    sizes_pct: z.object({ headline: z.number(), supporting: z.number(), small: z.number() }),
    treatment_over_texture: z.string(),
  }),

  text_manifest: z.array(
    z.object({
      role: z.string(),
      exact_string: z.string(),
      position: z.string(),
      size_pct: z.number(),
      colour: z.string(),
    }),
  ),

  realism_details: z.array(z.string()),
  finish: z.string(),
  negatives: z.array(z.string()),
  /** One line per field where a lower-priority source wanted something else. */
  conflicts_resolved: z.array(z.string()),

  /** Not creative. The record of how this sheet was made. */
  provenance: z.object({
    asset_family: z.string(),
    aspect_ratio: z.string(),
    approach: z.string(),
    approach_reason: z.string(),
    industry_label: z.string(),
    density: z.string(),
    print_rule_branch: z.string(),
    concept_specs: z.array(z.string()),
  }),
});

export type ArtDirectionSheet = z.infer<typeof ArtDirectionSheetSchema>;

// ──────────────────────────────────────────────────────────────────────────
// The input
// ──────────────────────────────────────────────────────────────────────────

export type ApproachLevel = "restrained" | "balanced" | "bold";

export interface SheetProduct {
  id: string;
  description: string;
  productId?: string | null;
}

export interface SheetInput {
  assetType: string;
  aspectRatio: string;
  /** The RAW industry id. Used for its spelling and its exclusions, never for craft. */
  industry?: string;
  concept: string;
  brand: string;
  copy: string[];
  products: SheetProduct[];
  allocation?: Allocation | null;
  productFacts?: string[];
  brandKit?: {
    colors?: { hex: string; role?: string }[];
    fonts?: { heading?: string; body?: string };
    stylePreferred?: string[];
    styleForbidden?: string[];
    typographyPreference?: string;
    hasLogoImage?: boolean;
  } | null;
  /** Dropdowns the client actually set. Tier 3. */
  userControls?: { label: string; instruction: string }[];
  /** An approach the client chose. Tier 3 when present. */
  userApproach?: { label: string; directive: string } | null;
  /** An approach the system inferred, with its reason. Tier 7. */
  inferredApproach?: { label: string; directive: string; reason: string } | null;
  strategy?: { label: string; text: string }[];
  /**
   * Style read off an inspiration image. Tier 6.
   *
   * Only honoured when `derived_from_image` is true. `types.ts:628` records why: the
   * transport is text-only, so a manifest can be an inference FROM THE CONCEPT dressed as
   * an observation, and injecting that as authoritative style reintroduces exactly the
   * generic studio look it was meant to replace.
   */
  styleManifest?: {
    composition?: string;
    lighting?: string;
    colorMood?: string;
    derived_from_image?: boolean;
  } | null;
  /** Phase 3's hook. Nothing populates it in this round. */
  detectedPrintedBranding?: Array<{ product: string; reads: string }> | null;
  density?: NumericWordsDensity;
}

// ──────────────────────────────────────────────────────────────────────────
// Vocabularies
//
// Every list below is a vocabulary of WORDS AS WRITTEN — colours, materials, surfaces,
// emotions — matched against the client's own text. None of them is keyed on an industry,
// a product type or an occasion, and none of them supplies a value on its own: each only
// recognises something the client already said.
// ──────────────────────────────────────────────────────────────────────────

// The colour-word table lives in `words.ts`, with the function that reads it backwards.
// One table: a second copy here would let the sheet store a hex the prompt cannot name.

const MATERIALS = [
  "glass", "ceramic", "porcelain", "stoneware", "plastic", "metal", "steel", "aluminium",
  "brass", "copper", "paper", "card", "cardboard", "wood", "bamboo", "fabric", "linen",
  "cotton", "leather", "silicone", "rubber", "foil", "wax",
];

const SURFACES = [
  "stone", "marble", "slate", "wood", "oak", "walnut", "linen", "concrete", "terrazzo",
  "ceramic tile", "paper", "fabric", "velvet", "metal", "steel", "glass", "sand", "water",
];

/** Words that say the picture should feel warm. Read off the CONCEPT, never the industry. */
const WARM_WORDS = [
  "warm", "cosy", "cozy", "golden", "amber", "evening", "sunset", "candle", "festive",
  "inviting", "homely", "nostalgic", "ấm", "vàng", "chiều", "tết", "đoàn viên",
];

/** Words that say the picture should feel cool and clean. */
const COOL_WORDS = [
  "clean", "clinical", "fresh", "cool", "crisp", "minimal", "sterile", "icy", "morning",
  "daylight", "bright", "sạch", "mát", "lạnh", "tươi",
];

/** Words that say the camera is looking down on a surface. */
const OVERHEAD_WORDS = ["from above", "overhead", "top-down", "top down", "flat lay", "flatlay", "nhìn từ trên"];

const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");
const trim = (v: unknown): string => String(v ?? "").trim();
const lower = (v: unknown): string => trim(v).toLowerCase();

function wordsIn(haystack: string, needles: string[]): string[] {
  const h = lower(haystack);
  return needles.filter((n) => h.includes(n));
}

// ──────────────────────────────────────────────────────────────────────────
// Derivations
// ──────────────────────────────────────────────────────────────────────────

/**
 * The approach, resolved. "AI decides" is answered here rather than left in the prompt.
 *
 * Derived from the asset family, how much copy there is and the emotion of the concept —
 * the three things that actually constrain how much invention a frame can carry. A hero
 * packshot examined at full size cannot afford a bold staging; a banner read in under a
 * second cannot afford a subtle one.
 */
function resolveApproach(input: SheetInput, profile: AssetProfile): { level: ApproachLevel; reason: string } {
  const stated = lower(input.userApproach?.label);
  for (const level of ["restrained", "balanced", "bold"] as ApproachLevel[]) {
    if (stated.includes(level)) return { level, reason: "the client chose it" };
  }
  const inferred = lower(input.inferredApproach?.label);
  for (const level of ["restrained", "balanced", "bold"] as ApproachLevel[]) {
    if (inferred.includes(level)) {
      return { level, reason: trim(input.inferredApproach?.reason) || "inferred upstream" };
    }
  }

  // Nobody said. Resolve it, and say why.
  const words = countCopyWords(input.copy);
  if (profile.family === "hero") {
    return { level: "restrained", reason: "a hero packshot is inspected, so invention costs more than it earns" };
  }
  if (words > profile.max_words) {
    return {
      level: "restrained",
      reason: `${words} words against the ${profile.max_words} this ${profile.family} carries: the frame has to work for the type, not against it`,
    };
  }
  if (profile.family === "banner") {
    return { level: "bold", reason: "a banner is read in under a second, so separation and statement outrank subtlety" };
  }
  return { level: "balanced", reason: `no approach was stated, and a ${profile.family} with ${words} words of copy needs neither extreme` };
}

/** Zones, derived from the canvas, the asset profile, the text volume and the approach. */
function deriveZones(input: SheetInput, profile: AssetProfile, approach: ApproachLevel) {
  const ratio = trim(input.aspectRatio) || "1:1";
  // The safe margin a canvas needs. 9:16 is larger because the frame is narrower in the
  // dimension type runs across, so the same absolute margin eats proportionally more.
  const safe_margin_pct = ratio === "9:16" ? 7 : 5;
  // Only the vertical canvas has an interface drawn over it: a story's own chrome sits in
  // the top and bottom bands whatever the content is.
  const platform_ui = ratio === "9:16" ? { top_pct: 12, bottom_pct: 14 } : null;

  // Hero share: the profile's own range, pushed to the end the approach asks for.
  const [lo, hi] = profile.dominance_pct;
  const hero_scale_pct = approach === "restrained" ? lo : approach === "bold" ? hi : Math.round((lo + hi) / 2);

  // How much height type needs: its share of this channel's own word budget, floored so a
  // single word still gets room and capped so it never rivals the subject.
  const words = countCopyWords(input.copy);
  const textLoad = profile.max_words > 0 ? Math.min(1, words / profile.max_words) : 0;
  const text_height_pct = input.copy.length === 0 ? 0 : Math.round(14 + textLoad * 22);

  const top = safe_margin_pct + (platform_ui?.top_pct ?? 0);
  const bottom = safe_margin_pct + (platform_ui?.bottom_pct ?? 0);
  const usable = Math.max(10, 100 - top - bottom);

  // Where the words go, and where the subject goes, per canvas. Geometry only.
  let text = { top_pct: top, left_pct: safe_margin_pct, width_pct: 100 - safe_margin_pct * 2, height_pct: text_height_pct };
  let subject = {
    top_pct: top + text_height_pct,
    left_pct: safe_margin_pct,
    width_pct: 100 - safe_margin_pct * 2,
    height_pct: Math.max(20, usable - text_height_pct),
  };
  if (ratio === "16:9") {
    // Two vertical zones: words in one, subject in the other. A wide frame has no calm
    // band above the subject, so stacking them would crush both.
    const textWidth = input.copy.length === 0 ? 0 : 38;
    text = { top_pct: top, left_pct: safe_margin_pct, width_pct: textWidth, height_pct: usable };
    subject = {
      top_pct: top,
      left_pct: safe_margin_pct + textWidth,
      width_pct: 100 - safe_margin_pct * 2 - textWidth,
      height_pct: usable,
    };
  }

  const subjectArea = (subject.width_pct * subject.height_pct) / 100;
  const negative_space_pct = Math.max(0, Math.round(100 - subjectArea - (text.width_pct * text.height_pct) / 100));

  return { safe_margin_pct, platform_ui, subject, text, negative_space_pct, hero_scale_pct };
}

/** Camera, derived from product count, asset type, canvas and the concept's own words. */
function deriveCamera(
  input: SheetInput,
  profile: AssetProfile,
  approach: ApproachLevel,
  specs: ConceptSpecs,
): { camera: ArtDirectionSheet["camera"]; conflicts: string[] } {
  const n = Math.max(1, input.products.length);
  const ratio = trim(input.aspectRatio) || "1:1";

  // More things in the frame means a shorter lens, because a long one cannot hold them all
  // without retreating until the setting disappears. Nothing here knows what they ARE.
  const baseLens = n === 1 ? 85 : n <= 3 ? 70 : n <= 6 ? 50 : 40;
  // A wide canvas sees more horizontally at the same distance, so it needs less lens to
  // fill the frame and more to avoid stretching its edges.
  const derivedLens = Math.max(24, baseLens - (ratio === "16:9" ? 10 : 0));

  const lens = resolvePrecedence<number>("camera.lens_mm", [
    { tier: "explicit_selection", value: specs.lens_mm, from: "a focal length in the concept" },
    { tier: "default", value: derivedLens, from: `${n} product(s) on a ${ratio} ${profile.family}` },
  ]);

  // Deeper as the group grows: every extra object is another plane that has to stay crisp.
  const derivedAperture = n === 1 ? 2.8 : n <= 3 ? 4 : n <= 6 ? 5.6 : 8;
  const aperture = resolvePrecedence<number>("camera.aperture", [
    { tier: "explicit_selection", value: specs.aperture, from: "an f-number in the concept" },
    { tier: "default", value: derivedAperture, from: `${n} product(s) to hold crisp` },
  ]);

  // The client's own word about the viewpoint wins; otherwise the count decides, because a
  // group only reads as a group from above it.
  const saysOverhead = wordsIn(input.concept, OVERHEAD_WORDS).length > 0;
  const height: CameraHeight = saysOverhead
    ? "overhead"
    : n >= 4
      ? "high"
      : profile.family === "hero"
        ? "subject_line"
        : "slightly_above";

  const tilt_deg = approach === "bold" ? 3 : 0;

  return {
    camera: {
      height,
      tilt_deg,
      lens_mm: lens.value ?? derivedLens,
      aperture: aperture.value ?? derivedAperture,
      focus_rule:
        "the hero is crisp from its nearest edge through its label, and focus falls away outward from the hero in every direction",
    },
    conflicts: [...lens.conflicts, ...aperture.conflicts],
  };
}

/** Lighting, derived from the concept's emotion, the text zone's side and the approach. */
function deriveLighting(
  input: SheetInput,
  approach: ApproachLevel,
  zones: ReturnType<typeof deriveZones>,
  specs: ConceptSpecs,
): { lighting: ArtDirectionSheet["lighting"]; conflicts: string[] } {
  const warm = wordsIn(input.concept, WARM_WORDS);
  const cool = wordsIn(input.concept, COOL_WORDS);
  // Neither, or both, means neutral. A concept that says "warm and clean" has not chosen,
  // and inventing a choice for it would be the system overruling the brief.
  const derivedKelvin = warm.length > cool.length ? 3200 : cool.length > warm.length ? 5600 : 4500;

  const kelvin = resolvePrecedence<number>("lighting.kelvin", [
    { tier: "explicit_selection", value: specs.kelvin, from: "a colour temperature in the concept" },
    {
      tier: "concept_text",
      value: warm.length || cool.length ? derivedKelvin : undefined,
      from: `the concept says ${(warm.length ? warm : cool).slice(0, 3).join(", ")}`,
    },
    { tier: "default", value: 4500, from: "the concept states no temperature" },
  ]);

  // The key comes from the side the words are NOT on, so the shadow it throws falls away
  // from the type instead of across it. Pure geometry.
  const textOnLeft = zones.text.width_pct > 0 && zones.text.left_pct + zones.text.width_pct / 2 < 50;
  const key_direction: KeyDirection = textOnLeft ? "front_right" : "front_left";

  const n = input.products.length;
  return {
    lighting: {
      key_direction,
      kelvin: kelvin.value ?? 4500,
      // A rim separates a subject from its ground; with a crowd in the frame it turns into
      // outlines on everything and reads as a cutout.
      rim: n <= 3,
      fill_ratio: approach === "restrained" ? 2 : approach === "bold" ? 5 : 3,
      shadow_rule:
        "one light direction governs every highlight and every shadow in the frame; each object has a contact shadow where it meets the surface, and no object casts a shadow in a direction the others do not",
    },
    conflicts: kelvin.conflicts,
  };
}

/** The dominant colour word the product photographs or the product facts state. */
function dominantProductColour(input: SheetInput): { word: string; hex: string } | null {
  const text = [
    ...(input.productFacts || []),
    ...input.products.map((p) => p.description),
  ].join(" ");
  const found = wordsIn(text, Object.keys(COLOUR_HEX));
  if (!found.length) return null;
  return { word: found[0], hex: COLOUR_HEX[found[0]] };
}

/**
 * The palette, 60/30/10.
 *
 * The one hard rule: the sixty — the field the eye spends most of its time on — may not be
 * the product's own dominant colour, because a red bottle on a red ground is not a
 * photograph of a bottle. When the brand kit's primary IS that colour it is demoted to the
 * ten, where it still does brand work, and the conflict is recorded.
 */
function derivePalette(input: SheetInput): { palette: ArtDirectionSheet["palette"]; conflicts: string[] } {
  const conflicts: string[] = [];
  const kit = (input.brandKit?.colors || []).map((c) => trim(c.hex)).filter(Boolean);
  const product = dominantProductColour(input);
  const conceptColours = wordsIn(input.concept, Object.keys(COLOUR_HEX)).map((w) => COLOUR_HEX[w]);

  // Neutral grounds, used when nothing in the brief names a colour for the field. Light and
  // dark so a dark product is not placed on near-black.
  const NEUTRAL_LIGHT = "#f2efe9";
  const NEUTRAL_MID = "#d8d2c6";
  const NEUTRAL_DARK = "#23211e";

  const clashes = (hex: string) => Boolean(product && lower(hex) === lower(product.hex));

  const kitUsable = kit.filter((h) => !clashes(h));
  if (product && kit.length && kitUsable.length < kit.length) {
    conflicts.push(
      `palette.sixty: product_appearance (the product is ${product.word}) won over brand_kit ` +
        `(${kit.find(clashes)}) — the brand colour is the product's own colour, so it moves to the accent`,
    );
  }

  // The FIELD takes only a brand colour or a neutral.
  //
  // Measured on the Florian fixture: the concept said "delicate yellow apricot blossom in
  // the background" and the field came out mustard, because a colour word was read as a
  // decision about the ground. It almost never is — a concept names the colour of a THING
  // ("yellow blossom", "a bright red bottle", "black dial"), and a thing's colour on the
  // field behind it is the one place that colour must not go. So concept colours feed the
  // accent, where naming a thing's colour is useful, and the field stays neutral unless
  // the brand itself specified one.
  const sixty = resolvePrecedence<string>("palette.sixty", [
    { tier: "brand_kit", value: kitUsable[0], from: "the kit's first usable colour" },
    { tier: "default", value: NEUTRAL_LIGHT, from: "no brand colour for the field, and a concept colour names a thing rather than the ground" },
  ]);

  const thirty = resolvePrecedence<string>("palette.thirty", [
    { tier: "brand_kit", value: kitUsable[1], from: "the kit's second usable colour" },
    { tier: "default", value: sixty.value === NEUTRAL_LIGHT ? NEUTRAL_MID : NEUTRAL_LIGHT, from: "a neutral against the field" },
  ]);

  // The accent is the one place the product's own colour, or a clashing brand colour, is
  // not only safe but useful: ten percent of the frame reads as emphasis, not as ground.
  const ten = resolvePrecedence<string>("palette.ten", [
    { tier: "brand_kit", value: kit.find(clashes) || kitUsable[2], from: "a brand colour, as emphasis" },
    { tier: "product_appearance", value: product?.hex, from: `the product is ${product?.word}` },
    { tier: "concept_text", value: conceptColours[0], from: "a colour named in the concept" },
    { tier: "default", value: NEUTRAL_DARK, from: "nothing named an accent" },
  ]);

  return {
    palette: {
      sixty: sixty.value ?? NEUTRAL_LIGHT,
      thirty: thirty.value ?? NEUTRAL_MID,
      ten: ten.value ?? NEUTRAL_DARK,
      product_dominant: product?.hex ?? null,
      reason:
        `field from ${sixty.tier}, secondary from ${thirty.tier}, accent from ${ten.tier}` +
        (product ? `; the product reads ${product.word}, so the field is not that colour` : ""),
    },
    conflicts: [...conflicts, ...sixty.conflicts, ...thirty.conflicts, ...ten.conflicts],
  };
}

/** Which copy string plays which part, and how tall it is. */
function deriveTextManifest(
  input: SheetInput,
  profile: AssetProfile,
  zones: ReturnType<typeof deriveZones>,
  palette: ArtDirectionSheet["palette"],
): ArtDirectionSheet["text_manifest"] {
  const copy = input.copy.map(nfc).filter((c) => c.trim());
  if (!copy.length) return [];

  // The hierarchy from the Appendix, applied to this channel's own legibility floor. The
  // floor is the number that matters: it is what survives the channel, measured per family.
  const floor = profile.min_cap_height_pct;
  const headline = Math.min(14, Math.round(floor * 3.5 * 10) / 10);
  const supporting = Math.round(floor * 1.2 * 10) / 10;
  const small = Math.round(floor * 10) / 10;

  const hasDigits = (s: string) => /\d/.test(s);
  const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

  return copy.map((line, i) => {
    // A line with a number in it is a price or a menu line, and both are read rather than
    // scanned, so both get the small-text treatment and the size floor that goes with it.
    const isPriceLike = hasDigits(line);
    const isCta = !isPriceLike && i === copy.length - 1 && copy.length > 2 && wordCount(line) <= 4;
    const role = i === 0 ? "headline" : isPriceLike ? "price line" : isCta ? "call to action" : "supporting line";
    const size_pct = role === "headline" ? headline : role === "supporting line" ? supporting : small;
    return {
      role,
      exact_string: line,
      position:
        role === "headline"
          ? "at the top of the text zone, first in the reading order"
          : role === "call to action"
            ? "at the foot of the text zone, last in the reading order"
            : role === "price line"
              ? "grouped with the other numbered lines, on a flat card inside the text zone"
              : "directly under the headline, inside the text zone",
      size_pct,
      colour: role === "headline" ? palette.ten : palette.ten,
    };
  });
}

/** Products, with everything the system cannot see marked as such. */
function deriveProducts(input: SheetInput): ArtDirectionSheet["products"] {
  const factText = (input.productFacts || []).join(" ");
  return input.products.map((p) => {
    const own = `${p.description} ${factText}`;
    const materials = wordsIn(own, MATERIALS);
    const colours = wordsIn(own, Object.keys(COLOUR_HEX));
    // "the label reads X" is the only shape the system can read branding from today, and
    // only when a human typed it into the product facts. Anything else is unverified, and
    // saying so is the whole point: a guessed label is drawn as a guessed label.
    const reads = /(?:label|front|cap|lid)\s+reads\s+([^;.]+)/i.exec(factText);
    return {
      id: p.id,
      material: materials.length ? materials.join(", ") : UNVERIFIED,
      size_class: UNVERIFIED,
      colours,
      printed_branding: reads ? trim(reads[1]).replace(/["“”]/g, "") : UNVERIFIED,
      description: p.description,
    };
  });
}

/**
 * The realism block. Phase 4.
 *
 * Every line holds for any product — food, a bottle, a shoe, a device, a box — because a
 * realism list that names a product type is an industry lock wearing a different hat. What
 * makes a render look synthetic is the same in every category: lights that disagree with
 * each other, objects that do not touch the surface they stand on, and copies that are
 * identical to the pixel.
 */
export function realismDetails(productCount: number): string[] {
  const lines = [
    // The single-light-direction rule lives in `lighting.shadow_rule` and is NOT repeated
    // here: both blocks land in the same master-prompt section, and the first draft of this
    // file put the same sentence in the prompt twice.
    "every object meets the surface with a contact shadow, darkest where they touch and softening outward, plus a faint reflection where the surface is glossy",
    // The three depth layers are stated by `arrangement`, and both blocks land in the same
    // master-prompt section. Saying it twice is how a prompt grows without saying more.
    "focus falls away outward from the hero rather than uniformly across the frame",
    "micro-imperfections, asymmetric: a droplet or drip that is not mirrored, a crumb out of line, real variation in the material",
    "true scale between objects — each the size it would really be beside the others",
    "no waxy, plastic or over-smoothed surfaces, and no HDR halo on any edge",
  ];
  if (productCount > 1) {
    // The specific tell of a generated group, and only relevant when there is a group.
    lines.push(
      "no two items are identical copies: where products are of the same kind, their highlights, garnishes, fill levels and small marks all differ",
    );
  }
  return lines;
}

// ──────────────────────────────────────────────────────────────────────────
// The builder
// ──────────────────────────────────────────────────────────────────────────

/**
 * The sheet. Deterministic: the same input returns the same object, byte for byte.
 *
 * Validated against the schema before it is returned, so a derivation that produces a
 * malformed sheet fails here rather than three layers downstream in a prompt nobody can
 * read back.
 */
export function buildArtDirectionSheet(input: SheetInput): ArtDirectionSheet {
  const profile = profileFor(input.assetType);
  const density: NumericWordsDensity = input.density ?? "words_only";
  const specs = extractConceptSpecs(input.concept);
  const conceptClean = conceptWithoutSpecs(input.concept, specs);
  const approach = resolveApproach(input, profile);
  const zones = deriveZones(input, profile, approach.level);
  const cam = deriveCamera(input, profile, approach.level, specs);
  const light = deriveLighting(input, approach.level, zones, specs);
  const pal = derivePalette(input);
  const manifest = deriveTextManifest(input, profile, zones, pal.palette);
  const products = deriveProducts(input);

  const conflicts = [...cam.conflicts, ...light.conflicts, ...pal.conflicts];

  // The hero: whichever product the copy actually names, else the first attached. A client
  // who wrote the product's name into the headline has told you which one the picture is
  // about, and that outranks upload order.
  const copyText = lower(input.copy.join(" "));
  const named = products.find((p) =>
    p.description
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .some((w) => copyText.includes(lower(w))),
  );
  const hero = named
    ? { id: named.id, reason: "the copy names this product, which outranks upload order" }
    : {
        id: products[0]?.id ?? "1",
        reason: products.length > 1 ? "no product is named in the copy, so the first attached leads" : "the only product",
      };

  // Props and culture come ONLY from the client's own concept. Nothing here invents a prop,
  // and nothing consults a table of what a category or an occasion usually shows.
  const propBudget = approach.level === "restrained" ? 1 : approach.level === "bold" ? 3 : 2;
  // Explicit exclusions the client typed: "not Chinese iconography", "no people", "không có".
  const conceptExclusions = nfc(conceptClean)
    .split(/[.;]/)
    .map((s) => s.trim())
    .filter((s) => /^(not|no)\b|\bnot\b|không/i.test(s))
    .slice(0, 4);

  const surfaceWord = wordsIn(conceptClean, SURFACES)[0];
  const sheet: ArtDirectionSheet = {
    big_idea:
      conceptClean ||
      `${trim(input.brand) || "the brand"} shown plainly and well, with one idea and nothing competing with it`,
    // The approach says how much invention the frame can carry; the CONCEPT says how the
    // picture should feel. Both, because either alone lies: measured on the Florian
    // fixture, nine lines of copy forced a restrained approach and the mood then read
    // "composed and quiet" over a concept that said "warm, inviting, festive".
    mood: [
      wordsIn(conceptClean, WARM_WORDS).length > wordsIn(conceptClean, COOL_WORDS).length
        ? "warm"
        : wordsIn(conceptClean, COOL_WORDS).length > 0
          ? "cool and clean"
          : "",
      approach.level === "restrained" ? "composed and quiet" : approach.level === "bold" ? "confident and graphic" : "assured",
    ]
      .filter(Boolean)
      .join(", "),
    audience_tone:
      trim((input.strategy || []).find((s) => /audience|psycholog|insight/i.test(s.label))?.text) ||
      `whoever this ${profile.family} is for, addressed directly and without hype`,
    products,
    hero,
    canvas_zones: {
      safe_margin_pct: zones.safe_margin_pct,
      platform_ui: zones.platform_ui,
      subject: zones.subject,
      text: zones.text,
      negative_space_pct: zones.negative_space_pct,
    },
    arrangement: {
      depth_layers: 3,
      overlaps: input.products.length >= 3,
      hero_scale_pct: zones.hero_scale_pct,
    },
    camera: cam.camera,
    lighting: light.lighting,
    set: {
      surface: surfaceWord
        ? `${surfaceWord}, as the concept states`
        : "a plain matte surface a shade darker than the background, with no pattern of its own",
      background: `a plain field of ${colourWords(pal.palette.sixty)}, falling softly out of focus behind the subject`,
      props: [],
      culture_signals: [],
      exclusions: [
        ...exclusionsFor(input.industry),
        ...conceptExclusions,
        ...(input.brandKit?.styleForbidden || []).map((s) => `never ${trim(s)}`),
      ].filter(Boolean),
    },
    palette: pal.palette,
    typography: {
      families: [
        trim(input.brandKit?.fonts?.heading),
        trim(input.brandKit?.fonts?.body),
      ].filter(Boolean).slice(0, 2),
      hierarchy: "the headline dominant, the supporting line a little over a third of it, the smallest line a third",
      sizes_pct: {
        headline: manifest.find((m) => m.role === "headline")?.size_pct ?? profile.min_cap_height_pct * 3.5,
        supporting: profile.min_cap_height_pct * 1.2,
        small: profile.min_cap_height_pct,
      },
      treatment_over_texture:
        "small text sits on a flat card, a plain panel or an untextured area of the surface — never over the product, never over texture, never over a gradient that crosses it",
    },
    text_manifest: manifest,
    realism_details: realismDetails(input.products.length),
    finish:
      "a gentle S-curve in the tone, highlights rolling off softly rather than clipping, blacks that keep detail, and no sharpening halo on any edge",
    negatives: [
      "no text, numeral, word or character other than the strings listed",
      "no logo, wordmark, emblem or icon other than the one the print rule allows",
      "no second or duplicate copy of any product",
      "no watermark, no signature, no frame or border drawn inside the image",
    ],
    conflicts_resolved: conflicts,
    provenance: {
      asset_family: profile.family,
      aspect_ratio: trim(input.aspectRatio) || "1:1",
      approach: approach.level,
      approach_reason: approach.reason,
      industry_label: industryLabel(input.industry),
      density,
      print_rule_branch: printRuleFor({
        hasLogoImage: Boolean(
          input.brandKit?.hasLogoImage ||
            input.allocation?.slots.some((s) => s.panels.some((p) => p.role === "logo")),
        ),
        detectedPrintedBranding: input.detectedPrintedBranding ?? null,
      }).branch,
      concept_specs: specs.matched,
    },
  };

  // Props are capped by the approach, and the cap is recorded rather than applied silently.
  if (sheet.set.props.length > propBudget) {
    sheet.set.props = sheet.set.props.slice(0, propBudget);
    sheet.conflicts_resolved.push(
      `set.props: creative_approach (${approach.level}) capped the props at ${propBudget}`,
    );
  }

  return ArtDirectionSheetSchema.parse(sheet);
}

/** The print rule for a sheet's inputs. Exported so the brief and the tests agree. */
export function printRuleForSheet(input: SheetInput): PrintRule {
  return printRuleFor({
    hasLogoImage: Boolean(
      input.brandKit?.hasLogoImage ||
        input.allocation?.slots.some((s) => s.panels.some((p) => p.role === "logo")),
    ),
    detectedPrintedBranding: input.detectedPrintedBranding ?? null,
  });
}

/** Counts and names only. Never the client's copy, never a prompt. */
export function sheetTelemetry(sheet: ArtDirectionSheet | null | undefined) {
  if (!sheet) return { art_direction_sheet: false };
  return {
    art_direction_sheet: true,
    approach: sheet.provenance.approach,
    family: sheet.provenance.asset_family,
    ratio: sheet.provenance.aspect_ratio,
    print_rule: sheet.provenance.print_rule_branch,
    products: sheet.products.length,
    unverified_materials: sheet.products.filter((p) => p.material === UNVERIFIED).length,
    manifest_entries: sheet.text_manifest.length,
    conflicts: sheet.conflicts_resolved.length,
    concept_specs: sheet.provenance.concept_specs.length,
  };
}

export { UNVERIFIED };
