import { SELF_CONTAINMENT_FLOOR, SelfContainmentResult } from "./creative-generation.types";

/**
 * CIOS Phase 4.0.7 Task 5 — does the sentence survive leaving the room?
 *
 * What this is not
 * ---------------
 * Not an evaluator, and deliberately not reported as a score. The phase's rule is
 * that the benchmark stays an independent judge, so nothing here reaches a rubric
 * or a ranking. It runs *inside* generation: a candidate that fails is sent back
 * for another attempt with a different direction, and if the second attempt also
 * fails it is dropped from the pool before any evaluator ever sees it. The only
 * number that leaves this file is a retry count for the report.
 *
 * What it asks
 * -----------
 * An idea is presented in a deck, after a truth, a territory and a brand role
 * have been explained. Much of what looks like an idea in that setting is a
 * pronoun pointing back at the slide before. The question here is the one a
 * director asks by covering the rest of the page: read cold, with nothing above
 * it, does this sentence still contain a person, a situation and something at
 * stake between them?
 *
 * Four components, each present or absent. The strength is their share, which
 * makes the 0.45 floor mean "at least two of the four, or three partials" rather
 * than a tuned constant. It is a coarse instrument and is meant to be — it exists
 * to catch sentences that are literally about nothing, which the audit found 48
 * copies of.
 */

/** Words that point outside the sentence and name nothing inside it. */
const DEICTIC = /^(?:this|that|these|those|it|they|there)\b/i;

/** Referents only a deck supplies. */
const DECK_ONLY = /\b(?:the (?:brand|category|product|campaign|client|market|audience|consumer|segment))\b/gi;

/** A human subject: someone the sentence is about. */
const HUMAN =
  /\b(?:i|you|your|we|they|them|their|he|she|people|someone|somebody|nobody|anyone|everyone|buyers?|owners?|parents?|mothers?|fathers?|drivers?|patients?|students?|teachers?|workers?|customers?|men|women|kids?|children|families|shoppers?|readers?|players?|users?)\b/i;

/** Something that can be filmed, held or stood in. */
const CONCRETE =
  /\b(?:receipts?|bills?|prices?|tags?|labels?|packets?|bottles?|boxe?s?|bags?|letters?|lists?|notes?|menus?|photographs?|screens?|phones?|mirrors?|windows?|doors?|seats?|chairs?|tables?|counters?|shelves|shelf|aisles?|queues?|wardrobes?|kitchens?|signs?|cards?|keys?|coats?|shirts?|rooms?|streets?|shops?|mornings?|nights?|hands?|faces?|voices?|floors?|beds?|cars?|buses?|markets?)\b/i;

/** Two things held against each other, inside the sentence. */
const OPPOSITION =
  /\b(?:but|rather than|instead of|not\b[^.]*\bbut\b|never|nobody|no one|without|and (?:still|yet|cannot|will not|would not)|would have to|costs? (?:you|them|it)|stops? (?:them|you)|is not\b[^.]*\bit is\b|was never|only|before)\b/i;

/** Something a person could lose. */
const STAKE =
  /\b(?:cost|costs|pay|paid|lose|lost|losing|risk|give up|gave up|stop being|afraid|shame|blame|fault|judged|price|carry|carrying|protect|defend|admit|say|says|asked|unasked)\b/i;

export class CandidateSelfContainment {
  /**
   * Reads one candidate cold.
   *
   * Every component is read from the sentence and from nothing else — no
   * territory, no truth, no insight is passed in, because passing them in would
   * be answering the opposite question. That restriction is the whole method.
   */
  public static check(idea: string): SelfContainmentResult {
    const t = String(idea || "").trim();
    if (!t) {
      return {
        contained: false,
        strength: 0,
        missing: ["subject", "situation", "opposition", "stake"],
        reason: "There is no sentence.",
      };
    }

    const missing: string[] = [];

    // 1. A subject. A sentence opening on a bare deictic is pointing at a slide.
    const hasSubject = HUMAN.test(t) && !DECK_ONLY.test(t.slice(0, 24));
    const opensDeictic = DEICTIC.test(t.replace(/^["“]/, ""));
    if (!hasSubject || opensDeictic) missing.push("subject");

    // 2. A situation: something that can be pictured, or an act being performed.
    const hasSituation = CONCRETE.test(t) || /\b\w+(?:s|ed|ing)\b[^.]*\b(?:when|every|again|today|before|after)\b/i.test(t);
    if (!hasSituation) missing.push("situation");

    // 3. An opposition held inside the sentence.
    if (!OPPOSITION.test(t)) missing.push("opposition");

    // 4. Something at stake.
    if (!STAKE.test(t)) missing.push("stake");

    // A sentence made mostly of deck referents is about the deck, whatever else
    // it contains. Counted as a separate failure so the reason names it.
    const deckRefs = (t.match(DECK_ONLY) || []).length;
    const words = t.split(/\s+/).length;
    const deckHeavy = deckRefs >= 2 || (deckRefs >= 1 && words < 10);

    const present = 4 - missing.length;
    const raw = present / 4;
    const strength = Number(Math.max(0, deckHeavy ? raw - 0.25 : raw).toFixed(3));
    const contained = strength >= SELF_CONTAINMENT_FLOOR;

    return {
      contained,
      strength,
      missing,
      reason: contained
        ? `Reads alone: ${["subject", "situation", "opposition", "stake"].filter((c) => !missing.includes(c)).join(", ")}.`
        : deckHeavy
          ? "Leans on the deck: it names the brand or the category where it should name a person or a thing."
          : `Does not stand alone without ${missing.join(" and ")}.`,
    };
  }

  /** Run-level summary, for the phase report only. Never scored. */
  public static aggregate(results: SelfContainmentResult[]): {
    checked: number;
    contained: number;
    mean_strength: number;
    missing: Record<string, number>;
  } {
    const missing: Record<string, number> = {};
    let sum = 0;
    for (const r of results) {
      sum += r.strength;
      for (const m of r.missing) missing[m] = (missing[m] || 0) + 1;
    }
    return {
      checked: results.length,
      contained: results.filter((r) => r.contained).length,
      mean_strength: Number((sum / (results.length || 1)).toFixed(3)),
      missing,
    };
  }
}
