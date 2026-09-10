import { CulturalContext, NO_CULTURE } from "./cultural-context.types";
import { CulturalContextResolver } from "./CulturalContextResolver";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { EmotionalPowerEvaluator } from "./EmotionalPowerEvaluator";
import { HumanTruthOriginalityEvaluator } from "./HumanTruthOriginalityEvaluator";
import { HumanTruthReview } from "./HumanTruthReview";
import { StressTestReport, TASTE_METHOD, TASTE_WEIGHTS, TasteDimension, TasteScore } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4 — the eight a director reads an idea against.
 *
 * Three of the eight are not computed here
 * ---------------------------------------
 * `originality`, `human_resonance` and `emotional_power` were already scored, by
 * `HumanTruthOriginalityEvaluator`, `HumanTruthReview` and
 * `EmotionalPowerEvaluator` respectively. This engine carries those numbers
 * rather than recomputing them, and `TASTE_METHOD` marks them `DERIVED`.
 *
 * That is deliberate. Two evaluators asking the same question in different words
 * will disagree, and when they do there is no principled way to choose between
 * them — you end up with whichever the aggregate happened to weight higher. One
 * evaluator per property, carried forward, is the only arrangement where a
 * dimension means one thing.
 *
 * The five that are computed here are the ones nothing upstream asked about:
 * whether the idea belongs to a place, whether it is simple, whether it sticks,
 * whether it can be made, and whether it serves the brief's objective.
 *
 * What a high total means
 * ----------------------
 * That nothing obvious is wrong. See the file header of `creative-taste.types`:
 * this layer identifies work a director would reject and cannot identify work a
 * director would love. The number is a floor.
 */

/** Concrete things a camera can point at. Execution needs one. */
const EXECUTABLE = [
  "aisle", "shelf", "counter", "room", "door", "house", "home", "flat", "table",
  "bill", "receipt", "phone", "screen", "photograph", "menu", "queue", "morning",
  "night", "bottle", "packet", "label", "box", "bag", "street", "shop", "face",
  "hands", "voice", "letter", "list", "size", "seat", "mirror", "window", "key",
  "chair", "bed", "kitchen", "car", "bus", "market", "sign", "receipt", "price",
];

/** Language that cannot be photographed. */
const UNFILMABLE =
  /\b(?:strategy|positioning|framework|synergy|optimis\w*|optimiz\w*|leverage|scalab\w*|paradigm|holistic|ecosystem|value proposition)\b/i;

/** Abstractions that make a sentence forgettable. */
const ABSTRACT = [
  "experience", "solution", "journey", "lifestyle", "wellness", "value",
  "quality", "innovation", "engagement", "satisfaction", "excellence",
  "opportunity", "capability", "functionality",
];

export class CreativeTasteEngine {
  public static evaluate(
    idea: string,
    context: {
      /** The truth the idea expresses. */
      human_truth?: string;
      /** The brief's stated problem. */
      briefProblem?: string;
      objective?: string;
      audience?: string;
      product?: string;
      culture?: CulturalContext;
      tension?: DynamicHumanTension | null;
      priorIdeas?: string[];
      priorTruths?: string[];
      /** Where the stress tests already landed, for `execution_potential`. */
      stress?: StressTestReport;
    } = {}
  ): TasteScore {
    const t = String(idea || "").trim();
    const notes: string[] = [];

    if (!t) {
      const zero = {} as Record<TasteDimension, number>;
      for (const k of Object.keys(TASTE_WEIGHTS) as TasteDimension[]) zero[k] = 0;
      return { idea: t, dimensions: zero, total: 0, method: TASTE_METHOD, notes: ["No idea to evaluate."] };
    }

    // ── Derived: carried from the evaluator that owns each property ────
    const originality =
      HumanTruthOriginalityEvaluator.evaluate(context.human_truth || t, {
        briefProblem: context.briefProblem,
        priorTruths: context.priorTruths,
        tension: context.tension,
      }).score / 100;

    const human_resonance =
      HumanTruthReview.review(context.human_truth || t, {
        briefProblem: context.briefProblem || "",
        audience: context.audience || "",
        product: context.product || "",
        objective: context.objective,
        tension: context.tension,
      }).score / 100;

    const power = EmotionalPowerEvaluator.evaluate(t, {
      audience: context.audience,
      priorIdeas: context.priorIdeas,
      tension: context.tension,
    });
    const emotional_power = power.score / 20;

    // ── Cultural resonance (proxy) ─────────────────────────────────────
    // Whether the idea touches a force this market actually carries. Where no
    // market was established the dimension is neutral rather than zero: an idea
    // is not worse for being written before anyone said where it runs.
    const culture = context.culture || NO_CULTURE;
    let cultural_resonance = 0.5;
    if (culture.country !== "unspecified") {
      const force = CulturalContextResolver.forceFor(culture, t);
      const symbol = CulturalContextResolver.symbolFor(culture, t);
      cultural_resonance = force && symbol ? 1 : force || symbol ? 0.75 : 0.35;
      if (cultural_resonance <= 0.35) {
        notes.push("Nothing in the idea touches a force this market carries.");
      }
    } else {
      notes.push("No market established, so cultural resonance is neutral rather than scored.");
    }

    // ── Simplicity (proxy) ─────────────────────────────────────────────
    const words = t.split(/\s+/).length;
    const clauses = t.split(/[,;:—]/).filter((c) => c.trim().length > 3).length;
    const simplicity = clamp(
      (words <= 12 ? 1 : words <= 18 ? 0.8 : words <= 24 ? 0.5 : 0.2) * 0.7 +
        (clauses <= 2 ? 0.3 : clauses === 3 ? 0.15 : 0)
    );

    // ── Memorability (proxy) ───────────────────────────────────────────
    // Brevity, concreteness, and one thing to hold on to.
    const lowered = t.toLowerCase();
    const concrete = EXECUTABLE.filter((c) => new RegExp(`\\b${c}s?\\b`, "i").test(t)).length;
    const abstract = ABSTRACT.filter((a) => lowered.includes(a)).length;
    const memorability = clamp(
      (words <= 14 ? 0.45 : words <= 20 ? 0.3 : 0.12) +
        Math.min(0.4, concrete * 0.2) +
        0.15 -
        abstract * 0.2
    );
    if (!concrete) notes.push("Nothing concrete to remember it by.");

    // ── Execution potential (proxy) ────────────────────────────────────
    // Could a team make this. Needs something a camera can point at, and must
    // not be written in language that cannot be photographed.
    const unfilmable = UNFILMABLE.test(t);
    const execution_potential = clamp(
      (concrete ? 0.55 : 0.2) + (unfilmable ? -0.4 : 0.25) + (context.stress?.survived ? 0.2 : 0)
    );
    if (unfilmable) notes.push(`Contains language nothing can be shot of: "${t.match(UNFILMABLE)?.[0]}".`);

    // ── Strategic fit (proxy) ──────────────────────────────────────────
    // Does the objective remain reachable from the idea? Measured as whether the
    // idea's subject is the audience the objective is aimed at, not as keyword
    // overlap with the objective itself — an idea that names its own objective is
    // a brief, and the earlier phases removed that on purpose.
    const audienceWords = words_(context.audience || "");
    const ideaWords = words_(t);
    const addressesAudience = overlap(audienceWords, ideaWords) > 0.15 || /\b(?:people|they|you|nobody|everyone)\b/i.test(t);
    const truthCarried = context.human_truth
      ? overlap(words_(context.human_truth), ideaWords) > 0.1
      : true;
    const strategic_fit = clamp((addressesAudience ? 0.5 : 0.15) + (truthCarried ? 0.5 : 0.2));
    if (!truthCarried) notes.push("The idea has drifted from the truth it is meant to express.");

    const dimensions: Record<TasteDimension, number> = {
      originality: round(originality),
      human_resonance: round(human_resonance),
      emotional_power: round(emotional_power),
      cultural_resonance: round(cultural_resonance),
      simplicity: round(simplicity),
      memorability: round(memorability),
      execution_potential: round(execution_potential),
      strategic_fit: round(strategic_fit),
    };

    let total = 0;
    for (const k of Object.keys(TASTE_WEIGHTS) as TasteDimension[]) {
      total += dimensions[k] * TASTE_WEIGHTS[k];
    }

    return { idea: t, dimensions, total: Number(total.toFixed(2)), method: TASTE_METHOD, notes };
  }

  public static aggregate(scores: TasteScore[]): {
    cases: number;
    mean_total: number;
    by_dimension: Record<TasteDimension, number>;
    weakest: TasteDimension;
    derived_share: number;
  } {
    const dims = Object.keys(TASTE_WEIGHTS) as TasteDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = {} as Record<TasteDimension, number>;
    for (const d of dims) by_dimension[d] = Number(mean(scores.map((s) => s.dimensions[d])).toFixed(4));
    const ranked = [...dims].sort(
      (a, b) => by_dimension[a] * TASTE_WEIGHTS[a] - by_dimension[b] * TASTE_WEIGHTS[b]
    );
    const derivedWeight = dims
      .filter((d) => TASTE_METHOD[d] === "DERIVED")
      .reduce((n, d) => n + TASTE_WEIGHTS[d], 0);
    return {
      cases: scores.length,
      mean_total: Number(mean(scores.map((s) => s.total)).toFixed(2)),
      by_dimension,
      weakest: ranked[0],
      derived_share: derivedWeight / 100,
    };
  }

  public static format(agg: ReturnType<typeof CreativeTasteEngine.aggregate>): string {
    const L = [`CREATIVE TASTE — ${agg.cases} ideas · mean ${agg.mean_total.toFixed(1)} / 100`];
    for (const d of Object.keys(TASTE_WEIGHTS) as TasteDimension[]) {
      const w = TASTE_WEIGHTS[d];
      L.push(
        `  ${d.padEnd(20)} ${(agg.by_dimension[d] * w).toFixed(1).padStart(5)} / ${String(w).padStart(2)}   ` +
          `(${TASTE_METHOD[d].toLowerCase()})`
      );
    }
    L.push(`  weakest dimension    : ${agg.weakest}`);
    L.push("");
    L.push(
      `  note: ${(agg.derived_share * 100).toFixed(0)}% of this total is carried from evaluators that already`
    );
    L.push("        scored those properties, not recomputed here. The rest are proxies. A high total");
    L.push("        means nothing obvious is wrong; it is a floor, not a judgement of the work.");
    L.push("        This is a different scale from CreativeQualityBenchmark and does not replace it.");
    return L.join("\n");
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Number(clamp(n).toFixed(4));
}
function words_(text: string): Set<string> {
  return new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  );
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}
