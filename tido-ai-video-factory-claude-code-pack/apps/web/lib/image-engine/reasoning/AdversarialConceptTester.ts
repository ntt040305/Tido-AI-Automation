import { CreativeQualityBenchmark } from "./CreativeQualityBenchmark";
import { CreativeQualityGate, CreativeGateResult } from "./CreativeQualityGate";
import { similarity } from "./OriginalityEvaluator";
import { CreativeSynthesisInput, CreativeSynthesisOutput } from "./creative-synthesis.types";

/**
 * Attacks a concept the way a sceptical creative director would, then tries to
 * repair what the attack found.
 *
 * The quality rubric measures properties of the text. An attack asks a different
 * question — *what is wrong with this specifically* — and the two find different
 * faults. A concept can score respectably and still be, on inspection, a
 * restatement of the brief, or a claim any competitor could make word for word,
 * or an idea about a person the brief never mentioned.
 *
 * Each attack below is a question a real reviewer asks, expressed as something
 * checkable. Where the check cannot be made honestly it is not included: there is
 * no "is it a good idea" attack, because no arrangement of string comparisons
 * answers that and pretending otherwise would make the whole harness decorative.
 */

export type AttackKind =
  /** The idea restates the brief rather than adding to it. */
  | "RESTATES_BRIEF"
  /** Any competitor in the category could make the same claim. */
  | "GENERICALLY_TRUE"
  /** The idea is about a person or problem the brief did not describe. */
  | "WRONG_SUBJECT"
  /** It reproduces a default the brief explicitly said to avoid. */
  | "CATEGORY_DEFAULT"
  /** It states a business goal rather than a reason for anyone to care. */
  | "BUSINESS_SPEAK"
  /** It cannot be acted on: no direction follows from it. */
  | "UNACTIONABLE";

export interface Attack {
  kind: AttackKind;
  /** The question a reviewer would actually ask. */
  challenge: string;
  /** What in the text triggered it. */
  evidence: string;
  /** How damaging, 0-1. */
  severity: number;
}

export interface AdversarialResult {
  case_id: string;
  original: CreativeSynthesisOutput;
  attacks: Attack[];
  /** Sum of severities, 0 upward. Higher is worse. */
  attack_pressure: number;
  survived: boolean;
  /** The repaired concept, when repair was attempted and helped. */
  improved?: CreativeSynthesisOutput;
  improvement_delta?: number;
  notes: string[];
}

const BUSINESS_SPEAK = /\b(brand attribution|market share|conversion rate|recall|awareness lift|engagement|roi|kpi|footfall|basket size|interchangeability)\b/i;
const HEDGES = /\b(perhaps|maybe|might|could|somewhat|generally|often|tends to)\b/i;

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

export class AdversarialConceptTester {
  /** Runs every attack that can be made honestly against this concept. */
  public static attack(
    concept: CreativeSynthesisOutput,
    input: CreativeSynthesisInput,
    briefProblem: string,
    productDescription: string
  ): Attack[] {
    const attacks: Attack[] = [];
    const idea = concept.big_idea;
    const ideaWords = words(idea);

    // ── Restates the brief ─────────────────────────────────────────────
    const vsProblem = overlap(ideaWords, words(briefProblem));
    if (vsProblem > 0.55) {
      attacks.push({
        kind: "RESTATES_BRIEF",
        challenge: "You have told me what I already told you. What is the idea?",
        evidence: `${Math.round(vsProblem * 100)}% overlap with the brief's own problem statement`,
        severity: Math.min(1, (vsProblem - 0.55) * 2 + 0.4),
      });
    }

    // ── Generically true ───────────────────────────────────────────────
    // A claim survives this only if it names something specific to the brief.
    // Measured as: does the idea contain any term from the product, brand or
    // territory that a competitor could not equally use?
    const specific = new Set([...words(productDescription), ...words(input.campaign_territory)]);
    const specificHits = [...ideaWords].filter((w) => specific.has(w)).length;
    if (specificHits === 0) {
      attacks.push({
        kind: "GENERICALLY_TRUE",
        challenge: "Any brand in this category could say this. What makes it yours?",
        evidence: "no term from the product or territory appears in the idea",
        severity: 0.7,
      });
    }

    // ── Wrong subject ──────────────────────────────────────────────────
    const tensionInProblem = overlap(words(input.human_tension), words(briefProblem));
    if (input.human_tension && tensionInProblem < 0.12) {
      attacks.push({
        kind: "WRONG_SUBJECT",
        challenge: "This is about a different problem from the one in my brief.",
        evidence: `the tension shares ${Math.round(tensionInProblem * 100)}% with the stated problem`,
        severity: 0.9,
      });
    }

    // ── Category default ───────────────────────────────────────────────
    const hit = (input.avoid || []).find((a) => a && idea.toLowerCase().includes(a.toLowerCase()));
    if (hit) {
      attacks.push({
        kind: "CATEGORY_DEFAULT",
        challenge: `The brief specifically said not to do this: "${hit}".`,
        evidence: hit,
        severity: 1,
      });
    }

    // ── Business speak ─────────────────────────────────────────────────
    const bs = idea.match(BUSINESS_SPEAK);
    if (bs) {
      attacks.push({
        kind: "BUSINESS_SPEAK",
        challenge: "That is a business outcome, not a reason for anyone to care.",
        evidence: bs[0],
        severity: 0.8,
      });
    }

    // ── Unactionable ───────────────────────────────────────────────────
    if (HEDGES.test(idea) || idea.split(/\s+/).length > 32) {
      attacks.push({
        kind: "UNACTIONABLE",
        challenge: "I could not brief a team from this. What would they make?",
        evidence: HEDGES.test(idea) ? "hedged language" : `${idea.split(/\s+/).length} words`,
        severity: 0.5,
      });
    }

    return attacks;
  }

  /**
   * Generate, attack, improve.
   *
   * Improvement reuses the quality gate's refinement rather than inventing a
   * second repair path: one mechanism for rebuilding a concept, exercised by two
   * callers. A second would drift from the first and the two would disagree
   * about what a better concept is.
   */
  public static run(
    caseId: string,
    concept: CreativeSynthesisOutput,
    input: CreativeSynthesisInput,
    briefProblem: string,
    productDescription: string,
    priorIdeas: string[] = []
  ): AdversarialResult {
    const attacks = this.attack(concept, input, briefProblem, productDescription);
    const pressure = Number(attacks.reduce((s, a) => s + a.severity, 0).toFixed(2));
    const notes: string[] = [];

    // Survives when nothing landed hard. A single severity-1 attack is fatal on
    // its own: reproducing a default the brief explicitly excluded is not a
    // matter of degree.
    const fatal = attacks.some((a) => a.severity >= 0.9);
    const survived = !fatal && pressure < 1.2;

    if (survived) return { case_id: caseId, original: concept, attacks, attack_pressure: pressure, survived, notes };

    const before = CreativeQualityBenchmark.score(caseId, concept, input, briefProblem, priorIdeas);
    const gate: CreativeGateResult = CreativeQualityGate.evaluate(
      caseId,
      concept,
      input,
      briefProblem,
      priorIdeas
    );

    if (gate.concept.big_idea === concept.big_idea) {
      notes.push("Refinement produced nothing better over this material.");
      return { case_id: caseId, original: concept, attacks, attack_pressure: pressure, survived, notes };
    }

    const afterAttacks = this.attack(gate.concept, input, briefProblem, productDescription);
    const afterPressure = afterAttacks.reduce((s, a) => s + a.severity, 0);
    if (afterPressure >= pressure) {
      notes.push(
        `Refinement changed the construction but not the verdict (${pressure.toFixed(2)} → ${afterPressure.toFixed(2)}).`
      );
      return { case_id: caseId, original: concept, attacks, attack_pressure: pressure, survived, notes };
    }

    notes.push(
      `Improved from ${concept.angle} to ${gate.concept.angle}; attack pressure ${pressure.toFixed(2)} → ${afterPressure.toFixed(2)}.`
    );
    return {
      case_id: caseId,
      original: concept,
      attacks,
      attack_pressure: pressure,
      survived,
      improved: gate.concept,
      improvement_delta: Number((gate.score.total - before.total).toFixed(2)),
      notes,
    };
  }

  /** Run-level summary. */
  public static summarise(results: AdversarialResult[]): {
    cases: number;
    survived: number;
    improved: number;
    unrepairable: number;
    mean_pressure: number;
    by_attack: Record<string, number>;
  } {
    const by: Record<string, number> = {};
    for (const r of results) for (const a of r.attacks) by[a.kind] = (by[a.kind] || 0) + 1;
    return {
      cases: results.length,
      survived: results.filter((r) => r.survived).length,
      improved: results.filter((r) => r.improved).length,
      unrepairable: results.filter((r) => !r.survived && !r.improved).length,
      mean_pressure: Number(
        (results.reduce((s, r) => s + r.attack_pressure, 0) / (results.length || 1)).toFixed(2)
      ),
      by_attack: by,
    };
  }

  /** Guards against a "repair" that is really a duplicate. */
  public static isDuplicate(idea: string, priorIdeas: string[]): boolean {
    return priorIdeas.some((p) => similarity(idea, p) >= 0.8);
  }
}
