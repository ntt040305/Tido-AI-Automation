import { InsightTerms } from "./human-insight.archetypes";
import { MOTIVATION_FAMILIES } from "./human-motivation.types";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";
import { CreativeLens, ExpressedIdea, HumanInsight } from "./human-insight.types";

/**
 * Expresses a finished insight. It does not improve one.
 *
 * The separation is the point of this file. Phase 4.0.1.5 chose the rhetorical
 * move while it assembled the material, so improving the expression and improving
 * the insight were the same edit and neither could be measured on its own. Here
 * the insight arrives scored and unchangeable, and six lenses each say the same
 * thing a different way. If all six read badly, the insight is the problem; if one
 * reads well and five badly, the lenses are.
 *
 * A lens whose material is missing is skipped rather than filled. `symbolic_
 * metaphor` needs something concrete to carry the truth, and where the ladder
 * supplies nothing concrete the honest output is five ideas, not six — the sixth
 * would be a metaphor about nothing, which scores like an idea and is not one.
 */

export class CreativeExpressionLayer {
  /** Every expression the insight genuinely supports. Unranked. */
  public static express(insight: HumanInsight, terms: InsightTerms): ExpressedIdea[] {
    const truth = strip(insight.human_truth);
    if (!truth) return [];

    const at = (s: Parameters<typeof HumanTensionAnalyzer.at>[1]) =>
      strip(HumanTensionAnalyzer.at(insight.ladder, s)?.statement || "");

    const emotion = at("hidden_emotion");
    const conflict = at("identity_conflict");
    const social = at("social_fear");
    const opportunity = at("creative_opportunity");
    const behaviour = at("behavior");

    // Phase 4.0.3.6 gives the expression layer the motivation stack, which is
    // what makes the constructions below possible: each lens needs two things to
    // hold against each other, and a stack supplies five layers to draw them
    // from. The 4.0.3 lenses had one rung each and could only assert.
    const stack = insight.dynamic_tension?.motivation;
    // The short forms, not the infinitive descriptions. See the note on
    // `MotivationFamily.short_want`.
    const family = MOTIVATION_FAMILIES.find((f) => f.id === stack?.family);
    const want = lower(strip(family?.short_want || ""));
    const identity = lower(strip(family?.short_identity || ""));
    const stake = lower(strip(family?.stake || ""));
    const consequence = lower(strip(stack?.social_consequence || ""));
    const feeling = lower(strip(stack?.emotional_need || "")).replace(/^to not /, "").replace(/^to /, "");
    const act = lower(strip(insight.dynamic_tension?.observable_behavior || ""));

    const out: ExpressedIdea[] = [];
    const add = (lens: CreativeLens, idea: string, hook: string, works: string, reason: string) => {
      const text = sentence(idea);
      // Below this it is a fragment, and a fragment scored as an idea is how a
      // diversity number gets inflated. Above the upper bound it is a paragraph,
      // and a team cannot be briefed from a paragraph.
      const length = text.split(/\s+/).length;
      if (length < 6 || length > 30) return;
      // A construction that came out as a fragment — a trailing conjunction, a
      // dangling "because" — is worse than one lens fewer.
      // Genuine danglers only. An earlier version included "it", which rejected
      // every human_confession the layer produced — "...to get it" is a perfectly
      // good ending, and the lens vanished from the run without a word.
      if (/(?:^|\s)(?:because|and|but|that|which|the|a|an|of|to|is|are|was|were)$/i.test(text.replace(/[.\"”]+$/, ""))) return;

      const tail = [
        terms.objective ? `in service of ${lower(strip(terms.objective))}` : "",
        terms.who ? `among ${terms.who}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      out.push({
        big_idea: text,
        lens,
        human_truth: insight.human_truth,
        why_it_works: sentence(works),
        emotional_hook: sentence(hook),
        strategic_reason: sentence(tail ? `${strip(reason)}, ${tail}` : reason),
      });
    };

    // Every construction below sets two things against each other. That is not a
    // stylistic preference: `emotional_friction` scored 0.3 of 5 across the
    // 4.0.3.6 run because the previous lenses asserted one thing each, however
    // strong the thing was. An idea that only asserts has nothing for a reader to
    // resolve, and nothing to resolve is nothing to remember.

    // ── Emotional reversal — move the fault off the person carrying it ──
    if (want && identity) {
      add(
        "emotional_reversal",
        `The failure was never ${terms.who}; it is a category where ${want} costs you being ${identity}`,
        "Relief that arrives as an acquittal",
        "The audience has assumed the failure was theirs; being told otherwise is new information",
        "Moves the fault from the person to the category, which only a brand willing to indict the category can say"
      );
    }

    // ── Cultural observation — the rule everyone obeys and nobody states ──
    if (consequence) {
      add(
        "cultural_observation",
        `Everyone here is quietly avoiding ${consequence}, and not one of them will say so`,
        "Recognition of an unwritten rule everyone obeys",
        "Describes a social fact the audience lives inside and has never seen stated",
        "Owns a piece of everyday behaviour rather than a product attribute"
      );
    }

    // ── Unexpected truth — the truth, which already holds its own poles ──
    add(
      "unexpected_truth",
      truth,
      "The small shock of hearing something obvious said for the first time",
      "States the truth the whole category has been working around",
      "A claim on the truth itself, which no competitor can make second without conceding it"
    );

    // ── Human confession — first person, with the contradiction intact ──
    if (want && identity) {
      add(
        "human_confession",
        `"I want ${want}, and I will not stop being ${identity} to get it"`,
        "Being seen, in the specific way that being quoted accurately feels like",
        "Puts the unspoken thing in the audience's own voice rather than the brand's",
        "A confession cannot be copied by a competitor without sounding like an echo"
      );
    }

    // ── Symbolic metaphor — one concrete thing, set against the abstraction ──
    if (terms.key && (stake || consequence)) {
      add(
        "symbolic_metaphor",
        `${cap(terms.key)} is not the small thing here; it is where ${stake || consequence} is decided`,
        "A single image standing in for something that takes a paragraph to explain",
        "Carries the truth on one concrete thing, which is what makes it repeatable",
        "A symbol is cheaper to remember than an argument and harder to appropriate"
      );
    }

    // ── Provocative statement — a position the category will not take ──
    if (stake || feeling) {
      add(
        "provocative_statement",
        `Say what ${terms.category} will not: the problem is not the price, it is ${stake || lower(strip(feeling))}`,
        "The charge of watching someone break a convention on purpose",
        "Takes a position that costs something, and a position that costs something is believed",
        "Competitors can agree with it or contradict it; either way the brand set the terms"
      );
    }

    return out;
  }

  /** Which lenses the insight could support, for diagnostics. */
  public static availableLenses(insight: HumanInsight, terms: InsightTerms): CreativeLens[] {
    return this.express(insight, terms).map((e) => e.lens);
  }
}

/**
 * Rewrites a third-person rung as first person.
 *
 * Deliberately mechanical and deliberately limited: pronouns and the handful of
 * verbs that must agree with them. It does not attempt full agreement, because a
 * confession that is subtly ungrammatical reads worse than a description, and a
 * sentence this transform cannot handle is better left to a different lens.
 */
function toFirstPerson(text: string): string {
  const IRREGULAR: Record<string, string> = {
    is: "am", was: "was", has: "have", does: "do", knows: "know", goes: "go",
    says: "say", wants: "want", needs: "need", feels: "feel", spends: "spend",
    suspects: "suspect", believes: "believe", thinks: "think", tries: "try",
    carries: "carry", relies: "rely", applies: "apply", buys: "buy", pays: "pay",
    stays: "stay", takes: "take", makes: "make", gets: "get", sees: "see",
    chooses: "choose", prefers: "prefer", assumes: "assume", blames: "blame",
  };

  let out = String(text || "")
    .replace(/\b(?:She|He|They)\b/g, "I")
    .replace(/\b(?:she|he|they)\b/g, "I")
    .replace(/\b(?:Her|His|Their)\b/g, "My")
    .replace(/\b(?:her|his|their)\b/g, "my")
    .replace(/\b(?:herself|himself|themselves)\b/g, "myself");

  // Agreement has to reach every verb the subject governs, not only the one
  // directly after the pronoun. "I spend more than this on other people without
  // a second thought, and knows it" was shipping on the confession lens: the
  // first verb was converted and the one after the conjunction was not.
  const fix = (verb: string) => {
    const lower = verb.toLowerCase();
    if (IRREGULAR[lower]) return IRREGULAR[lower];
    if (/^[a-z]+s$/.test(lower) && !/(?:ss|us|is)$/.test(lower)) return lower.slice(0, -1);
    return verb;
  };

  // Directly after the subject, and after a conjunction that continues it.
  out = out.replace(/\bI\s+([a-z]+)\b/g, (m, v) => `I ${fix(v)}`);
  out = out.replace(/\b(and|but|yet|or)\s+([a-z]+s)\b/g, (m, conj, v) => {
    const fixed = fix(v);
    return fixed === v ? m : `${conj} ${fixed}`;
  });

  return out.replace(/\s+/g, " ").trim();
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/^["“]/.test(t)) return t.replace(/([^.!?"”])(["”])$/, "$1.$2");
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
