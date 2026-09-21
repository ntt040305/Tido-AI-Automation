import type { CreativeBlueprint, Decision } from "../evolution/experiment/CreativeBlueprint";
import { allDecisions } from "../evolution/experiment/CreativeBlueprint";
import type { QualityReport } from "./RenderQualityJudge";
import { OriginalityEvaluator } from "../reasoning/OriginalityEvaluator";
import type { ConceptComparison } from "./ConceptEvaluator";

/**
 * Creative Diagnosis — what is wrong, why, and what to change.
 *
 * The judge answers "how ready is this". It does not answer "what do I do about
 * it", and a score with no action attached is the thing a creative team ignores.
 * `commercial_quality 5.2` was reported identically on 12 of 12 renders of
 * run_20260919_007 and moved nothing, because nothing downstream could act on
 * a number.
 *
 * Every diagnosis below carries a `targets` list: the exact blueprint fields a
 * correction would change. That is what makes the correction TARGETED rather
 * than a regeneration — the loop can act on `design.hierarchy_logic` without
 * disturbing a photography decision that was already right.
 *
 * Deterministic and offline, like everything else in this layer. It reads the
 * blueprint and the report; it never looks at a picture, and it says so.
 */

export type ProblemCategory =
  | "typography"
  | "layout"
  | "composition"
  | "product_focus"
  | "brand_consistency"
  | "photography"
  | "commercial_conversion"
  /** The idea itself is weak, generic, or restates its own input. */
  | "creative_concept";

export interface CreativeDiagnosis {
  problem_category: ProblemCategory;
  /** What is wrong, in one line a creative director would recognise. */
  problem: string;
  severity: "low" | "medium" | "high";
  /** The measured fact behind it, quotable and checkable. */
  evidence: string;
  /** Why it is wrong, rather than what is wrong. */
  root_cause: string;
  /** What to change. Written as a direction, not as a score. */
  recommended_correction: string;
  /** `section.field` entries a correction would touch. Never empty. */
  targets: string[];
}

const SEVERITY_ORDER: Record<CreativeDiagnosis["severity"], number> = { high: 0, medium: 1, low: 2 };

/** Which of a section's fields are undecided. */
function undecided(b: CreativeBlueprint | null, section: string): string[] {
  if (!b) return [];
  return allDecisions(b)
    .filter((d) => d.section === section && !d.decision)
    .map((d) => d.field);
}

function decisionAt(b: CreativeBlueprint | null, section: string, field: string): Decision | null {
  if (!b) return null;
  return allDecisions(b).find((d) => d.section === section && d.field === field)?.decision ?? null;
}

/**
 * Reads a blueprint and its score, and returns the problems worth fixing.
 *
 * Ordered worst first. Empty when nothing actionable is wrong, which is a
 * legitimate answer and must not be padded — a diagnosis list that always finds
 * something teaches a reader to stop reading it.
 */
export function diagnose(
  b: CreativeBlueprint | null,
  report: QualityReport,
  /** The comparison of the director's own candidates, where one was possible. */
  concepts?: ConceptComparison | null
): CreativeDiagnosis[] {
  const out: CreativeDiagnosis[] = [];
  const score = (d: string) => report.scores.find((s) => s.dimension === d)?.score ?? 10;

  // ── typography: the reading order ─────────────────────────────────────
  if (!decisionAt(b, "design", "hierarchy_logic")) {
    out.push({
      problem_category: "typography",
      problem: "No reading order is decided, so the renderer chooses which line leads.",
      severity: "high",
      evidence: "design.hierarchy_logic is undecided",
      root_cause:
        "Nobody assigned the authorized strings a job: the client labelled none and the director returned no copy roles.",
      recommended_correction:
        "State the reading order explicitly. The headline leads, the closing line ends, and everything else supports.",
      targets: ["design.hierarchy_logic", "layout.text_area"],
    });
  }

  // ── layout: structure left to the renderer ────────────────────────────
  const layoutGaps = undecided(b, "layout").filter((f) =>
    ["text_area", "attention_flow", "product_position", "negative_space"].includes(f)
  );
  if (layoutGaps.length) {
    out.push({
      problem_category: "layout",
      problem: `The poster's structure is partly undecided: ${layoutGaps.join(", ")}.`,
      severity: layoutGaps.length >= 3 ? "high" : "medium",
      evidence: `${layoutGaps.length} of 4 structural layout fields are undecided`,
      root_cause:
        "The director described a picture rather than a composition, and nothing downstream decided where the copy sits or where the eye travels.",
      recommended_correction:
        "Anchor the frame on the product, keep one clear band for the copy, and leave the space between them empty rather than decorated.",
      targets: layoutGaps.map((f) => `layout.${f}`),
    });
  }

  // ── product focus ─────────────────────────────────────────────────────
  if (score("product_accuracy") < 8) {
    out.push({
      problem_category: "product_focus",
      problem: "The product's own identity is not fully protected in the prompt.",
      severity: score("product_accuracy") < 5 ? "high" : "medium",
      evidence: report.scores.find((s) => s.dimension === "product_accuracy")?.because || "",
      root_cause:
        "Campaign copy and the product's printed label are not distinguished, so the renderer may print one over the other.",
      recommended_correction:
        "Reproduce the label exactly and set campaign copy in the layout around the product, never on it.",
      targets: ["layout.text_area", "brand_expression.material_language"],
    });
  }

  // ── brand consistency: the director talking to itself ─────────────────
  const rows = b ? allDecisions(b).filter((d) => d.decision) : [];
  const inProduct = rows.filter(
    (d) => d.decision!.derived_from === "product_truth" || d.decision!.derived_from === "visual_dna"
  ).length;
  const share = rows.length ? inProduct / rows.length : 0;
  if (share < 0.25) {
    out.push({
      problem_category: "brand_consistency",
      problem: "Almost nothing rests on the product or the attached image.",
      severity: share < 0.15 ? "high" : "medium",
      evidence: `${inProduct}/${rows.length} decisions rest on the product or the image`,
      root_cause:
        "The director is reasoning from itself. Phase 0.5 measured that state producing the category default rather than this brand's answer.",
      recommended_correction:
        "Take the palette and the surface qualities from the product itself rather than from a house style.",
      targets: ["brand_expression.color_system", "brand_expression.material_language", "photography.material_rendering"],
    });
  }

  // ── photography: behaviour never decided ──────────────────────────────
  const photoGaps = undecided(b, "photography");
  if (photoGaps.length >= 2) {
    out.push({
      problem_category: "photography",
      problem: `The photograph is under-directed: ${photoGaps.join(", ")} are undecided.`,
      severity: photoGaps.length >= 4 ? "high" : "medium",
      evidence: `${photoGaps.length} of 6 photography fields are undecided`,
      root_cause:
        "Lens behaviour and focus have no author anywhere in the pipeline, so they fall through to whatever the renderer does by default.",
      recommended_correction:
        "Isolate the product from its surroundings: the surface carrying its identity stays sharp and the background falls away behind it.",
      targets: photoGaps.map((f) => `photography.${f}`),
    });
  }

  // ── composition: an idea with nothing to resolve ──────────────────────
  if (b && !b.concept?.creative_tension) {
    out.push({
      problem_category: "composition",
      problem: "The concept has no tension, so it renders as a description of the product.",
      severity: "medium",
      evidence: "concept.creative_tension is undecided",
      root_cause:
        "No trade-off was recorded. Phase 0.5 measured six of twelve routes explicitly disclaiming an idea in this state.",
      recommended_correction:
        "Let one element carry the idea and keep the rest subordinate to it, so the frame resolves rather than lists.",
      targets: ["concept.creative_tension", "concept.emotional_hook"],
    });
  }

  // ── creative concept: is the idea any good ────────────────────────────
  //
  // The correction this loop could not make. Everything above finds a gap --
  // something undecided -- and a gap is structural. An idea that IS decided and
  // is nevertheless generic looks identical to a good one from a completeness
  // count, and that is the failure Phase 0.5 measured: six of twelve routes
  // decided a direction and the direction was a category default.
  //
  // `reasoning/OriginalityEvaluator` already measures this and was never wired
  // to anything that renders. It is pure, so asking it costs nothing. It is
  // also honest about its own limits: two of its four signals are proxies and
  // it weights them accordingly, and there is no embedding service behind the
  // distance measure. Treated here as a flag for review, never as a verdict.
  const idea = b?.concept?.big_idea?.value?.trim();
  if (idea) {
    const source = [
      b?.concept?.campaign_concept?.value,
      b?.story?.value,
      b?.concept?.message_strategy?.value,
    ].filter(Boolean) as string[];
    const assessed = OriginalityEvaluator.assess(idea, source, []);
    // The composite score is NOT the trigger. Measured on four ideas, it ranked
    // "premium luxury quality" (6.93) above "a premium modern luxury lifestyle
    // experience" (5.73) because the memorability proxy rewards brevity -- the
    // module documents that weakness itself. `notes` is the real signal: it
    // fires only when a category marker, an abstract word, or a close paraphrase
    // of the source was actually found, and each of those is a measurement
    // rather than a proxy.
    const flagged = !assessed.accepted || assessed.notes.length > 0 || assessed.score < 5;
    if (flagged) {
      out.push({
        problem_category: "creative_concept",
        problem:
          assessed.notes[0] ||
          "The idea is close to its own source material or to a category default.",
        severity: assessed.score < 5 ? "high" : "medium",
        evidence: `OriginalityEvaluator scored the big idea ${assessed.score}/10 (${assessed.notes.length} note(s))`,
        root_cause:
          "An idea that restates its own input has added nothing, and one built from category markers is the default any competitor would reach.",
        recommended_correction:
          "Build the frame on what is specifically true of this product rather than on what is true of its category.",
        // Targets the concept rather than a craft field: this is a brief to
        // rewrite, not a slot to fill, which is why it belongs in the director
        // correction rather than in the deterministic pass.
        targets: ["concept.big_idea", "concept.creative_tension"],
      });
    }
  }

  // ── the route that was rejected and scored higher ─────────────────────
  //
  // The director chose, with a reason, having read the brief -- so this does
  // NOT overrule it. What it does is surface a comparison the pipeline was
  // discarding: every candidate is developed and assessed, then all but one are
  // thrown away before anything downstream can look at them.
  //
  // Flagged only past a margin, because these scores rest partly on proxies and
  // a small gap is noise.
  if (concepts?.selected_is_weaker) {
    out.push({
      problem_category: "creative_concept",
      problem: `A rejected route scored higher than the one chosen: "${concepts.strongest}".`,
      severity: concepts.margin >= 3 ? "high" : "medium",
      evidence: `${concepts.scores.length} candidates compared; the chosen route trails the strongest by ${concepts.margin}`,
      root_cause:
        "The director developed several routes and the comparison between them stopped at the director. Nothing downstream could see what was rejected or why it scored better.",
      recommended_correction:
        "Build the frame on the stronger route's idea, keeping the product truth the chosen route rested on.",
      targets: ["concept.big_idea", "concept.creative_tension"],
    });
  }

  // ── commercial conversion ─────────────────────────────────────────────
  if (score("commercial_quality") < 7) {
    out.push({
      problem_category: "commercial_conversion",
      problem: "The asset is not yet arranged to do commercial work.",
      severity: score("commercial_quality") < 5 ? "high" : "medium",
      evidence: report.scores.find((s) => s.dimension === "commercial_quality")?.because || "",
      root_cause:
        "Hierarchy and copy placement are the two things that turn a photograph into an advertisement, and at least one of them is open.",
      recommended_correction:
        "Lead with the offer, close with the action, and keep the product legible between them.",
      targets: ["design.hierarchy_logic", "layout.text_area", "layout.attention_flow"],
    });
  }

  return out.sort((a, x) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[x.severity]);
}

/**
 * The correction context a Creative Director would be handed on a second pass.
 *
 * Written as direction, not as scores: a director given "typography 6/10"
 * cannot act, and a director given "the headline competes with the product,
 * move it to a supporting zone" can. Returns undefined when nothing is wrong,
 * so a caller never feeds an empty correction into a brief.
 *
 * This is a STRING for a prompt, deliberately. It does not mutate the blueprint
 * and it does not call anything — whoever holds the director's call decides
 * whether a second pass is worth its cost.
 */
export function correctionBrief(diagnoses: CreativeDiagnosis[]): string | undefined {
  const actionable = diagnoses.filter((d) => d.severity !== "low");
  if (!actionable.length) return undefined;
  const lines: string[] = [
    "CORRECTION REQUIRED — the previous pass was reviewed and these are its faults.",
    "Keep the creative intent. Change only what is named here.",
  ];
  for (const d of actionable) {
    lines.push(
      "",
      `${d.problem_category.toUpperCase().replace(/_/g, " ")} (${d.severity}):`,
      `  Problem: ${d.problem}`,
      `  Why: ${d.root_cause}`,
      `  Change: ${d.recommended_correction}`
    );
  }
  return lines.join("\n");
}

/** Counts and categories only — never the diagnosis prose. */
export function diagnosisTelemetry(d: CreativeDiagnosis[]) {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const x of d) {
    bySeverity[x.severity] = (bySeverity[x.severity] || 0) + 1;
    byCategory[x.problem_category] = (byCategory[x.problem_category] || 0) + 1;
  }
  return {
    problems: d.length,
    by_severity: bySeverity,
    by_category: byCategory,
    targets: [...new Set(d.flatMap((x) => x.targets))],
  };
}
