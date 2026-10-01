import type { PromptSection, PromptTopic } from "./PromptOwnership";
import { TOPIC_OWNER } from "./PromptOwnership";
import type { TreatmentAxis, TypographyTreatment } from "./TypographyDNA";
import { TREATMENT_AXES } from "./TypographyDNA";
import type { LedgerUseViolation, TextLedgers } from "./TextLedgerSystem";
import {
  PLAIN_INK_ABOVE_GRAPHEMES,
  auditLedgerUse,
  redactLedgerStrings,
  renderCampaignLedger,
  renderExclusionMatrix,
  renderProductLedger,
} from "./TextLedgerSystem";

/**
 * The Optical Compiler — the eight-block render script, and the typography block
 * at the end of it.
 *
 * WHY THIS EXISTS
 * ---------------
 * One-pass rendering: the image model draws the space, the light, the product,
 * the camera's point of view AND the campaign typography, in a single render.
 * Nothing is composited afterwards. That makes the prompt the only instrument
 * the system has, and it changes what the prompt has to be.
 *
 * A model asked for "an elegant headline" is being asked to invent a pattern,
 * and a pattern it invents is where misspellings, dropped tone marks and
 * letter-shaped noise come from. A model asked for "letters pressed 2mm into
 * coated stock, catching the same light the scene already has" is being asked to
 * render an OBJECT — something with a thickness, a contact edge and a shadow.
 * The second request is the same request in physical language, and physical
 * language is what this file writes.
 *
 * THE BLOCK AT THE END
 * --------------------
 * Four slots, fixed order, always last in the prompt:
 *
 *   T1  the ledgers      the only place a string is written out
 *   T2  the material     what the letters ARE, chosen from the treatment axes
 *   T3  the optics       which plane they occupy, their scale, their tone
 *   T4  the negatives    the closed list, including both exclusion directions
 *
 * Last, because recency is how a renderer settles two lines that disagree, and
 * every block before this one may mention type.
 *
 * WHAT IT MAY AND MAY NOT DECIDE
 * ------------------------------
 * It writes BLOCK 8 and assembles blocks 1-7 from the modules that own them. It
 * never writes a camera, a light or an environment itself: those topics belong to
 * `CompositionPlan` in `TOPIC_OWNER`, and a second author for them is how this
 * engine previously ended up with two accounts of one frame. Where typography
 * NEEDS something of the camera -- a sharp plane, an aperture that holds it --
 * the requirement is returned as data in `requires`, for the owner to honour
 * upstream. Asking for it in BLOCK 8's own words would be the same mistake in a
 * new place.
 *
 * It also does not author on its own behalf. The two sections it emits for the
 * ownership audit are declared under the registry's existing owners -- the copy
 * half under `typography_copy`, the material and optics half under
 * `typography_intent` -- because this module is their assembler, not a
 * fourteenth voice.
 *
 * Pure. No model call, no I/O, no clock.
 */

// ── the eight blocks ─────────────────────────────────────────────────────────

export interface BlockSpec {
  index: number;
  /** The heading as it appears in the prompt. */
  name: string;
  /** The subject this block speaks for, in the ownership registry's terms. */
  topic: PromptTopic;
}

/**
 * Order is the contract. The first block says what is being made, the last says
 * what the words are, and the six between describe the picture in the order a
 * photographer would build it: subject, light, lens, place, finish.
 */
export const BLOCK_ORDER: readonly BlockSpec[] = [
  { index: 1, name: "BLOCK 1 — OUTPUT CONTRACT", topic: "render_constraints" },
  { index: 2, name: "BLOCK 2 — IDENTITY LOCK", topic: "product_truth" },
  { index: 3, name: "BLOCK 3 — SUBJECT & STAGING", topic: "composition" },
  { index: 4, name: "BLOCK 4 — LIGHT", topic: "lighting" },
  { index: 5, name: "BLOCK 5 — LENS", topic: "camera" },
  { index: 6, name: "BLOCK 6 — ENVIRONMENT", topic: "scene_environment" },
  { index: 7, name: "BLOCK 7 — GRADE & MATERIAL", topic: "visual_style" },
  { index: 8, name: "BLOCK 8 — TYPOGRAPHY", topic: "typography_copy" },
] as const;

export const TYPOGRAPHY_BLOCK_NAME = "BLOCK 8 — TYPOGRAPHY";

export interface PromptBlock {
  index: number;
  name: string;
  topic: PromptTopic;
  text: string;
  chars: number;
}

// ── T2: what the letters are made of ─────────────────────────────────────────

/**
 * A letterform material, keyed to the treatment axis that argues for it.
 *
 * The axes are not invented here: `TypographyDNA` already resolves six of them
 * from the brief's own words, attenuates everything after the strongest so one
 * behaviour leads, and records why. This table is the other half of that work --
 * what each axis MEANS to a renderer that must now draw the letters itself.
 *
 * `physics` is deliberately a manufacturing description. "Debossed" is a style
 * word; "pressed 2mm below the surface, the upper edge catching the light and
 * the lower edge holding a shadow" is a thing to draw.
 */
interface Material {
  /** The name the prompt uses. */
  name: string;
  /** The axis whose value selects it. */
  axis: TreatmentAxis;
  physics: string;
  /** Words that, in an avoid rule, mean this material lost the brief's argument. */
  refusedBy: RegExp;
}

const MATERIALS: Material[] = [
  {
    name: "letterpress ink",
    axis: "contact",
    physics:
      "ink lying on a dense uncoated stock and pressed very slightly into it, the stroke edges carrying a fractionally heavier rim of ink than their centres, no gloss anywhere, and a shadow so shallow it reads as contact rather than as distance",
    refusedBy: /\b(print|printed|paper|letterpress|ink on paper)\b/i,
  },
  {
    name: "relief",
    axis: "relief",
    physics:
      "letters standing 2-3mm clear of the surface behind them, the upper edge of every stroke taking the light and the lower edge holding a short dense shadow tight against its own base, the face of each stroke flat and unlit",
    refusedBy: /\b(emboss|embossed|raised|relief|debossed)\b/i,
  },
  {
    name: "foil",
    axis: "sheen",
    physics:
      "a thin metal leaf laid on the surface, reflecting along one axis only so a highlight runs down each stroke and dies at its edges, the metal darkening to near-black where it turns away, and emitting nothing of its own",
    refusedBy: /\b(metal|metallic|foil|chrome|gold|polish|polished|gloss)\b/i,
  },
  {
    name: "emitted light",
    axis: "luminosity",
    physics:
      "letters formed as even-bore glass tubing carrying light of their own, a soft halo bleeding a short distance into the surface behind them, that surface measurably brighter near the strokes than away from them",
    refusedBy: /\b(neon|glow|glowing|luminous|emit|emitted|radiant)\b/i,
  },
  {
    name: "glass",
    axis: "translucency",
    physics:
      "letters cut from clear glass: the picture behind shows through every stroke, bending slightly at the stroke edges, the strokes themselves holding a thin bright line where they catch the surface light",
    refusedBy: /\b(glass|transparent|translucent|crystal|see-through)\b/i,
  },
  {
    name: "soft exposure",
    axis: "softness",
    physics:
      "letters whose edges dissolve into the surface over roughly one percent of the frame's width, with no hard boundary anywhere, as though exposed rather than printed",
    refusedBy: /\b(soft|softness|dreamy|haze|hazy|diffuse|diffusion)\b/i,
  },
];

/**
 * Flat ink. Not an absence of a decision -- the decision that the words matter
 * more than their surface.
 */
const FLAT_INK = {
  name: "flat ink",
  physics:
    "one solid even tone, the same across every stroke: no gradient, no metal, no glow, no transparency, no relief and no shadow of its own. Clean closed counters, every stroke the same weight along its length, and every accent fully formed and separate from the letter beneath it",
};

/** Below this, an axis is not making a case for anything. */
const MATERIAL_FLOOR = 0.3;
/** A supporting axis shows at this strength or it is not mentioned at all. */
const SUPPORT_FLOOR = 0.25;

export interface MaterialChoice {
  name: string;
  physics: string;
  /** The axis that decided it, or null for flat ink. */
  axis: TreatmentAxis | null;
  /** Strength of the deciding axis, 0-1. */
  strength: number;
  /** The one supporting behaviour kept, where there is one. */
  support: { axis: TreatmentAxis; strength: number } | null;
  /** True when the material was forced back to flat ink. */
  fallback: boolean;
  because: string;
}

/**
 * Chooses the letterform material.
 *
 * Three ways to arrive at flat ink, and all three are real answers:
 *
 *   1. The copy is long. Past `PLAIN_INK_ABOVE_GRAPHEMES` every decorated glyph
 *      is another place a Vietnamese tone mark can deform, and a correctly spelt
 *      plain headline beats a beautifully materialised wrong one. Legibility
 *      outranks art direction here, unconditionally.
 *   2. No axis reaches `MATERIAL_FLOOR`: the brief is not about a surface.
 *   3. The winning material is named in an avoid rule, and nothing else qualifies.
 */
export function chooseMaterial(
  treatment: TypographyTreatment | null | undefined,
  campaignGraphemes: number,
  avoidRules: string[] = [],
): MaterialChoice {
  if (campaignGraphemes > PLAIN_INK_ABOVE_GRAPHEMES) {
    return {
      ...FLAT_INK,
      axis: null,
      strength: 0,
      support: null,
      fallback: true,
      because:
        `${campaignGraphemes} graphemes of copy is past the ${PLAIN_INK_ABOVE_GRAPHEMES}-grapheme point where a decorated ` +
        "letterform becomes a spelling risk, so the material is dropped in favour of the words being right",
    };
  }

  const ranked = (treatment ? [...TREATMENT_AXES] : [])
    .map((axis) => ({ axis, value: Number(treatment?.[axis] ?? 0) }))
    .filter((a) => a.value >= MATERIAL_FLOOR)
    .sort((a, b) => b.value - a.value);

  const refused: string[] = [];
  for (const candidate of ranked) {
    const material = MATERIALS.find((m) => m.axis === candidate.axis);
    if (!material) continue;
    if (avoidRules.some((rule) => material.refusedBy.test(rule))) {
      refused.push(material.name);
      continue;
    }
    const support = ranked.find((a) => a.axis !== candidate.axis && a.value >= SUPPORT_FLOOR) ?? null;
    return {
      name: material.name,
      physics: material.physics,
      axis: candidate.axis,
      strength: candidate.value,
      support: support ? { axis: support.axis, strength: support.value } : null,
      fallback: false,
      because:
        `${candidate.axis} leads at ${candidate.value.toFixed(2)}` +
        (support ? `, with ${support.axis} at ${support.value.toFixed(2)} kept in support` : "") +
        (refused.length ? `; ${refused.join(" and ")} refused by an avoid rule` : ""),
    };
  }

  return {
    ...FLAT_INK,
    axis: null,
    strength: 0,
    support: null,
    fallback: Boolean(ranked.length),
    because: refused.length
      ? `every material the brief argued for is refused by an avoid rule (${refused.join(", ")})`
      : "no treatment axis reaches 0.30, so the brief is not about a surface and the words are set as themselves",
  };
}

// ── T3: the tone the ink has to be ───────────────────────────────────────────

/** How far from the mean a line can expect to sit, in luminance. */
const SPREAD_K = 1.5;
/** WCAG's floor for display copy. A metal ink needs 6:1 and says so separately. */
const CONTRAST_FLOOR = 4.5;

export interface InkPolarity {
  polarity: "light" | "dark" | "undecidable";
  /** The bound the ink's own luminance must respect, 0-1. */
  bound: number | null;
  /** Plain words for the bound, because a renderer reads words. */
  reads: string;
  feasible: boolean;
  because: string;
}

/**
 * Which way the ink has to go, from the tone the ground is PLANNED to be.
 *
 * The adverse end of the distribution decides, not the mean: a line half on a
 * highlight and half in a shadow averages to a comfortable mid-tone and is still
 * half invisible. With a planned ground of 0.62 and a spread of 0.10 the bright
 * end is 0.77, light ink would need a luminance of 3.64 to clear 4.5:1, and the
 * only answer left is near-black. That is a decision arithmetic can make before
 * anything is rendered, and it costs nothing.
 */
export function inkPolarity(groundLuminance: number, spread = 0.1, floor = CONTRAST_FLOOR): InkPolarity {
  const g = Math.max(0, Math.min(1, groundLuminance));
  const s = Math.max(0, Math.min(1, spread));
  const high = Math.min(1, g + SPREAD_K * s);
  const low = Math.max(0, g - SPREAD_K * s);

  const lightNeeds = floor * (high + 0.05) - 0.05;
  const darkAllows = (low + 0.05) / floor - 0.05;
  const lightOk = lightNeeds <= 1;
  const darkOk = darkAllows >= 0;

  const word = (v: number) =>
    v <= 0.08 ? "near-black" : v <= 0.25 ? "dark" : v >= 0.92 ? "near-white" : v >= 0.75 ? "light" : "mid-tone";
  /** Words first, number second: a renderer acts on the word and the number makes it checkable. */
  const reads = (polarity: "light" | "dark", bound: number) =>
    polarity === "light"
      ? `${word(bound)}, no darker than a relative luminance of ${bound.toFixed(2)}`
      : `${word(bound)}, no lighter than a relative luminance of ${bound.toFixed(2)}`;

  // Both feasible happens on a mid-grey ground. Take the larger margin: the one
  // further from its own bound survives the render drifting a little.
  if (lightOk && darkOk) {
    const lightMargin = 1 - lightNeeds;
    const darkMargin = darkAllows;
    const light = lightMargin >= darkMargin;
    return light
      ? {
          polarity: "light",
          bound: lightNeeds,
          reads: reads("light", lightNeeds),
          feasible: true,
          because: `the ground's bright end is ${high.toFixed(2)}; light ink clears ${floor}:1 from ${lightNeeds.toFixed(2)} up, with more room than dark ink has`,
        }
      : {
          polarity: "dark",
          bound: darkAllows,
          reads: reads("dark", darkAllows),
          feasible: true,
          because: `the ground's dark end is ${low.toFixed(2)}; dark ink clears ${floor}:1 from ${darkAllows.toFixed(2)} down, with more room than light ink has`,
        };
  }
  if (darkOk) {
    return {
      polarity: "dark",
      bound: darkAllows,
      reads: reads("dark", darkAllows),
      feasible: true,
      because: `light ink would need a luminance of ${lightNeeds.toFixed(2)} against a bright end of ${high.toFixed(2)}, which is impossible, so the ink must be dark`,
    };
  }
  if (lightOk) {
    return {
      polarity: "light",
      bound: lightNeeds,
      reads: reads("light", lightNeeds),
      feasible: true,
      because: `dark ink would need a luminance below ${darkAllows.toFixed(2)} against a dark end of ${low.toFixed(2)}, which is impossible, so the ink must be light`,
    };
  }
  // Neither polarity clears the floor: the GROUND is wrong, not the ink. Said
  // rather than hidden, because the fix belongs to whoever planned the ground.
  return {
    polarity: "undecidable",
    bound: null,
    reads: "neither polarity clears the contrast floor against this ground",
    feasible: false,
    because: `a ground of ${g.toFixed(2)} spreading ${s.toFixed(2)} leaves no ink luminance that reaches ${floor}:1 at both ends; the reserved area has to be made tonally quieter`,
  };
}

// ── T3: what typography needs of the camera ──────────────────────────────────

/**
 * Requirements typography places on blocks it does not own.
 *
 * Returned as data, never written into BLOCK 8. The camera belongs to
 * `CompositionPlan`; typography may only state what it needs and let the owner
 * honour it. Unverified as numbers -- both floors are reasoned, not measured.
 */
export interface OpticalRequirements {
  /** Drawn letters have to be in the sharp plane, or the strokes arrive as mush. */
  text_in_focal_plane: boolean;
  /** The aperture that keeps them there. Bites against a brief that wanted shallow depth. */
  aperture_floor_f: number;
  /** Cap height as a share of frame height, below which tone marks stop surviving. */
  min_cap_height_pct: number;
}

const DEFAULT_REQUIREMENTS: OpticalRequirements = {
  text_in_focal_plane: true,
  aperture_floor_f: 5.6,
  min_cap_height_pct: 2.2,
};

// ── the typography block ─────────────────────────────────────────────────────

/** The reserved area, in frame percentages, origin top-left. */
export interface ReservedZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TypographyBlockInput {
  ledgers: TextLedgers;
  /** The axes `TypographyDNA` resolved. Absent means flat ink. */
  treatment?: TypographyTreatment | null;
  /** `TypographyDNA.avoid_rules` — each one names a behaviour that lost this brief's argument. */
  avoidRules?: string[] | null;
  /** The area the composition reserved for the words. */
  zone?: ReservedZone | null;
  /** The tone the ground under the words is planned to be, 0-1, where it is known. */
  groundLuminance?: number | null;
  /** How uneven that ground is expected to be, 0-1. */
  groundSpread?: number | null;
  /** True when the ink is built from a brand accent: its floor is 6:1, not 4.5. */
  accentInk?: boolean;
  requirements?: Partial<OpticalRequirements>;
}

export interface TypographyBlock {
  /** The four slots, joined, as the prompt carries them. */
  text: string;
  /** The ledger half, for the ownership audit. */
  copySection: PromptSection;
  /** The material and optics half, for the ownership audit. */
  intentSection: PromptSection;
  material: MaterialChoice;
  ink: InkPolarity | null;
  requires: OpticalRequirements;
}

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Builds BLOCK 8.
 *
 * `mode: "none"` is not an empty block. "There is no typography in this frame"
 * is an instruction, and the one case this engine has measured where it was left
 * implied -- the no-copy branch asserting a finished frame while the composition
 * asked for a reserved band -- came back with the copy painted into the picture
 * twice.
 */
export function buildTypographyBlock(input: TypographyBlockInput): TypographyBlock {
  const { ledgers } = input;
  const requires = { ...DEFAULT_REQUIREMENTS, ...(input.requirements || {}) };
  const hasCampaign = ledgers.mode === "exact" && ledgers.campaign.length > 0;

  // ── T1 ───────────────────────────────────────────────────────────────────
  const t1: string[] = ["T1 · THE LEDGERS — the only words that exist in this frame."];
  if (hasCampaign) {
    t1.push(renderCampaignLedger(ledgers));
  } else {
    t1.push(
      "CAMPAIGN COPY — none. No headline, subheadline, call to action, price, caption, slogan or decorative lettering is authorized for this frame. Render no words of your own anywhere in it.",
    );
  }
  const productLedger = renderProductLedger(ledgers);
  if (productLedger) t1.push(productLedger);

  // ── T2 ───────────────────────────────────────────────────────────────────
  const material = chooseMaterial(input.treatment, ledgers.campaignGraphemes, input.avoidRules || []);
  const t2: string[] = [];
  if (hasCampaign) {
    t2.push(
      "T2 · MATERIAL — what the campaign letters are made of. They are a physical thing in this scene, not a graphic laid over it.",
      `- ${material.name}: ${material.physics}.`,
    );
    if (material.support) {
      t2.push(
        `- ${material.support.axis} is present in support at ${material.support.strength.toFixed(2)} and must not compete with the material above.`,
      );
    }
    t2.push(
      "- Every glyph is fully formed: closed counters, consistent stroke weight, no broken, clipped, doubled or half-drawn letters, and no ornament that is not described above.",
    );
  }

  // ── T3 ───────────────────────────────────────────────────────────────────
  const ink =
    typeof input.groundLuminance === "number"
      ? inkPolarity(
          input.groundLuminance,
          typeof input.groundSpread === "number" ? input.groundSpread : 0.1,
          input.accentInk ? 6 : CONTRAST_FLOOR,
        )
      : null;
  const t3: string[] = [];
  if (hasCampaign) {
    t3.push("T3 · OPTICS — where the letters sit in the picture and how they take its light.");
    t3.push(
      "- The campaign letters lie in their own plane, parallel to the picture plane: no perspective, no curvature, no wrap, no tilt, and no part of them bent around anything in the scene.",
    );
    t3.push(
      `- They are in the sharp plane, as crisp as the product itself -- never behind it, never softened, never partly out of focus. ${
        requires.text_in_focal_plane ? "Every stroke edge is resolved." : ""
      }`.trim(),
    );
    t3.push(
      `- [${ledgers.campaign[0].code}] is the largest: its capital letters stand at least ${pct(
        requires.min_cap_height_pct,
      )} of the frame's height, and every accent above or below a letter has its own clear room, touching nothing.`,
    );
    if (input.zone) {
      t3.push(
        `- They sit inside the area the composition reserved: ${pct(input.zone.x)} from the left, ${pct(
          input.zone.y,
        )} from the top, ${pct(input.zone.width)} wide and ${pct(
          input.zone.height,
        )} tall, measured from the frame's top-left corner. Nothing in the scene crosses into it and no part of any line leaves it.`,
      );
    }
    if (ink?.feasible) {
      t3.push(
        `- The ink is ${ink.polarity}: ${ink.reads}, so the words hold against the tone planned behind them even at its most adverse.`,
      );
    } else {
      t3.push(
        "- Set the ink against the tone of the area it actually sits on rather than against the frame's average, and keep that area tonally even so the words hold without an outline, a glow or a panel behind them.",
      );
    }
    t3.push(
      "- The letters take their light from the same source BLOCK 4 establishes, at the same angle and with the same shadow softness as everything else in frame. Whatever shadow they cast falls the same way the product's does.",
    );
  }

  // ── T4 ───────────────────────────────────────────────────────────────────
  const t4: string[] = ["T4 · FORBIDDEN.", renderExclusionMatrix(ledgers)];
  if (hasCampaign) {
    t4.push(
      "- No line appears twice. Not at a second size, not in a second corner, not as a watermark, a caption, a label or a reflection.",
      "- No line appears without its accents, and none in a transliterated, unaccented, translated, re-spelt, abbreviated or extended form. Every tone mark listed in T1 is part of the word, not decoration on it.",
      "- No letter-shaped marks that are not one of the lines above: no filler lettering, no suggested text, no blurred word-like shapes, no foreign script, and no second alphabet.",
      "- No line is cropped, cut by the frame edge, hidden behind an object, or allowed to run off the canvas.",
    );
  }

  const text = [
    TYPOGRAPHY_BLOCK_NAME,
    t1.filter(Boolean).join("\n"),
    t2.filter(Boolean).join("\n"),
    t3.filter(Boolean).join("\n"),
    t4.filter(Boolean).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    copySection: { topic: "typography_copy", owner: TOPIC_OWNER.typography_copy, text: t1.join("\n") },
    intentSection: {
      topic: "typography_intent",
      owner: TOPIC_OWNER.typography_intent,
      text: [t2.join("\n"), t3.join("\n"), t4.join("\n")].filter(Boolean).join("\n\n"),
    },
    material,
    ink,
    requires,
  };
}

// ── the script ───────────────────────────────────────────────────────────────

/**
 * Blocks 1-7, each written by its own owner and handed over as text.
 *
 * Optional one by one on purpose: a degraded run that lost the composition still
 * has to produce a prompt, and a missing block should leave a gap in the script
 * rather than a fabricated paragraph written by this file.
 */
export interface ScriptSources {
  outputContract?: string | null;
  identityLock?: string | null;
  subject?: string | null;
  light?: string | null;
  lens?: string | null;
  environment?: string | null;
  grade?: string | null;
}

export type InvariantId =
  /** Every campaign string appears once, in T1 and nowhere else. */
  | "count_once"
  /** The typography block is last. */
  | "typography_last"
  /** The assembled script fits the engine ceiling. */
  | "within_budget"
  /** The ledgers hold no blocking conflict. */
  | "ledgers_clean"
  /** With no copy authorized, the block says so rather than staying silent. */
  | "silence_is_stated";

export interface InvariantResult {
  id: InvariantId;
  ok: boolean;
  because: string;
}

/**
 * The provider's own ceiling, in characters.
 *
 * Characters, not tokens: the limit this provider enforces is a character count,
 * and a token figure is an estimate dressed as a measurement. Measured on a
 * fully decided brief, the sent prompt reached 31,895 of 32,000 -- about 105
 * characters of headroom -- which is why BLOCK 8 is a REPLACEMENT for the copy
 * and typography sections that preceded it and not an addition to them.
 */
const PROVIDER_CEILING = Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 32000);
/** What this compiler will build up to, leaving the provider's protocol suffix room. */
const ENGINE_CEILING = 30000;

export interface OpticalScript {
  /** The eight blocks, in order, as the prompt carries them. */
  blocks: PromptBlock[];
  /** The prompt itself. */
  prompt: string;
  /** Nine sections for the ownership audit: blocks 1-7, plus typography's two halves. */
  sections: PromptSection[];
  typography: TypographyBlock;
  /** Campaign strings quoted outside T1. Reported, never repaired here. */
  violations: LedgerUseViolation[];
  invariants: InvariantResult[];
  /** True when every invariant holds. */
  ok: boolean;
  budget: {
    total_chars: number;
    engine_ceiling: number;
    provider_ceiling: number;
    headroom: number;
    per_block: Array<{ index: number; name: string; chars: number }>;
  };
}

export interface OpticalCompilerInput extends TypographyBlockInput {
  sources?: ScriptSources;
}

/**
 * Compiles the script.
 *
 * Assembly order is `BLOCK_ORDER` and nothing else decides it. Blocks with no
 * text are dropped rather than emitted empty: an empty heading is a heading the
 * renderer has to interpret.
 */
export function compileOpticalScript(input: OpticalCompilerInput): OpticalScript {
  const s = input.sources || {};
  const supplied: Record<number, string> = {
    1: clean(s.outputContract),
    2: clean(s.identityLock),
    3: clean(s.subject),
    4: clean(s.light),
    5: clean(s.lens),
    6: clean(s.environment),
    7: clean(s.grade),
  };

  const typography = buildTypographyBlock(input);
  const blocks: PromptBlock[] = [];
  for (const spec of BLOCK_ORDER) {
    const text = spec.index === 8 ? typography.text : supplied[spec.index];
    if (!text) continue;
    const body = spec.index === 8 ? text : `${spec.name}\n${text}`;
    blocks.push({ index: spec.index, name: spec.name, topic: spec.topic, text: body, chars: body.length });
  }

  const prompt = blocks.map((b) => b.text).join("\n\n");
  const violations = auditLedgerUse(
    blocks.map((b) => ({ name: b.name, text: b.text })),
    input.ledgers,
    TYPOGRAPHY_BLOCK_NAME,
  );

  const total = prompt.length;
  const hasCampaign = input.ledgers.mode === "exact" && input.ledgers.campaign.length > 0;
  const last = blocks[blocks.length - 1];

  const invariants: InvariantResult[] = [
    {
      id: "count_once",
      ok: violations.length === 0,
      because: violations.length
        ? `${violations.length} campaign string(s) quoted outside T1: ${violations.map((v) => `${v.code} in ${v.block}`).join(", ")}`
        : "every campaign string is written once, in T1, and referred to elsewhere only by code",
    },
    {
      id: "typography_last",
      ok: Boolean(last && last.index === 8),
      because: last && last.index === 8
        ? "the typography block closes the prompt, where recency settles any disagreement with an earlier block"
        : "the typography block is not last, so an earlier block's account of the type can override it",
    },
    {
      id: "within_budget",
      ok: total <= ENGINE_CEILING,
      because: `${total} chars against an engine ceiling of ${ENGINE_CEILING} and a provider ceiling of ${PROVIDER_CEILING}`,
    },
    {
      id: "ledgers_clean",
      ok: !input.ledgers.blocked,
      because: input.ledgers.blocked
        ? `blocking ledger conflict: ${input.ledgers.conflicts.filter((c) => c.severity === "blocking").map((c) => c.kind).join(", ")}`
        : "no blocking conflict between the two ledgers",
    },
    {
      id: "silence_is_stated",
      ok: hasCampaign || /CAMPAIGN COPY — none/.test(typography.text),
      because: hasCampaign
        ? "copy is authorized, so the ledger states it"
        : "no copy is authorized, and the block says so explicitly rather than leaving it to be inferred",
    },
  ];

  return {
    blocks,
    prompt,
    sections: [
      ...blocks
        .filter((b) => b.index !== 8)
        .map((b) => ({ topic: b.topic, owner: TOPIC_OWNER[b.topic], text: b.text })),
      typography.copySection,
      typography.intentSection,
    ],
    typography,
    violations,
    invariants,
    ok: invariants.every((i) => i.ok),
    budget: {
      total_chars: total,
      engine_ceiling: ENGINE_CEILING,
      provider_ceiling: PROVIDER_CEILING,
      headroom: PROVIDER_CEILING - total,
      per_block: blocks.map((b) => ({ index: b.index, name: b.name, chars: b.chars })),
    },
  };
}


/** Counts, names and verdicts only. Never the client's copy. */
export function opticalTelemetry(script: OpticalScript | null | undefined) {
  if (!script) return { optical_script: false };
  return {
    optical_script: true,
    blocks: script.blocks.length,
    chars: script.budget.total_chars,
    headroom: script.budget.headroom,
    block_chars: script.budget.per_block.map((b) => `${b.index}:${b.chars}`),
    material: script.typography.material.name,
    material_fallback: script.typography.material.fallback,
    ink: script.typography.ink ? script.typography.ink.polarity : "unstated",
    ink_feasible: script.typography.ink ? script.typography.ink.feasible : null,
    aperture_floor_f: script.typography.requires.aperture_floor_f,
    failed_invariants: script.invariants.filter((i) => !i.ok).map((i) => i.id),
    ledger_violations: script.violations.length,
  };
}

// ── routing the analysis layer into the eight blocks ─────────────────────────
//
// The analysis layer is unchanged: every module that reasoned before this phase
// reasons exactly as it did. What changes is the last step. Its output used to be
// 27 sections joined in the order they happened to be written, three of which
// described the layout and three of which described the type. Here it is sorted
// into eight blocks, each topic arriving once, and the writers BLOCK 8 replaces
// are dropped rather than carried.

type RouteTarget = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "drop";

/**
 * Where each section of the analysis output belongs.
 *
 * First match wins, so the specific patterns come before the catch-alls. The
 * blanket `TYPOGRAPHY` drop is near the end on purpose: every module that ever
 * wrote about type -- the compiler's copy section, the blueprint's typography
 * direction, the art-direction pass's typography block -- is superseded by
 * BLOCK 8, and listing them one by one would mean a new one silently slipping
 * through.
 */
const SECTION_ROUTE: Array<[RegExp, RouteTarget]> = [
  [/^MASTER PROMPT/i, "drop"],
  [/^PREAMBLE$/, 1],
  [/^ROLE$/i, 1],
  [/^COMMERCIAL FRAMING/i, 1],
  [/^ASSET CONTEXT/i, 1],
  [/^CREATIVE & RENDER CONSTRAINTS/i, 1],
  [/^ATTACHED REFERENCE ROLES/i, 2],
  [/^LOCKED CLIENT INTENT/i, 2],
  [/^REFERENCE ADAPTATION RULES/i, 2],
  [/^THE SCENE/i, 3],
  [/^VISUAL TRANSLATION/i, 3],
  [/^CREATIVE DIRECTION/i, 3],
  [/^RESOLVED ART DIRECTION/i, 4],
  [/^EXCLUSIONS?$/i, 7],
  // The copy's own list. BLOCK 8's T1 is the only place a string is written out.
  [/^CONTENT MESSAGE/i, "drop"],
  [/^FINAL OUTPUT/i, 1],
  [/^CONFLICT PRIORITY/i, 1],
  [/^OUTPUT CONTEXT/i, 1],
  [/^PRODUCT INSTANCE REQUIREMENTS/i, 2],
  [/^REFERENCE SEMANTICS/i, 2],
  [/^USER HARD REQUIREMENTS/i, 2],
  [/^INSPIRATION REFERENCE/i, 2],
  [/^PRODUCT TRUTH/i, 2],
  [/^CREATIVE INTENT/i, 3],
  [/^CAMPAIGN STRATEGY/i, 3],
  [/^CREATIVE EXECUTION/i, 3],
  [/^AUDIENCE/i, 3],
  [/^THE STORY/i, 3],
  [/^CREATIVE CONCEPT/i, 3],
  [/^CREATIVE BLUEPRINT/i, 3],
  [/^COMMERCIAL LAYOUT/i, 3],
  [/^THE COMPOSITION/i, 3],
  [/^ART DIRECTION/i, 4],
  [/^PHOTOGRAPHY DIRECTION/i, 5],
  [/^BRAND POSITIONING/i, 7],
  [/^BRAND EXPRESSION/i, 7],
  [/KNOWLEDGE/i, 7],
  // Superseded by BLOCK 8. Dropped, not re-ordered.
  [/TYPOGRAPH/i, "drop"],
  [/^LAYOUT DIRECTION/i, "drop"],
  [/^TEXT IN THE IMAGE/i, "drop"],
  [/^READABLE COPY/i, "drop"],
];

/** A heading and the lines under it. */
export interface NamedSection {
  heading: string;
  body: string;
}

const HEADING_PATTERNS: RegExp[] = [
  /^#{1,3}\s+(.+?)\s*$/,
  /^\[([A-Z][^\]]{4,})\]\s*$/,
  /^([A-Z][-A-Z0-9 &'/()–—]{5,}):\s*$/,
  /^([A-Z][-A-Z0-9 &'/()–—]{5,})\s*$/,
];

function headingOf(line: string): string | null {
  for (const re of HEADING_PATTERNS) {
    const m = re.exec(line);
    if (m) return m[1].replace(/[:\s]+$/, "").trim();
  }
  return null;
}

/**
 * Splits assembled prompt text into named sections.
 *
 * Text before the first heading is kept under the heading `PREAMBLE` rather than
 * discarded: a preamble is usually the template's own framing, and losing it
 * silently would be a content change disguised as a refactor.
 */
export function splitNamedSections(text: string): NamedSection[] {
  const out: NamedSection[] = [];
  let heading = "PREAMBLE";
  let body: string[] = [];
  const flush = () => {
    const joined = body.join("\n").trim();
    if (joined) out.push({ heading, body: joined });
    body = [];
  };
  for (const line of String(text || "").split(/\r?\n/)) {
    const next = headingOf(line);
    if (next) {
      flush();
      heading = next;
      continue;
    }
    body.push(line);
  }
  flush();
  return out;
}

/**
 * Markup and stale ordering rules the eight-block script has no use for.
 *
 * Three kinds of residue, each measured on a real stored prompt:
 *
 *   - an HTML comment carrying the template's own id and version;
 *   - fenced code blocks, a markdown convention a renderer reads as characters;
 *   - the template's "sections appear in priority order, earlier ones carry more
 *     authority" rule, which is now false. BLOCK 8 is LAST and must win about
 *     type, so a sentence inherited from the 27-section order would invert
 *     exactly the thing the block order is built to settle.
 */
const RESIDUE: Array<[RegExp, string]> = [
  [/<!--[\s\S]*?-->/g, ""],
  [/^\s*```.*$/gm, ""],
  [/^.*\b(?:sections appear in priority order|earlier sections carry more authority)\b.*$/gim, ""],
];

/** Routed text with the residue removed and its blank lines collapsed. */
export function sanitizeRouted(text: string): string {
  let out = String(text || "");
  for (const [re, to] of RESIDUE) out = out.replace(re, to);
  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The EXCLUSIONS list out of an art-direction section, when it has one. */
function exclusionsOf(body: string): string {
  const lines = String(body || "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^EXCLUSIONS?:/i.test(l.trim()));
  return start < 0 ? "" : lines.slice(start).join("\n").trim();
}

/**
 * A line whose LABEL is a typographic role. `HEADLINE: x 6%, y 7%...` is a copy
 * zone, and BLOCK 8 states the copy zone once, from the composition artifact.
 */
const TYPOGRAPHIC_LABEL =
  /^\s*[-*\u2022]?\s*(headline|sub-?headline|subhead|cta|copy|typography|readability|text)\b\s*[:\u2014-]/i;

/** A sentence about setting type. */
const TYPOGRAPHIC_SENTENCE =
  /\b(typograph|headline|sub-?head|lettering|letterform|wordmark|display type|readab|the copy|copy strings)/i;

/**
 * Words that make a line about the FRAME or the PRODUCT even though it mentions
 * text in passing. The safe margin is the clearest case: "keep all meaningful
 * content, product edges and any text at least 6% in from every edge" is a frame
 * rule, and dropping it for the word "text" would delete a render constraint
 * nothing else states.
 */
const FRAME_OR_PRODUCT = /\b(margin|edge|edges|frame|canvas|silhouette|product)\b/i;

/** True for a line that introduces a list and says nothing on its own. */
const LIST_HEADER = /[:\u2014]\s*$/;

/**
 * A layout section with its typographic lines removed.
 *
 * `COMMERCIAL LAYOUT PLAN` carries two different things: the format, the safe
 * margin, the attention budget, the eye flow and the product's own zone -- which
 * are composition, and nothing else states them -- and the copy zones plus a
 * paragraph on how type should be set, which is BLOCK 8's. Deleting the section
 * whole would throw away the first to be rid of the second, so the cut is per
 * line, and a list header left with no list is cut after it.
 */
export function stripTypographicLines(body: string): string {
  const kept = String(body || "")
    .split(/\r?\n/)
    .filter((line) => {
      if (TYPOGRAPHIC_LABEL.test(line)) return false;
      if (TYPOGRAPHIC_SENTENCE.test(line) && !FRAME_OR_PRODUCT.test(line)) return false;
      return true;
    });
  // A header whose whole list went with the copy zones is noise, and a renderer
  // reading "RESERVED ZONES:" followed by nothing has been told to reserve
  // nothing in particular.
  const out: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i];
    if (LIST_HEADER.test(line.trim())) {
      const next = kept.slice(i + 1).find((l) => l.trim());
      if (!next || LIST_HEADER.test(next.trim())) continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface PlanBlocks {
  subject: string;
  light: string;
  lens: string;
  environment: string;
}

/** A plan field as one line, or nothing when the plan had nothing to say. */
function field(label: string, value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? `- ${label}: ${v}` : "";
}

/** What `blocksFromCompositionPlan` reads. A structural subset of `CompositionPlan`. */
export interface PlanShape {
  hero_subject?: { value?: string };
  product_role?: { value?: string };
  product_position?: { value?: { x: number; y: number; width: number; height: number; label?: string } };
  product_scale?: { value?: { share?: number; label?: string } };
  negative_space?: { value?: { share?: number; purpose?: string } };
  storytelling_intent?: { value?: string };
  camera_angle?: { value?: string };
  camera_distance?: { value?: string };
  camera_lens_behavior?: { value?: string };
  lighting_direction?: { value?: string };
  lighting_quality?: { value?: string };
  atmosphere?: { value?: string };
  environment?: { value?: string };
  foreground_background_relationship?: { value?: string };
  depth_structure?: Array<{ plane?: string; holds?: string }>;
  supporting_elements?: Array<{ element?: string; purpose?: string }>;
  visual_hierarchy?: Array<{ element?: string; rank?: number }>;
  typography_zone?: { value?: ReservedZone };
}

/**
 * Blocks 3, 4, 5 and 6 from the composition artifact.
 *
 * The artifact is read rather than its rendered prose re-used: `CompositionPlan`
 * holds camera, light and environment as separate fields, and separate fields are
 * what four separate blocks need. This is also why the compiled ART DIRECTION
 * section is dropped when a plan exists -- the same decisions stated twice is the
 * defect this architecture exists to end.
 */
export function blocksFromCompositionPlan(plan: PlanShape): PlanBlocks {
  const pos = plan.product_position?.value;
  const share = plan.product_scale?.value?.share;
  const subject = [
    field("what the frame is of", plan.hero_subject?.value),
    field("the product's role", plan.product_role?.value),
    pos
      ? `- where the product sits: ${Math.round(pos.x)}%, ${Math.round(pos.y)}% from the frame's top-left corner, ${Math.round(
          pos.width,
        )}% wide and ${Math.round(pos.height)}% tall${pos.label ? ` — ${pos.label}` : ""}`
      : "",
    typeof share === "number"
      ? `- how much of the frame it fills: about ${Math.round(share * 100)}%${
          plan.product_scale?.value?.label ? ` — ${plan.product_scale.value.label}` : ""
        }`
      : "",
    field("what the story is", plan.storytelling_intent?.value),
    plan.negative_space?.value?.purpose
      ? `- what the empty part of the frame is for: ${plan.negative_space.value.purpose}`
      : "",
    ...(plan.visual_hierarchy || [])
      .filter((h) => h?.element)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((h, i) => `- read ${i + 1}: ${h.element}`),
  ]
    .filter(Boolean)
    .join("\n");

  const light = [
    field("direction", plan.lighting_direction?.value),
    field("quality", plan.lighting_quality?.value),
    field("atmosphere", plan.atmosphere?.value),
  ]
    .filter(Boolean)
    .join("\n");

  const lens = [
    field("angle", plan.camera_angle?.value),
    field("distance", plan.camera_distance?.value),
    field("behaviour", plan.camera_lens_behavior?.value),
  ]
    .filter(Boolean)
    .join("\n");

  const environment = [
    field("the place", plan.environment?.value),
    field("foreground against background", plan.foreground_background_relationship?.value),
    ...(plan.depth_structure || []).filter((d) => d?.holds).map((d) => `- ${d.plane || "plane"}: ${d.holds}`),
    ...(plan.supporting_elements || [])
      .filter((e) => e?.element)
      .map((e) => `- supporting: ${e.element}${e.purpose ? ` — ${e.purpose}` : ""}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, light, lens, environment };
}

export interface RouteResult {
  sources: ScriptSources;
  /** Headings that reached a block, with the block they reached. */
  routed: Array<{ heading: string; block: number }>;
  /** Headings deliberately dropped because BLOCK 8 or the plan supersedes them. */
  dropped: string[];
  /** Headings no rule named. They go to BLOCK 3 and are reported so a rule can be added. */
  unrouted: string[];
}

export interface RouteInput {
  /** The analysis layer's assembled output: the compiled prompt, composed. */
  compiled: string;
  /** The ledgers, so every block but T1 refers to a string by code instead of quoting it. */
  ledgers: TextLedgers;
  /** The blueprint, where one was rendered. */
  blueprint?: string | null;
  /** The composition artifact. Where it exists it OWNS blocks 4-6. */
  plan?: PlanShape | null;
  /** The brand's own directive, minus anything typographic. */
  brand?: string | null;
}

/**
 * Sorts the analysis layer's output into the eight blocks.
 *
 * Deterministic, and reported: `dropped` and `unrouted` are what make this
 * auditable instead of lossy. A section nobody routed still reaches the renderer
 * -- under BLOCK 3 -- so adding a new analysis module can never silently delete
 * its output.
 */
export function routePromptSections(input: RouteInput): RouteResult {
  const bins: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const routed: RouteResult["routed"] = [];
  const dropped: string[] = [];
  const unrouted: string[] = [];
  const hasPlan = Boolean(input.plan);
  const ledgers = input.ledgers;

  const sections = [
    ...splitNamedSections(input.compiled),
    ...(input.blueprint ? splitNamedSections(input.blueprint) : []),
  ];

  for (const section of sections) {
    const rule = SECTION_ROUTE.find(([re]) => re.test(section.heading));
    const target: RouteTarget = rule ? rule[1] : 3;
    if (!rule) unrouted.push(section.heading);

    let body = section.body;

    // The composition artifact owns the camera, the light and the place. Where it
    // exists, every prose account of the same decisions is dropped -- except the
    // exclusions, which nothing else states.
    if (hasPlan && (target === 4 || target === 5 || target === 6)) {
      const keep = sanitizeRouted(redactLedgerStrings(exclusionsOf(body), ledgers));
      if (keep) {
        bins[7].push(keep);
        routed.push({ heading: `${section.heading} (exclusions only)`, block: 7 });
      } else {
        dropped.push(section.heading);
      }
      continue;
    }
    if (/^COMMERCIAL LAYOUT/i.test(section.heading)) body = stripTypographicLines(body);
    if (hasPlan && /^THE COMPOSITION/i.test(section.heading)) {
      dropped.push(section.heading);
      continue;
    }

    if (target === "drop" || !body.trim()) {
      dropped.push(section.heading);
      continue;
    }
    // Blocks 1-7 may REFER to the copy; only T1 may quote it.
    body = sanitizeRouted(redactLedgerStrings(body, ledgers));
    if (!body.trim()) {
      dropped.push(section.heading);
      continue;
    }
    bins[target].push(section.heading === "PREAMBLE" ? body : `${section.heading}\n${body}`);
    routed.push({ heading: section.heading, block: target });
  }

  if (input.plan) {
    const fromPlan = blocksFromCompositionPlan(input.plan);
    if (fromPlan.subject) bins[3].push(`THE FRAME, AS DECIDED\n${fromPlan.subject}`);
    if (fromPlan.light) bins[4].push(fromPlan.light);
    if (fromPlan.lens) bins[5].push(fromPlan.lens);
    if (fromPlan.environment) bins[6].push(fromPlan.environment);
  }
  const brand = sanitizeRouted(stripTypographicLines(input.brand || ""));
  if (brand) bins[7].push(brand);

  const join = (n: number) => bins[n].filter(Boolean).join("\n\n").trim() || null;
  return {
    sources: {
      outputContract: join(1),
      identityLock: join(2),
      subject: join(3),
      light: join(4),
      lens: join(5),
      environment: join(6),
      grade: join(7),
    },
    routed,
    dropped,
    unrouted,
  };
}

export interface OnePassInput extends TypographyBlockInput, RouteInput {}

export interface OnePassScript extends OpticalScript {
  route: RouteResult;
}

/**
 * The one call the pipeline makes: analysis output in, the eight-block script out.
 *
 * The reserved zone comes from the composition artifact when the caller did not
 * state one, because the artifact owns it.
 */
export function compileOnePassPrompt(input: OnePassInput): OnePassScript {
  const route = routePromptSections(input);
  const zone = input.zone ?? input.plan?.typography_zone?.value ?? null;
  const script = compileOpticalScript({ ...input, zone, sources: route.sources });
  return { ...script, route };
}
