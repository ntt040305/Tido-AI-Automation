import type { TextRole, TypographySystem, TextSpec } from "./TypographySystem";
import type { ZoneName, LayoutGeometry } from "./LayoutGeometry";
import type { VisionAnalysisResult, VisionAction, VisionNote } from "./VisionAnalysisResult";
import { sanitizeActions } from "./VisionAnalysisResult";

/**
 * Vision findings, translated into the design system's own vocabulary.
 *
 * The problem this solves
 * ----------------------
 * A vision model reports prose: "the headline lacks dominance", "the closing
 * line runs into the product". Appending that prose to the next prompt is what
 * the loop did first, and it is weak in a specific way -- a diffusion model
 * reads "make the headline more dominant" as a mood, not a measurement, and
 * will as happily restyle the whole frame as change one size.
 *
 * This engine already has exact vocabularies for both problems. `TypographySystem`
 * carries a `TextSpec` per role with a relative `scale`, a behavioural `weight`
 * and a `tracking`; `LayoutGeometry` carries `Zone`s with coordinates, a
 * `priority` and a `safe_inset`. A finding that lands in those terms becomes a
 * change to a number that something downstream already knows how to render.
 *
 * So this file maps prose to typed corrections, and then applies them to the
 * structures that already exist. It builds no typography system and no layout
 * of its own.
 *
 * The boundary it will not cross
 * ------------------------------
 * Only execution. Scale, weight, tracking, alignment, zone position, zone
 * priority. Never palette, never mood, never the concept, never the crop, never
 * whether the product is centred because the director wanted it centred. A
 * vision model shown one frame knows nothing about why a deliberately sparse
 * layout is sparse, and every correction vocabulary below is deliberately too
 * narrow to express "change the idea".
 */

/** What can be done to a piece of type. Deliberately a closed set. */
export type TypographyCorrectionAction =
  | "increase_headline_hierarchy"
  | "reduce_headline_dominance"
  | "increase_text_contrast"
  | "tighten_tracking"
  | "loosen_tracking"
  | "correct_text_content";

/** What can be done to a zone. Also closed. */
export type LayoutCorrectionAction =
  | "move_cta_to_safe_area"
  | "separate_overlapping_zones"
  | "increase_zone_margin"
  | "raise_zone_priority";

export type CorrectionPriority = "low" | "medium" | "high";

export interface TypographyCorrection {
  action: TypographyCorrectionAction;
  /** Which piece of type. */
  role: TextRole;
  priority: CorrectionPriority;
  /** The finding this came from, quoted. Never paraphrased into a new claim. */
  because: string;
}

export interface LayoutCorrection {
  action: LayoutCorrectionAction;
  zone: ZoneName;
  priority: CorrectionPriority;
  because: string;
}

export interface StructuredCorrections {
  typography: TypographyCorrection[];
  layout: LayoutCorrection[];
  /** Findings that matched no rule, kept so the gap is visible rather than silent. */
  untranslated: string[];
}

const ROLES: TextRole[] = ["headline", "subheadline", "body", "cta"];
const ZONES: ZoneName[] = ["product", "headline", "subheadline", "cta", "supporting", "logo"];

/** Which role a finding is about, or headline as the commonest subject. */
function roleIn(text: string): TextRole {
  const t = text.toLowerCase();
  for (const r of ROLES) if (t.includes(r)) return r;
  if (/\bcall to action\b|\bbutton\b/.test(t)) return "cta";
  if (/\btitle\b|\bheading\b/.test(t)) return "headline";
  return "headline";
}

/**
 * Which zone a finding is about.
 *
 * Text zones are checked before "product", because a finding almost always
 * names both -- "the cta overlaps the product" -- and the one that should move
 * is the text. Matching "product" first meant the correction proposed moving
 * the hero to accommodate a caption, which inverts the entire composition.
 */
function zoneIn(text: string): ZoneName {
  const t = text.toLowerCase();
  const textZones = ZONES.filter((z) => z !== "product");
  for (const z of textZones) if (t.includes(z)) return z;
  if (/\bcall to action\b|\bbutton\b/.test(t)) return "cta";
  if (t.includes("product")) return "product";
  if (/\bpack|\bbottle|\bcan\b|\bbag\b/.test(t)) return "product";
  return "headline";
}

/**
 * The rules. Each maps a way findings are actually phrased onto one correction.
 *
 * Kept as a table rather than a chain of ifs so that the set of things vision
 * is permitted to change can be read in one screen and audited -- which is the
 * property that keeps the loop from quietly growing the authority to redesign.
 */
const TYPOGRAPHY_RULES: { match: RegExp; action: TypographyCorrectionAction }[] = [
  { match: /too small|lacks? dominance|not dominant|weak hierarchy|hierarchy is weak|needs? to be larger|barely visible/, action: "increase_headline_hierarchy" },
  { match: /too (large|big|dominant)|overpowers|competing with the product|dominates the/, action: "reduce_headline_dominance" },
  { match: /hard to read|illegible|low contrast|difficult to read|blends? into|swallow|unreadable|poor contrast/, action: "increase_text_contrast" },
  { match: /letter[- ]spacing is too (wide|loose)|too spaced out|tracking is too (wide|loose)/, action: "tighten_tracking" },
  { match: /letters? (are )?too (tight|cramped|close)|cramped|tracking is too tight/, action: "loosen_tracking" },
  { match: /misspell|gibberish|nonsense|garbled|instead of|missing (its )?diacritic|wrong text|pseudo[- ]text|letter[- ]shaped/, action: "correct_text_content" },
];

const LAYOUT_RULES: { match: RegExp; action: LayoutCorrectionAction }[] = [
  { match: /overlap|collid|runs into|on top of|obscur|cover(s|ing) the/, action: "separate_overlapping_zones" },
  { match: /runs off|cut off|clipped|outside the (frame|safe)|too close to the edge|crop(ped)? awkward|against the edge/, action: "move_cta_to_safe_area" },
  { match: /crowded|cramped against|no breathing|tangent|touching the/, action: "increase_zone_margin" },
  { match: /lost in|gets? lost|hard to find|buried/, action: "raise_zone_priority" },
];

function priorityOf(note: { confidence?: string }, isError: boolean): CorrectionPriority {
  if (isError) return "high";
  if (note.confidence === "high") return "high";
  if (note.confidence === "low") return "low";
  return "medium";
}

/**
 * Translates a vision analysis into corrections the design system can apply.
 *
 * Reads only findings the scope allowlist already passed, so a direction
 * rewrite cannot enter through this door either.
 */
export function bridgeVisionToCorrections(
  analysis: VisionAnalysisResult | null | undefined,
): StructuredCorrections {
  const out: StructuredCorrections = { typography: [], layout: [], untranslated: [] };
  if (!analysis?.analyzed_image) return out;

  const seenT = new Set<string>();
  const seenL = new Set<string>();

  const considerNote = (note: VisionNote, hint: "typography" | "layout" | "any") => {
    const text = `${note.what} ${note.where || ""}`;
    let matched = false;

    if (hint !== "layout") {
      for (const r of TYPOGRAPHY_RULES) {
        if (!r.match.test(text.toLowerCase())) continue;
        const role = roleIn(text);
        const key = `${r.action}:${role}`;
        if (!seenT.has(key)) {
          seenT.add(key);
          out.typography.push({
            action: r.action,
            role,
            priority: priorityOf(note, r.action === "correct_text_content"),
            because: note.what,
          });
        }
        matched = true;
        break;
      }
    }

    if (hint !== "typography" && !matched) {
      for (const r of LAYOUT_RULES) {
        if (!r.match.test(text.toLowerCase())) continue;
        const zone = zoneIn(text);
        const key = `${r.action}:${zone}`;
        if (!seenL.has(key)) {
          seenL.add(key);
          out.layout.push({
            action: r.action,
            zone,
            priority: priorityOf(note, false),
            because: note.what,
          });
        }
        matched = true;
        break;
      }
    }

    // A finding nothing matched is recorded, not dropped. The rule table is
    // narrow on purpose, and the only way to learn where it is too narrow is to
    // see what keeps falling through it.
    if (!matched) out.untranslated.push(note.what);
  };

  for (const n of analysis.typography_problems) considerNote(n, "typography");
  for (const n of analysis.layout_problems) considerNote(n, "layout");
  for (const n of analysis.issues) considerNote(n, "any");

  return out;
}

/**
 * Applies typography corrections to the system that already exists.
 *
 * Returns a new system; the input is not mutated. Scale moves in bounded steps
 * rather than to an absolute, because the director set the original value for a
 * reason and a correction is an adjustment to it, not a replacement of it.
 */
export function applyTypographyCorrections(
  system: TypographySystem | null | undefined,
  corrections: TypographyCorrection[],
): TypographySystem | null {
  if (!system || !corrections.length) return system || null;

  const specs: TextSpec[] = system.specs.map((s) => ({ ...s }));
  const find = (role: TextRole) => specs.find((s) => s.role === role);

  for (const c of corrections) {
    const spec = find(c.role);
    if (!spec) continue;
    switch (c.action) {
      case "increase_headline_hierarchy":
        // Capped: a headline that runs away from the rest of the frame is the
        // same defect in the other direction.
        spec.scale = Math.min(Number((spec.scale * 1.35).toFixed(2)), 6);
        spec.weight = "heavier strokes, enough to hold the eye first";
        break;
      case "reduce_headline_dominance":
        spec.scale = Math.max(Number((spec.scale * 0.75).toFixed(2)), 1);
        break;
      case "increase_text_contrast":
        spec.weight = "heavier strokes, set against a cleared area so it reads at a glance";
        break;
      case "tighten_tracking":
        spec.tracking = "tighter, set close without touching";
        break;
      case "loosen_tracking":
        spec.tracking = "opened up, enough air between letters to read cleanly";
        break;
      case "correct_text_content":
        // Nothing numeric to change: the words themselves were wrong. Recorded
        // on the spec so the render instruction can quote it.
        spec.because = `${spec.because} The previous render set this text incorrectly; reproduce it exactly as written.`;
        break;
    }
  }

  return { ...system, specs };
}

/** Applies layout corrections to the geometry that already exists. */
export function applyLayoutCorrections(
  geometry: LayoutGeometry | null | undefined,
  corrections: LayoutCorrection[],
): LayoutGeometry | null {
  if (!geometry || !corrections.length) return geometry || null;

  const zones = geometry.zones.map((z) => ({ ...z }));
  const find = (name: ZoneName) => zones.find((z) => z.name === name);
  const inset = geometry.grid?.safe_inset ?? 8;

  for (const c of corrections) {
    const zone = find(c.zone);
    if (!zone) continue;
    switch (c.action) {
      case "move_cta_to_safe_area": {
        // Pulled inside the safe inset on whichever axes it escaped, rather
        // than moved to a fixed position -- the director's placement is kept
        // wherever it was already legal.
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;
        zone.x = Math.min(Math.max(zone.x, inset + halfW), 100 - inset - halfW);
        zone.y = Math.min(Math.max(zone.y, inset + halfH), 100 - inset - halfH);
        break;
      }
      case "separate_overlapping_zones": {
        const product = find("product");
        if (product && zone.name !== "product") {
          // Moved away from the product along the axis it is already furthest
          // on, which preserves the composition's intent better than a fixed
          // direction would.
          const dx = zone.x - product.x;
          const dy = zone.y - product.y;
          if (Math.abs(dy) >= Math.abs(dx)) zone.y = clamp(zone.y + (dy >= 0 ? 8 : -8), inset, 100 - inset);
          else zone.x = clamp(zone.x + (dx >= 0 ? 8 : -8), inset, 100 - inset);
        }
        break;
      }
      case "increase_zone_margin":
        zone.width = Math.max(zone.width * 0.9, 5);
        zone.height = Math.max(zone.height * 0.9, 5);
        break;
      case "raise_zone_priority":
        zone.priority = Math.min(zone.priority + 2, 10);
        break;
    }
  }

  return { ...geometry, zones };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * The corrections as an instruction block for the renderer.
 *
 * Opens by protecting the direction for the same reason the prose path does: an
 * instruction that leads with problems invites a reinterpretation, and the
 * whole point of this bridge is that only the listed values change.
 */
export function renderCorrections(c: StructuredCorrections): string | undefined {
  if (!c.typography.length && !c.layout.length) return undefined;

  const lines: string[] = [
    "EXECUTION CORRECTIONS",
    "",
    "Keep the concept, mood, palette, lighting and composition idea exactly as they are.",
    "This is a correction pass. Change only what is listed below:",
    "",
  ];

  const order: Record<CorrectionPriority, number> = { high: 0, medium: 1, low: 2 };
  const byPriority = <T extends { priority: CorrectionPriority }>(a: T, b: T) =>
    order[a.priority] - order[b.priority];

  for (const t of [...c.typography].sort(byPriority)) {
    lines.push(`- ${TYPOGRAPHY_PHRASING[t.action](t.role)} (${t.because})`);
  }
  for (const l of [...c.layout].sort(byPriority)) {
    lines.push(`- ${LAYOUT_PHRASING[l.action](l.zone)} (${l.because})`);
  }

  return lines.join("\n");
}

/** One phrasing per action, so the renderer reads a designer, not an enum. */
const TYPOGRAPHY_PHRASING: Record<TypographyCorrectionAction, (r: TextRole) => string> = {
  increase_headline_hierarchy: (r) => `Set the ${r} noticeably larger and heavier so it is read first`,
  reduce_headline_dominance: (r) => `Set the ${r} smaller so it stops competing with the product`,
  increase_text_contrast: (r) => `Give the ${r} a clear tonal separation from what sits behind it`,
  tighten_tracking: (r) => `Close up the letter spacing on the ${r}`,
  loosen_tracking: (r) => `Open up the letter spacing on the ${r} so it reads cleanly`,
  correct_text_content: (r) => `Reproduce the ${r} text exactly as specified, character for character, with all diacritics`,
};

const LAYOUT_PHRASING: Record<LayoutCorrectionAction, (z: ZoneName) => string> = {
  move_cta_to_safe_area: (z) => `Bring the ${z} fully inside the safe margin, clear of every edge`,
  separate_overlapping_zones: (z) => `Move the ${z} clear of the product so neither overlaps the other`,
  increase_zone_margin: (z) => `Leave more clear space around the ${z}`,
  raise_zone_priority: (z) => `Give the ${z} more visual weight so it is not lost in the frame`,
};

/** Counts only -- never the finding text, which describes customer content. */
export function correctionTelemetry(c: StructuredCorrections | null | undefined) {
  if (!c) return { corrections: false };
  return {
    corrections: true,
    typography: c.typography.length,
    layout: c.layout.length,
    untranslated: c.untranslated.length,
    actions: [...c.typography.map((t) => t.action), ...c.layout.map((l) => l.action)],
  };
}

/** Convenience for callers holding raw actions rather than an analysis. */
export function correctableActionCount(actions: VisionAction[] | null | undefined): number {
  return sanitizeActions(actions).kept.length;
}
