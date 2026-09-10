/**
 * CIOS Phase 4.0.3.6 — the motivation stack, and latent situations.
 *
 * Two weaknesses from 4.0.3.5 are answered here, and they turned out to be the
 * same weakness twice.
 *
 * Discovery fired on 45 of 100 briefs. The obvious reading was that the other 55
 * describe conditions rather than acts, and that is true of about half of them —
 * "every competitor uses steam, pour and bean close-ups" describes a market. But
 * the rest plainly do contain behaviour: "she calculates resale value at the
 * moment of purchase", "she stopped taking it when she felt better", "she left
 * the appointment with four unasked questions". Those failed because the six-need
 * lexicon had nothing to match them to, not because there was nothing to see.
 *
 * So one file holds both repairs. `MOTIVATION_FAMILIES` replaces the six flat
 * needs with a five-layer stack, which both covers more behaviour and says more
 * about each. `LATENT_PATTERNS` reconstructs a situation from a brief that states
 * only a condition, which covers the genuinely behaviourless half.
 *
 * On the honesty of the stack
 * ---------------------------
 * A five-layer motivation model is a strong claim to make about a stranger from
 * one sentence. What is actually happening is a lookup: a behaviour is matched to
 * a family, and the family carries five authored lines. `depth_score` reports how
 * many of those five were established from the brief rather than inherited from
 * the family, so a stack that is mostly inherited says so. It is a richer
 * vocabulary for describing a motive, not evidence about one.
 */

/** The five layers, from what the person is trying to do to what it costs them. */
export interface HumanMotivationStack {
  /** The job. What they are trying to get done. */
  functional_need: string;
  /** What the doing of it feels like when it goes wrong. */
  emotional_need: string;
  /** What it would say about them. */
  identity_need: string;
  /** What other people would conclude. */
  social_consequence: string;
  /** The larger thing the small thing is a case of. */
  existential_tension: string;
  /** 0-1. How much of the stack came from the brief rather than the family. */
  depth_score: number;
  /** Which family supplied it. */
  family: string;
}

export interface MotivationFamily {
  id: string;
  /** Behaviour or condition that signals this family. */
  match: RegExp;
  functional_need: string;
  emotional_need: string;
  identity_need: string;
  social_consequence: string;
  existential_tension: string;
  /** What is lost if the need goes unmet. Used to compose a truth. */
  stake: string;
  /**
   * Short noun-phrase forms, for splicing into a sentence.
   *
   * The five layers above are written as infinitive descriptions because that is
   * how a motivation reads when you state it — "to remain someone who has this
   * handled". Dropped into a frame they produce "made get the thing without the
   * getting of it being observed cost them remain someone who has this handled".
   * These two are the same content in a form a sentence can carry.
   */
  short_want: string;
  short_identity: string;
}

/**
 * Ten families, each a different answer to "what is this person protecting".
 *
 * Ten rather than six because the six were too coarse to match half the corpus,
 * and ten rather than thirty because a taxonomy fine enough to be precise about a
 * stranger is fine enough to be arbitrary about one.
 */
export const MOTIVATION_FAMILIES: MotivationFamily[] = [
  {
    id: "EXPOSURE",
    match: /\b(?:seen|watch\w*|in front of|publicly|in public|aisle|shelf|counter|embarrass\w*|apologi[sz]\w*|admit\w*|announce|announcing|stigma|ashamed|intimidat\w*|stranger into|letting a stranger|first time|walking in|face|asking feels like|wasting the \w+'?s? time|read as a comment|logos)\b/i,
    functional_need: "to get the thing without the getting of it being observed",
    emotional_need: "to not feel exposed at the moment of choosing",
    identity_need: "to remain someone who has this handled",
    social_consequence: "being read as a person who needs help with this",
    existential_tension: "every private need becomes public at the point of purchase",
    stake: "being seen as the kind of person who needs this",
    short_want: "privacy at the moment of buying",
    short_identity: "someone who has this handled",
  },
  {
    id: "COMPETENCE",
    match: /\b(?:explain\w* to|basics|patronis\w*|already knows?|done the reading|expert|talked down|beginner|not confident|correctly|dumbed|written for engineers|syllabus|able to do afterwards|what (?:she|he|they) will actually be able|taste wrong|size or the taste|wear it correctly|spreadsheet doing this badly|doing this badly)\b/i,
    functional_need: "to be given information at the level they actually operate at",
    emotional_need: "to not be quietly insulted by the help on offer",
    identity_need: "to be the person who knows their own field",
    social_consequence: "having to assert expertise, which looks like vanity",
    existential_tension: "the effort of becoming good at something is invisible to everyone who did not do it",
    stake: "having your own judgement counted",
    short_want: "to be spoken to as an equal",
    short_identity: "the person who knows their own field",
  },
  {
    id: "VERIFICATION",
    match: /\b(?:verif\w*|check\w*|prove|proof|no way to (?:tell|know)|claims?|promise|distrust\w*|stopped believing|does not believe|do not believe|identical|same (?:words|capability|price)|indistinguishable|every (?:competitor|brand|product|tutor|barber)|advertis\w*|guarantee|farm story|photograph enough times|marketing language|marketing asset|nobody will (?:talk|tell)|will not tell|seen what the last|watched previous|deteriorate|quietly concedes)\b/i,
    functional_need: "to tell a true claim from a practised one",
    emotional_need: "to stop feeling like every choice here is a guess",
    identity_need: "to be someone who is not taken in",
    social_consequence: "being seen to have believed something obvious",
    existential_tension: "a market where everyone says the same thing has taken away the ability to choose well",
    stake: "being able to justify the decision later",
    short_want: "a way to check",
    short_identity: "someone who is not taken in",
  },
  {
    id: "PRICE_EXPOSURE",
    match: /\b(?:overcharg\w*|quoted one price|charged another|hidden (?:fee|cost)|the bill|paid only if|commission|wasting money|resale value|price against|compete on price|concedes that|worth it|discount|lesser version|indulg\w*|justify|justifi\w*|guilt\w*|afford|deserve|fee is certain|benefit is uncertain|years away|without announcing what)\b/i,
    functional_need: "to know what this costs before committing to it",
    emotional_need: "to not carry a suspicion of having been taken",
    identity_need: "to be competent with money rather than casual about it",
    social_consequence: "having to account for the spend to whoever it was spent instead of",
    existential_tension: "value is decided after the fact by people with no reason to be fair about it",
    stake: "spending that does not have to be defended",
    short_want: "a price they can predict",
    short_identity: "someone careful with money",
  },
  {
    id: "COHERENCE",
    match: /\b(?:version of (?:herself|himself|themselves)|no longer|used to|outgrown|identity|belong\w*|not for (?:me|them)|feels? like it is for|defect|correction|dated|life stage|feels like hers|feel like everyone's|temporary condition|unrepresented|afterthought|designed as though|written for neither|somewhere new|has not been for|sold newness|call this piece dated|not on a trip|between meetings|keeps offering)\b/i,
    functional_need: "to find the version of this that was built for them",
    emotional_need: "to not be reminded that they are the exception",
    identity_need: "to recognise themselves in what they are offered",
    social_consequence: "being visibly the accommodated case rather than the expected one",
    existential_tension: "every default is a statement about who counts as ordinary",
    stake: "recognising yourself in what you are offered",
    short_want: "a version built for them",
    short_identity: "who they have become",
  },
  {
    id: "LOAD",
    match: /\b(?:effort|hassle|time pressure|deadline|by \w+day|eleven days|already (?:has|have)|switch\w*|migrat\w*|nine tools|attention|remembers? none|forty|exhaust\w*|more effort than|competes with|spreadsheet|workflow|least conscious time|will not study|dim room|first minute|thumbnail|grid of forty|washing machine already|opened it once|never went back)\b/i,
    functional_need: "to have the load taken off without a new one arriving with it",
    emotional_need: "to stop paying attention to something that should not need it",
    identity_need: "to be someone who has their day under control",
    social_consequence: "being the person who made everyone learn a new system",
    existential_tension: "the better option is usually the one that asks more, so the day is run on worse ones",
    stake: "the day being easier rather than more optimal",
    short_want: "a lighter day",
    short_identity: "someone with it under control",
  },
  {
    id: "HARM_MEMORY",
    match: /\b(?:reacted|reaction|went wrong|bad experience|memory of|irritat\w*|stopped early|stopped taking|gave up|damage|institutions have been wrong|will not mention|fault will feel like|not the product's fault|afraid of the procedure|afraid of both)\b/i,
    functional_need: "to try again without staking a repeat of the harm",
    emotional_need: "to not be asked to be brave about something that already hurt",
    identity_need: "to be someone who learns rather than someone who repeats",
    social_consequence: "being harmed twice by the same thing looks like carelessness",
    existential_tension: "one thing that happened outweighs any number of things that were promised",
    stake: "not repeating a harm you have already had",
    short_want: "a way to try that costs nothing",
    short_identity: "someone who learns rather than repeats",
  },
  {
    id: "RESPONSIBILITY",
    match: /\b(?:name on it|blamed|held responsible|on behalf|for (?:her|his|their) (?:mother|parent|child|family)|choosing (?:care|an institution|for)|carry the decision|proxy|elder|four specific teachers|strongest objection|group booking|will carry|living with the people|because a friend|warrants a doctor|no room to ask|unasked questions)\b/i,
    functional_need: "to make a choice they can defend afterwards",
    emotional_need: "to not spend the interval waiting to find out if they were wrong",
    identity_need: "to be someone whose judgement can be trusted with this",
    social_consequence: "being the one who chose, when it is discussed later",
    existential_tension: "a decision made for someone else is judged by its outcome, not by its reasons",
    stake: "a decision that can be defended even if it turns out badly",
    short_want: "a choice they can defend",
    short_identity: "someone whose judgement is trusted",
  },
  {
    id: "INVISIBLE_WORK",
    match: /\b(?:prevention|no evidence|notice(?:d|able)? working|nothing happen\w*|unnoticed|invisible|least able to notice|maintenance|actually keeps people coming|designs last|nutrition panel|no listing mentions)\b/i,
    functional_need: "to know the thing they are doing is working",
    emotional_need: "to get some confirmation for effort that returns none",
    identity_need: "to be someone who keeps going without being told to",
    social_consequence: "effort nobody can see earns no credit from anybody",
    existential_tension: "what protects people is exactly what gives them no evidence of protecting them",
    stake: "seeing the thing that did not happen",
    short_want: "some sign it is working",
    short_identity: "someone who keeps going unprompted",
  },
  {
    id: "MISMATCH",
    match: /\b(?:described in|experienced (?:as|in)|clinical measures|kilometres|kilometers|minutes at rush hour|formulated for|temperate|climate|not working here|imported|solve only one|really choosing|is never going to tell|taken from a corner|not driven by|wants food that exists|does not want the best|fits differently|pressure to enjoy|waited a year|size of the change)\b/i,
    functional_need: "to get an answer in the terms the question was asked in",
    emotional_need: "to stop having to translate everything themselves",
    identity_need: "to be treated as someone whose actual situation matters",
    social_consequence: "the translation is done privately, so nobody knows it was needed",
    existential_tension: "what gets measured is what is countable, and what is lived is neither",
    stake: "being answered in the unit the question was asked in",
    short_want: "an answer in their own terms",
    short_identity: "someone whose situation counts",
  },
];

// ── Latent situations ─────────────────────────────────────────────────────

/**
 * What a brief implies someone is doing when it only says what is true.
 *
 * "Every competitor uses steam, pour and bean close-ups, so the whole category
 * looks like one brand" states a fact about a market. Somebody is nonetheless in
 * front of that market doing something, and what they are doing is the missing
 * half of the brief. Reconstructing it is a real inference and a fallible one, so
 * `confidence` on the result is capped below what explicit extraction earns.
 *
 * The reconstruction is never presented as something the brief said.
 */
export interface LatentHumanSituation {
  /** The brief's sentence, unchanged. */
  surface_statement: string;
  /** The act the condition implies and the brief does not state. */
  missing_behavior: string;
  /** Where and when this happens in an ordinary day. */
  daily_context: string;
  /** The specific moment the difficulty is felt. */
  moment_of_tension: string;
  /** What sets it off. */
  trigger_event: string;
  /** What they do instead of dealing with it. */
  avoidance_behavior: string;
  /** What they would want if asked. */
  desired_state: string;
  /** 0-1. Capped below explicit extraction: this is inferred, not read. */
  confidence: number;
}

export interface LatentPattern {
  id: string;
  match: RegExp;
  missing_behavior: string;
  daily_context: string;
  moment_of_tension: string;
  trigger_event: string;
  avoidance_behavior: string;
  desired_state: string;
}

/**
 * Condition shapes, and the situation each implies.
 *
 * Written from the 55 briefs that produced no discovery in the 4.0.3.5 run, so
 * every entry answers a sentence that actually appeared rather than one imagined
 * for the table.
 */
export const LATENT_PATTERNS: LatentPattern[] = [
  {
    id: "CATEGORY_CONVERGED",
    match: /\b(?:every|all|each) (?:competitor|brand|product|listing|tutor|barber|boutique hotel|party)\b|\bidentical|indistinguishable|same (?:words|capability|red and gold)|looks like one brand|so completely that\b/i,
    missing_behavior: "stop comparing after the third option and decide on price or on habit",
    daily_context: "a few minutes on a phone, between other things, with too many tabs open",
    moment_of_tension: "the moment the options stop being distinguishable and the choosing turns into elimination",
    trigger_event: "a need that has become urgent enough to act on",
    avoidance_behavior: "defer to whatever is cheapest or most familiar and call it a decision",
    desired_state: "one reason to prefer one of them that survives being repeated to someone else",
  },
  {
    id: "BELIEF_COLLAPSED",
    match: /\bstopped believing|does not believe|do not believe|no longer believe|promised .* for a decade|enough times to have stopped|does not believe a word|been wrong about\b/i,
    missing_behavior: "read the claim, discount it before finishing it, and look for something else to go on",
    daily_context: "in front of packaging or a listing, alone, with no one to check it against",
    moment_of_tension: "the second the claim is recognised as the same claim as last time",
    trigger_event: "a claim in the form they have learned means nothing",
    avoidance_behavior: "buy on price or on someone else's recommendation instead of on what is said",
    desired_state: "something checkable rather than something asserted",
  },
  {
    id: "UNIT_MISMATCH",
    match: /\bdescribed in .* (?:and|but) experienced|clinical measures|kilometres|kilometers|minutes at rush hour|experienced as|really choosing|is never going to tell|solve only one\b/i,
    missing_behavior: "translate the stated measure into the lived one privately, every time",
    daily_context: "the ordinary run of a week, where the translation is done repeatedly and never mentioned",
    moment_of_tension: "the gap between what was promised in one unit and what arrives in another",
    trigger_event: "a specification presented as though it answered the question",
    avoidance_behavior: "stop asking and assume the difference is theirs to absorb",
    desired_state: "the answer given in the unit the question was asked in",
  },
  {
    id: "ADDRESSED_TO_SOMEONE_ELSE",
    match: /\bdesigned as though|temporary condition|written for (?:neither|engineers)|unrepresented|afterthought|feel like everyone's|taken from a corner|for a different|both notice|keeps offering him\b/i,
    missing_behavior: "adjust silently around a default that was not built for them",
    daily_context: "the same adjustment made so often that it has stopped registering as one",
    moment_of_tension: "seeing the version of themselves the category thinks it is talking to",
    trigger_event: "any piece of communication that assumes a different customer",
    avoidance_behavior: "accommodate it without mentioning it, and buy anyway or quietly stop",
    desired_state: "being the person the thing was designed for, once",
  },
  {
    id: "MISSING_FEATURE",
    match: /\bdoes not have one|without (?:an?|the)|no \w+ at all|is not on a trip|small size is treated|treated as a weakness\b/i,
    missing_behavior: "screen on the feature everyone advertises and never reach what is actually on offer",
    daily_context: "a shortlist built from whatever filters the category made available",
    moment_of_tension: "elimination on a criterion that was never the point",
    trigger_event: "a comparison built around the category's own conventions",
    avoidance_behavior: "take the option that ticks the familiar box and hope it is fine",
    desired_state: "a reason to choose that is not the same reason everyone else is offering",
  },
  {
    id: "DEADLINE",
    match: /\b(?:there are )?\w+ days?\b|school term starting|by \w+day|the invitation arrived|time pressure|at two in the morning|waited a year\b/i,
    missing_behavior: "choose from whatever is reachable in the time left rather than from what is best",
    daily_context: "a window that is closing, with the decision competing against everything else in it",
    moment_of_tension: "the point where sufficient replaces good as the standard",
    trigger_event: "a date that was set by somebody else",
    avoidance_behavior: "take the safe option and privately register it as a compromise",
    desired_state: "the right answer quickly, rather than every answer slowly",
  },
  {
    id: "ACCOUNTABLE",
    match: /\bname on it|will carry the decision|held responsible|strongest objection|advising her|paid only if\b/i,
    missing_behavior: "check the output by hand, which removes most of what was being saved",
    daily_context: "work that was meant to be delegated and is being supervised instead",
    moment_of_tension: "the moment of signing off on something they did not produce",
    trigger_event: "a decision that will be attributed to them afterwards",
    avoidance_behavior: "keep the old method running alongside, and never fully switch",
    desired_state: "something whose working can be inspected, so the responsibility is bearable",
  },
  {
    id: "UNSPOKEN_QUESTION",
    match: /\bunasked questions|no room to ask|will not mention|nobody will (?:say|tell)|none of them will say|no brand will acknowledge|what is realistic\b/i,
    missing_behavior: "leave without asking, and carry the question afterwards",
    daily_context: "a short appointment or transaction with an expert whose time feels scarce",
    moment_of_tension: "the moment the opportunity to ask closes",
    trigger_event: "an encounter that is shorter than the uncertainty it was meant to resolve",
    avoidance_behavior: "look it up afterwards and trust the answer less",
    desired_state: "being told the thing without having had to ask for it",
  },
  {
    id: "SCALE_OF_CHANGE",
    match: /\bsize of the change|has not started|knows what (?:she|he|they) should|should already know|the whole thing at once\b/i,
    missing_behavior: "postpone in units small enough that no single postponement is a decision",
    daily_context: "an intention carried for months alongside everything else that is carried",
    moment_of_tension: "each moment of not starting, which is individually forgivable",
    trigger_event: "a reminder that the change is still outstanding",
    avoidance_behavior: "research it further instead of beginning it",
    desired_state: "a first step small enough that failing at it would not mean anything",
  },
  {
    id: "PRODUCTION_CONSTRAINT",
    match: /\bsame small panel|type system|without breaking|character (?:count|limit)|required warning|ingredient list|aspect ratio\b/i,
    missing_behavior: "",
    daily_context: "",
    moment_of_tension: "",
    trigger_event: "",
    avoidance_behavior: "",
    desired_state: "",
  },
];
