/**
 * Phase 5.6.6 — which typeface sets the words.
 *
 * WHY THIS EXISTS
 * ---------------
 * The compositor used to name two faces: Georgia for anything serif and Arial
 * for anything else. Measured on this machine, Georgia does not carry
 * `ả ặ ư ơ ễ ỹ ụ` — so a Vietnamese serif headline fell back to a different
 * face PER CHARACTER, mid-word. The tone marks came from one typeface and the
 * letters from another, which is precisely the "looks pasted on" failure the
 * typography work is meant to remove, and it was invisible to every test
 * because the TEXT was correct. Only the shapes were wrong.
 *
 * So a face is chosen for three reasons, in this order:
 *
 *   1. it can draw the script the copy is written in -- non-negotiable;
 *   2. the brand asked for it, when the brand named one that qualifies;
 *   3. it suits the typographic personality the Creative Director chose, and
 *      the category the work belongs to.
 *
 * COVERAGE IS MEASURED, NOT DECLARED
 * ----------------------------------
 * `vietnamese` below is not a claim from a specification: each face was probed
 * by rendering `ả ặ đ ư ơ ễ ỹ ố ầ ụ` and comparing it against the same glyph
 * drawn with a deliberately absent family. Identical output means the face has
 * no glyph and the renderer substituted one. `run-font-intelligence-tests`
 * re-runs that probe, so a machine whose fonts differ fails loudly instead of
 * shipping mixed-face Vietnamese.
 *
 * NO USER SURFACE
 * ---------------
 * Internal intelligence. Nobody picks a font in the product; the system does,
 * and explains itself in the design document.
 */

export type FontClass = "serif" | "sans-serif" | "display-sans" | "humanist" | "mono";

export interface FontFace {
  /** The family name as the renderer resolves it. */
  family: string;
  class: FontClass;
  /** Verified by probe on this platform, not asserted from a spec sheet. */
  vietnamese: boolean;
  /** Typographic personalities this face serves well. */
  personalities: string[];
  /** Commercial categories it suits. Empty means "generally usable". */
  categories: string[];
  /** Usable weight range, for hierarchy. */
  weights: { regular: number; bold: number };
  /** Why a designer would reach for it. Recorded with the decision. */
  because: string;
}

/**
 * The catalogue. System faces only: they are present wherever the renderer
 * runs on this platform and carry no redistribution question, unlike bundling
 * a licensed family into the repository.
 */
export const FONT_CATALOGUE: FontFace[] = [
  {
    family: "Cambria", class: "serif", vietnamese: true,
    personalities: ["editorial", "quiet"], categories: ["beauty", "fashion", "beverage"],
    weights: { regular: 400, bold: 700 },
    because: "a high-contrast serif with full tone-mark coverage: editorial weight without losing Vietnamese",
  },
  {
    family: "Constantia", class: "serif", vietnamese: true,
    personalities: ["editorial", "crafted", "quiet"], categories: ["beauty", "fashion", "food"],
    weights: { regular: 400, bold: 700 },
    because: "a warmer book serif; reads as considered rather than corporate",
  },
  {
    family: "Palatino Linotype", class: "serif", vietnamese: true,
    personalities: ["editorial", "quiet"], categories: ["beauty", "fashion"],
    weights: { regular: 400, bold: 700 },
    because: "an old-style serif with generous counters: luxury without ornament",
  },
  {
    family: "Segoe UI", class: "sans-serif", vietnamese: true,
    personalities: ["direct", "technical"], categories: ["technology", "fmcg", "beverage"],
    weights: { regular: 400, bold: 700 },
    because: "an even humanist sans that stays legible small; the default working face",
  },
  {
    family: "Calibri", class: "sans-serif", vietnamese: true,
    personalities: ["technical", "quiet"], categories: ["technology", "fmcg"],
    weights: { regular: 400, bold: 700 },
    because: "softened stems and tight spacing: clean without feeling clinical",
  },
  {
    family: "Candara", class: "humanist", vietnamese: true,
    personalities: ["crafted", "quiet"], categories: ["food", "beverage"],
    weights: { regular: 400, bold: 700 },
    because: "flared humanist strokes that read as hand-made; suits food and craft",
  },
  {
    family: "Corbel", class: "humanist", vietnamese: true,
    personalities: ["quiet", "direct"], categories: ["beauty", "technology", "food"],
    weights: { regular: 400, bold: 700 },
    because: "an unfussy humanist sans; recedes so the picture carries the frame",
  },
  {
    family: "Verdana", class: "sans-serif", vietnamese: true,
    personalities: ["direct"], categories: ["fmcg"],
    weights: { regular: 400, bold: 700 },
    because: "wide apertures and heavy spacing: the most legible face here at distance",
  },
  {
    family: "Tahoma", class: "sans-serif", vietnamese: true,
    personalities: ["direct", "technical"], categories: ["fmcg", "technology"],
    weights: { regular: 400, bold: 700 },
    because: "tighter than Verdana, same clarity; useful where space is short",
  },
  {
    family: "Segoe UI Black", class: "display-sans", vietnamese: true,
    personalities: ["assertive", "direct"], categories: ["food", "beverage", "fmcg"],
    weights: { regular: 900, bold: 900 },
    because: "the only heavy display face measured with full Vietnamese: weight without broken tone marks",
  },
  {
    family: "Segoe UI Light", class: "sans-serif", vietnamese: true,
    personalities: ["quiet"], categories: ["beauty", "fashion", "technology"],
    weights: { regular: 300, bold: 600 },
    because: "light strokes that recede; restraint for premium work",
  },
];

/**
 * Faces excluded on purpose, with the reason. Kept as data so the exclusion is
 * reviewable and so a test can assert they are never selected for Vietnamese.
 */
export const EXCLUDED_FOR_VIETNAMESE = [
  { family: "Georgia", missing: "ảặươễỹụ", note: "was the serif default; fell back mid-word on Vietnamese" },
  { family: "Times New Roman", missing: "ảặđươễỹốầụ", note: "no tone-mark coverage at all" },
  { family: "Book Antiqua", missing: "ảặđươễỹốầụ", note: "no tone-mark coverage at all" },
  { family: "Impact", missing: "ảặươễỹốầụ", note: "display weight, but breaks Vietnamese" },
  { family: "Arial Black", missing: "ảặươễỹốầụ", note: "display weight, but breaks Vietnamese" },
  { family: "Franklin Gothic Medium", missing: "ảặươễỹốầụ", note: "breaks Vietnamese" },
  { family: "Trebuchet MS", missing: "ảặươễỹốầụ", note: "breaks Vietnamese" },
  { family: "Comic Sans MS", missing: "ảặươễỹốầụ", note: "breaks Vietnamese" },
] as const;

/** Latin text can use a face that lacks tone marks; Vietnamese cannot. */
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function needsVietnamese(lines: string[]): boolean {
  return lines.some((l) => VIETNAMESE.test(String(l)));
}

export interface FontChoice {
  family: string;
  class: FontClass;
  /** The generic family a renderer falls back to, named in the same stack. */
  fallback: "serif" | "sans-serif" | "monospace";
  weights: { regular: number; bold: number };
  /** How the face was arrived at. Stored with the design. */
  because: string;
  /** True when the brand's own face was used. */
  brand_font: boolean;
}

const GENERIC: Record<FontClass, FontChoice["fallback"]> = {
  serif: "serif",
  "sans-serif": "sans-serif",
  "display-sans": "sans-serif",
  humanist: "sans-serif",
  mono: "monospace",
};

/**
 * Faces the renderer should try, in order, when the chosen one is absent.
 *
 * Takes only the family and the generic class, so a stored TEXT LAYER can ask
 * for its own stack without reconstructing the whole choice. Every named
 * fallback is a face measured as carrying Vietnamese: a stack that falls back to
 * Georgia or Times New Roman would reintroduce the mid-word substitution this
 * module exists to remove, on exactly the machines where the chosen face is
 * missing and the fallback is all there is.
 */
export function fontStack(choice: Pick<FontChoice, "family" | "fallback">): string {
  // Helvetica was in this list until it was probed: on this platform it draws
  // none of `ảặđươễỹốầụ`. Arial, Tahoma and Verdana all do.
  const safe = choice.fallback === "serif" ? "Cambria, Constantia" : "Segoe UI, Arial, Tahoma, Verdana";
  return `'${choice.family.replace(/'/g, "")}', ${safe}, ${choice.fallback}`;
}

/**
 * What the letterforms have to be able to DO, decided before a face is chosen.
 *
 * Phase 5.6.3 put the creative reasoning first: the typography layer decides
 * what kind of letterforms the idea needs, and this module then finds a face
 * that can express it and draw the script. Structurally compatible with
 * `TypographyDNA.FontNeed` and deliberately not imported from it -- this module
 * is the technical foundation and must not depend on the creative layer.
 */
export interface FontRequirement {
  /** Stroke contrast wanted, 0 (even) to 1 (high modulation). */
  contrast: number;
  /** Letterforms with a hand in them rather than built geometrically. */
  humanist: boolean;
  /** Presence at display size rather than legibility at small size. */
  display: boolean;
}

export interface FontSelectionInput {
  /** The typographic personality the Creative Director chose. */
  personality?: string | null;
  /** The commercial category, when the work states one. */
  category?: string | null;
  /** The face the brand asked for, if any. */
  brandFamily?: string | null;
  /** The lines to be set, to decide whether tone-mark coverage is required. */
  lines?: string[];
  /** "heading" picks for presence; "body" picks for legibility. */
  role?: "heading" | "body";
  /**
   * What the creative layer decided the letterforms must do. Optional: without
   * it the choice rests on personality and category as before.
   */
  need?: FontRequirement | null;
}

/**
 * Chooses a face. Deterministic and total: it always returns something usable.
 *
 * The brand wins when its face qualifies, because a brand's typeface is part of
 * its identity and outranks this module's taste. It does NOT win when the copy
 * is Vietnamese and the face cannot draw it -- a brand would rather be set in a
 * near neighbour than have its tone marks come from a different typeface.
 */
export function selectFont(input: FontSelectionInput): FontChoice {
  const vi = needsVietnamese(input.lines || []);
  const usable = FONT_CATALOGUE.filter((f) => (vi ? f.vietnamese : true));
  const personality = String(input.personality || "direct").toLowerCase();
  const category = String(input.category || "").toLowerCase();
  const role = input.role || "heading";

  // 1. The brand's own face, when it is in the catalogue and can draw the copy.
  const brand = String(input.brandFamily || "").trim();
  if (brand) {
    const match = usable.find((f) => f.family.toLowerCase() === brand.toLowerCase());
    if (match) {
      return {
        family: match.family, class: match.class, fallback: GENERIC[match.class],
        weights: match.weights, brand_font: true,
        because: `the brand's own face${vi ? ", and it carries Vietnamese tone marks" : ""}`,
      };
    }
    // Named but unusable: say so, and continue to a chosen neighbour.
  }

  // 2. Personality and category, scored rather than branched: a face that suits
  //    both wins over one that suits either.
  const scored = usable
    .map((f) => {
      let score = 0;
      if (f.personalities.includes(personality)) score += 2;
      if (category && f.categories.includes(category)) score += 2;
      if (role === "body" && (f.class === "sans-serif" || f.class === "humanist")) score += 1;
      if (role === "heading" && (f.class === "serif" || f.class === "display-sans")) score += 1;
      // Phase 5.6.3: what the creative layer decided the letters must DO. It
      // outscores the personality label, because the label is a summary and
      // this is the specific requirement the idea produced.
      const need = input.need;
      if (need) {
        if (need.contrast >= 0.5 && f.class === "serif") score += 3;
        if (need.contrast < 0.3 && (f.class === "sans-serif" || f.class === "display-sans")) score += 2;
        if (need.humanist && (f.class === "humanist" || f.family === "Constantia")) score += 3;
        if (!need.humanist && f.class === "humanist") score -= 1;
        if (need.display && role === "heading" && f.weights.regular >= 700) score += 3;
        if (!need.display && f.weights.regular >= 900) score -= 2;
      }
      return { f, score };
    })
    .sort((a, b) => b.score - a.score || a.f.family.localeCompare(b.f.family));

  const chosen = scored[0]?.f ?? usable[0] ?? FONT_CATALOGUE[0];
  const reasons = [
    chosen.personalities.includes(personality) ? `suits a ${personality} voice` : "",
    category && chosen.categories.includes(category) ? `and reads right for ${category}` : "",
    vi ? "with verified Vietnamese coverage" : "",
  ].filter(Boolean);
  return {
    family: chosen.family, class: chosen.class, fallback: GENERIC[chosen.class],
    weights: chosen.weights, brand_font: false,
    because: `${chosen.because}${reasons.length ? ` — ${reasons.join(", ")}` : ""}`,
  };
}

/** A heading and a body face that differ enough to build hierarchy from. */
export function selectPairing(input: FontSelectionInput): { heading: FontChoice; body: FontChoice } {
  const heading = selectFont({ ...input, role: "heading" });
  let body = selectFont({ ...input, role: "body" });
  if (body.family === heading.family) {
    // One family throughout is a legitimate choice, but hierarchy then rests
    // entirely on weight and size. Prefer a companion when one is available.
    const vi = needsVietnamese(input.lines || []);
    const companion = FONT_CATALOGUE.find(
      (f) => (vi ? f.vietnamese : true) && f.family !== heading.family &&
        (heading.class === "serif" ? f.class !== "serif" : f.class === "serif" || f.class === "humanist"),
    );
    if (companion) {
      body = {
        family: companion.family, class: companion.class, fallback: GENERIC[companion.class],
        weights: companion.weights, brand_font: false,
        because: `${companion.because} — paired against ${heading.family} so hierarchy comes from the letterforms, not only the size`,
      };
    }
  }
  return { heading, body };
}

/** Counts and names only. Never the copy. */
export function fontTelemetry(p: { heading: FontChoice; body: FontChoice } | null | undefined) {
  if (!p) return { fonts: false };
  return {
    fonts: true,
    heading: p.heading.family,
    body: p.body.family,
    brand_font: p.heading.brand_font || p.body.brand_font,
    paired: p.heading.family !== p.body.family,
  };
}
