import type { CreativeBlueprint, Decision, DecisionBasis } from "./CreativeBlueprint";
import type { MarketingInsight } from "./MarketingInsight";
import type { ProductMeaning } from "./ProductMeaning";
import type { AssetContext } from "./AssetContext";
import type { LayoutGeometry, ZoneName } from "./LayoutGeometry";

/**
 * Typography System — typography that can be executed, not only described.
 *
 * The existing `design` section reasons about typography in prose: "the words
 * should feel spoken across a counter rather than set". That is the right
 * thought and a renderer can act on it, but nothing downstream can lay a text
 * object from it. This turns the reasoning into a spec: a role per string, a
 * relative scale, a weight, a tracking behaviour, and a position taken from the
 * layout geometry.
 *
 * Deterministic, pure, no model call.
 *
 * No font names, ever
 * -------------------
 * `font_personality` is a description of behaviour — "high contrast between
 * thick and thin, generous space between letters" — not a typeface. The image
 * model has its own fonts and naming one it may not have is an instruction it
 * cannot follow. Naming one it DOES have is a house style, which this codebase
 * refuses. So the spec describes what the letterforms must DO.
 *
 * Scales are relative, not points
 * -------------------------------
 * A headline is "2.4× the supporting text", not "48pt". Point sizes assume an
 * output resolution nobody has fixed, and a ratio survives any frame size. The
 * ratios come from the format's own information density, which is the real
 * difference between a poster read at distance and a banner read in passing.
 */

export type TypographyPersonality =
  | "editorial"
  | "technical"
  | "crafted"
  | "direct"
  | "quiet"
  | "assertive";

export type TextRole = "headline" | "subheadline" | "body" | "cta";

export interface TextSpec {
  role: TextRole;
  /** The zone this string occupies, from `LayoutGeometry`. */
  zone: ZoneName;
  /** Relative to the smallest text in the frame. Never a point size. */
  scale: number;
  /** Behavioural, not a numeric weight: what the strokes must do. */
  weight: string;
  /** Letter spacing as behaviour. */
  tracking: string;
  alignment: "left" | "centre" | "right";
  /** What this string is for in the reading order. */
  purpose: string;
  because: string;
}

export interface TypographySystem {
  personality: Decision | null;
  /** Ordered by what the viewer meets first. */
  attention_order: { position: number; role: TextRole; what_it_does: string }[];
  specs: TextSpec[];
  /** Five checks a senior designer would run before sending it out. */
  validation: {
    hierarchy_clarity: number;
    readability: number;
    premium_feeling: number;
    brand_fit: number;
    visual_balance: number;
    overall: number;
    issues: string[];
  };
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Reads a personality out of what the director already decided.
 *
 * Derived from the typographic voice the brain resolved, which itself rests on
 * product meaning or the brand. Where nothing was decided this returns null
 * rather than picking a default, because a default personality is a house
 * style with one extra step.
 */
function readPersonality(
  b: CreativeBlueprint | null,
  pm: ProductMeaning | null,
  mi: MarketingInsight | null
): Decision | null {
  const voice = b?.design?.typographic_voice || b?.design?.font_character || null;
  if (!voice?.value?.trim()) return null;

  const v = voice.value.toLowerCase();
  // Structural words only. These describe how letterforms behave, and mean the
  // same thing for a serum, a bowl of pho or a laptop.
  let personality: TypographyPersonality = "direct";
  if (/spoken|handwritten|by hand|hand-|informal|warm/.test(v)) personality = "crafted";
  else if (/quiet|restrained|understated|soft|not sell/.test(v)) personality = "quiet";
  else if (/loud|bold|shout|assertive|urgent|immediate/.test(v)) personality = "assertive";
  else if (/precise|technical|exact|specification|engineered/.test(v)) personality = "technical";
  else if (/heritage|craft|made|process|tradition|considered/.test(v)) personality = "editorial";

  const supporting = [
    pm?.emotional_value ? `ProductMeaning.emotional_value — ${pm.emotional_value.because}` : "",
    mi?.target_customer ? `MarketingInsight.target_customer — ${mi.target_customer.because}` : "",
  ].filter(Boolean);

  return {
    value: personality,
    because: `${voice.because}${supporting.length ? `; supported by ${supporting[0]}` : ""}`,
    derived_from: voice.derived_from as DecisionBasis,
    confidence: voice.confidence,
  };
}

/** How letterforms behave for each personality. Behaviour, never a typeface. */
const LETTERFORMS: Record<TypographyPersonality, { weight: string; tracking: string }> = {
  editorial: {
    weight: "high contrast between thick and thin strokes; the difference is the character",
    tracking: "generous space between letters, so the words breathe rather than lock together",
  },
  technical: {
    weight: "even stroke weight throughout; no modulation, nothing decorative",
    tracking: "tight and regular, so the line reads as one unit",
  },
  crafted: {
    weight: "uneven weight as if made by a hand rather than set by a machine",
    tracking: "irregular spacing, closer to writing than to typesetting",
  },
  direct: {
    weight: "solid and unmodulated, heavy enough to be read at a glance",
    tracking: "normal spacing; nothing draws attention to the letterforms themselves",
  },
  quiet: {
    weight: "light strokes that recede rather than announce",
    tracking: "open spacing, so the words sit quietly in their space",
  },
  assertive: {
    weight: "heavy, filled strokes that dominate whatever is behind them",
    tracking: "tight, so the words read as a single block of weight",
  },
};

export interface TypographyInput {
  blueprint?: CreativeBlueprint | null;
  productMeaning?: ProductMeaning | null;
  marketingInsight?: MarketingInsight | null;
  assetContext?: AssetContext | null;
  geometry?: LayoutGeometry | null;
  /** Roles the client labelled or the director assigned, in order. */
  copyRoles?: string[];
}

const ROLE_OF: Record<string, TextRole> = {
  HEADLINE: "headline",
  OFFER: "headline",
  SUBHEADLINE: "subheadline",
  SUPPORTING_TEXT: "body",
  PRODUCT_NAME: "body",
  CTA: "cta",
};

const ZONE_OF: Record<TextRole, ZoneName> = {
  headline: "headline",
  subheadline: "subheadline",
  body: "supporting",
  cta: "cta",
};

/** Scale relative to the smallest text. Wider spread where density is lower. */
function scaleFor(role: TextRole, density: string): number {
  const sparse = /one idea|single|only|room/i.test(density);
  const base: Record<TextRole, number> = { headline: sparse ? 3.2 : 2.4, subheadline: 1.6, cta: 1.3, body: 1 };
  return base[role];
}

export function buildTypographySystem(input: TypographyInput): TypographySystem {
  const b = input.blueprint || null;
  const density = clean(input.assetContext?.information_density);
  const personality = readPersonality(b, input.productMeaning || null, input.marketingInsight || null);
  const letterforms = LETTERFORMS[(personality?.value as TypographyPersonality) || "direct"];

  const roles = (input.copyRoles || []).map((r) => clean(r).toUpperCase()).filter(Boolean);
  const seen = new Set<TextRole>();
  const specs: TextSpec[] = [];

  for (const raw of roles) {
    const role = ROLE_OF[raw];
    if (!role || seen.has(role)) continue;
    seen.add(role);
    const zone = input.geometry?.zones.find((z) => z.name === ZONE_OF[role]);
    specs.push({
      role,
      zone: ZONE_OF[role],
      scale: scaleFor(role, density),
      weight: letterforms.weight,
      tracking: letterforms.tracking,
      alignment: input.geometry?.ratio === "16:9" ? "left" : "centre",
      purpose:
        role === "headline"
          ? "Read first and carry the message on its own."
          : role === "cta"
            ? "Close the reading path and name the action."
            : role === "subheadline"
              ? "Complete the headline without competing with it."
              : "Supply the detail the headline left out.",
      because:
        zone?.because ||
        `placed by the layout for a ${clean(input.geometry?.ratio) || "square"} frame`,
    });
  }

  // ── attention order ────────────────────────────────────────────────────
  const ORDER: TextRole[] = ["headline", "subheadline", "body", "cta"];
  const attention_order = ORDER.filter((r) => seen.has(r)).map((role, i) => ({
    position: i + 1,
    role,
    what_it_does:
      role === "headline"
        ? "seen first"
        : role === "cta"
          ? "acted on"
          : role === "subheadline"
            ? "understood second"
            : "remembered",
  }));

  // ── validation ─────────────────────────────────────────────────────────
  const issues: string[] = [];
  const scales = specs.map((s) => s.scale);
  const spread = scales.length > 1 ? Math.max(...scales) / Math.min(...scales) : 1;
  const hierarchy_clarity = round(Math.max(1, Math.min(10, spread * 3)));
  if (spread < 1.5 && scales.length > 1) issues.push("Sizes are too close: nothing clearly leads.");

  const readability = specs.length && specs.length <= 4 ? 9 : specs.length > 4 ? 5 : 1;
  if (specs.length > 4) issues.push(`${specs.length} text roles in one frame is more than a viewer will read.`);
  if (!specs.length) issues.push("No text roles resolved: typography cannot be executed.");

  const premium_feeling = round(
    personality ? (["quiet", "editorial"].includes(personality.value) ? 9 : 6) : 3
  );
  if (!personality) issues.push("No typographic personality was decided; the renderer picks one.");

  const brand_fit = personality
    ? personality.derived_from === "product_truth" || personality.derived_from === "user"
      ? 10
      : 7
    : 2;

  const balanceScore = input.geometry?.score.balance ?? 5;
  const visual_balance = round(balanceScore);

  const overall = round(
    (hierarchy_clarity + readability + premium_feeling + brand_fit + visual_balance) / 5
  );

  return {
    personality,
    attention_order,
    specs,
    validation: { hierarchy_clarity, readability, premium_feeling, brand_fit, visual_balance, overall, issues },
  };
}

/** Counts and roles only — never the client's copy. */
export function typographyTelemetry(t: TypographySystem | null | undefined) {
  if (!t) return { typography_system: false };
  return {
    typography_system: true,
    personality: t.personality?.value ?? null,
    personality_from: t.personality?.derived_from ?? null,
    roles: t.specs.map((s) => s.role),
    attention_order: t.attention_order.map((a) => a.role),
    score: t.validation.overall,
    issues: t.validation.issues.length,
  };
}

/** The spec as the prompt carries it. */
export function renderTypography(t: TypographySystem | null | undefined): string | undefined {
  if (!t?.specs.length) return undefined;
  const lines = ["TYPOGRAPHY — how the words behave. No typeface is named; these describe what the letterforms must do."];
  if (t.personality) lines.push(`- personality: ${t.personality.value} — ${t.personality.because}`);
  for (const s of t.specs) {
    lines.push(
      `- ${s.role}: ${s.scale}× the smallest text, ${s.alignment}-aligned in the ${s.zone} zone. ${s.purpose}`,
      `    strokes: ${s.weight}`,
      `    spacing: ${s.tracking}`
    );
  }
  if (t.attention_order.length) {
    lines.push(`- read in this order: ${t.attention_order.map((a) => `${a.role} (${a.what_it_does})`).join(" → ")}`);
  }
  return lines.join("\n");
}
