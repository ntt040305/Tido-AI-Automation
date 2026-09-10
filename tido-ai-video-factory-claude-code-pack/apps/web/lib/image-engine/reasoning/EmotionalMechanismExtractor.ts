import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { MemoryPatternEvaluator } from "./MemoryPatternEvaluator";
import {
  EmotionalMechanism,
  MECHANISM_REASONS,
  MemoryMechanism,
} from "./emotional-mechanism.types";

/**
 * CIOS Phase 4.0.6 — the four components, and the reason they add up to.
 *
 * Reading order matters
 * --------------------
 * The components are read from the idea first and from the insight material
 * second. That order is deliberate: the question is why *this sentence* would be
 * remembered, and an idea that fails to carry its own fear does not get credit
 * for one sitting upstream in a motivation stack. Where the idea supplies
 * nothing the insight's material is used and the evidence says so, because a
 * component inherited is weaker than one present.
 *
 * The honest weak point
 * --------------------
 * `mechanism` is an inference over the four components and it is the least
 * defensible thing here. Two ideas with an identical component profile can work
 * on a reader for different reasons; nothing in this file can separate them. It
 * is reported with its components attached so a director can overrule it from
 * the same evidence it used.
 */

/** What a person is avoiding, named. */
const FEAR_TERMS = [
  "afraid", "fear", "shame", "ashamed", "guilt", "blame", "exposed", "humiliat",
  "judged", "insult", "underestimat", "embarrass", "isolat", "alone", "regret",
  "taken in", "carel", "wrong", "vanity", "seen as", "read as", "avoiding",
  "risk", "lose", "lost", "cost", "unwanted", "unasked",
];

/** What a person wants, named. */
const DESIRE_TERMS = [
  "want", "wants", "wanted", "need", "needs", "would rather", "wish", "hope",
  "permission", "relief", "recognis", "recogniz", "belong", "trust", "certain",
  "safe", "seen", "understood", "keep", "protect", "defend", "ask for",
];

/** Two things held against each other. */
const CONTRADICTION =
  /\b(?:rather than|instead of|and (?:cannot|will not|would not|still|yet)|not\b[^.]*\bbut\b|is not\b[^.]*\bit is\b|before they|long before|do neither|have to stop|turn out to be the same|and not one of them|at the same time)\b/i;

/** Movement from one state to another. */
const TRANSFORMATION =
  /\b(?:no longer|used to|stopped|started|becomes?|became|turns? into|ends? up|comes? back|until|after|before|once|by the time|from\b[^.]*\bto\b)\b/i;

/** Language that says a thing not usually said aloud. */
const TRANSGRESSION =
  /\b(?:nobody (?:says|admits|will say|puts)|not one of them will|what nobody|the thing (?:nobody|no one)|quietly|never once|will not say|out loud|say(?:s|ing)? the thing)\b/i;

/** First-person or second-person address: the register of recognition. */
const SELF_ADDRESS = /^["“]|\bI\b|\byou\b|\byour\b/;

export class EmotionalMechanismExtractor {
  public static extract(
    idea: string,
    context: {
      human_truth?: string;
      tension?: DynamicHumanTension | null;
    } = {}
  ): EmotionalMechanism {
    const t = String(idea || "").trim();
    const notes: string[] = [];
    const evidence: Record<string, string> = {};

    if (!t) {
      return {
        idea: t,
        human_fear: "",
        human_desire: "",
        contradiction: "",
        emotional_transformation: "",
        mechanism: null,
        confidence: 0,
        reason: "There is no idea to read.",
        evidence,
        notes: ["No idea supplied."],
      };
    }

    const lowered = t.toLowerCase();
    const stack = context.tension?.motivation;

    // ── Human fear ─────────────────────────────────────────────────────
    const fearHit = FEAR_TERMS.find((f) => lowered.includes(f));
    let human_fear = "";
    if (fearHit) {
      human_fear = this.clauseAround(t, fearHit);
      evidence.human_fear = `in the idea: "${fearHit}"`;
    } else if (stack?.social_consequence) {
      human_fear = stack.social_consequence;
      evidence.human_fear = "inherited from the motivation stack, not present in the idea";
      notes.push("The idea does not carry its own fear; it was taken from the stack behind it.");
    }

    // ── Human desire ───────────────────────────────────────────────────
    const desireHit = DESIRE_TERMS.find((d) => new RegExp(`\\b${d}`, "i").test(t));
    let human_desire = "";
    if (desireHit) {
      human_desire = this.clauseAround(t, desireHit);
      evidence.human_desire = `in the idea: "${desireHit}"`;
    } else if (stack?.functional_need) {
      human_desire = stack.functional_need;
      evidence.human_desire = "inherited from the motivation stack, not present in the idea";
    }

    // ── Contradiction ──────────────────────────────────────────────────
    const contra = t.match(CONTRADICTION);
    const contradiction = contra ? this.clauseAround(t, contra[0]) : "";
    if (contra) evidence.contradiction = `holds two things apart: "${contra[0]}"`;

    // ── Emotional transformation ───────────────────────────────────────
    const trans = t.match(TRANSFORMATION);
    const emotional_transformation = trans ? this.clauseAround(t, trans[0]) : "";
    if (trans) evidence.emotional_transformation = `moves between states: "${trans[0]}"`;

    // ── The mechanism ──────────────────────────────────────────────────
    const memory = MemoryPatternEvaluator.evaluate(t, { tension: context.tension });
    const mechanism = this.infer(t, {
      hasFear: Boolean(human_fear && evidence.human_fear?.startsWith("in the idea")),
      hasDesire: Boolean(human_desire && evidence.human_desire?.startsWith("in the idea")),
      hasContradiction: Boolean(contradiction),
      hasTransformation: Boolean(emotional_transformation),
      image: memory.dimensions.mental_image,
      lowered,
    });

    // Confidence is the share of the four components the *idea itself* supplied,
    // because a mechanism inferred from inherited material is a claim about the
    // insight rather than about the sentence.
    const own = [
      evidence.human_fear?.startsWith("in the idea"),
      evidence.human_desire?.startsWith("in the idea"),
      Boolean(contradiction),
      Boolean(emotional_transformation),
    ].filter(Boolean).length;
    const confidence = Number((own / 4).toFixed(3));
    if (!mechanism) {
      notes.push("No mechanism could be inferred: the idea carries none of the four components.");
    }

    return {
      idea: t,
      human_fear,
      human_desire,
      contradiction,
      emotional_transformation,
      mechanism,
      confidence,
      reason: mechanism ? MECHANISM_REASONS[mechanism] : "Nothing here would make a person keep it.",
      evidence,
      notes,
    };
  }

  /**
   * Which of the five reasons this is.
   *
   * Ordered by how distinctive the signal is rather than by how common the
   * mechanism is. Transgression and concretion have the clearest tells;
   * recognition is checked before relief because the two overlap and recognition
   * is the stronger claim when both are available.
   */
  private static infer(
    idea: string,
    f: {
      hasFear: boolean;
      hasDesire: boolean;
      hasContradiction: boolean;
      hasTransformation: boolean;
      image: number;
      lowered: string;
    }
  ): MemoryMechanism | null {
    if (TRANSGRESSION.test(idea)) return "transgression";
    // Recognition is checked before concretion, not after.
    //
    // A first-person confession naming a fear is a far more specific signal than
    // one concrete noun, and the earlier ordering read '"I want a price I can
    // predict, and I am afraid of asking"' as concretion because "price" is a
    // seeable thing. The image there is incidental; the voice is the mechanism.
    if (SELF_ADDRESS.test(idea) && (f.hasFear || f.hasDesire)) return "recognition";
    if (f.image >= 0.5 && !f.hasContradiction) return "concretion";
    if (f.hasContradiction && f.hasTransformation) return "reversal";
    if (f.hasFear && f.hasDesire) return "relief";
    if (f.hasContradiction) return "reversal";
    if (f.image >= 0.5) return "concretion";
    if (f.hasFear || f.hasDesire) return "relief";
    return null;
  }

  /** The clause a term sits in, so the component reads as a phrase. */
  private static clauseAround(text: string, term: string): string {
    const i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return "";
    const before = text.lastIndexOf(",", i);
    const afterComma = text.indexOf(",", i + term.length);
    const afterStop = text.indexOf(".", i + term.length);
    const end =
      afterComma >= 0 && (afterStop < 0 || afterComma < afterStop) ? afterComma : afterStop >= 0 ? afterStop : text.length;
    return text
      .slice(before >= 0 ? before + 1 : 0, end)
      .replace(/\s+/g, " ")
      .trim();
  }

  public static aggregate(results: EmotionalMechanism[]): {
    cases: number;
    by_mechanism: Record<string, number>;
    /** Ideas carrying no mechanism at all. */
    mechanismless: number;
    mean_confidence: number;
    /** Components the ideas supplied themselves, as a share. */
    self_supplied: Record<string, number>;
  } {
    const by_mechanism: Record<string, number> = {};
    const self: Record<string, number> = {
      human_fear: 0,
      human_desire: 0,
      contradiction: 0,
      emotional_transformation: 0,
    };
    let confidence = 0;
    for (const r of results) {
      const key = r.mechanism || "none";
      by_mechanism[key] = (by_mechanism[key] || 0) + 1;
      confidence += r.confidence;
      if (r.evidence.human_fear?.startsWith("in the idea")) self.human_fear++;
      if (r.evidence.human_desire?.startsWith("in the idea")) self.human_desire++;
      if (r.contradiction) self.contradiction++;
      if (r.emotional_transformation) self.emotional_transformation++;
    }
    const n = results.length || 1;
    for (const k of Object.keys(self)) self[k] = Number((self[k] / n).toFixed(3));
    return {
      cases: results.length,
      by_mechanism,
      mechanismless: results.filter((r) => !r.mechanism).length,
      mean_confidence: Number((confidence / n).toFixed(3)),
      self_supplied: self,
    };
  }

  public static format(agg: ReturnType<typeof EmotionalMechanismExtractor.aggregate>): string {
    const L = [`EMOTIONAL MECHANISM — ${agg.cases} ideas · mean confidence ${agg.mean_confidence.toFixed(2)}`];
    for (const [k, v] of Object.entries(agg.by_mechanism).sort((a, b) => b[1] - a[1])) {
      L.push(`  ${k.padEnd(16)} ${String(v).padStart(4)}`);
    }
    L.push(`  carrying none    ${String(agg.mechanismless).padStart(4)}`);
    L.push("  components the idea supplied itself:");
    for (const [k, v] of Object.entries(agg.self_supplied)) {
      L.push(`    ${k.padEnd(26)} ${(v * 100).toFixed(0).padStart(3)}%`);
    }
    L.push("");
    L.push("  note: the four components are read from the text and are checkable. The mechanism is");
    L.push("        an inference over them and is the weakest thing here — two ideas with the same");
    L.push("        components can work on a reader for different reasons. It travels with its");
    L.push("        evidence so a director can overrule it from the same facts.");
    return L.join("\n");
  }
}
