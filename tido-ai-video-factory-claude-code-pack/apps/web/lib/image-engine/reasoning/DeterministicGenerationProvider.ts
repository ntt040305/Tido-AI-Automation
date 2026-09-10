import { MOTIVATION_FAMILIES } from "./human-motivation.types";
import { similarity } from "./OriginalityEvaluator";
import {
  CreativeCandidate,
  CreativeGenerationProvider,
  GenerationRequest,
} from "./creative-generation.types";
import { CreativeStructure } from "./creative-patterns.types";
import { MemoryMechanism } from "./emotional-mechanism.types";

/**
 * CIOS Phase 4.0.7 — the fallback writer, rebuilt around directions.
 *
 * What the audit forced
 * --------------------
 * The old expression layer had six frames and fired each once per brief. One of
 * them — the confession — was a *constant string* with no material spliced at
 * all, emitted 48 times identically; it alone manufactured 85 of the run's 121
 * `recognition` readings, and `recognition` survives a director 3% of the time.
 * Two structures were never produced by anything.
 *
 * So this provider is organised the other way round. It is asked for a
 * *direction* — a structure to search in, a psychological objective, or neither
 * — and builds from whichever part of the insight that direction points at. Two
 * calls with different directions reach for different material, which is what
 * makes them different ideas rather than the same idea reworded.
 *
 * Three constraints every construction is written to
 * -------------------------------------------------
 * Craft rules, adopted because the first run of the new pool failed all three:
 *
 *   anchored — the sentence rests on something *this brief* supplied: the
 *              behaviour it described, the phrase in its challenge, an object in
 *              its product. An idea resting on none of those is one any
 *              competitor could run.
 *   short    — twenty words, one clause, no subordination. An idea gets one read.
 *   opposed  — two things held against each other inside the sentence, so it
 *              carries its own tension without the deck standing next to it.
 *   connected — the sentence carries something from the truth as well as
 *              something from the brief. The first version of this rebuild
 *              anchored only in the brief, and 81% of what it produced was read
 *              as DISCONNECTED from the insight against 38% before — a bigger,
 *              more varied pool of sentences that were no longer interpretations
 *              of anything. An idea has to be about the brief *and* about the
 *              truth; either alone is not an idea.
 *
 * Worth saying plainly, because it bears on how the benchmark should be read:
 * the first two are also what REPLACE_BRAND and FIRST_REACTION measure. Writing
 * generation to them means those two stress numbers are no longer fully
 * independent evidence about generation — they are partly a measurement of a
 * rule the generator was given. The director decision, the taste dimensions and
 * the mechanism reading are untouched by this and remain the numbers worth
 * trusting: no construction below contains a phrase chosen to trip a detector in
 * any of them.
 *
 * What it still is
 * ---------------
 * A deterministic writer, which means templates underneath. The honest claim is
 * that there are more of them, that which one is used depends on the direction
 * rather than on a rotation, and that every one splices real material — the
 * constant-string failure cannot recur, because a construction whose material is
 * missing returns nothing at all. It is the fallback and the test harness. The
 * LLM provider is the one that can actually write.
 */

const CONCRETE = [
  "receipt", "bill", "price", "tag", "label", "panel", "packet", "bottle",
  "box", "bag", "letter", "list", "note", "menu", "photograph", "screen",
  "phone", "mirror", "window", "door", "seat", "chair", "table", "counter",
  "shelf", "aisle", "till", "queue", "wardrobe", "kitchen", "sign", "drawer",
  "card", "key", "coat", "shirt", "size", "room", "street", "shop", "cream",
  "serum", "set", "kit", "jar", "tube", "sachet", "cup", "bowl", "plate",
];

/** Subordination the sentence must not carry: it costs the idea its one read. */
const SUBORDINATOR = /\b(?:because|although|whereas|which|while|since|unless|whereby|given that)\b/i;

// Trailing words that leave a phrase hanging. Modals are included because the
// behaviour reconstructor truncates clauses mid-verb: "know what she should"
// is not an act, and spliced into a frame it produces a sentence that stops
// before its own verb.
const TRAILING =
  /\s+(?:because|that|which|and|but|or|the|a|an|of|to|in|on|for|with|is|are|was|were|as|at|by|should|would|could|must|will|can|might|shall|may)$/i;

interface Material {
  who: string;
  category: string;
  stake: string;
  want: string;
  identity: string;
  fear: string;
  emotion: string;
  existential: string;
  behaviour: string;
  key: string;
  object: string;
  deed: string;
}

type Push = (idea: string, derivation: string) => void;

export class DeterministicGenerationProvider implements CreativeGenerationProvider {
  public readonly name = "deterministic";

  public available(): boolean {
    return true;
  }

  public generate(request: GenerationRequest): CreativeCandidate[] {
    const m = this.material(request);
    if (!m.who) return [];

    const out: CreativeCandidate[] = [];
    const spent = new Set((request.avoid_openings || []).map((o) => o.toLowerCase()));
    const push: Push = (idea, derivation) => {
      const text = sentence(idea);
      if (!this.wellFormed(text)) return;
      // An opening the pool has had its fill of. Rejecting here rather than in
      // the builder matters: the slot goes on to the next construction in the
      // same direction instead of returning nothing.
      if (spent.has(opening(text))) return;
      if (request.avoid.some((a) => similarity(text, a) >= 0.7)) return;
      if (out.some((c) => similarity(text, c.idea) >= 0.7)) return;
      out.push({
        idea: text,
        territory: request.territory.name,
        structure_direction: request.structure_direction,
        mechanism_objective: request.mechanism_objective,
        provider: this.name,
        derivation,
        unguided: !request.structure_direction && !request.mechanism_objective,
      });
    };

    // A direction chooses which constructions are attempted. Where both a
    // structure and an objective are given, both are attempted and whichever
    // finds material contributes — neither is forced.
    if (request.mechanism_objective) this.forMechanism(request.mechanism_objective, m, push);
    if (request.structure_direction) this.forStructure(request.structure_direction, m, push);
    if (!request.mechanism_objective && !request.structure_direction) this.unguided(m, push);

    return out.slice(0, Math.max(1, request.count));
  }

  // ── Material ────────────────────────────────────────────────────────────

  /**
   * What this brief actually supplies, pulled apart once and length-capped.
   *
   * The caps are what keep a construction inside one readable clause. A field
   * that arrives too long to splice comes back empty, and the constructions
   * needing it produce nothing — the intended behaviour, because a gap in the
   * pool is honest and a twenty-eight-word sentence is not.
   */
  private material(r: GenerationRequest): Material {
    const family = MOTIVATION_FAMILIES.find((f) => f.id === r.tension?.motivation.family);
    const object =
      CONCRETE.find((c) => new RegExp(`\\b${c}s?\\b`, "i").test(r.brief.challenge)) ||
      CONCRETE.find((c) => new RegExp(`\\b${c}s?\\b`, "i").test(r.brief.product)) ||
      "";

    return {
      who: short(shortAudience(r.brief.audience), 3),
      category: short(String(r.brief.category || "").toLowerCase(), 3),
      stake: short(lower(strip(family?.stake || "")), 6),
      // Eight, not five. This field arrives as a noun phrase, so a longer one is
      // still spliceable — "a way to try that costs nothing" is seven words and
      // reads correctly in every frame that takes it. At five, briefs phrased
      // slightly longer lost every construction that needs a want, and one brief
      // in ten came out with a single candidate.
      want: short(lower(strip(r.contradiction.desire || family?.short_want || "")), 8),
      identity: short(
        lower(strip(r.contradiction.tradeoff || family?.short_identity || "")).replace(/^to be /, ""),
        5
      ),
      fear: short(lower(strip(r.contradiction.fear || "")), 5),
      emotion: short(
        lower(strip(r.tension?.motivation.emotional_need || ""))
          .replace(/^to not /, "")
          .replace(/^to /, ""),
        8
      ),
      existential: short(lower(strip(r.tension?.motivation.existential_tension || "")), 11),
      behaviour: this.behaviourPhrase(r.tension?.observable_behavior || ""),
      key: this.keyPhrase(r.brief.key_phrase || ""),
      object,
      deed: this.firstShort([...(r.brand_dna.history || []), ...(r.brand_dna.behavior || [])]),
    };
  }

  /**
   * The observed behaviour, as something a sentence can say a person does.
   *
   * Trimmed rather than rejected where it trails off. The briefs supply
   * behaviours like "reject correction language because", and discarding that
   * loses the single most brief-specific thing the insight holds. What is
   * rejected is a phrase still carrying subordination after trimming, or one too
   * short to be an act.
   */
  private behaviourPhrase(raw: string): string {
    let t = String(raw || "").trim().toLowerCase().replace(/^because\s+/, "");
    for (let i = 0; i < 3; i++) t = t.replace(TRAILING, "");
    if (SUBORDINATOR.test(t)) return "";
    const w = t.split(/\s+/).filter(Boolean);
    if (w.length < 2 || w.length > 7) return "";
    if (/\b(?:is|are|was|were|has|have|been|being)\b/.test(t)) return "";
    // A behaviour with a coordinator inside it is a fragment of a longer clause,
    // not an act. The reconstructor hands back phrases like "open and the cost"
    // and "comparing at read and the thing"; splicing those verbatim produced
    // sentences that were plainly broken English and were still scored, ranked
    // and recommended — "Product teams open and the cost again this morning
    // before anyone judged it" reached a MODIFY. Nothing downstream reads
    // grammar, so the guard has to be here.
    if (/\b(?:and|or|but)\b/.test(t)) return "";
    // Likewise a phrase opening on a preposition or a bare article: it is the
    // tail of something, and there is no subject it can follow.
    if (/^(?:at|in|on|for|with|to|of|by|the|a|an)\b/.test(t)) return "";
    return t;
  }

  /** The distinctive phrase from the challenge, where it is short enough to splice. */
  private keyPhrase(raw: string): string {
    let t = String(raw || "").trim().toLowerCase();
    for (let i = 0; i < 3; i++) t = t.replace(TRAILING, "");
    if (SUBORDINATOR.test(t)) return "";
    const w = t.split(/\s+/).filter(Boolean);
    if (w.length < 2 || w.length > 5) return "";
    return t;
  }

  // ── Mechanism-directed construction (Task 4) ────────────────────────────

  /**
   * The objective decides which material is reached for.
   *
   * Not which frame is filled. `recognition` reaches for the observed behaviour;
   * `relief` reaches for the consequence and reassigns it; `transgression`
   * reaches for the stake. Two objectives over the same insight therefore write
   * about different things, which is what stops them being paraphrases.
   */
  private forMechanism(objective: MemoryMechanism, m: Material, push: Push): void {
    const d = (s: string) => `mechanism:${objective} — ${s}`;

    switch (objective) {
      case "recognition":
        // Something done, held against what doing it costs. Where the brief names
        // no act, recognition is not reachable and nothing is produced.
        if (m.behaviour) {
          if (m.fear) push(`${cap(m.who)} ${m.behaviour} rather than admit ${m.fear}`, d("the act, against the fear"));
          push(`${cap(m.who)} ${m.behaviour} rather than say what it costs them`, d("the act, against its cost"));
          // Second person, which is the register recognition actually works in:
          // the reader has to find themselves in it, and "women" is not addressed
          // to anyone. The third-person rebuild lost this entirely — and because a
          // slot keeps only the first constructions that produce, being third in
          // this list meant it landed twice in a hundred briefs.
          push(`You ${m.behaviour} rather than admit what it costs you`, d("the act, addressed to the reader"));
          push(`Somebody ${m.behaviour} today rather than be seen asking`, d("the act, in the singular"));
        }
        if (m.key) push(`${cap(m.key)} is what ${m.who} protect rather than explain`, d("the brief phrase as a private act"));
        break;

      case "relief":
        // The burden, taken off the person and put where it came from.
        if (m.fear && m.who) {
          push(`${cap(m.who)} did not cause ${m.fear} and cannot keep paying for it`, d("burden reassigned"));
        }
        if (m.behaviour && m.want) {
          push(`${cap(m.who)} ${m.behaviour} and were never wrong to want ${m.want}`, d("the act, absolved by the want"));
        }
        if (m.behaviour) push(`${cap(m.who)} ${m.behaviour} and will not be blamed for it`, d("the act, absolved"));
        if (m.key) push(`${cap(m.key)} was not carelessness but a cost nobody named`, d("the brief phrase, absolved"));
        if (m.want) push(`${cap(m.who)} want ${m.want} and were never wrong to`, d("the want, absolved"));
        break;

      case "transgression":
        // The thing the category will not say, said.
        if (m.key) push(`Nobody in ${m.category} will say ${m.key} is the risk`, d("the unsaid thing, named"));
        if (m.stake && m.want) {
          push(`${cap(m.who)} are not paying for ${m.want} but for ${m.stake}`, d("what is really bought"));
        }
        if (m.behaviour && m.fear) {
          push(`Everyone knows ${m.who} ${m.behaviour} and nobody will name ${m.fear}`, d("the act and the unnamed fear"));
        }
        if (m.behaviour) push(`Everyone in ${m.category} knows ${m.who} ${m.behaviour} and will not say it`, d("the known unsaid"));
        break;

      case "concretion":
        // One thing, made the subject.
        if (m.object && m.want) {
          push(`One ${m.object} is where ${m.want} is won or given up`, d("object as the site of the want"));
        }
        if (m.object) {
          push(`${cap(m.who)} keep one ${m.object} rather than trust the label`, d("object against the category"));
          push(`The ${m.object} in the drawer costs more than they will admit`, d("object as the verdict"));
        }
        if (m.key) push(`${cap(m.key)} costs more than anything on the price list`, d("brief phrase priced"));
        break;

      case "reversal":
        // The fault, moved to what made it cost anything.
        if (m.who && m.want) {
          push(`It was not ${m.who} but the ${m.category} that made ${m.want} cost this much`, d("fault relocated"));
        }
        if (m.behaviour && m.identity) {
          push(`${cap(m.who)} ${m.behaviour} to stay ${m.identity} and get called difficult`, d("the act, and what it protects"));
        }
        if (m.behaviour) push(`${cap(m.who)} ${m.behaviour} and will not be called careless for it`, d("the act, renamed"));
        // A reversal that is actually a change of mind rather than a change of
        // wording: who was blamed before, and who is blamed now.
        if (m.fear) push(`${cap(m.who)} used to blame themselves for ${m.fear}`, d("blame, before and after"));
        break;
    }
  }

  // ── Structure-directed construction (Task 3) ────────────────────────────

  private forStructure(direction: CreativeStructure, m: Material, push: Push): void {
    const d = (s: string) => `structure:${direction} — ${s}`;

    switch (direction) {
      case "emotional_reversal":
        // Never produced by the old layer at all.
        if (m.behaviour && m.fear) {
          push(`${cap(m.who)} ${m.behaviour} rather than risk ${m.fear} again`, d("the act, against the fear"));
        }
        if (m.behaviour) push(`${cap(m.who)} ${m.behaviour} rather than risk being wrong again`, d("the act, exonerated"));
        if (m.fear) push(`${cap(m.fear)} was not theirs to begin with but the category's`, d("the fault, traced back"));
        if (m.identity) push(`Nobody in ${m.category} treats ${m.who} as ${m.identity}`, d("the identity, unrecognised"));
        break;

      case "human_ritual":
        // Also never produced. It needs a repeated act.
        if (m.behaviour) {
          if (m.want) {
            push(`Before anything else ${m.who} ${m.behaviour} and protect ${m.want}`, d("the act, protecting the want"));
          }
          push(`Before anything else ${m.who} ${m.behaviour} and keep it to themselves`, d("the act, as the first move"));
          push(`${cap(m.who)} ${m.behaviour} again this morning before anyone judged it`, d("the act, repeated"));
        }
        if (m.object) push(`The ${m.object} comes out before the decision does`, d("object inside the ritual"));
        break;

      case "object_carrying_truth":
        if (m.object && m.fear) {
          push(`One ${m.object} holds ${m.fear} and will not be argued with`, d("object holding the fear"));
        }
        if (m.object) {
          push(`One ${m.object} holds the whole cost and will not be argued with`, d("object against the category"));
          push(`${cap(m.who)} keep the ${m.object} and no longer keep the promise`, d("object as what survived"));
        }
        if (m.key) push(`${cap(m.key)} carries the whole decision and costs nothing to show`, d("brief phrase as carrier"));
        break;

      case "identity_transformation":
        if (m.identity && m.want) {
          push(`${cap(m.who)} would have to stop being ${m.identity} to get ${m.want}`, d("the identity cost, stated"));
        }
        if (m.behaviour) push(`${cap(m.who)} ${m.behaviour} and no longer trust anyone who asks`, d("the act, as a change"));
        if (m.want) push(`${cap(m.who)} no longer want ${m.want} and will not say when that changed`, d("the want, given up"));
        if (m.identity) push(`${cap(m.who)} are ${m.identity} and are never spoken to that way`, d("the identity, unaddressed"));
        break;

      case "unexpected_perspective":
        if (m.fear) push(`From where ${m.who} stand the risk was always ${m.fear}`, d("the position, and the real risk"));
        if (m.category) push(`From where ${m.who} stand the risk was never the product`, d("the audience's own position"));
        if (m.behaviour) {
          push(`${cap(m.who)} ${m.behaviour} and the risk stops looking irrational`, d("the act, seen from outside"));
        }
        break;
    }
  }

  // ── Unguided construction (Task 3's reserve) ────────────────────────────

  /**
   * With no direction at all.
   *
   * Kept deliberately different in kind from the directed constructions: these
   * reach for whatever the insight has most of rather than for what a direction
   * points at. The reserve exists so the search space is not closed by the
   * directions available, and a reserve producing the same sentences as the
   * directed path would not be a reserve.
   */
  private unguided(m: Material, push: Push): void {
    const d = (s: string) => `unguided — ${s}`;
    if (m.want) push(`${cap(m.who)} want ${m.want} and will not ask for it`, d("want, unspoken"));
    if (m.behaviour && m.want) push(`${cap(m.who)} ${m.behaviour} rather than lose ${m.want}`, d("act against the want"));
    if (m.behaviour) push(`${cap(m.who)} ${m.behaviour} rather than carry the cost in public`, d("act against its cost"));
    if (m.key) push(`${cap(m.key)} is the risk nobody prices and everybody carries`, d("brief phrase as the unpriced part"));
    if (m.want) push(`${cap(m.who)} gave up ${m.want} before anyone offered it`, d("want, abandoned early"));
    if (m.deed && m.behaviour) push(`${cap(m.who)} ${m.behaviour} and we ${m.deed}`, d("act against brand deed"));
    if (m.existential) push(`${cap(m.existential)} and no one is told`, d("the existential tension, unspoken"));
    // Two that reach for the parts of the stack the others do not touch. Without
    // them the reserve is unreachable on a brief that supplies no want, no
    // behaviour and no distinctive phrase — one pool in ten, which is a reserve
    // that exists in the plan and not in the pool.
    if (m.emotion) push(`${cap(m.who)} would rather ${m.emotion} than say so`, d("the emotional need, unspoken"));
    if (m.fear) push(`${cap(m.who)} carry ${m.fear} and were never asked to`, d("the fear, carried unasked"));
    if (m.stake) push(`${cap(m.who)} would give up ${m.stake} before admitting why`, d("the stake, surrendered quietly"));
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  /**
   * Whether the constructed string is a sentence at all.
   *
   * The doubled-space and dangling-article checks are the important ones: they
   * make an empty material field produce nothing instead of a sentence about
   * nothing, which is the exact failure the audit found 48 copies of.
   */
  private wellFormed(text: string): boolean {
    const words = text.split(/\s+/);
    if (words.length < 7 || words.length > 20) return false;
    if (/\b(\w+)\s+\1\b/i.test(text)) return false;
    if (SUBORDINATOR.test(text)) return false;
    // One clause. A second comma is a second thought, and an idea gets one read.
    if ((text.match(/[,;:—]/g) || []).length > 1) return false;
    if (/(?:^|\s)(?:and|but|that|the|a|an|of|to|is|are|was|were|for|with)$/i.test(text.replace(/[.""]+$/, ""))) {
      return false;
    }
    if (/\s{2,}|\b(?:the|a|an)\s+[,.]/.test(text)) return false;
    return true;
  }

  private firstShort(items: string[]): string {
    for (const raw of items) {
      const t = strip(String(raw || "")).toLowerCase().replace(/^(?:has |have |had )/, "");
      const w = t.split(/\s+/).filter(Boolean);
      if (w.length < 2 || w.length > 6 || /[.;:]/.test(t)) continue;
      return t.replace(/^(\w+)/, (verb) => {
        const irregular: Record<string, string> = {
          publishes: "publish", prints: "print", keeps: "keep", walks: "walk",
          repairs: "repair", removes: "remove", answers: "answer", declines: "decline",
          photographs: "photograph", withdraws: "withdraw", begins: "begin", buys: "buy",
        };
        const l = verb.toLowerCase();
        if (irregular[l]) return irregular[l];
        if (/(?:ed|ing)$/.test(l)) return verb;
        if (/^[a-z]+s$/.test(l) && !/(?:ss|us|is)$/.test(l)) return l.slice(0, -1);
        return verb;
      });
    }
    return "";
  }
}

/**
 * The first few words, as an identity for the sentence's opening move.
 *
 * Four words is enough to catch a shared subject-and-verb and short enough not
 * to collapse two genuinely different sentences into one bucket.
 */
export function opening(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

/** A fragment, or nothing if it is too long to sit inside one clause. */
function short(text: string, maxWords: number): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(" ").length <= maxWords ? t : "";
}
function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}
function strip(t: string): string {
  return String(t || "").replace(/[.]+$/, "").trim();
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
function shortAudience(raw: string): string {
  const t = String(raw || "").replace(/\.$/, "").trim();
  if (!t) return "people";
  const deAged = t
    .replace(/\baged?\s+/gi, " ")
    .replace(/\b\d+\s*(?:to|-|–|—)\s*\d+\b/g, " ")
    .replace(/\b\d+\s*(?:\+|plus|and (?:over|above|up))\b/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const head = deAged.split(/\s+who\b|\s+that\b|\s+new to\b|\s+with\b|\s+in\b|\s+for\b|,/i)[0].trim();
  const words = head.split(/\s+/).filter(Boolean).slice(0, 3);
  while (words.length > 1 && /^(?:to|and|or|plus|over|under|up|of|the|a|an)$/i.test(words[words.length - 1])) {
    words.pop();
  }
  // A trailing participle turns the audience into half a clause, and the
  // behaviour spliced after it doubles the verb: "people buying" + "bought under
  // time pressure" reads "People buying bought under time pressure". The head
  // noun is the subject; the participle belongs to the behaviour, if anywhere.
  while (words.length > 1 && /(?:ing|ed)$/i.test(words[words.length - 1])) {
    words.pop();
  }
  return (words.join(" ") || "people").toLowerCase();
}
