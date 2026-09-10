import { CreativeConcept } from "./creative-concept.types";
import {
  ART_DIRECTION_DOMAINS,
  CONCEPT_PROSE_FIELDS,
  ConceptViolation,
  ConceptViolationKind,
  CreativeConceptValidation,
} from "./concept-validation.types";

/**
 * Rejects concepts that are actually art direction.
 *
 * The rules are deliberately literal. A concept layer is distinguished from an
 * execution layer by whether it contains *quantities* and *frame references* —
 * "the step you skip that costs the most" is an idea, "the subject within the
 * upper 65 percent" is a layout rule, and no amount of judgement is needed to
 * tell them apart once you look for the numbers.
 *
 * One deliberate exception, because the first version of this gate got it wrong:
 * a concept may legitimately contain a number as *content* — "the one that costs
 * four hundred dollars", "twelve courses", "two units only". Those are facts
 * about the offer, not instructions about the frame. So a bare number alone is
 * not a violation; a number attached to a production unit or a frame reference
 * is. Rejecting "twelve courses" would have made the gate reject good concepts
 * for having a product in them.
 */

/** Frame geometry. The dominant contamination — 20 of 30 cases came from layout. */
const LAYOUT_PATTERNS: [RegExp, string][] = [
  [/\b(upper|lower|left|right|top|bottom)\s+(third|half|quarter|\d+\s*(percent|%))/i, "names a frame band"],
  [/\b\d+(\.\d+)?\s*(percent|%)\s*(of\s+)?(the\s+)?(frame|canvas|width|height|area)/i, "sizes an element against the frame"],
  [/\bframe\s+(height|width|edge|centre|center)\b/i, "refers to the frame itself"],
  [/\b(centre|center)\s+axis\b/i, "names a compositional axis"],
  [/\brule of thirds\b/i, "names a compositional rule"],
  [/\bnegative space\b/i, "names a layout property"],
  [/\b(safe area|margin|gutter|grid|column)s?\b/i, "names a layout mechanism"],
  [/\b(crop|cropped|framing|reserve the|occupies?)\b.*\b\d/i, "gives a framing quantity"],
];

const CAMERA_PATTERNS: [RegExp, string][] = [
  [/\b\d{2,3}\s?mm\b/i, "names a focal length"],
  [/\bf\/\d/i, "names an aperture"],
  [/\b(lens|focal length|depth of field|aperture|shutter|ISO)\b/i, "names a camera control"],
  [/\b(eye[- ]level|low angle|high angle|top[- ]down|overhead|three[- ]quarter)\b/i, "names a camera angle"],
  [/\bshoot(ing)?\s+(at|from|the)\b/i, "instructs a camera set-up"],
];

const LIGHTING_PATTERNS: [RegExp, string][] = [
  [/\b(key ?light|fill light|rim light|backlight|softbox|scrim|bounce)\b/i, "names a lighting instrument"],
  [/\b(diffused?|specular|luminance|contrast ratio|kelvin|white balance)\b/i, "names a lighting property"],
  [/\b\d+\s*(to|:)\s*\d+\s*(luminance|contrast|ratio)/i, "gives a lighting ratio"],
  [/\bat\s+\d+\s*degrees?\b/i, "gives a light position"],
];

const TYPOGRAPHY_PATTERNS: [RegExp, string][] = [
  [/\b(type|typographic)\s+(level|hierarchy|scale)s?\b/i, "names a type hierarchy"],
  // Unambiguous: these words have no everyday sense.
  [/\b(kerning|letter[- ]spacing|x[- ]height)\b/i, "names a typographic control"],
  // Ambiguous, so they need typographic company. "Leading", "tracking" and
  // "baseline" are ordinary English before they are type controls, and bare they
  // flagged six clean concepts on the hundred-brief run — every one of them for
  // the phrase "leading with", which is what a differentiation statement says
  // when it names the category default it is rejecting.
  [
    /\b(?:tight|loose|open|negative|generous|wide|narrow|increased?|reduced?|extra)\s+(?:tracking|leading|baseline)\b|\b(?:tracking|leading|baseline)\s+(?:of|at|set|value|grid|shift)\b|\b(?:type|text|caption|headline)\s+(?:tracking|leading|baseline)\b/i,
    "names a typographic control",
  ],
  [/\b(serif|sans|grotesque|typeface|font)\b/i, "names a typeface class"],
  [/\b\d+\s*(pt|point|px)\b/i, "gives a type size"],
];

const MATERIAL_PATTERNS: [RegExp, string][] = [
  [/\brender\b.*\b(surface|texture|finish|material)\b/i, "instructs how a surface renders"],
  [/\b(pore structure|specular highlight|matte finish|gloss|sheen)\b/i, "names a surface property"],
];

/**
 * A quantity attached to a production unit.
 *
 * Bare numbers are allowed — a concept may say "twelve courses" or "two units
 * only", which are facts about the offer. What is not allowed is a number bound
 * to a unit that only exists inside a production instruction.
 */
const MEASUREMENT_PATTERN =
  /\b\d+(\.\d+)?\s*(percent|%|mm|pt|px|degrees?|:\s*\d)\b|\b\d+\s*(to|-)\s*\d+\s*(percent|%|mm|pt|px|degrees?)\b|\b(four|three|two|five|six)[- ]to[- ](one|two|three|five)\b/i;

const RULES: [ConceptViolationKind, [RegExp, string][]][] = [
  ["LAYOUT_INSTRUCTION", LAYOUT_PATTERNS],
  ["CAMERA_INSTRUCTION", CAMERA_PATTERNS],
  ["LIGHTING_INSTRUCTION", LIGHTING_PATTERNS],
  ["TYPOGRAPHY_INSTRUCTION", TYPOGRAPHY_PATTERNS],
  ["MATERIAL_INSTRUCTION", MATERIAL_PATTERNS],
];

export class ConceptQualityGate {
  /**
   * Validates one concept.
   *
   * `leadDomain`, when supplied, is checked independently of the text: a concept
   * built from a layout object is invalid even in the rare case where its wording
   * happens to carry no numbers, because the object it came from was answering
   * the wrong question.
   */
  public static validate(
    concept: CreativeConcept,
    leadDomain?: string,
    requireComplete = false
  ): CreativeConceptValidation {
    const violations: ConceptViolation[] = [];
    const cleanFields: (keyof CreativeConcept)[] = [];

    const prose = CONCEPT_PROSE_FIELDS.map((f) => String(concept[f] ?? "").trim());
    const empty = prose.every((v) => !v);

    if (!String(concept.big_idea ?? "").trim()) {
      violations.push({
        kind: "MISSING_BIG_IDEA",
        field: "big_idea",
        evidence: "",
        reason: "No idea was produced. The corpus supplied nothing to have an idea from.",
      });
    }

    // Phase 4.0 Task 5 — a valid concept needs all four elements.
    //
    // Enforced only when `requireComplete` is set, because the requirement is
    // only fair once the corpus can meet it: before the Creative Concept
    // Intelligence layer existed this would have rejected every concept for a
    // gap in the knowledge rather than a fault in the concept. Callers that want
    // the strict contract ask for it.
    if (requireComplete) {
      const required: [keyof CreativeConcept, string][] = [
        ["audience_tension", "a human tension"],
        ["consumer_insight", "an insight"],
        ["emotional_goal", "an emotional direction"],
        ["differentiation", "a differentiation"],
      ];
      for (const [field, label] of required) {
        if (!String(concept[field] ?? "").trim()) {
          violations.push({
            kind: "INCOMPLETE_CONCEPT",
            field,
            evidence: "",
            reason: `A complete concept requires ${label}, and ${String(field)} is empty.`,
          });
        }
      }
    }

    if (leadDomain && ART_DIRECTION_DOMAINS.has(String(leadDomain))) {
      violations.push({
        kind: "ART_DIRECTION_SOURCE",
        field: "big_idea",
        evidence: String(leadDomain),
        reason: `The big idea was built from a "${leadDomain}" object, which describes execution rather than a reason to care.`,
      });
    }

    for (const field of CONCEPT_PROSE_FIELDS) {
      const text = String(concept[field] ?? "").trim();
      if (!text) continue;
      let dirty = false;

      for (const [kind, patterns] of RULES) {
        for (const [pattern, reason] of patterns) {
          const m = text.match(pattern);
          if (m) {
            violations.push({ kind, field, evidence: m[0], reason: `${field} ${reason}.` });
            dirty = true;
            break; // one finding per kind per field is enough to reject it
          }
        }
      }

      const measurement = text.match(MEASUREMENT_PATTERN);
      if (measurement) {
        violations.push({
          kind: "MEASUREMENT",
          field,
          evidence: measurement[0],
          reason: `${field} carries a production quantity; a concept states a reason, not a specification.`,
        });
        dirty = true;
      }

      if (!dirty) cleanFields.push(field);
    }

    // Score from the share of fields that came back clean, with the lead-domain
    // fault weighted heavily: a concept sourced from art direction is wrong at
    // the root, not merely worded badly.
    const checked = CONCEPT_PROSE_FIELDS.filter((f) => String(concept[f] ?? "").trim()).length;
    let score = checked ? (cleanFields.length / checked) * 10 : 0;
    if (violations.some((v) => v.kind === "ART_DIRECTION_SOURCE")) score = Math.min(score, 3);
    if (violations.some((v) => v.kind === "MISSING_BIG_IDEA")) score = Math.min(score, 2);
    if (violations.some((v) => v.kind === "INCOMPLETE_CONCEPT")) score = Math.min(score, 6);

    return {
      valid: violations.length === 0,
      violations,
      separation_score: Math.round(score * 100) / 100,
      clean_fields: cleanFields,
      empty,
    };
  }

  /** One-screen summary. */
  public static format(v: CreativeConceptValidation): string {
    if (v.valid) return `Concept separation: clean (${v.separation_score.toFixed(1)}/10)`;
    const lines = [`Concept separation: REJECTED (${v.separation_score.toFixed(1)}/10, ${v.violations.length} violation(s))`];
    for (const x of v.violations.slice(0, 6)) {
      lines.push(`  [${x.kind}] ${x.field}: ${x.reason}${x.evidence ? ` — "${x.evidence}"` : ""}`);
    }
    return lines.join("\n");
  }

  /** Corpus-level view, for auditing a whole benchmark run. */
  public static validateMany(
    entries: { concept: CreativeConcept; leadDomain?: string; id: string }[]
  ): {
    total: number;
    valid: number;
    mean_separation: number;
    byKind: Record<string, number>;
    worst: { id: string; score: number; kinds: string[] }[];
  } {
    const results = entries.map((e) => ({ id: e.id, v: this.validate(e.concept, e.leadDomain) }));
    const byKind: Record<string, number> = {};
    for (const r of results) for (const x of r.v.violations) byKind[x.kind] = (byKind[x.kind] || 0) + 1;
    return {
      total: results.length,
      valid: results.filter((r) => r.v.valid).length,
      mean_separation:
        Math.round((results.reduce((s, r) => s + r.v.separation_score, 0) / (results.length || 1)) * 100) / 100,
      byKind,
      worst: results
        .filter((r) => !r.v.valid)
        .sort((a, b) => a.v.separation_score - b.v.separation_score)
        .slice(0, 5)
        .map((r) => ({ id: r.id, score: r.v.separation_score, kinds: [...new Set(r.v.violations.map((x) => x.kind))] })),
    };
  }
}
