import type { OpticalRequirements } from "./OpticalCompiler";

/**
 * The Cinematography Layer — the setup that produces the picture.
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured across the twelve-case benchmark: `optics` stated a physical parameter
 * in 2 cases of 12, `light` in 1, `surface` in 0. Not a single prompt carried a
 * focal length, an aperture, a key-to-fill ratio, a colour temperature, a source
 * size or a camera height in degrees. The system decided what the picture should
 * BE -- "warm, low-raking light from the side-rear" -- and left how to make it to
 * the renderer, which fills that gap with the average of its training data. The
 * average of advertising photography is the generic gloss the prompt's own ROLE
 * line forbids.
 *
 * This layer closes that gap, and nothing else in the system does.
 *
 * TWO STEPS, DELIBERATELY SEPARATE
 * --------------------------------
 *   1. RESOLVE  the brief's own words into six continuous optical axes.
 *   2. PROJECT  those axes onto physical parameters -- mm, f-stop, ratio, Kelvin,
 *               centimetres, degrees, percentages.
 *
 * Separate because they fail differently and are audited differently. A wrong
 * axis is a misread brief; a wrong projection is a misread of how light behaves.
 * Keeping them apart means a live render that comes back wrong can be traced to
 * one or the other instead of to "the prompt".
 *
 * WHY AXES AND NOT PRESETS
 * ------------------------
 * A preset list ("editorial", "clinical", "kinetic") is a category label, and a
 * category label is what the measurement says this prompt has too much of. Axes
 * compose: a brief can be still AND warm AND grave, which is one specific morning
 * and not the average of three styles. The resolver idiom -- signed pulls summed
 * over regex readings, divided by a soft constant, clamped -- is the one
 * `TypographyDNA` already proved on this engine, including its `VOTE` constant.
 *
 * OWNERSHIP
 * ---------
 * `TOPIC_OWNER` moved `camera`, `lighting` and `scene_environment` here. That is a
 * real transfer and it is justified by the measurement above: `CompositionPlan`
 * writes those topics as prose and its prose produced a parameter in at most 1
 * case of 12. The plan keeps what it is good at -- the staging, the product's
 * position and share, the reserved copy zone, all L3 on 12 of 12 -- and its prose
 * about light and camera becomes EVIDENCE here instead of instruction there.
 *
 * HONESTY ABOUT THE NUMBERS
 * -------------------------
 * Every coefficient below is REASONED from how light and lenses behave, not fitted
 * to this provider. Whether Nano Banana 2 renders "key:fill 5:1 at 3200K" more
 * faithfully than "warm side light" is UNVERIFIED -- the live comparison was taken
 * out of scope. The whole table is therefore written to be falsified cheaply: one
 * place, one coefficient each, and `because` records what produced every value.
 *
 * Pure. No model call, no I/O, no clock.
 */

// ── the six axes ─────────────────────────────────────────────────────────────

export const OPTICAL_AXES = ["stillness", "austerity", "intimacy", "warmth", "gravity", "theatricality"] as const;
export type OpticalAxis = (typeof OPTICAL_AXES)[number];

/**
 * Where this brief sits on each axis, 0-1.
 *
 * Named `optical_axes` and never `axes`: `TypographyDNA.TREATMENT_AXES` is a
 * different six, about letterform surfaces, and this engine has already paid once
 * for a name collision it could not undo.
 */
export type OpticalAxisValues = Record<OpticalAxis, number>;

export interface AxisEvidence {
  axis: OpticalAxis;
  /** The phrase that moved it. */
  phrase: string;
  /** The named quality that phrase belongs to. */
  quality: string;
  /** Signed contribution after weighting. */
  pull: number;
}

export interface OpticalAxesResult {
  values: OpticalAxisValues;
  /** Evidence weight behind each axis before the divisor. Low means "default", not "balanced". */
  strength: Record<OpticalAxis, number>;
  /** 0-1. Under 0.25 the axis is sitting at its default and decided nothing. */
  confidence: Record<OpticalAxis, number>;
  evidence: AxisEvidence[];
  because: Record<string, string>;
  /** Axes a pairwise conflict clamped, with the argument that was had. */
  reconciled: string[];
}

interface Quality {
  name: string;
  when: RegExp;
  /** Signed pulls, per unit of evidence. */
  pull: Partial<Record<OpticalAxis, number>>;
}

/**
 * What a brief can be about, and which way each thing pushes the optics.
 *
 * The trigger vocabulary is taken from the briefs this engine actually renders --
 * the twelve-case dataset's own `emphasis` strings and the brand language beside
 * them -- rather than invented, so the table covers the real corpus on the day it
 * ships instead of covering an imagined one.
 */
const QUALITIES: Quality[] = [
  {
    name: "still ritual",
    when: /\b(quiet|calm|stillness|unhurried|slow|mindful|ritual|pause|serene|contemplat)\b/i,
    pull: { stillness: 1.0, austerity: 0.2, intimacy: 0.3, gravity: 0.2, theatricality: -0.3 },
  },
  {
    name: "motion",
    when: /\b(motion|splash|dynamic|burst|energetic|pour|flow|movement|action|kinetic)\b/i,
    pull: { stillness: -1.0, austerity: -0.2, gravity: -0.2, theatricality: 0.5 },
  },
  {
    name: "restraint",
    when: /\b(negative space|clean composition|colour discipline|color discipline|minimal|uncluttered|restrained|sparse|reduction)\b/i,
    pull: { stillness: 0.3, austerity: 1.0, intimacy: -0.2, warmth: -0.2, gravity: 0.2, theatricality: -0.4 },
  },
  {
    name: "appetite",
    when: /\b(appetite|ingredient|indulgen|rich|abundan|juicy|fresh|freshness|baked|flavour|flavor)\b/i,
    pull: { stillness: -0.2, austerity: -0.8, intimacy: 0.3, warmth: 0.6, theatricality: 0.2 },
  },
  {
    name: "luxury",
    when: /\b(luxur|premium design|elegance|elegant|refined|couture|precious|exquisite)\b/i,
    pull: { stillness: 0.3, austerity: 0.6, intimacy: -0.2, warmth: -0.1, gravity: 0.5, theatricality: 0.3 },
  },
  {
    name: "lived-in",
    when: /\b(lifestyle|hands|home|morning|personal|everyday|routine|domestic|human)\b/i,
    pull: { austerity: -0.3, intimacy: 1.0, warmth: 0.4, gravity: -0.2 },
  },
  {
    name: "clinical trust",
    when: /\b(clarity|trust|packaging importance|brand communication|hygien|efficacy|clinical|proof|evidence|safe)\b/i,
    pull: { stillness: 0.2, austerity: 0.5, intimacy: -0.3, warmth: -0.5, gravity: 0.2, theatricality: -0.6 },
  },
  {
    name: "material craft",
    when: /\b(material honesty|material quality|texture|artisan|tactile|crafted|handmade|grain of|woven)\b/i,
    pull: { austerity: 0.2, intimacy: 0.5, warmth: 0.3, gravity: 0.2, theatricality: -0.2 },
  },
  {
    name: "warmth",
    when: /\b(warm|warmth|golden|amber|cosy|cozy|sunlit|glow|honey)\b/i,
    pull: { austerity: -0.2, intimacy: 0.3, warmth: 1.0 },
  },
  {
    name: "engineered cool",
    when: /\b(innovation|tech|technolog|future|precision|engineered|digital|lab|performance)\b/i,
    pull: { stillness: 0.2, austerity: 0.4, intimacy: -0.2, warmth: -0.8, gravity: 0.2, theatricality: 0.2 },
  },
  {
    name: "editorial drama",
    when: /\b(emotional impact|editorial|statement|cinematic|bold|striking|dramatic|theatre|theater)\b/i,
    pull: { stillness: -0.2, gravity: 0.4, theatricality: 1.0 },
  },
  {
    name: "mass and authority",
    when: /\b(heritage|architectural|tectonic|monolith|weight|stone|authority|monument|institution)\b/i,
    pull: { stillness: 0.4, austerity: 0.3, intimacy: -0.2, warmth: -0.2, gravity: 1.0, theatricality: 0.2 },
  },
  {
    name: "play",
    when: /\b(playful|fun|pop|cheeky|bright|joy|humour|humor|colourful|colorful)\b/i,
    pull: { stillness: -0.4, austerity: -0.4, intimacy: 0.2, warmth: 0.3, gravity: -0.7, theatricality: 0.6 },
  },
  {
    name: "product first",
    when: /\b(product hero|product focus|product identity|packshot|packaging|label|unmistakab)\b/i,
    pull: { stillness: 0.2, austerity: 0.3, theatricality: -0.3 },
  },
  {
    name: "atmosphere and story",
    when: /\b(mood|storytelling|atmosphere|narrative|story|feeling|evocative)\b/i,
    pull: { austerity: -0.2, intimacy: 0.3, gravity: 0.2, theatricality: 0.5 },
  },
];

/** Where a format starts before any evidence moves it. */
const BASE_BY_FORMAT: Record<string, OpticalAxisValues> = {
  poster: { stillness: 0.45, austerity: 0.4, intimacy: 0.3, warmth: 0.4, gravity: 0.5, theatricality: 0.4 },
  social: { stillness: 0.35, austerity: 0.35, intimacy: 0.45, warmth: 0.45, gravity: 0.35, theatricality: 0.45 },
  banner: { stillness: 0.4, austerity: 0.5, intimacy: 0.25, warmth: 0.4, gravity: 0.4, theatricality: 0.3 },
  hero: { stillness: 0.6, austerity: 0.6, intimacy: 0.2, warmth: 0.35, gravity: 0.45, theatricality: 0.15 },
};

/**
 * The divisor on evidence strength.
 *
 * 1.6, the constant `TypographyDNA` resolved its own axes with. Dividing rather
 * than normalising to the strongest reading is what lets a brief that says one
 * thing weakly produce a weak setup instead of a full-strength one by default.
 */
const VOTE = 1.6;
/**
 * Ceiling on one quality's evidence.
 *
 * 1.4 rather than 2.0, measured on the twelve-case dataset: at 2.0 a single
 * quality mentioned in the emphasis, the category and the concept contributed
 * 1.25 to an axis, which saturated it to 1.00 on its own. An axis pinned at its
 * extreme by one idea stops being a continuous reading, and a saturated axis
 * produces an extreme setup -- every brief came back at 5:1 or harder. Two
 * different qualities can still saturate an axis between them, which is the case
 * where saturation is the right answer.
 */
const QUALITY_CAP = 1.4;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AxesInput {
  /** `AssetContext.asset_type` or the use case. Decides the base. */
  assetType?: string | null;
  /** What the client said matters, in their order. The first carries most weight. */
  emphasis?: string[] | null;
  /** The brand's personality and emotional territory. */
  brand?: (string | null | undefined)[];
  /** Decided prose: the concept, the plan's atmosphere, light quality, environment. */
  evidence?: (string | null | undefined)[];
  /** What the brief refuses. Read as negative evidence. */
  exclusions?: string[] | null;
  /** Axes the user set directly. A pinned axis is never moved by evidence or reconciliation. */
  pins?: Partial<OpticalAxisValues> | null;
}

/** Which family of base values this asset starts from. */
export function formatFamily(assetType: string): keyof typeof BASE_BY_FORMAT {
  const a = assetType.toLowerCase();
  if (/banner|display|leaderboard|skyscraper/.test(a)) return "banner";
  if (/packshot|product hero|hero|catalogue|catalog|ecommerce|e-commerce/.test(a)) return "hero";
  if (/social|instagram|facebook|feed|story|reel/.test(a)) return "social";
  return "poster";
}

/** Sources of evidence, and what a mention in each is worth. */
const SOURCE_WEIGHT = { emphasis_first: 1.0, emphasis_second: 0.75, emphasis_rest: 0.55, brand: 0.8, prose: 0.6, exclusion: -1.0 };

/**
 * Resolves the axes from the brief's own words.
 *
 * Reconciliation is pairwise, not a single dominance rule: unlike letterform
 * treatments, two optical axes at full strength are usually a coherent picture --
 * still AND warm is a quiet morning. Only the four pairs below actually demand
 * opposite physical parameters, and only those are clamped.
 */
export function resolveOpticalAxes(input: AxesInput): OpticalAxesResult {
  const family = formatFamily(clean(input.assetType) || "poster");
  const base = BASE_BY_FORMAT[family];

  const readings: Array<{ text: string; weight: number }> = [];
  (input.emphasis || []).forEach((e, i) => {
    const text = clean(e);
    if (text) readings.push({ text, weight: i === 0 ? SOURCE_WEIGHT.emphasis_first : i === 1 ? SOURCE_WEIGHT.emphasis_second : SOURCE_WEIGHT.emphasis_rest });
  });
  for (const b of input.brand || []) {
    const text = clean(b);
    if (text) readings.push({ text, weight: SOURCE_WEIGHT.brand });
  }
  for (const p of input.evidence || []) {
    const text = clean(p);
    if (text) readings.push({ text, weight: SOURCE_WEIGHT.prose });
  }
  for (const x of input.exclusions || []) {
    const text = clean(x);
    if (text) readings.push({ text, weight: SOURCE_WEIGHT.exclusion });
  }

  const evidence: AxisEvidence[] = [];
  const sum: Record<OpticalAxis, number> = { stillness: 0, austerity: 0, intimacy: 0, warmth: 0, gravity: 0, theatricality: 0 };
  const strength: Record<OpticalAxis, number> = { stillness: 0, austerity: 0, intimacy: 0, warmth: 0, gravity: 0, theatricality: 0 };

  for (const quality of QUALITIES) {
    let weight = 0;
    const phrases: string[] = [];
    for (const reading of readings) {
      const hits = reading.text.match(new RegExp(quality.when.source, "gi"));
      if (!hits) continue;
      weight += reading.weight;
      for (const h of hits) if (phrases.length < 3) phrases.push(h.toLowerCase());
    }
    if (!weight) continue;
    const capped = clamp(weight, -QUALITY_CAP, QUALITY_CAP);
    for (const axis of OPTICAL_AXES) {
      const pull = quality.pull[axis];
      if (!pull) continue;
      const contribution = (pull * capped) / VOTE;
      sum[axis] += contribution;
      strength[axis] += Math.abs(capped * pull);
      evidence.push({ axis, phrase: phrases.join(", "), quality: quality.name, pull: round1(contribution * 100) / 100 });
    }
  }

  const values = {} as OpticalAxisValues;
  const confidence = {} as Record<OpticalAxis, number>;
  for (const axis of OPTICAL_AXES) {
    values[axis] = clamp01(base[axis] + sum[axis]);
    confidence[axis] = Math.round(Math.min(1, strength[axis] / 1.2) * 100) / 100;
  }

  const because: Record<string, string> = {
    base: `a ${family} starts at ${OPTICAL_AXES.map((a) => `${a} ${base[a].toFixed(2)}`).join(", ")}`,
  };
  for (const axis of OPTICAL_AXES) {
    const own = evidence.filter((e) => e.axis === axis);
    because[axis] = own.length
      ? `${values[axis].toFixed(2)} from ${[...new Set(own.map((e) => e.quality))].join(" + ")} (${[...new Set(own.flatMap((e) => e.phrase.split(", ")))].slice(0, 4).join(", ")})`
      : `${values[axis].toFixed(2)} — the ${family} default; nothing in the brief argued about it`;
  }

  // Pins last, so a user's own value is never a starting point something else moved.
  const pinned = new Set<OpticalAxis>();
  for (const [axis, value] of Object.entries(input.pins || {}) as Array<[OpticalAxis, number | undefined]>) {
    if (typeof value !== "number" || !OPTICAL_AXES.includes(axis)) continue;
    values[axis] = clamp01(value);
    confidence[axis] = 1;
    pinned.add(axis);
    because[axis] = `${values[axis].toFixed(2)} — set directly; evidence was not allowed to move it`;
  }

  const reconciled = reconcile(values, strength, pinned, because);
  return { values, strength, confidence, evidence, because, reconciled };
}

/**
 * The four pairs that cannot both be satisfied, and how each is settled.
 *
 * Each pair names a single physical parameter they fight over. A pair that fights
 * over nothing physical is not a conflict, however opposed the words sound.
 */
const CONFLICTS: Array<{ a: OpticalAxis; b: OpticalAxis; over: string; settle: string }> = [
  { a: "austerity", b: "theatricality", over: "how many elements the frame may hold", settle: "one wants an empty frame and the other wants staging" },
  { a: "intimacy", b: "gravity", over: "camera height", settle: "closeness wants eye level or above, authority wants level or below" },
  { a: "stillness", b: "theatricality", over: "movement in the frame", settle: "stillness keeps the movement and theatricality is paid in contrast instead" },
  { a: "austerity", b: "warmth", over: "how much colour the frame carries", settle: "restraint wants neutrals, warmth wants hue" },
];

const CONFLICT_FLOOR = 0.65;
const CLAMPED_TO = 0.45;

function reconcile(
  values: OpticalAxisValues,
  strength: Record<OpticalAxis, number>,
  pinned: Set<OpticalAxis>,
  because: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const c of CONFLICTS) {
    if (values[c.a] < CONFLICT_FLOOR || values[c.b] < CONFLICT_FLOOR) continue;
    const loser = strength[c.a] >= strength[c.b] ? c.b : c.a;
    const winner = loser === c.a ? c.b : c.a;
    if (pinned.has(loser)) {
      out.push(`${c.a} and ${c.b} both high over ${c.over}; ${loser} is pinned, so nothing was clamped and the setup will favour it`);
      continue;
    }
    const was = values[loser];
    values[loser] = Math.min(values[loser], CLAMPED_TO);
    out.push(`${c.over}: ${winner} ${values[winner].toFixed(2)} beat ${loser} ${was.toFixed(2)} → ${values[loser].toFixed(2)} (${c.settle})`);
    because[loser] = `${because[loser]}; clamped to ${values[loser].toFixed(2)} because ${winner} won the argument over ${c.over}`;
  }
  return out;
}

// ── the setup the axes project onto ──────────────────────────────────────────

export interface LightSetup {
  /** Number of sources. More than one is a decision, not a default. */
  sources: number;
  /** Degrees above the product's centre. */
  key_elevation_deg: number;
  /** Degrees off the lens axis, camera-left. */
  key_azimuth_deg: number;
  /** Source width as a multiple of the product's own width. */
  source_size_ratio: number;
  /** Stops between key and fill, as the prompt states it: `5:1`. */
  key_fill_ratio: string;
  shadow_edge: "hard" | "medium" | "soft" | "gradient";
  /** Specular highlights allowed on the product. */
  specular_count: number;
  kelvin: number;
  /** Veiling haze as a percentage of frame contrast lost. 0 for clear air. */
  atmosphere_percent: number;
  contact_shadow: string;
}

export interface LensSetup {
  focal_mm: number;
  aperture_f: number;
  /** Degrees above (+) or below (-) the product's centre. */
  height_deg: number;
  distance_class: "macro" | "close" | "medium" | "wide";
  /** How much of the frame the product fills. */
  subject_share_pct: number;
  tilt_allowed: boolean;
  motion_cue: string;
}

export interface EnvironmentSetup {
  /** Target relative luminance of the staging surface, 0-1. */
  surface_luminance: number;
  backdrop: string;
  /** Tolerance of the backdrop's own evenness, in percent. */
  backdrop_tolerance_pct: number;
  prop_count_max: number;
  depth_layers: number;
  horizon: "low" | "middle" | "high" | "absent";
}

export interface SurfaceSetup {
  /** Gloss of the staging surface, percent. */
  staging_gloss_pct: number;
  /** Scale of the surface's own micro-texture, in millimetres. */
  micro_texture_mm: number;
  /** Width of a specular on the product, as a percent of its width. */
  specular_width_pct: number;
}

export interface CinematographySetup {
  axes: OpticalAxisValues;
  light: LightSetup;
  lens: LensSetup;
  environment: EnvironmentSetup;
  surface: SurfaceSetup;
  because: Record<string, string>;
  /** Parameters something else overrode, and why. */
  refused: string[];
}

export interface ProjectionContext {
  /**
   * The framing the director stated, where one exists. The axes only fill what
   * nobody decided: `distanceShare` already maps a stated framing to a share of
   * frame (macro 55, close 38, medium 20, wide 9) and that mapping wins.
   */
  distance_class?: LensSetup["distance_class"] | null;
  /** The product's share of frame, where the composition decided it (0-1). */
  product_share?: number | null;
  /** What BLOCK 8 needs of the camera when the model is drawing the type. */
  requires?: OpticalRequirements | null;
  /** True when there is copy to draw. */
  drawing_type?: boolean;
}

/** Nearest value in a set a renderer would recognise. */
const snap = (n: number, options: number[]) =>
  options.reduce((best, o) => (Math.abs(o - n) < Math.abs(best - n) ? o : best), options[0]);

const RATIOS = [1.5, 2, 3, 4, 5, 6, 8];
const FOCALS = [24, 35, 50, 85, 100, 135];
const APERTURES = [2, 2.8, 4, 5.6, 8, 11];

/**
 * Projects the axes onto the setup.
 *
 * Every line is one coefficient and one clamp, so a value that comes back wrong
 * from a live render can be corrected without touching anything else. The
 * `because` entry for each states the axis that drove it, which is what makes a
 * wrong number traceable to a wrong reading rather than to the whole layer.
 */
export function projectToSetup(axes: OpticalAxisValues, context: ProjectionContext = {}): CinematographySetup {
  const { stillness, austerity, intimacy, warmth, gravity, theatricality } = axes;
  const because: Record<string, string> = {};
  const refused: string[] = [];

  // ── light ────────────────────────────────────────────────────────────────
  const sources = stillness >= 0.6 ? 1 : stillness >= 0.35 ? 2 : 3;
  const key_elevation_deg = Math.round(20 + 30 * gravity);
  const key_azimuth_deg = Math.round(55 - 25 * intimacy);
  const source_size_ratio = round1(1 + 2.2 * stillness);
  // Contrast is theatricality's parameter. Gravity contributes -- weight wants a
  // dark side -- and austerity takes away, because a restrained frame is usually a
  // flat-lit one. The first version took `max(theatricality, gravity * 0.8)` and
  // every brief in the dataset came back at 5:1 or harder, including a detergent
  // trust brief whose whole argument is that nothing is being dramatised.
  const ratioTarget = 1.5 + 5 * theatricality + 1.5 * gravity - 1.5 * austerity;
  const ratioValue = snap(clamp(ratioTarget, 1.5, 8), RATIOS);
  const shadow_edge: LightSetup["shadow_edge"] =
    stillness >= 0.8 ? "gradient" : stillness >= 0.6 ? "soft" : stillness >= 0.35 ? "medium" : "hard";
  const specular_count = clamp(Math.round(3 - 3 * stillness + theatricality), 0, 3);
  const kelvin = Math.round((6500 - 3300 * warmth) / 100) * 100;
  const atmosphere_percent = Math.round(clamp(40 * theatricality - 20 * stillness, 0, 40));

  because.sources = `${sources} source(s): stillness ${stillness.toFixed(2)} — a still frame is lit by one thing, a busy one by several`;
  because.key_fill_ratio = `${ratioValue}:1 from theatricality ${theatricality.toFixed(2)} and gravity ${gravity.toFixed(2)}`;
  because.source_size_ratio = `${source_size_ratio}x the product's width: stillness ${stillness.toFixed(2)} decides how soft the shadow edge is allowed to be`;
  because.kelvin = `${kelvin}K from warmth ${warmth.toFixed(2)}`;

  const light: LightSetup = {
    sources,
    key_elevation_deg,
    key_azimuth_deg,
    source_size_ratio,
    key_fill_ratio: `${ratioValue}:1`,
    shadow_edge,
    specular_count,
    kelvin,
    atmosphere_percent,
    contact_shadow:
      gravity >= 0.6
        ? "dense and tight against the base, no light leaking under the product"
        : gravity >= 0.35
          ? "defined but not deep, holding the product on the surface"
          : "light and open, barely darker than the surface",
  };

  // ── lens ─────────────────────────────────────────────────────────────────
  const focalTarget = 60 + 50 * gravity + 30 * intimacy - 25 * (1 - stillness);
  let focal_mm = snap(focalTarget, FOCALS);
  // Both units accepted, for the reason stated in `OpticalCompiler.sharePercent`:
  // the composition stores this as a percentage and multiplying it by 100 again
  // produced `subject_share_pct` 3800 -- which also pushed `distance_class` to
  // `macro` on every brief, since its threshold is 45.
  const shareFromPlan =
    typeof context.product_share === "number"
      ? Math.round(context.product_share <= 1 ? context.product_share * 100 : context.product_share)
      : null;
  // The share the composition decided IS the framing, and it outranks the axes:
  // a product filling 38% of the frame is a close frame whatever the brief's own
  // intimacy reads. Only where nobody decided a share do the axes choose.
  const distance_class: LensSetup["distance_class"] =
    context.distance_class ||
    (shareFromPlan !== null
      ? shareFromPlan >= 45
        ? "macro"
        : shareFromPlan >= 32
          ? "close"
          : shareFromPlan >= 20
            ? "medium"
            : "wide"
      : intimacy >= 0.7
        ? "close"
        : intimacy >= 0.4
          ? "medium"
          : austerity >= 0.6
            ? "medium"
            : "wide");
  const subject_share_pct = shareFromPlan ?? Math.round(clamp(18 + 30 * intimacy + 8 * gravity, 15, 55));
  const height_deg = Math.round(20 - 30 * gravity);
  let aperture_f = snap(clamp(8 - 5 * theatricality + 2 * stillness, 2, 11), APERTURES);
  const tilt_allowed = stillness < 0.35 && theatricality >= 0.5;

  because.focal_mm = `${focal_mm}mm from gravity ${gravity.toFixed(2)}, intimacy ${intimacy.toFixed(2)}, stillness ${stillness.toFixed(2)}`;
  because.height_deg = `${height_deg}° from gravity ${gravity.toFixed(2)}: authority sits level or below, lightness looks down`;
  because.aperture_f = `f/${aperture_f} from theatricality ${theatricality.toFixed(2)} against stillness ${stillness.toFixed(2)}`;
  if (shareFromPlan !== null) {
    because.subject_share_pct = `${subject_share_pct}% — the composition decided the product's share, so the axes did not`;
  }

  // BLOCK 8's requirement, honoured here because this layer owns the camera.
  // Drawn letterforms have to be in the sharp plane or the strokes arrive as mush,
  // and that outranks a shallow depth of field the theatricality asked for.
  const floor = context.requires?.aperture_floor_f;
  if (context.drawing_type && typeof floor === "number" && aperture_f < floor) {
    refused.push(`f/${aperture_f} raised to f/${floor}: the frame carries drawn type, which has to sit in the sharp plane`);
    aperture_f = snap(floor, APERTURES);
  }
  // A long lens at a wide framing is a contradiction a renderer resolves by
  // ignoring one of them. The framing is the decision; the focal length follows.
  if (distance_class === "wide" && focal_mm > 50) {
    refused.push(`${focal_mm}mm shortened to 35mm: the framing is wide, and a long lens cannot deliver it`);
    focal_mm = 35;
  }

  const lens: LensSetup = {
    focal_mm,
    aperture_f,
    height_deg,
    distance_class,
    subject_share_pct,
    tilt_allowed,
    motion_cue:
      stillness >= 0.7
        ? "nothing in the frame is moving; the air is still"
        : stillness >= 0.4
          ? "no movement, but the scene looks recently touched"
          : "one element caught mid-movement, frozen sharp",
  };

  // ── environment ──────────────────────────────────────────────────────────
  const environment: EnvironmentSetup = {
    surface_luminance: Math.round(clamp(0.65 - 0.4 * gravity, 0.15, 0.75) * 100) / 100,
    backdrop:
      austerity >= 0.65
        ? "one uninterrupted plane, no join, no pattern, no second material"
        : austerity >= 0.4
          ? "a single material with a visible but quiet grain"
          : "a layered set with a second material behind the first",
    backdrop_tolerance_pct: Math.round(3 + 12 * (1 - austerity)),
    prop_count_max: clamp(Math.round(5 - 5 * austerity - 1.5 * stillness), 0, 5),
    depth_layers: clamp(1 + Math.round(2 * (1 - austerity) * (1.5 - stillness)), 1, 3),
    horizon: gravity >= 0.65 ? "low" : gravity >= 0.35 ? "middle" : "high",
  };
  because.prop_count_max = `at most ${environment.prop_count_max} prop(s): austerity ${austerity.toFixed(2)} and stillness ${stillness.toFixed(2)}`;
  because.surface_luminance = `surface at ${environment.surface_luminance}: gravity ${gravity.toFixed(2)} decides how much the ground weighs`;

  // ── surface ──────────────────────────────────────────────────────────────
  const surface: SurfaceSetup = {
    staging_gloss_pct: Math.round(clamp(15 + 45 * theatricality - 25 * austerity, 0, 70)),
    micro_texture_mm: round1(clamp(0.1 + 0.6 * (1 - austerity), 0.1, 0.7)),
    specular_width_pct: Math.round(clamp(4 + 8 * (1 - stillness), 2, 14)),
  };
  because.staging_gloss_pct = `${surface.staging_gloss_pct}% gloss: theatricality ${theatricality.toFixed(2)} against austerity ${austerity.toFixed(2)}`;

  return { axes, light, lens, environment, surface, because, refused };
}

// ── what the blocks say ──────────────────────────────────────────────────────

/** BLOCK 4. A lighting plot, in the terms a plot is written in. */
export function renderLightForPrompt(s: CinematographySetup | null | undefined): string {
  if (!s) return "";
  const l = s.light;
  const fill =
    l.sources === 1
      ? `No second source: the fill is bounce off the set itself, keeping the shadow side ${l.key_fill_ratio} down from the key.`
      : `${l.sources - 1} secondary source(s), each at least ${l.key_fill_ratio} below the key and none of them casting a second shadow of the product.`;
  return [
    `LIGHT — ${l.sources} source${l.sources === 1 ? "" : "s"} at ${l.kelvin}K.`,
    `Key: a source ${l.source_size_ratio}x the product's own width, ${l.key_elevation_deg} degrees above the product's centre and ${l.key_azimuth_deg} degrees camera-left of the lens axis. Key to fill ${l.key_fill_ratio}.`,
    fill,
    `Shadow: ${l.shadow_edge} edge. Contact shadow ${l.contact_shadow}.`,
    l.specular_count === 0
      ? "Speculars: none. No highlight on the product competes with its form."
      : `Speculars: at most ${l.specular_count} on the product, each one reading as the same source reflected.`,
    l.atmosphere_percent === 0
      ? "Air: clear. No haze, no atmospheric veiling, no light shafts."
      : `Air: haze costing about ${l.atmosphere_percent}% of the frame's contrast, thickest away from the product.`,
  ].join("\n");
}

/** BLOCK 5. A shot spec. */
export function renderLensForPrompt(s: CinematographySetup | null | undefined): string {
  if (!s) return "";
  const n = s.lens;
  const height =
    n.height_deg > 3
      ? `${Math.abs(n.height_deg)} degrees above the product's centre, looking slightly down`
      : n.height_deg < -3
        ? `${Math.abs(n.height_deg)} degrees below the product's centre, looking slightly up`
        : "level with the product's centre";
  return [
    `LENS — ${n.focal_mm}mm at f/${n.aperture_f}, ${n.distance_class} framing.`,
    `Camera: ${height}. ${n.tilt_allowed ? "A slight tilt is allowed." : "No tilt; the vertical edges of the frame stay vertical."}`,
    `The product fills about ${n.subject_share_pct}% of the frame and sits wholly inside it, never cropped.`,
    `Depth of field at f/${n.aperture_f} holds the product's full depth sharp; everything behind it falls away without becoming an abstraction.`,
    `Movement: ${n.motion_cue}.`,
  ].join("\n");
}

/** BLOCK 6. The set. */
export function renderEnvironmentForPrompt(s: CinematographySetup | null | undefined): string {
  if (!s) return "";
  const e = s.environment;
  return [
    `ENVIRONMENT — ${e.backdrop}.`,
    `The staging surface reads at about ${Math.round(e.surface_luminance * 100)}% luminance; the backdrop stays even within ${e.backdrop_tolerance_pct}% across its whole area.`,
    e.prop_count_max === 0
      ? "Props: none. Nothing in the frame but the product and the surface it stands on."
      : `Props: at most ${e.prop_count_max}${e.prop_count_max === 1 ? ", which has to earn its place and must not touch the product" : ", each one earning its place and none of them touching the product"}.`,
    `Depth: ${e.depth_layers} plane${e.depth_layers === 1 ? "" : "s"}. Horizon ${e.horizon}.`,
  ].join("\n");
}

/** BLOCK 7, beside the finish. How the surfaces behave. */
export function renderSurfaceForPrompt(s: CinematographySetup | null | undefined): string {
  if (!s) return "";
  const f = s.surface;
  return [
    `SURFACES — the staging surface is ${f.staging_gloss_pct}% gloss; the rest of the set is matte.`,
    `Its own micro-texture reads at about ${f.micro_texture_mm}mm, visible where the light rakes across it and nowhere else.`,
    `A specular on the product is no wider than ${f.specular_width_pct}% of the product's width, and the product's material keeps its true roughness rather than being polished to read as new.`,
  ].join("\n");
}

/** Counts and values only. Never the client's copy. */
export function cinematographyTelemetry(s: CinematographySetup | null | undefined) {
  if (!s) return { cinematography: false };
  return {
    cinematography: true,
    axes: OPTICAL_AXES.map((a) => `${a} ${s.axes[a].toFixed(2)}`),
    light: `${s.light.sources}x ${s.light.kelvin}K ${s.light.key_fill_ratio} ${s.light.shadow_edge} elev${s.light.key_elevation_deg} az${s.light.key_azimuth_deg} size${s.light.source_size_ratio}`,
    lens: `${s.lens.focal_mm}mm f/${s.lens.aperture_f} ${s.lens.height_deg}deg ${s.lens.distance_class} ${s.lens.subject_share_pct}%`,
    environment: `lum${s.environment.surface_luminance} props${s.environment.prop_count_max} layers${s.environment.depth_layers} ${s.environment.horizon}`,
    surface: `gloss${s.surface.staging_gloss_pct}% texture${s.surface.micro_texture_mm}mm spec${s.surface.specular_width_pct}%`,
    refused: s.refused,
  };
}
