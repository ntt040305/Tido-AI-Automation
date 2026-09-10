import { OriginalityEvaluator, similarity } from "./OriginalityEvaluator";
import {
  CREATIVE_QUALITY_METHOD,
  CREATIVE_QUALITY_WEIGHTS,
  CreativeQualityDimension,
  CreativeQualityScore,
  CreativeSynthesisInput,
  CreativeSynthesisOutput,
} from "./creative-synthesis.types";

/**
 * Scores a finished idea on the five-dimension creative rubric.
 *
 * Two of the five are genuinely measured. `human_truth` asks whether the idea's
 * tension appears in the brief's own account of the problem, which is a fact
 * about two texts. `strategic_fit` asks whether it addresses the stated
 * objective, likewise.
 *
 * The other three are proxies and are labelled as such on every score, because a
 * hundred-point total that hides which sixty points are proxied is a total
 * somebody will act on as though it were measured. `differentiation` measures
 * distance from category default, which is not the same as being ownable by this
 * brand and no other. `emotional_power` counts opposition structure and feeling
 * vocabulary; a sentence can carry both and move nobody. `memorability` counts
 * brevity and concreteness, which correlate with recall imperfectly.
 *
 * What none of them measure is whether the idea is any good. That needs the
 * blind human review, and this rubric exists to make the automated half of that
 * comparison honest rather than to replace it.
 */

const OBJECTIVE_STOP = new Set(["drive", "increase", "build", "launch", "grow", "improve", "raise", "the", "and", "for", "with"]);

function words(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}

/**
 * What the "measured" half is actually measuring.
 *
 * `human_truth` and `strategic_fit` are called measured because each compares two
 * real texts rather than counting a stylistic tell. What they compare with is
 * shared vocabulary, and shared vocabulary is not the same thing as shared
 * subject. The hundred-brief run produced the demonstration: brief problem
 * "mature buyers reject correction language because it frames the face they have
 * now as a defect", tension "she is not afraid of looking older; she is afraid of
 * no longer recognising the person looking back" — the same idea in different
 * words, scored 0.000.
 *
 * The same overlap drives `AdversarialConceptTester`'s WRONG_SUBJECT attack. So
 * the two are one measurement reported twice, and a run where both agree is not
 * two findings confirming each other. Whether a low `human_truth` is a retrieval
 * failure or a vocabulary mismatch cannot be settled from inside this file; the
 * blind human benchmark settles it.
 */
const LEXICAL_CAVEAT =
  "  note: human_truth and strategic_fit compare shared vocabulary, not shared meaning,\n" +
  "        and the adversarial WRONG_SUBJECT attack reruns the same comparison. A low\n" +
  "        score here is a lexical mismatch, which may or may not be a retrieval failure.";

export class CreativeQualityBenchmark {
  /**
   * Scores one idea.
   *
   * `briefProblem` is the brief's own statement of what it is up against — the
   * creative challenge, not the product description. Passing the wrong text
   * silently turns `human_truth` from a measure into noise.
   */
  public static score(
    caseId: string,
    output: CreativeSynthesisOutput,
    input: CreativeSynthesisInput,
    briefProblem: string,
    priorIdeas: string[] = []
  ): CreativeQualityScore {
    const notes: string[] = [];
    const idea = output.big_idea;

    // ── Human truth (measured) ─────────────────────────────────────────
    // Does the tension the idea rests on actually appear in the brief's own
    // account of the problem?
    const tensionInBrief = overlap(words(input.human_tension), words(briefProblem));
    const ideaInBrief = overlap(words(idea), words(briefProblem));
    const human_truth = Number(Math.min(1, tensionInBrief * 0.7 + ideaInBrief * 0.3).toFixed(4));
    if (human_truth < 0.2) notes.push("The tension is not visible in the brief's own statement of the problem.");

    // ── Strategic fit (measured) ───────────────────────────────────────
    const objectiveWords = new Set([...words(input.brand_objective)].filter((w) => !OBJECTIVE_STOP.has(w)));
    const reasonCovers = overlap(objectiveWords, words(output.strategic_reason));
    const audienceCovers = overlap(words(input.audience), words(`${idea} ${output.strategic_reason}`));
    const strategic_fit = Number(Math.min(1, reasonCovers * 0.6 + audienceCovers * 0.4).toFixed(4));

    // ── Differentiation (proxy) ────────────────────────────────────────
    const avoidHits = (input.avoid || []).filter((a) => a && idea.toLowerCase().includes(a.toLowerCase())).length;
    const nearestPrior = priorIdeas.reduce((m, p) => Math.max(m, similarity(idea, p)), 0);
    const differentiation = Number(
      Math.max(0, 1 - avoidHits * 0.4 - nearestPrior * 0.5).toFixed(4)
    );
    if (avoidHits) notes.push(`Contains ${avoidHits} of the case's own must-avoid phrases.`);

    // ── Emotional power (proxy) ────────────────────────────────────────
    const assessment = OriginalityEvaluator.assess(idea, [], [], input.avoid || []);
    const hookPresent = output.emotional_hook.trim().length > 15 ? 0.3 : 0;
    const emotional_power = Number(
      Math.min(1, assessment.signals.emotional_tension * 0.7 + hookPresent).toFixed(4)
    );

    // ── Memorability (proxy) ───────────────────────────────────────────
    const memorability = assessment.signals.memorability;

    const dimensions: Record<CreativeQualityDimension, number> = {
      human_truth,
      strategic_fit,
      differentiation,
      emotional_power,
      memorability,
    };

    let total = 0;
    for (const k of Object.keys(CREATIVE_QUALITY_WEIGHTS) as CreativeQualityDimension[]) {
      total += dimensions[k] * CREATIVE_QUALITY_WEIGHTS[k];
    }

    return {
      case_id: caseId,
      dimensions,
      total: Number(total.toFixed(2)),
      method: CREATIVE_QUALITY_METHOD,
      notes,
    };
  }

  /** Aggregates a run, keeping the measured and proxied halves separate. */
  public static aggregate(scores: CreativeQualityScore[]): {
    cases: number;
    mean_total: number;
    by_dimension: Record<CreativeQualityDimension, number>;
    /** The two genuinely measured dimensions, out of their 45 combined points. */
    measured_subtotal: number;
    /** The three proxied dimensions, out of their 55. */
    proxied_subtotal: number;
  } {
    const keys = Object.keys(CREATIVE_QUALITY_WEIGHTS) as CreativeQualityDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = Object.fromEntries(
      keys.map((k) => [k, Number(mean(scores.map((s) => s.dimensions[k])).toFixed(4))])
    ) as Record<CreativeQualityDimension, number>;

    const subtotal = (which: "MEASURED" | "PROXY") =>
      Number(
        keys
          .filter((k) => CREATIVE_QUALITY_METHOD[k] === which)
          .reduce((sum, k) => sum + by_dimension[k] * CREATIVE_QUALITY_WEIGHTS[k], 0)
          .toFixed(2)
      );

    return {
      cases: scores.length,
      mean_total: Number(mean(scores.map((s) => s.total)).toFixed(2)),
      by_dimension,
      measured_subtotal: subtotal("MEASURED"),
      proxied_subtotal: subtotal("PROXY"),
    };
  }

  public static format(agg: ReturnType<typeof CreativeQualityBenchmark.aggregate>): string {
    const L = [`CREATIVE QUALITY — ${agg.cases} cases · mean ${agg.mean_total.toFixed(1)} / 100`];
    for (const k of Object.keys(CREATIVE_QUALITY_WEIGHTS) as CreativeQualityDimension[]) {
      const w = CREATIVE_QUALITY_WEIGHTS[k];
      const earned = agg.by_dimension[k] * w;
      L.push(
        `  ${k.padEnd(18)} ${earned.toFixed(1).padStart(5)} / ${String(w).padStart(2)}   ` +
          `${CREATIVE_QUALITY_METHOD[k] === "PROXY" ? "(proxy)" : ""}`
      );
    }
    L.push(`  measured half : ${agg.measured_subtotal.toFixed(1)} / 45`);
    L.push(`  proxied half  : ${agg.proxied_subtotal.toFixed(1)} / 55  — directional only`);
    L.push("");
    L.push(LEXICAL_CAVEAT);
    return L.join("\n");
  }
}
