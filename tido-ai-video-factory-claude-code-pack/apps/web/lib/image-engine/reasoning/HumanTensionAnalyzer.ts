import { ARCHETYPES, Archetype, InsightTerms } from "./human-insight.archetypes";
import { DynamicHumanTensionDiscovery } from "./DynamicHumanTensionDiscovery";
import { INSIGHT_LADDER, InsightLadderStep, LadderRung } from "./human-insight.types";

/**
 * Ladders from what the client said is hard down to why it is hard for a person.
 *
 * The direction of travel is the whole point. Phase 4.0.2 asked "which stored
 * tension best matches this brief" and got an answer for every brief, including
 * the 77 where the honest answer was none — the tension was about a different
 * problem, so every construction over it was too. Here rung one *is* the brief's
 * stated challenge, and each rung below is a transformation of the rung above, so
 * the result cannot be about a different problem than the one supplied.
 *
 * That buys anchoring, not depth. What produces the descent is the archetype
 * library, and where no archetype fits, this class says so and derives what it
 * can from the sentence's own structure — at a confidence that reports the
 * difference. Forcing the nearest archetype would reproduce the 4.0.2 failure
 * with a new mechanism.
 */

export interface TensionAnalysisInput {
  /** The brief's own statement of what the work is up against. Rung one. */
  challenge: string;
  audience: string;
  product: string;
  category?: string;
  objective?: string;
  /** Optional corroboration: returns knowledge_ids that support a statement. */
  corroborate?: (statement: string) => string[];
  /**
   * Phase 4.0.3.5. The discovery layer's output, where it produced one.
   *
   * It runs *before* archetype matching and supplies three rungs the archetype
   * would otherwise supply from its template: the emotional rung, the social
   * rung and the conflict. Those are the three that were identical across the
   * twelve briefs sharing an archetype, so this is where the flattening was.
   * The archetype still supplies the descent and the truth.
   */
  discovered?: import("./DynamicHumanTensionDiscovery").DynamicHumanTension | null;
  /** Established market context, or nothing. Never guessed. */
  culture?: import("./cultural-context.types").CulturalContext;
}

export interface TensionAnalysis {
  ladder: LadderRung[];
  archetype: string;
  archetype_label: string;
  matched: boolean;
  truncated_at?: InsightLadderStep;
  terms: InsightTerms;
  warnings: string[];
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "she", "her", "his", "they", "them",
  "their", "have", "has", "had", "was", "were", "been", "being", "does", "not",
  "but", "who", "what", "when", "where", "which", "while", "from", "into", "than",
  "then", "will", "would", "could", "should", "about", "there", "these", "those",
  "because", "rather", "instead", "already", "before", "after", "more", "most",
  "some", "such", "only", "own", "same", "just", "also", "very", "them", "itself",
]);

function contentWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

/**
 * Reduces an audience descriptor to a usable plural noun phrase.
 *
 * "Women 30 to 45 who buy premium skincare and read ingredient lists" becomes
 * "women". Dropped whole into a sentence the descriptor produced twenty-word
 * subjects that disagreed with their own verbs.
 */
function shortAudience(raw: string): { plural: string; singular: string; isPlural: boolean } {
  const t = String(raw || "").replace(/\.$/, "").trim();
  if (!t) return { plural: "people", singular: "a person", isPlural: true };

  // Age ranges are removed as whole patterns rather than by deleting the digits
  // and hoping. Deleting digits alone left "Women 30 to 45" as "Women to" and
  // "Affluent women 45 plus" as "Affluent women plus", and both then took a verb.
  const deAged = t
    .replace(/\baged?\s+/gi, " ")
    .replace(/\b\d+\s*(?:to|-|–|—)\s*\d+\b/g, " ")
    .replace(/\b\d+\s*(?:\+|plus|and (?:over|above|up))\b/gi, " ")
    .replace(/\b\d+\s*(?:years?|yrs?)(?:\s+old)?\b/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Stop at the first qualifying clause. "Men new to skincare" keeps "men",
  // because everything after the head noun describes rather than names them.
  const head = deAged
    .split(/\s+who\b|\s+that\b|\s+new to\b|\s+looking\b|\s+buying\b|\s+with\b|\s+in\b|\s+for\b|,/i)[0]
    .trim();

  let words = head.split(/\s+/).filter(Boolean).slice(0, 3);
  // A dangling preposition or conjunction at the end is debris from whatever was
  // removed above.
  while (words.length > 1 && /^(?:to|and|or|plus|over|under|up|of|the|a|an)$/i.test(words[words.length - 1])) {
    words.pop();
  }

  const plural = (words.join(" ") || "people").toLowerCase().trim() || "people";
  // Agreement is decided by whichever word in the phrase carries number.
  // Testing only the first word made "affluent women" singular; testing only the
  // last made "adults delaying a visit" singular. Either word can be the head.
  const isPlural = plural
    .split(/\s+/)
    .some((w) => /(?:s|people|men|women|children|folk|staff|family|youth)$/i.test(w) && !/(?:ss|us|is)$/i.test(w));
  const singular = /s$/.test(plural) ? `a ${plural.replace(/s$/, "")}` : `a ${plural}`;
  return { plural, singular, isPlural };
}

/**
 * Agrees a third-person-singular verb phrase with a plural subject.
 *
 * The archetype library writes its conflict poles in the singular ("wants what
 * the serum does"), because that is how the sentence reads with "a mature
 * buyer". Most audiences are plural, and "Mature buyers wants" appeared on
 * roughly every case in the first run. Only the leading verb needs agreeing —
 * everything after it is already tense-neutral.
 */
function agree(phrase: string, isPlural: boolean): string {
  if (!isPlural) return phrase;
  const IRREGULAR: Record<string, string> = {
    wants: "want", has: "have", is: "are", does: "do", was: "were",
    needs: "need", knows: "know", feels: "feel", gets: "get", makes: "make",
    takes: "take", sees: "see", buys: "buy", pays: "pay", chooses: "choose",
    carries: "carry", tries: "try", relies: "rely", applies: "apply",
  };
  return phrase.replace(/^(\w+)/, (m) => {
    const lower = m.toLowerCase();
    if (IRREGULAR[lower]) return IRREGULAR[lower];
    // Only strip a trailing "s" where it is a verb ending rather than part of
    // the stem: "will", "cannot", "would" are left alone by the guard above.
    if (/^[a-z]+s$/.test(lower) && !/(?:ss|us|is)$/.test(lower)) return lower.slice(0, -1);
    return m;
  });
}

function nounPhrase(raw: string, fallback: string): string {
  const t = String(raw || "").replace(/\.$/, "").trim().toLowerCase();
  if (!t) return fallback;
  return /^(?:a|an|the)\b/.test(t) ? t : `the ${t}`;
}

/**
 * The most distinctive phrase in the challenge.
 *
 * Distinctive meaning: the longest run of content words that the audience and
 * product descriptors do not already supply. It is what makes a rung about *this*
 * brief rather than about its archetype, so `specificity` is measured against it.
 */
function keyPhrase(challenge: string, audience: string, product: string): string {
  const known = new Set([...contentWords(audience), ...contentWords(product)]);
  const words = String(challenge || "").replace(/[.,;:]/g, "").split(/\s+/);
  let best: string[] = [];
  let run: string[] = [];
  for (const w of words) {
    const bare = w.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (bare.length > 3 && !STOP.has(bare) && !known.has(bare)) run.push(w);
    else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;
  const phrase = best.slice(0, 6).join(" ").toLowerCase();
  // A run that begins with a verb or adverb is a clause fragment, not a thing the
  // campaign can turn on: "still feels", "reacted badly". One word is not a
  // phrase either. Better to anchor on nothing than on debris.
  if (best.length < 2) return "";
  if (/^(?:still|already|usually|never|always|often|rarely|reacted|feels?|wants?|knows?|thinks?|makes?|does|will|would|could|should)\b/.test(phrase)) {
    return "";
  }
  return phrase;
}

export class HumanTensionAnalyzer {
  /** Classifies a stated challenge, declining rather than forcing a fit. */
  public static classify(challenge: string): Archetype | null {
    const text = String(challenge || "");
    if (!text.trim()) return null;
    const hits = ARCHETYPES.filter((a) => a.match.test(text));
    if (!hits.length) return null;
    // More than one archetype fits a real brief, and the tie-break matters: a
    // stigma brief was classified SEEN_CHOOSING because the single word "seen"
    // happened to produce a longer match than STIGMA_OF_COMMONNESS's first hit.
    //
    // Total matched evidence across the whole sentence is the better rule. An
    // archetype that matches three separate cues has more claim on the brief than
    // one that matched a single longer word, and counting all matches rather than
    // the first is what makes that visible.
    let best = hits[0];
    let bestScore = -1;
    for (const a of hits) {
      const global = new RegExp(a.match.source, a.match.flags.includes("g") ? a.match.flags : a.match.flags + "g");
      const all = [...text.matchAll(global)];
      const chars = all.reduce((n, m) => n + m[0].length, 0);
      // Distinct cues count for more than one long one.
      const score = chars + all.length * 6;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  public static terms(input: TensionAnalysisInput): InsightTerms {
    const { plural, singular, isPlural } = shortAudience(input.audience);
    const challenge = String(input.challenge || "").replace(/\s+/g, " ").trim();
    return {
      who: plural,
      whoSingular: singular,
      whoIsPlural: isPlural,
      thing: nounPhrase(input.product, "the product"),
      category: String(input.category || input.product || "the category").toLowerCase().replace(/^the\s+/, ""),
      key: keyPhrase(challenge, input.audience, input.product),
      challenge,
      objective: String(input.objective || "").trim(),
    };
  }

  public static analyze(input: TensionAnalysisInput): TensionAnalysis {
    const warnings: string[] = [];
    const terms = this.terms(input);

    if (!terms.challenge) {
      warnings.push(
        "NO_CHALLENGE: the brief states no difficulty, so there is nothing to ladder from. " +
          "The insight layer declines rather than inventing a problem to solve."
      );
      return {
        ladder: [],
        archetype: "NONE",
        archetype_label: "no stated challenge",
        matched: false,
        truncated_at: "observed_reality",
        terms,
        warnings,
      };
    }

    const archetype = this.classify(terms.challenge);
    if (!archetype) {
      warnings.push(
        `NO_ARCHETYPE: "${terms.challenge.slice(0, 60)}…" matches no known problem shape. ` +
          "Deriving structurally from the sentence, which reaches the emotional rung and stops."
      );
      return this.structural(terms, input, warnings);
    }

    const rungs: LadderRung[] = [
      this.rung("observed_reality", terms.challenge, "The brief's own statement, unchanged.", terms, input),
    ];

    const d = input.discovered;

    const steps: [InsightLadderStep, () => string, string][] = [
      [
        "behavior",
        () =>
          // What the person does, which the discovery layer either read out of
          // the brief or reconstructed from the condition it states. The
          // archetype's functional problem is the fallback, and it describes a
          // class of briefs rather than this one.
          d?.observable_behavior
            ? sentence(
                `${cap(terms.who)} ${lower(strip(d.observable_behavior))}` +
                  (d.source === "LATENT" ? " — reconstructed from the condition the brief states" : "")
              )
            : archetype.functional(terms),
        "What the person does about it, read from the brief or reconstructed from it.",
      ],
      [
        "hidden_emotion",
        () => {
          const base = d?.hidden_emotion
            ? `${strip(d.hidden_emotion)}. ${strip(archetype.emotional(terms))}`
            : archetype.emotional(terms);
          return terms.key ? `${strip(base)} — and ${terms.key} is where it is met` : base;
        },
        "What the doing of it feels like, from the motivation stack.",
      ],
      [
        "identity_conflict",
        () => {
          // Separated from social fear in 4.0.3.6. What it would cost them in
          // who they are is a different question from what other people would
          // conclude, and fusing the two lost the first.
          if (d?.contradiction) {
            return terms.key
              ? `${strip(d.contradiction)}. The whole of it turns on ${terms.key}`
              : strip(d.contradiction);
          }
          const c = archetype.conflict(terms);
          return `${cap(terms.who)} ${agree(c.wants, terms.whoIsPlural)}, and ${agree(c.but, terms.whoIsPlural)}.`;
        },
        "What accepting the offer would cost them in who they take themselves to be.",
      ],
      [
        "social_fear",
        () =>
          // Culture enters the ladder here and nowhere else.
          d?.social_force || archetype.social(terms),
        "What other people would conclude — culturally grounded where a market was established.",
      ],
      [
        "human_truth",
        () => {
          if (input.discovered && input.discovered.confidence >= 0.6) {
            const composed = DynamicHumanTensionDiscovery.composeTruth(input.discovered);
            if (composed) return composed;
          }
          return archetype.truth(terms);
        },
        "The statement about people that all of the above is a case of.",
      ],
      [
        "creative_opportunity",
        () => {
          // New in 4.0.3.6, and the reason it is a rung rather than a note: the
          // expression layer was inferring it from the desire, and an inference
          // made twice in two files drifts. Stated once, here, from the
          // functional need the stack established.
          const want = d?.motivation.functional_need || archetype.desire(terms);
          return sentence(
            `A brand could answer this by ${lower(strip(want)).replace(/^to /, "")}, which nothing in ` +
              `${terms.category} currently does`
          );
        },
        "What a brand could do with it. The bridge to expression.",
      ],
    ];

    for (const [step, build, how] of steps) {
      const statement = sentence(build());
      if (!statement) {
        warnings.push(`LADDER_TRUNCATED(${step}): the archetype supplied nothing for this rung.`);
        return {
          ladder: rungs,
          archetype: archetype.id,
          archetype_label: archetype.label,
          matched: true,
          truncated_at: step,
          terms,
          warnings,
        };
      }
      rungs.push(this.rung(step, statement, how, terms, input));
    }

    return { ladder: rungs, archetype: archetype.id, archetype_label: archetype.label, matched: true, terms, warnings };
  }

  /**
   * When no archetype matches.
   *
   * Real briefs use sentence shapes that carry their own structure: "the barrier
   * is not X, it is Y", "A because B", "A, so B". Those give a functional and an
   * emotional rung honestly. They do not give a hidden problem, a social
   * pressure or a human truth — inventing those would produce exactly the
   * confident-and-wrong output this phase exists to remove — so the ladder stops
   * where the evidence stops and says where.
   */
  private static structural(
    terms: InsightTerms,
    input: TensionAnalysisInput,
    warnings: string[]
  ): TensionAnalysis {
    const rungs: LadderRung[] = [
      this.rung("observed_reality", terms.challenge, "The brief's own statement, unchanged.", terms, input),
    ];

    const c = terms.challenge;
    let functional = "";
    let how = "";

    const notButIs = c.match(/\bis not\s+(.+?),\s*(?:it is|it's)\s+(.+?)[.;]?$/i);
    const because = c.match(/^(.+?)\s+because\s+(.+?)[.;]?$/i);
    const so = c.match(/^(.+?),?\s+so\s+(.+?)[.;]?$/i);

    if (notButIs) {
      functional = `The impediment is ${notButIs[2].trim()}, not ${notButIs[1].trim()}.`;
      how = 'From the "not X, it is Y" contrast in the brief.';
    } else if (because) {
      functional = `${cap(because[2].trim())} is what produces ${lower(because[1].trim())}.`;
      how = 'From the causal clause in the brief.';
    } else if (so) {
      functional = `${cap(so[1].trim())}, and ${lower(so[2].trim())} follows from it.`;
      how = 'From the consequence clause in the brief.';
    } else {
      warnings.push(
        "LADDER_TRUNCATED(behavior): the challenge carries no contrast, cause or " +
          "consequence to derive from, so only the surface rung is available."
      );
      return {
        ladder: rungs,
        archetype: "NO_ARCHETYPE",
        archetype_label: "unclassified",
        matched: false,
        truncated_at: "behavior",
        terms,
        warnings,
      };
    }

    rungs.push(this.rung("behavior", sentence(functional), how, terms, input));
    rungs.push(
      this.rung(
        "hidden_emotion",
        sentence(`For ${terms.who}, that is met as ${terms.key || "the difficulty the brief describes"} rather than as a feature of ${terms.category}`),
        "Restates the impediment from the person's side. Weak: no archetype supplied the feeling.",
        terms,
        input
      )
    );
    warnings.push(
      "LADDER_TRUNCATED(identity_conflict): no archetype matched, and an identity conflict cannot be " +
        "derived from sentence structure. Rungs four to eight are unavailable for this brief."
    );

    return {
      ladder: rungs,
      archetype: "NO_ARCHETYPE",
      archetype_label: "unclassified",
      matched: false,
      truncated_at: "identity_conflict",
      terms,
      warnings,
    };
  }

  private static rung(
    step: InsightLadderStep,
    statement: string,
    derivation: string,
    terms: InsightTerms,
    input: TensionAnalysisInput
  ): LadderRung {
    return {
      step,
      statement,
      derivation,
      evidence: input.corroborate ? input.corroborate(statement).slice(0, 3) : [],
      specificity: this.specificity(statement, terms),
    };
  }

  /**
   * How much of this rung came from the brief rather than from the archetype.
   *
   * Measured as the share of the rung's own content words that the brief supplied
   * — through the audience, the product, or the challenge's distinctive phrase.
   * A rung that returns its template unchanged scores near zero, which is what
   * stops the library from flattening every brief onto its archetype without the
   * report showing it.
   */
  public static specificity(statement: string, terms: InsightTerms): number {
    const words = contentWords(statement);
    if (!words.length) return 0;
    const brief = new Set([
      ...contentWords(terms.who),
      ...contentWords(terms.thing),
      ...contentWords(terms.category),
      ...contentWords(terms.key),
      ...contentWords(terms.challenge),
    ]);
    const hits = words.filter((w) => brief.has(w)).length;
    return Number(Math.min(1, hits / Math.max(4, words.length * 0.5)).toFixed(3));
  }

  /** How far the ladder actually descended, 0-1. */
  public static depth(ladder: LadderRung[]): number {
    return Number((ladder.length / INSIGHT_LADDER.length).toFixed(3));
  }

  /** The rung at a given step, if the ladder reached it. */
  public static at(ladder: LadderRung[], step: InsightLadderStep): LadderRung | undefined {
    return ladder.find((r) => r.step === step);
  }
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}

function strip(text: string): string {
  return String(text || "").replace(/[.]+$/, "").trim();
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
