import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { AssetContext } from "./AssetContext";
import type { BrandKit } from "./BrandKit";
import type { CompositionPlan } from "./CompositionPlan";
import type { TextLine, TextRole, TypographySystem } from "./TypographySystem";
import type { LayoutGeometry } from "./LayoutGeometry";
import { wantsGenerousSpace } from "./BrandKit";

/**
 * The Typography Plan — typography as a creative decision, made before the
 * picture exists.
 *
 * WHY THIS LAYER EXISTS
 * ---------------------
 * `TypographySystem` answers "how should these words be SET" — class, weight,
 * tracking, colour. It answers it well. What nothing answered was the question
 * that has to come FIRST: how much of the frame does this copy need, how many
 * lines will it run to, and therefore what must the picture leave empty.
 *
 * Without that, the order of operations was: compose a picture, then discover
 * where the words fit. That is the definition of typography that looks pasted
 * on. The plan inverts it — the copy states its spatial requirement, the image
 * prompt is written to satisfy it, and the compositor places into space that
 * was reserved rather than space that happened to be left over.
 *
 * WHAT IT MAY AND MAY NOT DECIDE
 * ------------------------------
 * It may decide everything about TREATMENT and SPACE. It may not decide a
 * single word: `content` is copied from the client's line and nothing in this
 * file writes, rewrites, shortens, translates or invents one. `text_mode` is
 * the requirement's own mode, so a brief with no copy produces a plan whose
 * only content is "there is no typography in this frame" — which is a real
 * instruction to the image model, not an absence of one.
 *
 * Deterministic, pure, no model call. Every field is derived from decisions
 * that already exist: the text requirement, the director's roles, the
 * blueprint's typographic voice, the format's information density, the brand.
 */

export type TextMode = "exact" | "none";

/** Where a block of type wants to sit, before the scene is known. */
export type Zone =
  | "upper-left"
  | "upper-center"
  | "upper-right"
  | "center-left"
  | "center"
  | "center-right"
  | "lower-left"
  | "lower-center"
  | "lower-right";

export type Alignment = "left" | "center" | "right";

/** One block of copy and the job it does. */
export interface PlannedBlock {
  /** The client's line, exactly. Never produced here. */
  content: string;
  /** What this line is for, in plain words. */
  role: string;
  /** 1 is read first. Drives relative size, and the order of placement. */
  hierarchy: number;
  /** The most visual lines this block may run to before it is too heavy. */
  max_lines: number;
  alignment: Alignment;
  preferred_zone: Zone;
  /** Size relative to the smallest block in the frame. Never a point size. */
  scale: number;
  /** Which TypographySystem spec this block corresponds to. */
  text_role: TextRole;
  because: string;
}

export interface PlanStyle {
  /** How the type should feel, in the director's own terms. */
  personality: string;
  /** What the letterforms must DO. Never a typeface name. */
  font_direction: string;
  /** How far apart the largest and smallest blocks sit. */
  contrast: string;
  /** How the blocks breathe. */
  spacing: string;
  /** Whether the copy is set as given, or set in caps. */
  capitalization: string;
}

/**
 * What the picture has to leave for the type.
 *
 * This is the half of the plan the IMAGE MODEL is told about. It carries no
 * words — only geometry and the instruction to keep it clean.
 */
export interface SpaceRequirement {
  /** Which third the product should occupy, so the copy has the other. */
  product_zone: "left" | "right" | "upper" | "lower" | "center";
  /** The region that must stay quiet, as percentages of the frame, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Share of the frame the copy needs, 0-1. */
  share: number;
  because: string;
}

export interface TypographyPlan {
  text_mode: TextMode;
  headline: PlannedBlock | null;
  subtitle: PlannedBlock | null;
  cta: PlannedBlock | null;
  /** Everything else the client supplied, in the order it was written. */
  supporting: PlannedBlock[];
  style: PlanStyle;
  /** What the picture must leave empty. Null when there is no copy. */
  space: SpaceRequirement | null;
  /** Every block, hierarchy order. The list the compositor walks. */
  blocks: PlannedBlock[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** Roughly how many characters fit on one line of a block at its scale. */
const CHARS_PER_LINE: Record<TextRole, number> = {
  headline: 22,
  subheadline: 34,
  body: 44,
  cta: 26,
};

/**
 * How many lines this string will want, bounded by what the role can carry.
 *
 * A headline is allowed two lines because a two-line headline is a normal
 * commercial headline; it is not allowed five, because five lines of display
 * type is a paragraph wearing a headline's weight. The bound is the point at
 * which the compositor should shrink rather than wrap further.
 */
function linesFor(role: TextRole, text: string, generous: boolean): number {
  const chars = [...text].length;
  const perLine = CHARS_PER_LINE[role] * (generous ? 0.85 : 1);
  const natural = Math.max(1, Math.ceil(chars / perLine));
  const ceiling = role === "headline" ? 3 : role === "cta" ? 1 : role === "subheadline" ? 2 : 3;
  return Math.min(natural, ceiling);
}

/** The zone a role wants, given where the copy column is. */
function zoneFor(role: TextRole, side: "left" | "right" | "center", wide: boolean): Zone {
  const h = side === "center" ? "center" : side;
  if (role === "cta") return h === "center" ? "lower-center" : (`lower-${h}` as Zone);
  if (role === "headline") {
    if (wide) return h === "center" ? "center" : (`center-${h}` as Zone);
    return h === "center" ? "upper-center" : (`upper-${h}` as Zone);
  }
  if (role === "subheadline") {
    if (wide) return h === "center" ? "center" : (`center-${h}` as Zone);
    return h === "center" ? "upper-center" : (`upper-${h}` as Zone);
  }
  return h === "center" ? "lower-center" : (`lower-${h}` as Zone);
}

const PURPOSE: Record<TextRole, string> = {
  headline: "hero headline",
  subheadline: "supporting copy",
  body: "supporting detail",
  cta: "action",
};

const HIERARCHY: Record<TextRole, number> = { headline: 1, subheadline: 2, body: 3, cta: 4 };

/** Scale relative to the smallest block. Wider spread where density is lower. */
function scaleFor(role: TextRole, sparse: boolean): number {
  const base: Record<TextRole, number> = { headline: sparse ? 3.2 : 2.4, subheadline: 1.6, cta: 1.3, body: 1 };
  return base[role];
}

/**
 * How the letterforms must behave, per personality. Copied in spirit from
 * `TypographySystem.LETTERFORMS` and stated in one sentence, because the plan
 * is read by the prompt and the compositor rather than by a type designer.
 */
const DIRECTION: Record<string, string> = {
  editorial: "high stroke contrast, generous letter spacing, the headline carrying the character",
  technical: "even unmodulated strokes, tight regular spacing, nothing decorative",
  crafted: "uneven hand-made weight, irregular spacing, closer to writing than typesetting",
  direct: "solid unmodulated strokes, normal spacing, readable at a glance",
  quiet: "light strokes that recede, open spacing, the words sitting quietly in their space",
  assertive: "heavy filled strokes, tight spacing, the words reading as one block of weight",
};

/**
 * Whether the copy should be set in caps.
 *
 * Caps is a TREATMENT, not a rewrite: the stored content stays exactly as the
 * client typed it and the renderer applies the transform, which is why
 * `checkRenderedText` reports a case difference as `case_styled` rather than as
 * a wrong line. A line the client already capitalised is left alone; Vietnamese
 * is never force-capped, because full-caps mangles the tone marks' vertical
 * space and this engine has measured that failure.
 */
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

function capitalizationFor(personality: string, lines: TextLine[]): string {
  if (lines.some((l) => VIETNAMESE.test(l.text))) {
    return "as supplied — Vietnamese diacritics and tone marks need their vertical space, so nothing is force-capped";
  }
  if (lines.some((l) => l.text === l.text.toUpperCase() && /\p{L}/u.test(l.text))) {
    return "as supplied — the client already set the case";
  }
  if (personality === "assertive" || personality === "direct") {
    return "the headline may be set in caps for weight; everything else as supplied";
  }
  return "as supplied — case is the client's and carries their tone";
}

/** The composition's reserved area, as the plan's own requirement. */
function spaceFromComposition(plan: CompositionPlan): SpaceRequirement {
  const z = plan.typography_zone.value;
  return {
    product_zone: z.product_zone,
    x: z.x,
    y: z.y,
    width: z.width,
    height: z.height,
    share: z.share,
    because: `${plan.typography_zone.because}. ${plan.negative_space.value.purpose}`,
  };
}

export interface TypographyPlanInput {
  /** The requirement's mode. "none" produces a plan with no blocks. */
  mode?: TextMode;
  /** The client's lines with their assigned roles. */
  lines?: TextLine[] | null;
  blueprint?: CreativeBlueprint | null;
  assetContext?: AssetContext | null;
  brandKit?: BrandKit | null;
  /** The geometry, when one was already built. Only its ratio and side are read. */
  geometry?: LayoutGeometry | null;
  /** The typography system, when one was already built. Its personality is reused. */
  typography?: TypographySystem | null;
  ratio?: string;
  /**
   * The composition, decided before this plan. Where it exists it OWNS the
   * reserved copy area, and this plan lays blocks into that area rather than
   * deciding a second one from the same geometry.
   */
  compositionPlan?: CompositionPlan | null;
}

/**
 * Builds the plan. Pure and total.
 *
 * With no lines it returns a `none` plan: every block null, `space` null, and a
 * style that still states the frame carries no typography. That is deliberately
 * not the same as returning null — "this image has no words" is a decision the
 * prompt has to transmit, and a null would transmit nothing.
 */
export function buildTypographyPlan(input: TypographyPlanInput): TypographyPlan {
  const lines = (input.lines || []).filter((l) => l && clean(l.text));
  const mode: TextMode = input.mode === "none" || !lines.length ? "none" : "exact";
  const ratio = clean(input.ratio) || clean(input.geometry?.ratio) || "1:1";
  const wide = ratio === "16:9";
  const generous = wantsGenerousSpace(input.brandKit);
  const density = clean(input.assetContext?.information_density);
  const sparse = /one idea|single|only|room/i.test(density);

  const personality =
    clean(input.typography?.personality?.value) ||
    clean(input.blueprint?.design?.typographic_voice?.value) ||
    "direct";
  const direction = DIRECTION[personality] || DIRECTION.direct;

  const style: PlanStyle = {
    personality,
    font_direction: direction,
    contrast:
      mode === "none"
        ? "no typography in this frame"
        : sparse
          ? "wide — the headline runs about three times the smallest line, so first read is unmistakable"
          : "clear — the headline runs about two and a half times the smallest line",
    spacing: generous
      ? "generous — every block gets more room than it strictly needs, because the brand asks for space"
      : "measured — blocks sit close enough to read as one statement, far enough not to touch",
    capitalization: capitalizationFor(personality, lines),
  };

  if (mode === "none") {
    return { text_mode: "none", headline: null, subtitle: null, cta: null, supporting: [], style, space: null, blocks: [] };
  }

  // Which side the copy column takes. The geometry already decided this from
  // the director's composition; the plan follows it rather than deciding again,
  // so the two can never disagree.
  const align = input.geometry?.decisions?.alignment;
  const side: "left" | "right" | "center" = align === "left" ? "left" : align === "right" ? "right" : wide ? "left" : "center";
  const alignment: Alignment = side === "center" ? "center" : side;

  const blocks: PlannedBlock[] = lines.map((line) => {
    const role = line.role;
    return {
      content: line.text,
      role: PURPOSE[role],
      hierarchy: HIERARCHY[role],
      max_lines: linesFor(role, line.text, generous),
      alignment,
      preferred_zone: zoneFor(role, side, wide),
      scale: scaleFor(role, sparse),
      text_role: role,
      because:
        role === "headline"
          ? "read first and carries the message on its own, so it takes the largest block and the first clear area"
          : role === "cta"
            ? "closes the reading path, so it sits last and stays on one line — a wrapped action reads as a sentence"
            : role === "subheadline"
              ? "completes the headline without competing with it, so it sits directly beneath and at a clearly smaller size"
              : "supplies the detail the headline left out, so it sits lowest and lightest",
    };
  });
  blocks.sort((a, b) => a.hierarchy - b.hierarchy);

  const first = (r: TextRole) => blocks.find((b) => b.text_role === r) || null;
  const supporting = blocks.filter((b) => b.text_role === "body");

  return {
    text_mode: "exact",
    headline: first("headline"),
    subtitle: first("subheadline"),
    cta: first("cta"),
    supporting,
    style,
    // Phase 5.6.5: the composition owns the reserved area. Typography reads
    // it and lays blocks into it; it computes one only when no composition
    // plan exists, which is a degraded render.
    space: input.compositionPlan?.typography_zone.from === "geometry"
      ? spaceFromComposition(input.compositionPlan)
      : spaceFor(blocks, side, wide, generous),
    blocks,
  };
}

/**
 * What the picture has to leave empty, in percentages of the frame.
 *
 * Derived from the blocks themselves: how many lines they run to and what
 * relative size they are. A one-line headline and a three-line headline are
 * different pictures, and until now the prompt could not tell them apart.
 */
/**
 * How much vertical room the copy needs, in units of "one line of the smallest
 * text". Exported because `CompositionPlan` OWNS the reserved area and has to
 * know the demand to size it; the arithmetic lives here, with the roles and
 * scales it is made of, so there is one definition of it rather than two.
 */
export function copyDemandUnits(blocks: Array<{ scale: number; max_lines: number }>): number {
  return blocks.reduce((n, b) => n + b.scale * b.max_lines * 1.35, 0);
}

/** The demand of a set of client lines, before any of them has been planned. */
export function demandForLines(lines: TextLine[], generous: boolean, sparse: boolean): number {
  return copyDemandUnits(
    lines.map((l) => ({ scale: scaleFor(l.role, sparse), max_lines: linesFor(l.role, l.text, generous) })),
  );
}

/**
 * The reserved area, computed the way `CompositionPlan` computes it.
 *
 * Phase 5.6.5 moved ownership of this decision to the composition, where the
 * product's position and the frame's negative space are decided, because two
 * modules deriving the same rectangle from the same inputs is a divergence
 * waiting for someone to change one of them. This remains only as the path for
 * a render with no composition plan -- a degraded run -- and the composition
 * imports the same arithmetic rather than restating it.
 */
export function spaceFor(
  blocks: Array<{ scale: number; max_lines: number; text_role?: TextRole }>,
  side: "left" | "right" | "center",
  wide: boolean,
  generous: boolean,
): SpaceRequirement {
  // Total vertical demand, in units of "one line of the smallest text".
  const units = copyDemandUnits(blocks);
  // One such unit is about 4.5% of the frame's height in a square, less in a
  // wide one where height is scarce and the copy column is taller than it is
  // broad.
  const perUnit = wide ? 5.5 : 4.5;
  const height = Math.min(wide ? 62 : 52, Math.max(16, Math.round(units * perUnit)));
  const width = side === "center" ? (generous ? 70 : 80) : wide ? 42 : 48;
  const x = side === "left" ? 4 : side === "right" ? 100 - width - 4 : 50 - width / 2;

  // Where the copy sits vertically decides where the product may not.
  const ctaLast = blocks.length > 1 && blocks[blocks.length - 1].text_role === "cta";
  const y = wide || side !== "center" ? Math.round((100 - height) / 2) : 6;

  const product_zone: SpaceRequirement["product_zone"] =
    side === "left" ? "right" : side === "right" ? "left" : height > 40 ? "lower" : "lower";

  return {
    product_zone,
    x: Math.round(x),
    y,
    width,
    height,
    share: Math.round(((width * height) / 10000) * 100) / 100,
    because: [
      `${blocks.length} block${blocks.length === 1 ? "" : "s"} of copy running to ${blocks.reduce((n, b) => n + b.max_lines, 0)} line${blocks.reduce((n, b) => n + b.max_lines, 0) === 1 ? "" : "s"} in total`,
      side === "center"
        ? "set on the frame's centre axis, so the product takes the lower area and the copy the upper"
        : `set against the ${side} edge, so the product takes the ${side === "left" ? "right" : "left"} and the two do not cross`,
      ctaLast ? "the action closes the column, so the area runs to the foot of the copy" : "",
      generous ? "widened because the brand asks for uncluttered space" : "",
    ]
      .filter(Boolean)
      .join("; "),
  };
}

/**
 * The plan as the IMAGE prompt carries it.
 *
 * Layout guidance only. It names where the product goes, where the frame must
 * stay quiet, and how much room the type needs — and it deliberately contains
 * not one word of the copy, because this block is read by a model that is being
 * told in the same prompt to render no text. A block that carried the words
 * would be an instruction to draw them.
 */
export function renderPlanForImagePrompt(plan: TypographyPlan | null | undefined): string | undefined {
  if (!plan) return undefined;
  if (plan.text_mode === "none" || !plan.space) {
    return [
      "COMPOSITION — this frame carries no typography.",
      "Compose it as a finished photograph: no band of empty space is being reserved for type, because none is coming. Fill the frame as the image requires.",
    ].join("\n");
  }

  const s = plan.space;
  const lineTotal = plan.blocks.reduce((n, b) => n + b.max_lines, 0);
  const where =
    s.product_zone === "right"
      ? "the right of the frame"
      : s.product_zone === "left"
        ? "the left of the frame"
        : s.product_zone === "upper"
          ? "the upper area"
          : "the lower area";

  return [
    "COMPOSITION FOR TYPOGRAPHY — the type is set separately and composited afterwards. These are spatial instructions, not text.",
    `- Place the product in ${where}, held clear of the reserved area below.`,
    `- Reserve a clean, quiet area at ${s.x}% across, ${s.y}% down, occupying ${s.width}%×${s.height}% of the frame. ${lineTotal} line${lineTotal === 1 ? "" : "s"} of type will be set there.`,
    "- Inside that area keep tone even and detail low: no product edges, no high-frequency pattern, no hard highlight or specular hit, no busy background object. Even, uninterrupted tone is what makes type readable over a photograph.",
    "- Keep contrast between the reserved area and the type's likely weight: a light area for dark type, a dark or shadowed area for light type. An area of mid-tone noise is the one thing type cannot sit on.",
    `- ${s.because}.`,
    "- Compose the rest as a finished commercial photograph: real light, real materials, a real ground for the product to sit on. Do not leave the frame looking unfinished around the reserved area.",
  ].join("\n");
}

/**
 * The plan as the RECORD carries it — what was decided about the type itself.
 *
 * Used for the design document and telemetry, never for the image prompt.
 */
export function renderPlanForRecord(plan: TypographyPlan | null | undefined): string | undefined {
  if (!plan || plan.text_mode === "none") return undefined;
  const out = ["TYPOGRAPHY PLAN — one block per supplied line. The words are the client's; only their treatment is decided."];
  for (const b of plan.blocks) {
    out.push(
      `- ${b.text_role} (hierarchy ${b.hierarchy}): "${b.content}" — ${b.role}, up to ${b.max_lines} line${b.max_lines === 1 ? "" : "s"}, ${b.alignment}-aligned, ${b.preferred_zone}, ${b.scale}× the smallest line.`,
      `    ${b.because}`,
    );
  }
  out.push(
    `- personality: ${plan.style.personality} — ${plan.style.font_direction}`,
    `- contrast: ${plan.style.contrast}`,
    `- spacing: ${plan.style.spacing}`,
    `- capitalization: ${plan.style.capitalization}`,
  );
  return out.join("\n");
}

/** Counts, roles and geometry only — never the client's copy. */
export function typographyPlanTelemetry(p: TypographyPlan | null | undefined) {
  if (!p) return { typography_plan: false };
  return {
    typography_plan: true,
    text_mode: p.text_mode,
    blocks: p.blocks.length,
    roles: p.blocks.map((b) => b.text_role),
    max_lines: p.blocks.map((b) => b.max_lines),
    zones: p.blocks.map((b) => b.preferred_zone),
    personality: p.style.personality,
    copy_share: p.space?.share ?? 0,
    product_zone: p.space?.product_zone ?? null,
  };
}
