import { ReasoningKnowledgeObject } from "./reasoning-knowledge.types";
import { ReasoningKnowledgeValidator, ValidationIssue } from "./ReasoningKnowledgeValidator";

/**
 * Phase 2 — the Knowledge Quality Gate.
 *
 * Phase 0 validated that a knowledge object is well FORMED. This gate decides
 * whether it is worth HAVING. They are different questions: an object can carry
 * every required field and still say nothing a senior creative would act on.
 *
 * The gate exists because the corpus is about to grow. At twenty objects a human
 * reviews everything; at a thousand nobody does, and the failure mode is silent —
 * the corpus fills with plausible-sounding advice that never changes a decision.
 * That is exactly how Layer 1 arrived at a 5.8:1 hedge ratio while every block
 * passed its own schema.
 *
 * Five scored dimensions, plus three hard failures that no score can outweigh.
 * Structure is checked first and separately: a malformed object is not graded,
 * it is rejected.
 */

export type QualityDimension =
  | "specificity"
  | "decision_value"
  | "context_completeness"
  | "anti_pattern_quality"
  | "trade_off_clarity";

export type HardFailure = "GENERIC_ADVICE" | "SUBJECTIVE_STATEMENT" | "NON_ACTIONABLE";

export interface QualityDimensionScore {
  dimension: QualityDimension;
  /** 0-10. */
  score: number;
  finding: string;
  improvement?: string;
}

export interface KnowledgeQualityReport {
  knowledge_id: string;
  file?: string;
  domain: string;
  structural_errors: ValidationIssue[];
  dimensions: QualityDimensionScore[];
  /** Mean of the five dimensions, 0-10. */
  overall: number;
  hard_failures: { failure: HardFailure; evidence: string }[];
  /** Whether this object may be retrieved. */
  admitted: boolean;
  rejection_reasons: string[];
}

export interface CorpusQualityReport {
  total: number;
  admitted: number;
  rejected: number;
  average_overall: number;
  by_domain: Record<string, { total: number; admitted: number }>;
  reports: KnowledgeQualityReport[];
}

// ── Detectors ───────────────────────────────────────────────────────────

/** Language that declines to choose. Layer 2's defining failure. */
const HEDGE = /\b(may|might|could|as appropriate|according to the needs|where appropriate|if desired|generally|typically|often|sometimes|can be|should probably|consider)\b/gi;

/** Aesthetic judgement offered instead of a reason. */
const SUBJECTIVE = /\b(beautiful|gorgeous|stunning|lovely|pretty|nice|amazing|awesome|i think|we believe|in my opinion|feels right|looks good|looks great|visually pleasing|aesthetically pleasing)\b/gi;

/** Filler that describes a desirable quality without naming an action. */
const GENERIC_FILLER = /\b(high quality|premium quality|best practice|industry standard|eye-catching|stand out|professional look|modern and clean|world class|cutting edge|state of the art|attention-grabbing)\b/gi;

/**
 * Whether a decision tells someone to do something.
 *
 * This began as a whitelist of imperatives and was extended three times, each
 * time because real knowledge used a verb nobody had thought of — "Identify",
 * "Route", "Verify", "Suspend", "Fill". An English imperative list is open-ended,
 * so a whitelist guarantees a steady trickle of correct knowledge being rejected,
 * and a gate that rejects good work is worse than no gate because it is trusted.
 *
 * The test is now the sentence's SHAPE rather than its vocabulary. A descriptive
 * statement announces a subject and then a finite verb — "Younger consumers ARE
 * more active", "The palette IS restrained". An imperative does neither: it opens
 * on a bare verb with the subject implied.
 *
 * Two signals, either of which means descriptive:
 *   1. The sentence opens with a determiner, pronoun or existential.
 *   2. A copula or modal appears within the first five words, which only happens
 *      when a subject preceded it.
 *
 * The known-imperative list is retained purely as a fast accept, so the common
 * cases never reach the heuristic.
 */
const KNOWN_IMPERATIVE = /^(use|apply|choose|select|adopt|frame|anchor|lead|set|build|place|hold|render|prioriti[sz]e|avoid|replace|reject|limit|restrict|reserve|shoot|light|compose|crop|keep|treat|show|cast|ground|isolate|separate|align|scale|reduce|increase|remove|give|work|review|photograph|rake|claim|fill|suspend|divide|split|stack|pair|capture|retain|score|identify|route|match|supply|verify|state|declare)\b/i;

/** Openers that can only begin a description, never an instruction. */
const DESCRIPTIVE_OPENER = /^(the|a|an|this|that|these|those|it|its|they|their|them|we|our|us|you|your|i|my|he|she|his|her|there|here|most|many|some|all|every|each|both|either|neither|when|if|while|although|because|since|however|therefore|thus|so)\b/i;

/** A finite verb this close to the start implies a subject came before it. */
const EARLY_COPULA = /^(?:\S+\s+){0,4}(is|are|was|were|be|been|being|has|have|had|will|would|can|could|should|shall|may|might|must|does|do|did|tends|seems|appears)\b/i;

function isActionable(decision: string): boolean {
  const d = (decision || "").trim();
  if (!d) return false;
  if (KNOWN_IMPERATIVE.test(d)) return true;
  if (DESCRIPTIVE_OPENER.test(d)) return false;
  if (EARLY_COPULA.test(d)) return false;
  return true;
}

/** Concrete measurable specification. */
const CONCRETE = /(\b\d+\s?(mm|degrees?|deg|%|stops?|px|:\d+)\b)|(\bf\/\d)|(\b\d+\s?[-–]\s?\d+\b)|(\bone\b|\bsingle\b|\btwo\b|\bthree\b|\bupper (two )?thirds?\b|\blower third\b)/i;

const CONTEXT_AXES = [
  "industry", "category", "audience", "objective", "channel", "asset_type", "brand_position",
] as const;

function asArray(v: unknown): string[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
}

function matches(re: RegExp, text: string): string[] {
  return Array.from(text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))).map((m) => m[0]);
}

export class KnowledgeQualityGate {
  /** Admission thresholds. Deliberately strict — a thin corpus beats a noisy one. */
  public static readonly MIN_OVERALL = 6.0;
  public static readonly MIN_SPECIFICITY = 5;
  public static readonly MIN_DECISION_VALUE = 6;
  public static readonly MIN_CONTEXT_COMPLETENESS = 3;

  // ── Dimension 1: specificity ────────────────────────────────────────
  /**
   * Hedging is weighted by where it occurs.
   *
   * A hedge in `decision` is the defining Layer 2 failure — the object declined
   * to choose. The same word in `reasoning` is usually ordinary discourse: "a
   * frame that COULD carry a competitor's logo" states a test condition, and
   * "can be tested objectively" states a capability. Scoring both alike failed
   * several of the sharpest objects in the corpus for describing possibility.
   */
  private static specificity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    // A hedge inside a relative clause describes the CONDITION being tested, not
    // the instruction. "Reject any asset that could belong to another campaign"
    // is fully decisive — the verb is Reject, and "could" defines what to look
    // for. Counting it failed two of the sharpest evaluation rules in the corpus,
    // so only the leading clause is measured for commitment.
    const leadingClause = (o.decision || "").split(/\b(?:that|which|whose|who|where|when|whether)\b/i)[0];
    const decisionHedges = matches(HEDGE, leadingClause);
    const supportHedges = matches(HEDGE, [o.reasoning, o.why_this_works].filter(Boolean).join(" "));
    const concrete = CONCRETE.test(o.decision || "");

    let score = 5;
    if (concrete) score += 3;
    if ((o.decision || "").length > 60) score += 1;
    if ((o.decision || "").length > 110) score += 1;
    score -= decisionHedges.length * 3;
    score -= Math.floor(supportHedges.length / 3);
    score = Math.max(0, Math.min(10, score));

    const hedges = [...decisionHedges, ...supportHedges];
    return {
      dimension: "specificity",
      score,
      finding: decisionHedges.length
        ? `${decisionHedges.length} hedge word(s) in the DECISION: ${[...new Set(decisionHedges)].join(", ")}`
        : concrete
        ? "Decision names a concrete, checkable specification."
        : "Decision is committed but carries no measurable specification.",
      improvement: score < this.MIN_SPECIFICITY ? "Replace hedging with a specific, checkable instruction." : undefined,
    };
  }

  // ── Dimension 2: decision value ─────────────────────────────────────
  private static decisionValue(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const decision = (o.decision || "").trim();
    const actionable = isActionable(decision);
    const hasImpact = Boolean(o.impact && o.impact.length > 10);
    const hasScore = typeof o.impact_score === "number";
    const hasAlternatives = asArray(o.alternatives).length > 0;

    let score = 0;
    if (actionable) score += 5;
    if (hasImpact) score += 2;
    if (hasScore) score += 1;
    if (hasAlternatives) score += 2;
    score = Math.min(10, score);

    return {
      dimension: "decision_value",
      score,
      finding: [
        actionable ? "states an action" : "does NOT begin with an action",
        hasImpact ? "states expected impact" : "no expected impact",
        hasAlternatives ? `${asArray(o.alternatives).length} alternative(s)` : "no alternatives offered",
      ].join(" · "),
      improvement: score < this.MIN_DECISION_VALUE
        ? "Open the decision with an imperative and state what it is expected to achieve."
        : undefined,
    };
  }

  // ── Dimension 3: context completeness ───────────────────────────────
  private static contextCompleteness(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const specific = CONTEXT_AXES.filter((a) => {
      const v = asArray(o.context?.[a]);
      return v.length > 0 && !v.every((x) => x === "*");
    });
    // Every axis specified is as suspicious as none: knowledge that applies to
    // exactly one situation cannot transfer (Governance §14 Transfer Test).
    const n = specific.length;

    // Universal scope is legitimate for two kinds of knowledge, and penalising
    // them rejected most of the craft corpus at Phase 2.1 scale.
    //
    //   A `principle` or `evaluation_rule` is universal by definition — "one
    //   organising idea per campaign" and "reject interchangeable work" are true
    //   in every industry, and asking them to name one would be asking them to lie.
    //
    //   Craft domains describe how an instrument behaves. Selective focus directs
    //   attention identically in beauty and in automotive; what is situational is
    //   WHEN to reach for it, and that choice happens at decision time, not in the
    //   knowledge. Strategic domains are the opposite: context is what makes them
    //   correct or wrong, so they must still declare it.
    const universalByType = ["principle", "evaluation_rule", "framework"].includes(String(o.knowledge_type));
    const CRAFT_DOMAINS = ["camera", "lighting", "composition", "color", "material", "typography", "photography", "layout"];
    const META_DOMAINS = ["critic", "concept"];
    const universalByDomain =
      CRAFT_DOMAINS.includes(String(o.domain)) || META_DOMAINS.includes(String(o.domain));
    const mayBeUniversal = universalByType || universalByDomain;

    let score: number;
    if (n === 0) score = mayBeUniversal ? 7 : 0;
    else if (n <= 2) score = 5;
    else if (n <= 4) score = 9;
    else if (n <= 5) score = 10;
    else score = 7;

    return {
      dimension: "context_completeness",
      score,
      finding: n === 0
        ? mayBeUniversal
          ? `Universal scope, accepted for ${universalByType ? "a " + o.knowledge_type : "the " + o.domain + " domain"}.`
          : "Every axis is a wildcard — the object never says when it applies."
        : `${n}/7 axes specified: ${specific.join(", ")}`,
      improvement: score < this.MIN_CONTEXT_COMPLETENESS
        ? "Name at least the industry and brand position this applies to, or declare it a principle."
        : n > 5
        ? "Consider relaxing an axis — over-specified knowledge cannot transfer."
        : undefined,
    };
  }

  // ── Dimension 4: anti-pattern quality ───────────────────────────────
  private static antiPatternQuality(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const aps = o.anti_patterns || [];
    if (aps.length === 0) {
      return {
        dimension: "anti_pattern_quality",
        score: 0,
        finding: "No anti-patterns. The object cannot teach what to avoid (Governance §9).",
        improvement: "Name the category default this decision displaces, why it fails, and the replacement.",
      };
    }

    let score = 4;
    const complete = aps.filter((a) => a.problem && a.why_it_fails && a.replacement);
    score += Math.min(3, complete.length * 3);
    // A replacement that merely negates the problem teaches nothing.
    const substantive = complete.filter((a) => a.replacement.length > 20 && !/^(do not|don't|avoid)\b/i.test(a.replacement.trim()));
    score += substantive.length ? 3 : 0;
    score = Math.min(10, score);

    return {
      dimension: "anti_pattern_quality",
      score,
      finding: `${aps.length} anti-pattern(s); ${complete.length} complete; ${substantive.length} offer a substantive replacement.`,
      improvement: score < 7 ? "Give each anti-pattern a replacement that names what to do instead." : undefined,
    };
  }

  // ── Dimension 5: trade-off clarity ──────────────────────────────────
  private static tradeOffClarity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const t = o.trade_off;
    if (!t) {
      return {
        dimension: "trade_off_clarity",
        score: 0,
        finding: "No trade-off. Every rule has a cost (Governance §10).",
        improvement: "State what this decision gives up, and the conditions where it is the wrong call.",
      };
    }
    if (typeof t === "string") {
      const both = /\bbut\b|\bhowever\b|\bat the cost of\b|\bin exchange\b|\btrade\b/i.test(t);
      return {
        dimension: "trade_off_clarity",
        score: both ? 6 : 3,
        finding: both ? "Prose trade-off names both sides." : "Prose trade-off names only a benefit.",
        improvement: both ? "Convert to structured form for machine reasoning." : "State the cost, not only the gain.",
      };
    }
    let score = 4;
    if (t.advantage) score += 2;
    if (t.limitation) score += 2;
    if (t.suitable_conditions) score += 1;
    if (t.unsuitable_conditions) score += 1;
    score = Math.min(10, score);
    return {
      dimension: "trade_off_clarity",
      score,
      finding: `advantage=${!!t.advantage} limitation=${!!t.limitation} suitable=${!!t.suitable_conditions} unsuitable=${!!t.unsuitable_conditions}`,
      improvement: score < 8 ? "Add the conditions under which this becomes the wrong choice." : undefined,
    };
  }

  // ── Hard failures ───────────────────────────────────────────────────
  /**
   * Three faults no score can offset.
   *
   * These are scanned on the decision chain only — `anti_patterns` and
   * `avoid_when` are supposed to quote weak practice in order to reject it, and
   * penalising them would punish the objects doing the work.
   */
  public static hardFailures(o: ReasoningKnowledgeObject): { failure: HardFailure; evidence: string }[] {
    const out: { failure: HardFailure; evidence: string }[] = [];
    const chain = [o.decision, o.reasoning, o.why_this_works, o.impact].filter(Boolean).join(" ");

    const filler = matches(GENERIC_FILLER, chain);
    if (filler.length) {
      out.push({ failure: "GENERIC_ADVICE", evidence: `generic filler: ${[...new Set(filler)].join(", ")}` });
    }

    const subjective = matches(SUBJECTIVE, chain);
    if (subjective.length) {
      out.push({ failure: "SUBJECTIVE_STATEMENT", evidence: `unsupported judgement: ${[...new Set(subjective)].join(", ")}` });
    }

    const decision = (o.decision || "").trim();
    if (decision && !isActionable(decision)) {
      out.push({ failure: "NON_ACTIONABLE", evidence: `decision does not open with an action: "${decision.slice(0, 60)}…"` });
    }

    return out;
  }

  // ── Evaluation ──────────────────────────────────────────────────────
  public static evaluate(o: ReasoningKnowledgeObject): KnowledgeQualityReport {
    const structural_errors = ReasoningKnowledgeValidator.validateStructure(o);
    const dimensions = [
      this.specificity(o),
      this.decisionValue(o),
      this.contextCompleteness(o),
      this.antiPatternQuality(o),
      this.tradeOffClarity(o),
    ];
    const overall = Number((dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length).toFixed(2));
    const hard_failures = this.hardFailures(o);
    const rejection_reasons: string[] = [];

    if (structural_errors.length) {
      rejection_reasons.push(`${structural_errors.length} structural error(s) — object is malformed.`);
    }
    for (const hf of hard_failures) rejection_reasons.push(`${hf.failure}: ${hf.evidence}`);

    const get = (d: QualityDimension) => dimensions.find((x) => x.dimension === d)!.score;
    if (overall < this.MIN_OVERALL) rejection_reasons.push(`Overall ${overall} below threshold ${this.MIN_OVERALL}.`);
    if (get("specificity") < this.MIN_SPECIFICITY) rejection_reasons.push(`Specificity ${get("specificity")} below ${this.MIN_SPECIFICITY}.`);
    if (get("decision_value") < this.MIN_DECISION_VALUE) rejection_reasons.push(`Decision value ${get("decision_value")} below ${this.MIN_DECISION_VALUE}.`);
    if (get("context_completeness") < this.MIN_CONTEXT_COMPLETENESS) rejection_reasons.push(`Context completeness ${get("context_completeness")} below ${this.MIN_CONTEXT_COMPLETENESS}.`);

    return {
      knowledge_id: o.knowledge_id || "(missing id)",
      file: o._file,
      domain: String(o.domain || "(none)"),
      structural_errors,
      dimensions,
      overall,
      hard_failures,
      admitted: rejection_reasons.length === 0,
      rejection_reasons,
    };
  }

  public static evaluateCorpus(objects: ReasoningKnowledgeObject[]): CorpusQualityReport {
    const reports = objects.map((o) => this.evaluate(o));
    const by_domain: Record<string, { total: number; admitted: number }> = {};
    for (const r of reports) {
      by_domain[r.domain] ||= { total: 0, admitted: 0 };
      by_domain[r.domain].total++;
      if (r.admitted) by_domain[r.domain].admitted++;
    }
    return {
      total: reports.length,
      admitted: reports.filter((r) => r.admitted).length,
      rejected: reports.filter((r) => !r.admitted).length,
      average_overall: reports.length
        ? Number((reports.reduce((s, r) => s + r.overall, 0) / reports.length).toFixed(2))
        : 0,
      by_domain,
      reports,
    };
  }

  /** One-line diagnostic: object → score → retrievability. */
  public static formatDiagnostic(r: KnowledgeQualityReport): string {
    const dims = r.dimensions.map((d) => `${d.dimension.replace(/_/g, " ").slice(0, 12)}=${d.score}`).join(" ");
    return `${r.admitted ? "ADMITTED" : "REJECTED"}  ${String(r.overall).padStart(5)}/10  ${dims}  ${r.knowledge_id}`;
  }
}
