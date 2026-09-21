import type { CreativeBlueprint } from "../evolution/experiment/CreativeBlueprint";
import { allDecisions } from "../evolution/experiment/CreativeBlueprint";

/**
 * Phase 6 — the quality judge.
 *
 * Deterministic, offline, free. No agent, no model call, no network.
 *
 * What it does and does not claim
 * -------------------------------
 * It does NOT score a picture. Nothing in this repository can look at a render
 * and say whether it is good — that judgement has been made by a human in every
 * benchmark so far, and pretending otherwise would be the most expensive lie
 * this system could tell itself. `Phase0TransmissionScorer` learned the same
 * lesson at the prompt stage and this inherits it.
 *
 * What it scores is READINESS: whether the system was entitled to expect a good
 * render. Every dimension is answerable from the blueprint and the prompt
 * without seeing the image, and each one maps to a failure this project has
 * actually measured:
 *
 *   product_accuracy    E2: the label was destroyed in 4/4 hero renders and
 *                       blank in two more. Answerable: did the identity
 *                       protection block and the copy-placement rule survive
 *                       into the prompt?
 *   concept_strength    Phase 0.5: six of twelve routes disclaimed having an
 *                       idea. Answerable: does the concept section carry a big
 *                       idea AND a tension, or only a description?
 *   visual_quality      Phase 2.1: lens 0/6, depth of field 0/6. Answerable:
 *                       how much of the photography section is grounded?
 *   commercial_quality  Answerable: is the copy hierarchy decided, and does the
 *                       layout say where it goes?
 *   brand_consistency   Answerable: does anything rest on the product and the
 *                       brand, or is the director talking to itself?
 *
 * A high score here means "nothing was left to the renderer's imagination". It
 * does not mean the picture is good, and the report says so in as many words.
 */

export type QualityDimension =
  | "product_accuracy"
  | "concept_strength"
  | "visual_quality"
  | "commercial_quality"
  | "brand_consistency"
  | "layout_quality"
  | "typography_quality"
  | "professional_advertising_similarity";

export const QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  "product_accuracy",
  "concept_strength",
  "visual_quality",
  "commercial_quality",
  "brand_consistency",
  "layout_quality",
  "typography_quality",
  "professional_advertising_similarity",
];

export interface DimensionScore {
  dimension: QualityDimension;
  /** 1–10. Readiness, never beauty. */
  score: number;
  /** What produced this number, so a reader can disagree with it specifically. */
  because: string;
  /** What would raise it. Empty when the dimension is already saturated. */
  suggestion: string;
}

export interface QualityReport {
  scores: DimensionScore[];
  mean: number;
  /** Ordered worst first: the bottleneck is whatever sits at the top. */
  suggestions: string[];
  /** Stated on every report so the number is never read as a verdict on a picture. */
  disclaimer: string;
}

const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));

/** Share of a section's fields that are grounded. */
function sectionFill(b: CreativeBlueprint | null, section: string): number {
  if (!b) return 0;
  const rows = allDecisions(b).filter((d) => d.section === section);
  if (!rows.length) return 0;
  return rows.filter((d) => d.decision).length / rows.length;
}

export interface QualityJudgeInput {
  /** The blueprint that drove the render, when one was produced. */
  blueprint?: CreativeBlueprint | null;
  /** The final compiled prompt, exactly as the provider received it. */
  prompt?: string;
}

export class RenderQualityJudge {
  /** Pure and total. Never throws; an empty input scores 1 across the board. */
  static evaluate(input: QualityJudgeInput): QualityReport {
    const b = input.blueprint || null;
    const p = input.prompt || "";

    const has = (needle: string) => p.includes(needle);
    const scores: DimensionScore[] = [];

    // ── product accuracy ──────────────────────────────────────────────────
    const protection = has("PRODUCT IDENTITY PROTECTION");
    const copyPlacement = has("belong to the layout, not to the product");
    const blankNamed = has("blank, partial or illegible label is a failed render");
    const paScore = 1 + (protection ? 4 : 0) + (copyPlacement ? 3 : 0) + (blankNamed ? 2 : 0);
    scores.push({
      dimension: "product_accuracy",
      score: clamp(paScore),
      because: `identity protection ${protection ? "present" : "ABSENT"}, copy placement rule ${
        copyPlacement ? "present" : "ABSENT"
      }, blank-label failure ${blankNamed ? "named" : "NOT named"}`,
      suggestion: protection && copyPlacement && blankNamed
        ? ""
        : "the prompt does not fully protect the product's own label; campaign copy can be printed onto it",
    });

    // ── concept strength ──────────────────────────────────────────────────
    // A big idea with no tension is a description, which is exactly what
    // Phase 0.5 measured six of twelve routes producing.
    const bigIdea = Boolean(b?.concept?.big_idea);
    const tension = Boolean(b?.concept?.creative_tension);
    const hook = Boolean(b?.concept?.emotional_hook);
    const csScore = 1 + (bigIdea ? 3 : 0) + (tension ? 4 : 0) + (hook ? 2 : 0);
    scores.push({
      dimension: "concept_strength",
      score: clamp(csScore),
      because: `big idea ${bigIdea ? "decided" : "MISSING"}, creative tension ${
        tension ? "decided" : "MISSING"
      }, emotional hook ${hook ? "decided" : "MISSING"}`,
      suggestion: tension
        ? bigIdea && hook
          ? ""
          : "the concept is partly decided; a missing hook leaves the viewer's feeling to the renderer"
        : "no creative tension is recorded — an idea with nothing to resolve renders as a description of the product",
    });

    // ── visual quality ────────────────────────────────────────────────────
    const photo = sectionFill(b, "photography");
    const art = sectionFill(b, "visual_world");
    scores.push({
      dimension: "visual_quality",
      score: clamp(1 + (photo * 5 + art * 4)),
      because: `photography ${Math.round(photo * 100)}% grounded, art direction ${Math.round(art * 100)}% grounded`,
      suggestion:
        photo >= 0.8
          ? ""
          : "the photography section is mostly unauthored; lens and focus behaviour in particular have no source in the pipeline",
    });

    // ── commercial quality ────────────────────────────────────────────────
    const hierarchy = Boolean(b?.design?.hierarchy_logic);
    const layoutFill = sectionFill(b, "layout");
    const cqScore = 1 + (hierarchy ? 4 : 0) + layoutFill * 5;
    scores.push({
      dimension: "commercial_quality",
      score: clamp(cqScore),
      because: `copy hierarchy ${hierarchy ? "decided" : "MISSING"}, layout ${Math.round(layoutFill * 100)}% grounded`,
      suggestion: hierarchy
        ? layoutFill >= 0.6
          ? ""
          : "the layout is largely undecided, so where the copy sits is left to the renderer"
        : "no reading order is recorded; the renderer decides which string leads",
    });

    // ── brand consistency ─────────────────────────────────────────────────
    // A blueprint where everything says "director" is a director talking to
    // itself, which Phase 0.5 measured as producing category defaults.
    const rows = b ? allDecisions(b).filter((d) => d.decision) : [];
    const grounded = rows.length;
    const inProduct = rows.filter(
      (d) => d.decision!.derived_from === "product_truth" || d.decision!.derived_from === "visual_dna"
    ).length;
    const share = grounded ? inProduct / grounded : 0;
    const brandFill = sectionFill(b, "brand_expression");
    scores.push({
      dimension: "brand_consistency",
      score: clamp(1 + share * 12 + brandFill * 3),
      because: `${inProduct}/${grounded} decisions rest on the product or the image, brand expression ${Math.round(
        brandFill * 100
      )}% grounded`,
      suggestion:
        share >= 0.25
          ? ""
          : "almost nothing rests on the product or the attached image; the director is reasoning from itself, which regresses to the category default",
    });

    // ── layout quality ────────────────────────────────────────────────────
    // Structure, as distinct from whether the layout is pretty. The four
    // fields below are the ones a poster fails on when it reads as a
    // photograph with words dropped on it.
    const layoutRows = b ? allDecisions(b).filter((d) => d.section === "layout" && d.decision) : [];
    const structural = ["text_area", "attention_flow", "product_position", "negative_space"];
    const decided = layoutRows.filter((d) => structural.includes(d.field)).length;
    scores.push({
      dimension: "layout_quality",
      score: clamp(1 + (decided / structural.length) * 9),
      because: `${decided}/${structural.length} structural decisions made (${structural.filter((f) => !layoutRows.some((r) => r.field === f)).join(", ") || "none missing"})`,
      suggestion:
        decided === structural.length
          ? ""
          : "the poster's structure is partly undecided — where the copy sits and where the eye goes are being left to the renderer",
    });

    // ── typography quality ────────────────────────────────────────────────
    // Typography is judged on whether it RESTS on something, not on whether a
    // typeface was named. A voice with no source is a house default.
    const typoRows = b ? allDecisions(b).filter((d) => d.section === "design" && d.decision) : [];
    const typoGrounded = typoRows.filter(
      (d) => d.decision!.derived_from === "product_truth" || d.decision!.derived_from === "visual_dna"
    ).length;
    scores.push({
      dimension: "typography_quality",
      score: clamp(1 + (typoRows.length / 6) * 6 + (typoGrounded ? 3 : 0)),
      because: `${typoRows.length}/6 typographic decisions made, ${typoGrounded} of them resting on the product rather than the director`,
      suggestion:
        typoRows.length >= 5 && typoGrounded
          ? ""
          : typoGrounded
            ? "typography is partly undecided; the unfilled fields fall back to a house default"
            : "no typographic decision rests on the product or the brand, so the voice is a default rather than a choice",
    });

    // ── professional advertising similarity ───────────────────────────────
    // Deliberately a COMPOSITE of the seven above rather than a new judgement.
    // Nothing here can compare a render to a brand campaign; what it can say is
    // whether the same things a professional job decides were decided. Naming
    // it anything stronger would be the lie this file exists to avoid.
    const so_far = scores.reduce((n, s) => n + s.score, 0) / scores.length;
    const sections = b ? new Set(allDecisions(b).filter((d) => d.decision).map((d) => d.section)).size : 0;
    scores.push({
      dimension: "professional_advertising_similarity",
      score: clamp(so_far * 0.7 + (sections / 6) * 3),
      because: `composite of the seven dimensions above (${Math.round(so_far * 10) / 10}) weighted with ${sections}/6 creative sections deciding anything`,
      suggestion:
        sections === 6 && so_far >= 8
          ? ""
          : "at least one creative discipline is not contributing; a professional job decides all six before the render",
    });

    const mean = Math.round((scores.reduce((n, s) => n + s.score, 0) / scores.length) * 100) / 100;
    return {
      scores,
      mean,
      suggestions: [...scores]
        .sort((a, x) => a.score - x.score)
        .map((s) => s.suggestion)
        .filter(Boolean),
      disclaimer:
        "These are readiness scores, computed from the blueprint and the prompt. They say how much was decided before the render, not whether the resulting picture is good. Only a human looking at the image can say that.",
    };
  }
}
