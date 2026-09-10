import { InsightTerms } from "./human-insight.archetypes";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";
import { BrandDNA } from "./brand-dna.types";
import { InsightContradiction } from "./InsightContradictionEngine";
import { MOTIVATION_FAMILIES } from "./human-motivation.types";
import { HumanInsight } from "./human-insight.types";

/**
 * CIOS Phase 4.0.3.7 — six modes, and less template underneath them.
 *
 * What "reduce template dependency" means here
 * -------------------------------------------
 * It does not mean removing templates. A deterministic engine has nothing else;
 * pretending otherwise would just hide them. What it means is that a mode no
 * longer has *one* sentence shape.
 *
 * Phase 4.0.3.6 had six lenses and six frames — one each. Two briefs reaching the
 * same lens produced the same sentence with two nouns swapped, which is why the
 * run's ideas read as a family however distinct the insights behind them were.
 * Here each mode carries three frames, chosen by a hash of the material rather
 * than by score. Eighteen shapes over ten motivation families is a different
 * order of variety, and choosing by material rather than by score keeps the
 * selection out of the metric — which is the mistake that collapsed the lens
 * distribution in 4.0.3.
 *
 * The modes are the ones Task 4 names, and each is a different *argument*:
 *
 *   psychological_reversal — the fault is not where everyone puts it
 *   hidden_cost            — the price is not the price
 *   identity_paradox       — getting it costs being it
 *   social_pressure        — the room decides, not the person
 *   human_confession       — the person says the unsaid thing themselves
 *   unexpected_connection  — two unrelated things turn out to be the same thing
 *
 * A mode whose material is missing is skipped rather than filled. That rule has
 * held since 4.0.3 and it is the reason a run can report five ideas rather than
 * six without anything being wrong.
 */

export const EXPRESSION_MODES = [
  "psychological_reversal",
  "hidden_cost",
  "identity_paradox",
  "social_pressure",
  "human_confession",
  "unexpected_connection",
] as const;

export type ExpressionMode = (typeof EXPRESSION_MODES)[number];

export interface ModeExpression {
  big_idea: string;
  mode: ExpressionMode;
  human_truth: string;
  why_it_works: string;
  emotional_hook: string;
  strategic_reason: string;
}

/**
 * The first brand deed short enough to sit inside a sentence.
 *
 * Histories are written as full clauses, so most are too long. Returning the
 * first usable one rather than the best is deliberate: choosing by fit would be
 * choosing by the metric the result is scored on.
 */
function firstUsable(items: string[]): string {
  for (const raw of items) {
    const t = strip(String(raw || "")).toLowerCase().replace(/^(?:has |have |had )/, "");
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 9) continue;
    if (/[.;:]/.test(t)) continue;
    // The frames say "we <deed>", and brand behaviours are written in the third
    // person singular — "prints the concentration", "publishes the wait". Left
    // alone they produce "we publishes the wait".
    return agreeWithWe(t);
  }
  return "";
}

/** Agrees a third-person-singular verb with "we". */
function agreeWithWe(phrase: string): string {
  const IRREGULAR: Record<string, string> = {
    is: "are", has: "have", does: "do", says: "say", goes: "go",
    publishes: "publish", withdraws: "withdraw", answers: "answer",
    declines: "decline", prints: "print", keeps: "keep", walks: "walk",
    repairs: "repair", removes: "remove", begins: "begin", buys: "buy",
    photographs: "photograph", runs: "run", covers: "cover",
  };
  return phrase.replace(/^(\w+)/, (m) => {
    const lower = m.toLowerCase();
    if (IRREGULAR[lower]) return IRREGULAR[lower];
    // Past tense and bare plurals are already right after "we".
    if (/(?:ed|ing)$/.test(lower)) return m;
    if (/^[a-z]+ies$/.test(lower)) return `${lower.slice(0, -3)}y`;
    if (/^[a-z]+(?:s|x|z|ch|sh)es$/.test(lower)) return lower.slice(0, -2);
    if (/^[a-z]+s$/.test(lower) && !/(?:ss|us|is)$/.test(lower)) return lower.slice(0, -1);
    return m;
  });
}

/** Deterministic small hash, so the same material always picks the same frame. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

export class InsightExpressionModes {
  /** Every expression the insight and its contradiction genuinely support. */
  public static express(
    insight: HumanInsight,
    terms: InsightTerms,
    contradiction: InsightContradiction,
    /**
     * Phase 4.0.4.1. What the brand has actually done.
     *
     * Until this existed, no idea this engine wrote could rest on a brand's
     * history, because nothing carried a history into expression. The ownership
     * evaluator then correctly reported that every idea was unowned — a true
     * finding about the engine rather than about the ideas.
     *
     * A brand behaviour or a piece of brand history is the strongest ownership
     * material there is, so where one exists it gets its own frame. Where none
     * exists nothing changes: the frames below it are the ones that already ran.
     */
    dna?: BrandDNA
  ): ModeExpression[] {
    const truth = strip(insight.human_truth);
    if (!truth) return [];

    const at = (s: Parameters<typeof HumanTensionAnalyzer.at>[1]) =>
      strip(HumanTensionAnalyzer.at(insight.ladder, s)?.statement || "");

    const stack = insight.dynamic_tension?.motivation;
    const family = MOTIVATION_FAMILIES.find((f) => f.id === stack?.family);

    const want = lower(strip(contradiction.desire || family?.short_want || ""));
    const identity = lower(strip(contradiction.tradeoff || family?.short_identity || ""));
    // `fear` reaches here either from the motivation stack, where it is an
    // authored noun phrase, or from the social rung, where it can be a whole
    // clause. A clause spliced after "It is" produces two verbs: "It is the
    // translation is done privately". Only the phrase form is usable.
    const rawFear = lower(strip(contradiction.fear || ""));
    const fear = usablePhrase(rawFear) ? rawFear : "";
    const stake = lower(strip(family?.stake || ""));
    const behaviour = lower(strip(insight.dynamic_tension?.observable_behavior || ""));
    const occasion = lower(strip(insight.dynamic_tension?.expanded?.occasion || at("hidden_emotion")));
    const who = terms.who;
    const category = terms.category;

    // The brief's own particulars, for anchoring.
    //
    // Phase 4.0.4's REPLACE_BRAND test found that 66 of 100 cases produced no
    // ownable idea: every mode but `unexpected_connection` wrote a sentence that
    // was true of the whole category, because the insight layers were built to
    // maximise `universality` and the modes inherited the habit.
    //
    // Universality is right for a *truth* and wrong for an *idea*. The truth
    // generalises; the idea has to belong to this brief, or a competitor
    // inherits it. So each mode below now carries at least one frame anchored on
    // the situation the brief actually described.
    // Both are guarded. `terms.key` and `observable_behavior` are extracted
    // spans, not noun phrases, and splicing an unguarded one as a sentence
    // subject produced "Mature buyers reject correction language is where the
    // real price is paid". An anchor that cannot carry a subject is worse than
    // no anchor: it makes the idea ungrammatical *and* keeps the ownership.
    // A brand behaviour reads as something done; a value reads as something
    // claimed, so only behaviour and history are used here.
    //
    // The deed is tied to the *stake* rather than to the brief's key phrase.
    //
    // In the first version of these frames the deed was anchored on `key`, and
    // `CreativeInterpretationDistance` then found the result DISCONNECTED from
    // its own human truth on most cases — correctly. "Half-used bottles is why
    // we say the price before it is asked for" is a fine sentence about a brand
    // deed and it is not about the truth the insight produced. Anchoring on the
    // stake connects the two, because the stake is what the truth is built from.
    const deed = firstUsable([...(dna?.history || []), ...(dna?.behavior || [])]);
    const asset = firstUsable(dna?.distinctive_assets || []);

    const key = usableAnchor(terms.key || "") ? lower(strip(terms.key || "")) : "";
    const act = usableVerbPhrase(behaviour) ? lower(strip(behaviour)) : "";

    const out: ModeExpression[] = [];

    /** Picks one of three frames by the material, never by the score. */
    const add = (
      mode: ExpressionMode,
      frames: string[],
      hook: string,
      works: string,
      reason: string
    ) => {
      const usable = frames.filter(Boolean);
      if (!usable.length) return;
      const start = Math.abs(hash(`${mode}|${want}|${identity}|${behaviour}`)) % usable.length;

      for (let i = 0; i < usable.length; i++) {
        const text = sentence(usable[(start + i) % usable.length]);
        const n = text.split(/\s+/).length;
        if (n < 6 || n > 28) continue;
        // A construction that came out as a fragment is worse than one mode fewer.
        if (/(?:^|\s)(?:because|and|but|that|which|the|a|an|of|to|is|are|was|were)$/i.test(
            text.replace(/[.\"”]+$/, "")
        )) {
          continue;
        }
        if (/\b(\w+)\s+\1\b/i.test(text)) continue;

        const tail = [
          terms.objective ? `in service of ${lower(strip(terms.objective))}` : "",
          who ? `among ${who}` : "",
        ]
          .filter(Boolean)
          .join(" ");

        out.push({
          big_idea: text,
          mode,
          human_truth: insight.human_truth,
          why_it_works: sentence(works),
          emotional_hook: sentence(hook),
          strategic_reason: sentence(tail ? `${strip(reason)}, ${tail}` : reason),
        });
        return;
      }
    };

    // ── Psychological reversal — the fault is not where it is put ───────
    if (want && identity) {
      add(
        "psychological_reversal",
        [
          deed && stake ? `${cap(who)} give up ${stake} every day — so we ${deed}` : "",
          `The failure was never ${who}; it is a category where ${want} costs you being ${identity}`,
          act ? `${cap(who)} ${act} — and ${category} has spent years calling that the problem` : "",
          `${cap(who)} did not get this wrong — ${category} built it so that ${want} has a price`,
          `Stop asking ${who} to try harder at a thing ${category} made difficult on purpose`,
        ],
        "Relief that arrives as an acquittal",
        "The audience has assumed the failure was theirs; being told otherwise is new information",
        "Moves the fault from the person to the category, which only a brand willing to indict the category can say"
      );
    }

    // ── Hidden cost — the price is not the price ────────────────────────
    if (stake || fear) {
      add(
        "hidden_cost",
        [
          deed && stake ? `The real price here is ${stake}. That is why we ${deed}` : "",
          `The price on the label is not what this costs; ${stake || fear} is`,
          key ? `${cap(key)} ${isPlural(key) ? "are" : "is"} where the real price is paid, and never the one quoted` : "",
          `Count what ${who} actually pay here, and the money is the smallest part of it`,
          `Everything in ${category} is priced except the part that matters: ${stake || fear}`,
        ],
        "The discomfort of a cost that had not been counted",
        "Converts an accepted condition into a decision, which is where action starts",
        "A cost that has been named is harder to keep paying quietly"
      );
    }

    // ── Identity paradox — getting it costs being it ────────────────────
    if (want && identity) {
      add(
        "identity_paradox",
        [
          `To get ${want}, ${who} have to stop being ${identity} — so most of them do neither`,
          act ? `${cap(who)} ${act} precisely because staying ${identity} matters more than ${want}` : "",
          `${cap(who)} can have ${want} or stay ${identity}, and ${category} has never offered both`,
          `The thing that makes ${who} good at this is the same thing stopping them from ${want}`,
        ],
        "Recognition of a trap the audience has been inside without naming",
        "Names a bind the category creates and never acknowledges",
        "A brand that dissolves the bind owns the resolution; a brand that names it owns the problem"
      );
    }

    // ── Social pressure — the room decides ──────────────────────────────
    if (fear) {
      add(
        "social_pressure",
        [
          asset && fear ? `Everyone here is avoiding ${fear}. ${cap(asset)} is what we did about it` : "",
          `Everyone here is quietly avoiding ${fear}, and not one of them will say so`,
          key ? `Nobody admits that ${key} is a room full of people managing ${fear}` : "",
          `The decision is not made by ${who}; it is made by whoever they imagine watching`,
          `${cap(category)} is full of people managing ${fear} and pretending they are comparing options`,
        ],
        "Recognition of an unwritten rule everyone obeys",
        "Describes a social fact the audience lives inside and has never seen stated",
        "Owns a piece of everyday behaviour rather than a product attribute"
      );
    }

    // ── Human confession — the person says it ───────────────────────────
    if (want && identity) {
      add(
        "human_confession",
        [
          `"I want ${want}, and I will not stop being ${identity} to get it"`,
          act ? `"I ${act}. I have never once been asked why"` : "",
          `"I have worked out what this costs me, and I have decided not to say so"`,
          fear ? `"What I am avoiding is not the price. It is ${fear}"` : "",
        ],
        "Being seen, in the specific way that being quoted accurately feels like",
        "Puts the unspoken thing in the audience's own voice rather than the brand's",
        "A confession cannot be copied by a competitor without sounding like an echo"
      );
    }

    // ── Unexpected connection — two things turn out to be one ───────────
    if (key && (stake || fear)) {
      add(
        "unexpected_connection",
        [
          deed && stake ? `${cap(stake)} and ${key || fear} are the same thing — so we ${deed}` : "",
          `${cap(key)} and ${stake || fear} turn out to be the same decision`,
          `Nobody thinks ${key} is about ${stake || fear}. It is only ever about that`,
          occasion ? `${cap(key)} is where ${stake || fear} gets settled, and nobody calls it that` : "",
        ],
        "The click of two unrelated things turning out to be one",
        "Connects the brief's own particular to the truth underneath it, which is what makes it ownable",
        "A connection nobody has drawn is a position nobody can take second"
      );
    }

    return out;
  }

  /** Which modes the insight could support, for diagnostics. */
  public static availableModes(
    insight: HumanInsight,
    terms: InsightTerms,
    contradiction: InsightContradiction
  ): ExpressionMode[] {
    return this.express(insight, terms, contradiction).map((e) => e.mode);
  }
}

/**
 * Can this phrase stand as the subject of a sentence?
 *
 * Two to five content-bearing words, no finite verb, no leading conjunction. A
 * span that contains its own verb is a clause, and a clause spliced in front of
 * "is where the real price is paid" produces two verbs and no sentence.
 */
/**
 * A noun phrase short enough and simple enough to splice after a copula.
 *
 * Looser than `usableAnchor` — this one only has to follow "It is", not head a
 * sentence — but it still rejects anything carrying its own finite verb.
 */
function usablePhrase(p: string): boolean {
  const t = strip(String(p || "")).toLowerCase();
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 12) return false;
  if (/\b(?:is|are|was|were|has|have|does|do)\b/.test(t)) return false;
  return true;
}

/** Does this anchor take a plural verb? Crude, and enough for a copula. */
function isPlural(phrase: string): boolean {
  const last = strip(String(phrase || "")).split(/\s+/).pop() || "";
  return /s$/i.test(last) && !/(?:ss|us|is)$/i.test(last);
}

/**
 * A conjunction inside an extracted span means the extractor crossed a boundary.
 *
 * "reading and every brand" and "buy her skincare and" both passed the earlier
 * guards and both produced sentences that fall over. A span carrying its own
 * conjunction is two fragments, and neither half is what was wanted.
 */
function hasConjunction(p: string): boolean {
  return /(?:^|\s)(?:and|or|but|nor|yet|so)(?:\s|$)/i.test(p);
}

/**
 * Can this phrase stand as the subject of a sentence?
 *
 * Two to five words, headed by a noun, with no verb and no conjunction. The bar
 * is high on purpose: an anchor that cannot carry a subject makes the idea
 * ungrammatical *and* keeps the brand ownership, which is the worst of both.
 * Where it fails the mode simply uses one of its unanchored frames.
 */
function usableAnchor(phrase: string): boolean {
  const p = strip(String(phrase || "")).toLowerCase();
  if (!p) return false;
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (hasConjunction(p)) return false;
  if (/\b(?:is|are|was|were|has|have|does|do|will|would|can|could|reject|feel|want|know|make|take|leave|leaves|give|gives)\b/.test(p)) {
    return false;
  }
  if (/^(?:and|but|so|because|that|which|every|all|each|the|a|an|of|to|in|on|for|with|it)\b/.test(p)) return false;
  // The head of a noun phrase is its last word, and a participle there means the
  // span is a verb phrase: "prevention leaves", "women reading".
  const head = words[words.length - 1];
  if (/(?:ing|ed)$/.test(head)) return false;
  return true;
}

/**
 * Can this read as something a person does, after a plural subject?
 *
 * Must start with a bare plural verb, carry no auxiliary, no clause marker and
 * no conjunction.
 */
function usableVerbPhrase(phrase: string): boolean {
  const p = strip(String(phrase || "")).toLowerCase();
  if (!p) return false;
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  if (hasConjunction(p)) return false;
  if (/\b(?:is|are|was|were|has|have|been|being)\b/.test(p)) return false;
  if (/^(?:and|but|so|because|that|which|the|a|an|of|to|in|on|for|with|it)\b/.test(p)) return false;
  if (/\b(?:because|which|while|although|whether|when|since|that|like)\b/.test(p)) return false;
  // A trailing function word means the span was cut mid-phrase.
  if (/(?:^|\s)(?:the|a|an|of|to|in|on|for|with|her|his|their|its)$/.test(p)) return false;
  return true;
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
