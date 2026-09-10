import { GENERIC_MARKERS, EMOTIONAL_DEPTH_MARKERS } from "../reasoning/creative-concept.types";
import {
  BENCHMARK_DIMENSIONS,
  BenchmarkCase,
  BenchmarkCategory,
  BenchmarkDimensionDefinition,
  BenchmarkDimensionId,
  BenchmarkDimensionScore,
  BenchmarkOutput,
  CreativeBenchmarkScore,
} from "./creative-benchmark.types";

/**
 * Scores one pipeline's output on one case.
 *
 * Everything here measures a property of the text. That is a real limit, stated
 * rather than hidden: the scorer can tell you a composition instruction names a
 * measurable quantity and is executable without a follow-up question, and it
 * cannot tell you the picture will be any good. Dimensions where no honest proxy
 * exists return `scored: false` and are excluded from every average, so the
 * automated number never quietly stands in for a judgement it did not make.
 *
 * One measure, used everywhere
 * ----------------------------
 * `concreteness()` is the single definition of "is this instruction specific".
 * An earlier phase of this project shipped two definitions of the same property
 * in two files, they disagreed, and the disagreement was mistaken for a corpus
 * defect for several hours. Every dimension that needs the notion calls this
 * function; none of them re-derive it.
 */

/** Units, ratios and counts — the vocabulary of an executable instruction. */
const QUANTITY = /\b\d+(\.\d+)?\s?(?:percent|%|mm|pt|points?|px|degrees?|:\s?\d|to\s\d|-\s?to\s?-\s?\d)/i;
const RATIO = /\b\d+\s*(?:to|:)\s*\d+\b/i;
const NUMBER = /\b\d+(\.\d+)?\b/;
/**
 * Ratios written in words: "four-to-one", "two to one", "three to five".
 *
 * The CIOS corpus states ratios this way throughout ("a four-to-one luminance
 * ratio"), and a digits-only measure scored those instructions the same as an
 * unqualified sentence — which would have systematically under-scored the very
 * pipeline the benchmark exists to assess. Caught by the scorer's own test.
 */
const SPELLED_NUMBER = "(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|fifty)";
const SPELLED_RATIO = new RegExp(`\\b${SPELLED_NUMBER}\\s*(?:-|\\s)\\s*to\\s*(?:-|\\s)\\s*${SPELLED_NUMBER}\\b`, "i");
/** A spelled quantity attached to a unit: "twelve columns", "two levels". */
const SPELLED_QUANTITY = new RegExp(
  `\\b${SPELLED_NUMBER}\\s+(?:percent|column|level|line|word|weight|face|point|degree|second|band|zone|step)s?\\b`,
  "i"
);
const IMPERATIVE = /^(use|apply|choose|set|place|hold|keep|limit|reduce|increase|avoid|frame|light|crop|align|reserve|track|shoot|position|compose|verify|state|separate|match|render|scale|anchor|split|order)\b/i;
const HEDGE = /\b(should|could|might|may|consider|perhaps|generally|often|usually|somewhat|fairly|try to|aim to|where possible)\b/gi;

/** Adjectives that describe a desirable quality without instructing anything. */
const EMPTY_QUALITY = [
  "beautiful", "stunning", "premium", "high-end", "elegant", "modern", "clean",
  "professional", "attractive", "eye-catching", "striking", "compelling",
  "engaging", "impactful", "harmonious", "sophisticated", "sleek", "crisp",
];

function words(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(re: RegExp, text: string): number {
  const m = (text || "").match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
  return m ? m.length : 0;
}

/**
 * 0-10: how executable a single instruction is.
 *
 * A photographer reading a 9 knows exactly what to do. Reading a 3 they have to
 * ask a question. The scale is built from what distinguishes those two in
 * practice — a named quantity, a verb, and the absence of quality adjectives
 * standing in for decisions.
 */
export function concreteness(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;

  let score = 3; // a present but unqualified instruction
  if (QUANTITY.test(t) || RATIO.test(t) || SPELLED_RATIO.test(t) || SPELLED_QUANTITY.test(t)) score += 4;
  else if (NUMBER.test(t)) score += 2;
  if (IMPERATIVE.test(t)) score += 2;
  if (t.split(/\s+/).length >= 8) score += 1;

  const hedges = countMatches(HEDGE, t);
  score -= hedges * 2;

  const empty = words(t).filter((w) => EMPTY_QUALITY.includes(w)).length;
  // Adjectives are not free: each one is a decision the reader now has to make.
  score -= empty * 1.5;

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/** Fraction of `needles` that appear in `haystack`, as whole phrases. */
function phraseHits(haystack: string, needles: string[]): string[] {
  const h = (haystack || "").toLowerCase();
  return needles.filter((n) => n && h.includes(n.toLowerCase()));
}

export class CreativeBenchmarkScorer {
  public static score(output: BenchmarkOutput, benchmarkCase: BenchmarkCase): CreativeBenchmarkScore {
    const dimensions = BENCHMARK_DIMENSIONS.map((def) => this.scoreDimension(def, output, benchmarkCase));

    const scored = dimensions.filter((d) => d.scored);
    const mean = (list: BenchmarkDimensionScore[]) =>
      list.length ? Math.round((list.reduce((s, d) => s + d.score, 0) / list.length) * 100) / 100 : 0;

    const byCategory: Partial<Record<BenchmarkCategory, number>> = {};
    for (const category of ["concept", "strategy", "visual", "production"] as BenchmarkCategory[]) {
      const inCategory = scored.filter((d) => d.category === category);
      if (inCategory.length) byCategory[category] = mean(inCategory);
    }

    const weighted = scored.filter((d) => benchmarkCase.criteria.weighted_dimensions.includes(d.dimension));

    return {
      case_id: benchmarkCase.case_id,
      pipeline: output.pipeline,
      dimensions,
      automated_overall: mean(scored),
      by_category: byCategory,
      weighted_overall: weighted.length ? mean(weighted) : undefined,
      scored_count: scored.length,
      unscored_dimensions: dimensions.filter((d) => !d.scored).map((d) => d.dimension),
    };
  }

  private static scoreDimension(
    def: BenchmarkDimensionDefinition,
    output: BenchmarkOutput,
    c: BenchmarkCase
  ): BenchmarkDimensionScore {
    const base = { dimension: def.id, category: def.category, method: def.method };
    const unscored = (finding: string): BenchmarkDimensionScore => ({
      ...base,
      score: 0,
      scored: false,
      finding,
      evidence: [],
    });

    if (def.method === "HUMAN_REQUIRED") {
      return unscored("No honest automated proxy exists; comes from blind review.");
    }

    const concept = output.concept;
    const dir = output.direction;
    const conceptProse = [
      concept.big_idea,
      concept.core_message,
      concept.consumer_insight,
      concept.differentiation,
    ]
      .filter(Boolean)
      .join(" \n ");
    const directionProse = Object.values(dir).filter(Boolean).join(" \n ");

    switch (def.id) {
      // ── Concept ──────────────────────────────────────────────────────
      case "originality": {
        if (!conceptProse.trim()) return unscored("No concept text to assess.");
        const generic = phraseHits(conceptProse, GENERIC_MARKERS);
        const avoided = phraseHits(conceptProse + " " + directionProse, c.criteria.must_avoid);
        const empty = words(conceptProse).filter((w) => EMPTY_QUALITY.includes(w));
        const score = Math.max(0, 10 - generic.length * 3 - avoided.length * 2.5 - empty.length);
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding:
            generic.length || avoided.length || empty.length
              ? `${generic.length} generic marker(s), ${avoided.length} case-specific cliché(s), ${empty.length} empty adjective(s).`
              : "No category cliché or generic marker detected.",
          evidence: [...generic, ...avoided, ...empty].slice(0, 6),
        };
      }

      case "differentiation": {
        const claim = concept.differentiation || "";
        if (!claim.trim()) {
          // Scored, not skipped: a missing differentiation claim is a result, and
          // treating it as unmeasurable would hide the pipeline's actual gap.
          return { ...base, score: 0, scored: true, finding: "No differentiation claim was produced.", evidence: [] };
        }
        const concrete = concreteness(claim);
        const empty = words(claim).filter((w) => EMPTY_QUALITY.includes(w)).length;
        const score = Math.max(0, Math.min(10, concrete - empty * 2));
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: `Claim present; concreteness ${concrete}/10${empty ? `, ${empty} quality adjective(s)` : ""}.`,
          evidence: [claim.slice(0, 120)],
        };
      }

      case "brand_fit": {
        const tone = words(c.brief.tone || "");
        const info = words(c.brief.brandInfo || "");
        const target = new Set([...tone, ...info].filter((w) => w.length > 3));
        if (!target.size || !conceptProse.trim()) return unscored("No tone vocabulary or no concept to compare.");
        const produced = new Set(words(conceptProse + " " + directionProse));
        const overlap = [...target].filter((w) => produced.has(w));
        // Overlap is capped low deliberately: matching three of a brand's own
        // words is evidence of fit, matching twelve is evidence of restating the
        // brief. The measure detects mismatch; it cannot confirm fit.
        const score = Math.min(10, 4 + overlap.length * 2);
        return {
          ...base,
          score,
          scored: true,
          finding: `${overlap.length} term(s) shared with the brief's stated tone and positioning.`,
          evidence: overlap.slice(0, 6),
        };
      }

      // ── Strategy ─────────────────────────────────────────────────────
      case "audience_understanding": {
        const insight = concept.consumer_insight || "";
        if (!insight.trim()) {
          return { ...base, score: 0, scored: true, finding: "No consumer insight was produced.", evidence: [] };
        }
        const audienceWords = new Set(words(c.brief.audience || "").filter((w) => w.length > 3));
        const insightWords = words(insight);
        const restated = insightWords.filter((w) => audienceWords.has(w)).length;
        const emotional = EMOTIONAL_DEPTH_MARKERS.filter((m) => insight.toLowerCase().includes(m));
        // An insight that mostly repeats the audience descriptor has not added
        // anything; one that names a tension has.
        const score = Math.max(0, Math.min(10, 4 + emotional.length * 2 + (insightWords.length > 8 ? 1 : 0) - restated));
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: `${emotional.length} tension marker(s), ${restated} word(s) restated from the audience descriptor.`,
          evidence: emotional.slice(0, 4),
        };
      }

      case "business_alignment": {
        const addressed = phraseHits(conceptProse + " " + directionProse, c.criteria.must_address);
        // must_address entries are sentences, so a whole-phrase hit is rare and a
        // keyword overlap is the workable measure.
        const keywordHits = c.criteria.must_address.filter((requirement) => {
          const key = words(requirement).filter((w) => w.length > 4);
          const produced = new Set(words(conceptProse + " " + directionProse));
          return key.filter((w) => produced.has(w)).length >= 2;
        });
        const total = c.criteria.must_address.length || 1;
        const score = Math.min(10, (keywordHits.length / total) * 10);
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: `${keywordHits.length} of ${total} case requirement(s) substantively addressed.`,
          evidence: [...addressed, ...keywordHits].slice(0, 4),
        };
      }

      case "positioning": {
        const premium = /premium|luxury|refined|restrained|quiet|affluent|investment|high net worth|severe/i.test(
          `${c.brief.tone} ${c.brief.brandInfo}`
        );
        if (!directionProse.trim()) return unscored("No direction to assess for positioning.");
        const restraintSignals = /restrain|minimal|negative space|margin|single|two level|quiet|reduce|limit|one\b/i;
        const saliencySignals = /contrast|bold|large|dominant|salient|prominent|urgen|fast|clear/i;
        const wanted = premium ? restraintSignals : saliencySignals;
        const hit = wanted.test(directionProse);
        const opposite = (premium ? saliencySignals : restraintSignals).test(directionProse);
        const score = hit ? (opposite ? 6 : 9) : opposite ? 3 : 5;
        return {
          ...base,
          score,
          scored: true,
          finding: `${premium ? "Premium" : "Value or utility"} positioning; direction ${hit ? "carries" : "does not carry"} the matching signal${opposite ? ", and carries the opposing one" : ""}.`,
          evidence: [directionProse.slice(0, 120)],
        };
      }

      // ── Visual ───────────────────────────────────────────────────────
      case "composition":
        return this.scoreInstruction(base, dir.composition, "composition");
      case "typography":
        return this.scoreInstruction(base, dir.typography, "typography");
      case "color_direction":
        return this.scoreInstruction(base, dir.colour, "colour");
      case "material":
        return this.scoreInstruction(base, dir.material, "material");
      case "photography": {
        // Camera and lighting are one craft decision from a photographer's side,
        // and a pipeline that supplies only one of the two has not specified the
        // shot. Averaging them would hide exactly that, so a missing half caps
        // the score rather than being averaged away.
        const camera = concreteness(dir.camera);
        const lighting = concreteness(dir.lighting);
        if (!dir.camera && !dir.lighting) {
          return { ...base, score: 0, scored: true, finding: "Neither camera nor lighting was specified.", evidence: [] };
        }
        const both = dir.camera && dir.lighting;
        const score = both ? (camera + lighting) / 2 : Math.min(4, Math.max(camera, lighting));
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: both
            ? `Camera ${camera}/10, lighting ${lighting}/10.`
            : `Only ${dir.camera ? "camera" : "lighting"} specified; capped at 4 because half the shot is undefined.`,
          evidence: [dir.camera, dir.lighting].filter(Boolean).map((v) => v.slice(0, 90)),
        };
      }

      // ── Production ───────────────────────────────────────────────────
      case "clarity": {
        const values = Object.values(dir).filter(Boolean);
        if (!values.length) return { ...base, score: 0, scored: true, finding: "No direction was produced.", evidence: [] };
        const scores = values.map((v) => concreteness(v));
        const score = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: `${values.length} instruction(s), mean concreteness ${(Math.round(score * 10) / 10).toFixed(1)}/10.`,
          evidence: values.slice(0, 3).map((v) => v.slice(0, 90)),
        };
      }

      case "consistency": {
        const values = Object.entries(dir).filter(([, v]) => v);
        if (values.length < 2) {
          return { ...base, score: 0, scored: true, finding: "Fewer than two instructions; nothing to be consistent with.", evidence: [] };
        }
        // Direct contradictions are what a reviewer actually catches: an
        // instruction to minimise and an instruction to maximise the same thing.
        const prose = directionProse.toLowerCase();
        const contradictions: string[] = [];
        const pairs: [RegExp, RegExp, string][] = [
          [/\bminimal|restrain|reduce|negative space\b/, /\bbold|maximal|dense|busy|dramatic\b/, "restraint vs boldness"],
          [/\bsoft|diffused|gentle\b/, /\bhard light|harsh|specular|dramatic shadow\b/, "soft vs hard light"],
          [/\bcentred|centered|symmetr\b/, /\boff-cent|asymmetr|rule of thirds\b/, "symmetry vs asymmetry"],
          [/\bmonochrome|neutral palette|desaturat\b/, /\bvibrant|saturated|bold colour|bold color\b/, "muted vs saturated"],
        ];
        for (const [a, b, label] of pairs) {
          if (a.test(prose) && b.test(prose)) contradictions.push(label);
        }
        const coverage = values.length / 6;
        const score = Math.max(0, Math.min(10, 5 + coverage * 5 - contradictions.length * 3));
        return {
          ...base,
          score: Math.round(score * 100) / 100,
          scored: true,
          finding: contradictions.length
            ? `${contradictions.length} contradiction(s): ${contradictions.join("; ")}.`
            : `${values.length} of 6 dimensions specified, no contradictions detected.`,
          evidence: contradictions,
        };
      }

      case "feasibility": {
        const values = Object.values(dir).filter(Boolean);
        if (!values.length) return { ...base, score: 0, scored: true, finding: "No direction to assess.", evidence: [] };
        const total = values.join(" ").length;
        const impossible = [
          /\bimpossible\b/i,
          /\bevery angle at once\b/i,
          /\binfinite\b/i,
          /\bboth .{0,20} and (?:the )?opposite\b/i,
        ].filter((re) => re.test(directionProse));
        // The compiler's ceiling is real, and direction is only one contributor
        // to a prompt. A direction block past 1200 characters starts competing
        // with the brief itself for budget.
        const overBudget = total > 1200;
        const score = Math.max(0, 10 - impossible.length * 4 - (overBudget ? 3 : 0));
        return {
          ...base,
          score,
          scored: true,
          finding: `${total} chars of direction${overBudget ? " (over the 1200-char comfort budget)" : ""}${impossible.length ? `, ${impossible.length} unproducible instruction(s)` : ""}.`,
          evidence: impossible.map(String),
        };
      }

      default:
        return unscored("No scoring method defined.");
    }
  }

  /** Shared shape for the three single-instruction visual dimensions. */
  private static scoreInstruction(
    base: { dimension: BenchmarkDimensionId; category: BenchmarkCategory; method: BenchmarkDimensionScore["method"] },
    value: string,
    label: string
  ): BenchmarkDimensionScore {
    if (!value || !value.trim()) {
      // Scored zero rather than skipped. An absent instruction is the finding
      // that matters most for the Phase 3.2 decision, and skipping it would
      // remove it from every average that decision is read from.
      return { ...base, score: 0, scored: true, finding: `No ${label} instruction was produced.`, evidence: [] };
    }
    const score = concreteness(value);
    return {
      ...base,
      score,
      scored: true,
      finding: `${label} instruction present; concreteness ${score}/10.`,
      evidence: [value.slice(0, 120)],
    };
  }
}
