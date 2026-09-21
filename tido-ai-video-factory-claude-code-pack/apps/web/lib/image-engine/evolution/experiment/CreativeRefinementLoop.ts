import type { CreativeBlueprint } from "./CreativeBlueprint";
import { allDecisions } from "./CreativeBlueprint";
import { ProfessionalCreativeBrain, CreativeBrainInput } from "./ProfessionalCreativeBrain";
import { RenderQualityJudge, QualityReport } from "../../benchmark/RenderQualityJudge";
import {
  CreativeDiagnosis,
  correctionBrief,
  diagnose,
  diagnosisTelemetry,
} from "../../benchmark/CreativeDiagnosis";
import { compareConcepts, ConceptComparison } from "../../benchmark/ConceptEvaluator";

/**
 * The refinement loop: generate → judge → diagnose → correct → regenerate →
 * compare → select.
 *
 * What was wrong with the previous version
 * ----------------------------------------
 * It called `assemble` twice with identical inputs. The brain is deterministic,
 * so the second blueprint was byte-identical to the first and `improved` was
 * structurally always false. It produced a useful critique and called itself a
 * refinement loop, which is the more dangerous of the two failures: a loop that
 * does nothing looks exactly like a loop that found nothing to do.
 *
 * What makes pass two different now
 * ---------------------------------
 * `corrections` — a map of `section.field` to a replacement, derived from the
 * diagnosis and fed back into the ladder as its LOWEST tier. That is the only
 * input that differs between the passes, which makes the comparison honest: any
 * score change is attributable to the correction and to nothing else.
 *
 * A correction can only fill a field nothing decided. It cannot overrule the
 * client, the director, or an observation. A critic who can overwrite the brief
 * is not a critic, and USER > DIRECTOR > AI does not stop applying because a
 * later pass disagrees.
 *
 * Monotonic by construction
 * -------------------------
 * The worse pass is discarded. The loop can leave a blueprint unchanged; it can
 * never make one worse. That property is what allows it to run unattended on
 * every request.
 *
 * Cost: none. No model call, no agent, no network. The correction is derived
 * from structures already in memory, which is why this can run on every render
 * rather than on a sampled few.
 */

export interface Critique {
  /** `section.field` for every decision nothing authored. */
  ungrounded: string[];
  /**
   * Fields whose only source was the director's own reasoning.
   *
   * Not a defect on its own. It becomes one in aggregate: Phase 0.5 measured
   * that a director reasoning from itself regresses to the category default.
   */
  director_only: string[];
  /** Ordered worst-dimension-first, straight from the judge. */
  problems: string[];
  /** What to change, in the order most likely to move the score. */
  suggestions: string[];
  /** The structured diagnosis. What a creative director would act on. */
  diagnosis: CreativeDiagnosis[];
  /** How the director's own candidates ranked, when there were several. */
  concepts?: ConceptComparison | null;
}

export interface RefinementResult {
  blueprint: CreativeBlueprint;
  before: QualityReport;
  after: QualityReport;
  critique: Critique;
  /** True when the corrected pass scored higher and was therefore kept. */
  improved: boolean;
  /** Mean score delta. Never negative: a worse pass is discarded. */
  delta: number;
  /** The corrections applied on pass two, keyed `section.field`. */
  corrections: Record<string, { value: string; because: string }>;
  /**
   * Set only when `applyDirectorRevision` ran. True when the revised pass beat
   * both earlier ones and was kept.
   */
  director_revision_kept?: boolean;
  /**
   * The correction context a second Creative Director call would receive.
   *
   * Built whether or not anyone spends that call. Producing it is free;
   * spending a model call on it is not, so that decision belongs to the caller.
   */
  director_correction?: string;
}

/**
 * Turns a diagnosis into concrete field corrections.
 *
 * Only targets that are genuinely UNDECIDED are corrected. A field the director
 * already decided is left alone even when a diagnosis names it — the diagnosis
 * is then advice for the next brief rather than an overwrite.
 *
 * Pure.
 */
export function correctionsFor(
  b: CreativeBlueprint,
  diagnoses: CreativeDiagnosis[]
): Record<string, { value: string; because: string }> {
  const out: Record<string, { value: string; because: string }> = {};
  const undecided = new Set(
    allDecisions(b).filter((d) => !d.decision).map((d) => `${d.section}.${d.field}`)
  );
  for (const d of diagnoses) {
    for (const target of d.targets) {
      if (!undecided.has(target) || out[target]) continue;
      out[target] = {
        value: d.recommended_correction,
        because: `${d.problem_category}: ${d.root_cause}`,
      };
    }
  }
  return out;
}

export interface RefinementInput extends CreativeBrainInput {
  /** The compiled prompt, so the judge can see the identity protection block. */
  prompt?: string;
}

export class CreativeRefinementLoop {
  /**
   * One generate → judge → diagnose → correct → regenerate → compare cycle.
   *
   * Pure and total. Returns the better of the two passes and the evidence for
   * the choice, so a reader can disagree with the verdict specifically.
   */
  static run(input: RefinementInput): RefinementResult {
    const prompt = input.prompt || "";

    // 1. GENERATE
    const first = ProfessionalCreativeBrain.assemble(input);

    // 2. JUDGE
    const before = RenderQualityJudge.evaluate({ blueprint: first, prompt });

    // 3. DIAGNOSE
    // The candidate comparison comes from the judgment the caller already has,
    // so this costs nothing and adds no call.
    const concepts: ConceptComparison | null = compareConcepts(input.judgment?.strategy);
    const diagnosis = diagnose(first, before, concepts);

    // 4. CORRECT — the only thing that differs between the two passes.
    const corrections = correctionsFor(first, diagnosis);

    const crit: Critique = {
      ungrounded: allDecisions(first).filter((d) => !d.decision).map((d) => `${d.section}.${d.field}`),
      director_only: allDecisions(first)
        .filter((d) => d.decision?.derived_from === "director")
        .map((d) => `${d.section}.${d.field}`),
      problems: before.scores
        .filter((s) => s.score < 7)
        .sort((a, x) => a.score - x.score)
        .map((s) => `${s.dimension} ${s.score}/10 — ${s.because}`),
      suggestions: before.suggestions,
      diagnosis,
      concepts,
    };

    // Nothing to correct is a legitimate outcome, and re-running to prove it
    // would burn a pass to learn what is already known.
    if (!Object.keys(corrections).length) {
      return {
        blueprint: first,
        before,
        after: before,
        critique: crit,
        improved: false,
        delta: 0,
        corrections: {},
        director_correction: correctionBrief(diagnosis),
      };
    }

    // 5. REGENERATE
    const second = ProfessionalCreativeBrain.assemble({ ...input, corrections });
    const after = RenderQualityJudge.evaluate({ blueprint: second, prompt });

    // 6. COMPARE and 7. SELECT
    const improved = after.mean > before.mean;
    return {
      blueprint: improved ? second : first,
      before,
      after: improved ? after : before,
      critique: crit,
      improved,
      delta: improved ? Math.round((after.mean - before.mean) * 100) / 100 : 0,
      corrections,
      director_correction: correctionBrief(diagnosis),
    };
  }

  /**
   * The critique as text, for the run log.
   *
   * Never sent to a model. It exists so a human reading a benchmark can see why
   * a render scored what it scored without opening the blueprint.
   */
  static report(r: RefinementResult): string {
    const lines: string[] = [
      `readiness ${r.before.mean}/10${r.improved ? ` → ${r.after.mean}/10 (+${r.delta})` : " (no improvable gap found)"}`,
      `${r.critique.ungrounded.length} fields undecided, ${r.critique.director_only.length} resting on the director alone`,
      `${r.critique.diagnosis.length} problems diagnosed, ${Object.keys(r.corrections).length} corrected`,
    ];
    for (const d of r.critique.diagnosis.slice(0, 3)) {
      lines.push(`  [${d.severity}] ${d.problem_category}: ${d.problem}`);
    }
    return lines.join("\n");
  }

  /**
   * The eighth stage: a blueprint rebuilt from a Creative Director revision.
   *
   * Completes the architecture without putting a model call inside this file.
   * The loop stays pure and synchronous -- it can run on every request for
   * nothing -- and the caller, which already owns the director and already
   * knows whether a second call is affordable, spends it and hands the revised
   * decision back here.
   *
   * That split is deliberate. A loop that calls a model is a loop that cannot
   * be tested offline, cannot run on every render, and fails when a gateway is
   * down. `director_correction` on the result is the context to send; this is
   * where the answer comes back.
   *
   * Three-way comparison, same monotonic rule: the original, the corrected
   * pass, and the revised pass all get judged and the best is kept. A revision
   * that scores worse is discarded, so a bad second opinion cannot degrade the
   * output.
   */
  static applyDirectorRevision(
    previous: RefinementResult,
    revised: RefinementInput
  ): RefinementResult {
    const prompt = revised.prompt || "";
    const third = ProfessionalCreativeBrain.assemble(revised);
    const thirdReport = RenderQualityJudge.evaluate({ blueprint: third, prompt });

    // The best of what we already had, so a revision competes with the winner
    // rather than with the first draft.
    const incumbentScore = previous.after.mean;
    const wins = thirdReport.mean > incumbentScore;

    return {
      blueprint: wins ? third : previous.blueprint,
      before: previous.before,
      after: wins ? thirdReport : previous.after,
      critique: previous.critique,
      improved: wins || previous.improved,
      delta: wins
        ? Math.round((thirdReport.mean - previous.before.mean) * 100) / 100
        : previous.delta,
      corrections: previous.corrections,
      director_correction: previous.director_correction,
      director_revision_kept: wins,
    };
  }

  /** Counts only — never the blueprint or the diagnosis prose. */
  static telemetry(r: RefinementResult) {
    return {
      readiness_before: r.before.mean,
      readiness_after: r.after.mean,
      improved: r.improved,
      delta: r.delta,
      corrections_applied: Object.keys(r.corrections).length,
      ...(r.director_revision_kept === undefined ? {} : { director_revision_kept: r.director_revision_kept }),
      corrected_fields: Object.keys(r.corrections),
      ...diagnosisTelemetry(r.critique.diagnosis),
    };
  }
}
