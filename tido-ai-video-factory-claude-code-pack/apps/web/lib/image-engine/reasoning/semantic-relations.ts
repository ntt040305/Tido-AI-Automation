/**
 * CIOS Phase 4.0.4.1 — relations between two texts, rather than overlap.
 *
 * What this changes, and what it does not
 * --------------------------------------
 * Every evaluator downstream of the insight layers has judged one text against
 * another by counting shared words. That answers "how alike are these" and the
 * questions actually being asked are different in kind:
 *
 *   Does this idea *enact* the brand's behaviour, or merely mention it?
 *   Does it *transform* the human truth, or repeat it?
 *   Does it *supply* what a film needs, or talk about supplying it?
 *
 * Those are relations, and a similarity score cannot express one. Two texts at
 * 0.4 overlap might be a restatement in different words or a genuine departure
 * that happens to share vocabulary, and a number cannot tell you which.
 *
 * So this classifies the *relation* instead: it splits each text into what it is
 * about (subject) and what it says about it (predicate), compares the two halves
 * separately, and reads polarity. A pair that shares a subject and differs in
 * predicate is a transformation. A pair that shares both is a restatement. A pair
 * that shares a subject with opposite polarity is a contradiction.
 *
 * The honest limit
 * ---------------
 * This is still lexical underneath. The subject/predicate split is heuristic —
 * content nouns before the first finite verb are the subject, the rest is the
 * predicate — and it has no idea what any word means. What changes is the *unit
 * of judgement*: an evaluator now receives a typed relation with evidence rather
 * than a number it has to interpret, and a wrong relation is visible in a way a
 * wrong similarity score never was.
 *
 * Where an embedding service exists, `subjectOf`, `predicateOf` and `classify`
 * are the three functions to replace. Nothing above them would change.
 */

export type Relation =
  /** The idea performs the act the other text describes. Strongest ownership. */
  | "ENACTS"
  /** It names the thing without doing it. */
  | "INVOKES"
  /** Same subject, different proposition. What a good idea does to a truth. */
  | "TRANSFORMS"
  /** Same subject, same proposition. A paraphrase. */
  | "RESTATES"
  /** Same subject, opposite polarity. */
  | "CONTRADICTS"
  /** No shared subject at all. */
  | "UNRELATED";

export interface RelationVerdict {
  relation: Relation;
  /** 0-1. How much of the subject is shared. */
  subject_overlap: number;
  /** 0-1. How much of the predicate is shared. */
  predicate_overlap: number;
  /** True where the two disagree in polarity on a shared subject. */
  opposed: boolean;
  /** What decided it, in words. */
  evidence: string;
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "not", "no", "is", "are", "was", "were",
  "be", "been", "being", "it", "its", "this", "that", "these", "those", "they",
  "them", "their", "there", "here", "what", "who", "which", "when", "where",
  "why", "how", "will", "would", "can", "could", "shall", "should", "may",
  "might", "must", "have", "has", "had", "do", "does", "did", "of", "to", "in",
  "on", "at", "by", "for", "with", "from", "into", "onto", "than", "then",
  "because", "while", "before", "after", "until", "unless", "rather", "instead",
  "never", "always", "still", "yet", "only", "even", "just", "more", "most",
  "less", "very", "so", "too", "as", "if", "about", "over", "under", "up",
  "down", "out", "off", "again", "once", "all", "any", "both", "each", "few",
  "many", "some", "such", "own", "same", "one", "two", "you", "your", "i", "we",
  "she", "he", "her", "his", "him", "us", "our", "my", "me",
]);

/** Verbs that mark where a subject ends and a predicate begins. */
const FINITE_VERB =
  /\b(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|must|makes?|made|takes?|took|gives?|gave|goes|went|comes?|came|becomes?|became|costs?|pays?|paid|buys?|bought|wants?|needs?|knows?|feels?|felt|sees?|saw|says?|said|turns?|stops?|starts?|keeps?|kept|leaves?|left|gets?|got|puts?|holds?|held|calls?|called|asks?|asked|refuses?|gives? up|forgo(?:es)?|avoids?|protects?|publishes?|prints?|walks?|repairs?|removes?|photographs?|counts?|checks?|admits?)\b/i;

/** Polarity markers. A shared subject with opposite polarity is a contradiction. */
const NEGATION = /\b(?:not|never|no|nobody|nothing|none|cannot|refuse[sd]?|without|fails? to|will not|does not|do not)\b/i;

function words(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * What the text is about: content words before the first finite verb.
 *
 * Where there is no finite verb the whole text is the subject, which is the
 * right default for a noun phrase like a brand asset.
 */
export function subjectOf(text: string): string[] {
  const t = String(text || "");
  const m = t.match(FINITE_VERB);
  const head = m && m.index !== undefined ? t.slice(0, m.index) : t;
  const w = words(head);
  return w.length ? w : words(t);
}

/** What the text says about it: everything from the first finite verb on. */
export function predicateOf(text: string): string[] {
  const t = String(text || "");
  const m = t.match(FINITE_VERB);
  if (!m || m.index === undefined) return words(t);
  return words(t.slice(m.index));
}

/**
 * Subjects that carry no information about what a sentence is about.
 *
 * A human truth is universal by construction — "people give up X", "everyone
 * here avoids Y" — so its grammatical subject is always one of these. Comparing
 * those subjects to each other measured nothing: "people" and "everyone" share
 * no characters, and 349 of 458 ideas were classified UNRELATED to the truth
 * they were built from. That was the classifier failing, not the ideas.
 *
 * Where either side's subject is generic, the discriminating content is in the
 * predicate, and the comparison moves there.
 */
const GENERIC_SUBJECT = new Set([
  "people", "everyone", "everybody", "nobody", "anyone", "someone", "person",
  "customers", "consumers", "buyers", "shoppers", "users", "audiences",
  "women", "men", "adults", "parents", "patients", "guests", "clients",
  "most", "many", "some", "others",
]);

function isGeneric(subject: string[]): boolean {
  return subject.length > 0 && subject.every((w) => GENERIC_SUBJECT.has(w));
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let hits = 0;
  for (const w of new Set(a)) if (sb.has(w)) hits++;
  return hits / Math.min(new Set(a).size, sb.size);
}

/** Does the text contain a stem-sharing form of any of these words? */
function stemHit(text: string, targets: string[]): string {
  const t = String(text || "").toLowerCase();
  for (const w of targets) {
    if (w.length < 5) continue;
    const stem = w.slice(0, Math.max(4, w.length - 2));
    if (new RegExp(`\\b${stem}\\w*`, "i").test(t)) return w;
  }
  return "";
}

/**
 * Classifies how `idea` stands to `reference`.
 *
 * `reference` is the thing being compared against — a brand behaviour, a human
 * truth, a channel requirement. The relation is directional: an idea can enact a
 * behaviour, but a behaviour does not enact an idea.
 */
export function classify(idea: string, reference: string): RelationVerdict {
  const ideaSubject = subjectOf(idea);
  const refSubject = subjectOf(reference);
  const ideaPredicate = predicateOf(idea);
  const refPredicate = predicateOf(reference);

  // Where either subject is generic, the sentence's aboutness lives in its
  // predicate and the subject comparison is moved there. See `GENERIC_SUBJECT`.
  const genericPair = isGeneric(ideaSubject) || isGeneric(refSubject);
  const subject_overlap = Number(
    (genericPair
      ? Math.max(overlap(ideaPredicate, refPredicate), overlap(ideaSubject, refSubject))
      : overlap(ideaSubject, refSubject)
    ).toFixed(3)
  );
  const predicate_overlap = Number(overlap(ideaPredicate, refPredicate).toFixed(3));

  // Polarity is read across the whole sentence, because a negation anywhere
  // flips what the sentence asserts about its subject.
  const ideaNegated = NEGATION.test(idea);
  const refNegated = NEGATION.test(reference);
  const opposed = ideaNegated !== refNegated;

  // Shared subject is the gate. Without it there is no relation to classify,
  // however many incidental words the two have in common.
  const shared = Math.max(subject_overlap, overlap(ideaSubject, refPredicate));
  if (shared < 0.15 && predicate_overlap < 0.2) {
    return {
      relation: "UNRELATED",
      subject_overlap,
      predicate_overlap,
      opposed,
      evidence: genericPair
        ? "generic subjects on both sides, and no shared predicate either"
        : "no shared subject",
    };
  }

  // ENACTS: the idea contains the reference's own verb *and* its object. A
  // behaviour is enacted when the idea does the thing, not when it mentions it.
  const refVerb = reference.match(FINITE_VERB)?.[0] || "";
  const enactsVerb = refVerb ? stemHit(idea, [refVerb]) : "";
  if (enactsVerb && predicate_overlap >= 0.3 && !opposed) {
    return {
      relation: "ENACTS",
      subject_overlap,
      predicate_overlap,
      opposed,
      evidence: `performs the act itself ("${enactsVerb}") with ${Math.round(predicate_overlap * 100)}% of its object`,
    };
  }

  if (opposed && shared >= 0.3) {
    return {
      relation: "CONTRADICTS",
      subject_overlap,
      predicate_overlap,
      opposed,
      evidence: "same subject, opposite polarity",
    };
  }

  // RESTATES: same subject and the same thing said about it.
  if (subject_overlap >= 0.4 && predicate_overlap >= 0.5) {
    return {
      relation: "RESTATES",
      subject_overlap,
      predicate_overlap,
      opposed,
      evidence: `same subject and ${Math.round(predicate_overlap * 100)}% the same predicate`,
    };
  }

  // TRANSFORMS: same subject, something else said about it. This is what a good
  // idea does to a truth, and it is the relation the whole phase is after.
  if (subject_overlap >= 0.25 && predicate_overlap < (genericPair ? 0.45 : 0.5)) {
    return {
      relation: "TRANSFORMS",
      subject_overlap,
      predicate_overlap,
      opposed,
      evidence: `keeps the subject and says something else about it (${Math.round(predicate_overlap * 100)}% predicate)`,
    };
  }

  return {
    relation: "INVOKES",
    subject_overlap,
    predicate_overlap,
    opposed,
    evidence: "names the thing without doing it or transforming it",
  };
}

/** The strongest relation an idea has to any of the references. */
export function classifyBest(
  idea: string,
  references: string[],
  preference: Relation[] = ["ENACTS", "TRANSFORMS", "INVOKES", "RESTATES", "CONTRADICTS", "UNRELATED"]
): { reference: string; verdict: RelationVerdict } | null {
  let best: { reference: string; verdict: RelationVerdict } | null = null;
  let bestRank = preference.length;
  for (const reference of references) {
    if (!reference) continue;
    const verdict = classify(idea, reference);
    const rank = preference.indexOf(verdict.relation);
    if (rank >= 0 && rank < bestRank) {
      bestRank = rank;
      best = { reference, verdict };
    }
  }
  return best;
}
