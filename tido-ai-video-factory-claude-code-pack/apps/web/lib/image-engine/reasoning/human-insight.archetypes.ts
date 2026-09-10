import { InsightLadderStep } from "./human-insight.types";

/**
 * The problem archetypes the ladder transforms through.
 *
 * This is authored knowledge sitting in code, and it should be read as such. Each
 * entry says: when a brief's stated difficulty has *this* shape, here is the
 * functional impediment underneath it, here is what meeting that impediment feels
 * like, here is what the person does not say, who they think is watching, the two
 * things they want that cannot both be had, what they actually want, and the
 * statement about people that all of it is a case of.
 *
 * Why a taxonomy rather than retrieval
 * ------------------------------------
 * Phase 4.0.2 retrieved a tension by scoring stored tensions against the brief.
 * That returns something for every brief, including the briefs it has nothing for
 * — 23 tensions served 100 briefs, one of them leading four unrelated campaigns.
 * A classifier can decline. Where nothing here matches, `NO_ARCHETYPE` is
 * reported and the ladder derives structurally from the sentence instead, at a
 * confidence that says so.
 *
 * Where this belongs eventually
 * -----------------------------
 * In the corpus, as `human_tension` objects with an archetype field, so the
 * library is editable without a deploy. It is here now because Phase 4.0.2 closed
 * with an instruction not to add knowledge, and because a table this small is
 * easier to review in one screen than as twenty YAML files. Migration is a
 * mechanical change: the shape below is already object-per-archetype.
 *
 * Each template receives the brief's own concrete terms. A rung that uses them
 * scores higher on `specificity` than one that returns the template unchanged,
 * which is what stops the library from flattening every brief onto its archetype.
 */

export interface InsightTerms {
  /** Short plural noun phrase for the audience: "mature buyers". */
  who: string;
  /** Singular form where a sentence needs one: "a mature buyer". */
  whoSingular: string;
  /** Whether `who` takes a plural verb. The conflict poles are written singular. */
  whoIsPlural: boolean;
  /** The product, as a noun phrase: "a retinol serum". */
  thing: string;
  /** The category, for statements about the market: "skincare". */
  category: string;
  /** The most distinctive phrase in the stated challenge. */
  key: string;
  /** The stated challenge, trimmed. */
  challenge: string;
  /** The brief's objective, for the strategic reason. Never enters the idea. */
  objective?: string;
}

export interface Archetype {
  id: string;
  /** Matched against the stated challenge. */
  match: RegExp;
  /** A short human name for reports. */
  label: string;
  functional: (t: InsightTerms) => string;
  emotional: (t: InsightTerms) => string;
  hidden: (t: InsightTerms) => string;
  social: (t: InsightTerms) => string;
  /** The two poles. Rendered as "wants X, and Y". */
  conflict: (t: InsightTerms) => { wants: string; but: string };
  desire: (t: InsightTerms) => string;
  /** Rung eight. The statement about people. */
  truth: (t: InsightTerms) => string;
  /** The mechanism, not the restatement. */
  mechanism: (t: InsightTerms) => string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "JUDGED_AS_DEFECTIVE",
    label: "the category treats what she has as a fault",
    match: /\b(?:correct(?:ion|ive)?|fix|flaw|defect|anti[- ]?ag\w*|repair|problem area|imperfection|blemish|undo|as a defect|needs? (?:fixing|correcting))\b/i,
    functional: (t) => `The language ${t.category} uses to describe ${t.thing} names ${t.who} as the thing that needs correcting.`,
    emotional: (t) => `Being sold to feels like being assessed, and the assessment has already gone against her.`,
    hidden: (t) => `She would like the result. She will not agree that she is a defect in order to be offered it.`,
    social: (t) => `Buying it is a public concession that other people were right about how she looks.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} actually does`,
      but: `will not accept the verdict she has to sign to get it`,
    }),
    desire: () => `To be offered an improvement without being told she was a problem.`,
    truth: (t) => `${cap(t.who)} will refuse a benefit that arrives as a verdict.`,
    mechanism: () => `Correction language sets the terms before the offer arrives: to accept the product is to accept the diagnosis. The refusal is not of the product, it is of the diagnosis.`,
  },
  {
    id: "CANNOT_VERIFY",
    label: "every claim sounds the same and none can be checked",
    match: /\b(?:claim|promise|prove|proof|verif\w*|evidence|sceptic\w*|skeptic\w*|believ\w*|distrusts?|trust\w*|indistinguishable|interchangeable|same result|no way to (?:tell|know))\b/i,
    functional: (t) => `Every brand in ${t.category} makes the same promise about ${t.thing}, and nothing available to ${t.who} separates them.`,
    emotional: () => `Choosing feels like guessing, and guessing about something that matters feels like carelessness.`,
    hidden: () => `She does not believe she is a good judge of this any more, and would rather not say so.`,
    social: () => `Getting it wrong in public reads as being taken in, which is worse than the wasted money.`,
    conflict: (t) => ({
      wants: `wants to choose well in ${t.category}`,
      but: `has no instrument for telling a true claim from a practised one`,
    }),
    desire: () => `To be handed the means of checking rather than another reason to believe.`,
    truth: () => `People stop believing claims long before they stop wanting the thing claimed.`,
    mechanism: (t) => `When every competitor converges on the same promise, the promise stops carrying information and starts carrying only cost. ${cap(t.who)} discount all of it equally, including the true ones.`,
  },
  {
    id: "SEEN_CHOOSING",
    label: "the act of buying is visible and means something",
    match: /\b(?:seen|aisle|shelf|counter|in front of|publicly|in public|be seen|embarrass\w*|awkward|discreet)\b/i,
    functional: (t) => `The barrier is not using ${t.thing}, it is being observed selecting it.`,
    emotional: () => `The moment of choosing is exposure — a private need becoming a visible one.`,
    hidden: () => `He already wants it. Admitting that in front of people is the part he will not do.`,
    social: (t) => `In ${t.category}, being seen to need the thing is read as a statement about the person needing it.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} does`,
      but: `will not perform the need in front of an audience to get it`,
    }),
    desire: () => `To arrive at it without the arrival being witnessed.`,
    truth: () => `People will forgo something they want rather than be seen wanting it.`,
    mechanism: () => `Purchase is a public act in a category whose need is private. The cost is not the price, it is the disclosure the price is paid in front of.`,
  },
  {
    id: "SPENDING_ON_SELF",
    label: "can afford it and still cannot justify it",
    match: /\b(?:indulg\w*|justify|justifi\w*|guilt\w*|deserve|afford|extravagan\w*|selfish|treat herself|treat himself|spend(?:ing)? on)\b/i,
    functional: (t) => `The money is available. What is missing is a reason for ${t.thing} that survives being said out loud.`,
    emotional: () => `Wanting it feels like a small failure of proportion, and the feeling arrives before the purchase does.`,
    hidden: () => `She spends more than this on other people without a second thought, and knows it.`,
    social: (t) => `Household spending is accounted for to someone, and ${t.category} is the line that gets questioned.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} on its own terms`,
      but: `cannot make the case for it in the terms the household uses`,
    }),
    desire: () => `Permission that does not have to be argued for.`,
    truth: () => `People do not need to afford a thing to buy it; they need to be allowed to want it.`,
    mechanism: (t) => `Spending on oneself is the only category of spending that has to be defended to oneself. ${cap(t.category)} is where the defence usually fails, because the benefit is real and hard to itemise.`,
  },
  {
    id: "INVISIBLE_BENEFIT",
    label: "the thing that works best leaves no evidence",
    match: /\b(?:prevent\w*|no evidence|notice(?:d|able)? working|maintenance|invisible|nothing happen\w*|absence of|does not show|unnoticed)\b/i,
    functional: (t) => `${cap(t.thing)} succeeds by producing nothing observable, so its working and its failing look identical.`,
    emotional: () => `Doing the right thing for years without a single confirmation feels like faith, and faith gets tiring.`,
    hidden: () => `She is not sure it is doing anything, and stopping would tell her nothing either.`,
    social: () => `There is nothing to show anyone, so the effort earns no credit from anybody.`,
    conflict: (t) => ({
      wants: `wants proof that ${t.thing} is working`,
      but: `the proof of it working is that nothing happens`,
    }),
    desire: () => `To see the thing that did not happen.`,
    truth: () => `People abandon what protects them because protection has no evidence to offer.`,
    mechanism: () => `Reward learning needs a signal. Prevention withholds the signal by design, so persistence has to come from belief rather than from feedback — and belief decays on a schedule of its own.`,
  },
  {
    id: "MEMORY_OF_HARM",
    label: "it went wrong once and that outweighs any promise",
    match: /\b(?:reacted|reaction|went wrong|bad experience|burn\w*|hurt|damage[sd]?|irritat\w*|last time|before,? and|previously)\b/i,
    functional: (t) => `A previous attempt in ${t.category} did harm, and no claim about ${t.thing} is weighed on the same scale as that memory.`,
    emotional: () => `Trying again is not optimism, it is exposure to a thing that has already happened once.`,
    hidden: () => `She blames herself a little for the first time, which is why the second time frightens her more.`,
    social: () => `Being harmed twice by the same category would be carelessness rather than bad luck.`,
    conflict: (t) => ({
      wants: `wants the improvement ${t.thing} offers`,
      but: `will not stake a repeat of the harm on it`,
    }),
    desire: () => `A way to try that costs nothing if it goes wrong again.`,
    truth: () => `One bad experience outweighs any number of good promises, because only one of them has actually happened.`,
    mechanism: () => `A harm is evidence and a claim is not. No volume of claims reaches the weight of a single thing that occurred, so the category argues on a scale the memory is not even on.`,
  },
  {
    id: "NOT_FOR_ME",
    label: "the category signals it is for other people",
    match: /\b(?:not for (?:me|them|people like)|belong\w*|intimidat\w*|exclud\w*|unwelcom\w*|people like (?:me|her|him)|for a different|feels? like hers|feel like everyone's|somewhere new)\b/i,
    functional: (t) => `Everything ${t.category} shows about ${t.thing} depicts someone ${t.who} do not recognise as themselves.`,
    emotional: () => `The category is not hostile, it is simply addressed to somebody else, and that is its own kind of exclusion.`,
    hidden: () => `She suspects she would be welcome. She is not willing to test it in person to find out.`,
    social: () => `Turning up somewhere you are not the expected customer is a risk taken in front of the expected customers.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} offers`,
      but: `has never been shown a version of it addressed to her`,
    }),
    desire: () => `To see it offered to someone like her before having to ask for it.`,
    truth: () => `People do not need to be excluded to feel excluded; being consistently addressed as someone else is enough.`,
    mechanism: () => `Category imagery is read as a description of the customer, not the product. Every depiction that is not you is a small piece of evidence that this was not built with you in mind.`,
  },
  {
    id: "DECIDING_FOR_ANOTHER",
    label: "choosing on someone else's behalf",
    match: /\b(?:for (?:a|her|his|their) (?:parent|child|mother|father|son|daughter|family)|on behalf|proxy|choosing for|elder|guardian|carer|caregiver)\b/i,
    functional: (t) => `${cap(t.whoSingular)} must choose ${t.thing} for someone whose experience of the choice they cannot access.`,
    emotional: () => `Every option is a wager placed with someone else's wellbeing as the stake.`,
    hidden: () => `They are afraid of being blamed later, including by themselves, and cannot say that to anyone.`,
    social: () => `The rest of the family will have an opinion about the decision without having had to make it.`,
    conflict: (t) => ({
      wants: `wants to choose the right ${t.thing}`,
      but: `will never receive the information that would make it the right choice`,
    }),
    desire: () => `To be able to show their working, so the decision can be defended even if it turns out badly.`,
    truth: () => `A decision made for someone else is judged by its outcome; a decision made for yourself is judged by your reasons.`,
    mechanism: () => `Responsibility without experience removes the normal basis for confidence. What is wanted is not certainty about the outcome, which is unavailable, but a defensible account of how the choice was made.`,
  },
  {
    id: "FIRST_TIME_EXPOSURE",
    label: "the barrier is the first time, in front of everyone",
    match: /\b(?:first time|walking in|never (?:joined|been|tried|done)|beginner|new to|starting out|step (?:inside|through)|should already know|admitting that (?:she|he|they) do)\b/i,
    functional: (t) => `Nothing about ${t.thing} is difficult except the first occasion, which happens in front of people who are already competent at it.`,
    emotional: () => `Incompetence is bearable in private. The barrier is being visibly new.`,
    hidden: () => `They believe everyone there is watching, and know that is probably not true, and it does not help.`,
    social: (t) => `Everyone else in the room appears to have always known how to do this, so being new looks like being late.`,
    conflict: (t) => ({
      wants: `wants to start with ${t.thing}`,
      but: `would have to be publicly a beginner to do it`,
    }),
    desire: () => `A first time that nobody sees.`,
    truth: () => `The hardest part of starting is doing it where people can see you have not started before.`,
    mechanism: () => `Competence is assumed to be visible, so its absence is assumed to be visible too. The imagined audience is far more attentive than the real one, and the imagined one is the one that decides.`,
  },
  {
    id: "KNOWN_AND_NOT_STARTED",
    label: "they know, and still have not begun",
    match: /\b(?:know\w* (?:and|but) (?:have not|haven't|still)|intend\w*|keep meaning|put(?:ting)? off|procrastinat\w*|not started|one day|eventually|delay\w*)\b/i,
    functional: (t) => `${cap(t.who)} already accept the case for ${t.thing}. Information is not the missing input.`,
    emotional: () => `Each postponement is small and forgivable, and the accumulation of them is neither.`,
    hidden: () => `Not starting has become part of how they think of themselves, and starting would contradict it.`,
    social: () => `Announcing an intention and not acting on it is worse than never having announced it.`,
    conflict: (t) => ({
      wants: `wants to have begun with ${t.thing}`,
      but: `beginning requires being the kind of person who begins`,
    }),
    desire: () => `A first step small enough that failing at it would not mean anything.`,
    truth: () => `People do not fail to act because they are unconvinced; they fail because acting means becoming someone slightly different.`,
    mechanism: () => `Persuasion targets the decision, but the obstacle is identity. More reasons raise the cost of continuing not to act, which makes the not-acting more uncomfortable and no more likely to end.`,
  },
  {
    id: "OUTGROWN_IDENTITY",
    label: "the person changed and the category did not follow",
    match: /\b(?:size has changed|no longer|outgrown|life stage|a version of (?:herself|himself|themselves)|has not been for|used to be|different (?:body|life|circumstance)|call this piece dated|sold newness)\b/i,
    functional: (t) => `${cap(t.who)} have changed in a way ${t.category} has not registered, so ${t.thing} is offered as if to a previous version of them.`,
    emotional: () => `Being addressed as who you were is a reminder of the distance, delivered by a stranger.`,
    hidden: () => `They have not entirely accepted the change themselves, which is why hearing it from a brand lands hard.`,
    social: () => `The brands you buy are read as a statement about which version of you is current.`,
    conflict: (t) => ({
      wants: `wants ${t.category} to work for who they are now`,
      but: `everything on offer is addressed to who they were`,
    }),
    desire: () => `To be met where they actually are, without the change being the subject.`,
    truth: () => `People change faster than the categories that serve them, and feel the gap as a judgement.`,
    mechanism: () => `Segmentation is built from historical behaviour, so it always describes a past self. The lag is structural, and it is experienced personally.`,
  },
  {
    id: "UNCERTAIN_RETURN",
    label: "cost now, benefit later and unprovable",
    match: /\b(?:fee|cost|price|pay\w*|invest\w*)\b.{0,60}\b(?:uncertain|years away|later|future|cannot see|unproven|no guarantee)\b|\b(?:certain and immediate|immediate and)\b/i,
    functional: (t) => `The cost of ${t.thing} is exact and arrives now; the benefit is approximate and arrives later, if it arrives.`,
    emotional: () => `The decision is made in a currency they can count against a return they can only hope for.`,
    hidden: () => `They suspect the outcome depends mostly on factors the provider does not control.`,
    social: () => `A large sum spent on an unprovable return has to be explained to whoever else it was spent instead of.`,
    conflict: (t) => ({
      wants: `wants the outcome ${t.thing} is meant to produce`,
      but: `is asked to pay for it in full before any of it is visible`,
    }),
    desire: () => `Something to hold onto in the interval between paying and knowing.`,
    truth: () => `People are not unwilling to pay for the future; they are unwilling to spend the interval with nothing to show for it.`,
    mechanism: () => `Cost and benefit are separated in time, so the two are never weighed against each other in the same moment. What fills the gap is not evidence, because there is none yet — it is whether the interval was made bearable.`,
  },
  {
    id: "COMPETENCE_DOUBTED",
    label: "being explained to as though they knew nothing",
    match: /\b(?:talked down|patronis\w*|patroniz\w*|explains? the basics|as (?:if|though) (?:she|he|they) (?:had|did) not|condescend\w*|dumbed down|done the reading|already knows?)\b/i,
    functional: (t) => `${cap(t.who)} know this category well, and ${t.thing} is presented at a level pitched below them.`,
    emotional: () => `Being over-explained to is a small insult delivered helpfully, which makes it harder to object to.`,
    hidden: () => `They would like to be asked what they already know, and nobody ever asks.`,
    social: () => `Expertise unrecognised in public is expertise you have to assert, and asserting it looks like vanity.`,
    conflict: (t) => ({
      wants: `wants to be sold ${t.thing} properly`,
      but: `is addressed as a person who has never encountered ${t.category} before`,
    }),
    desire: () => `To be spoken to as the expert they became on their own.`,
    truth: () => `People forgive being sold to; they do not forgive being underestimated while it happens.`,
    mechanism: () => `Communication is written for the least informed plausible buyer, because that failure is visible and the other one is not. The informed buyer's exit is silent, so it never corrects the writing.`,
  },
  {
    id: "TIME_TAKEN",
    label: "the thing consumes days that are not returned",
    match: /\b(?:lost days|days? (?:lost|taken|back|returned)|time (?:lost|taken|back)|hours (?:lost|back)|counting (?:lost|the)|takes up|eats into)\b/i,
    functional: (t) => `${cap(t.thing)} is measured in outcomes, but what ${t.who} actually spend on it is time that does not come back.`,
    emotional: () => `The loss is not dramatic, it is cumulative, and cumulative losses are the hardest to get angry about.`,
    hidden: () => `They have stopped counting, because counting made it worse and changed nothing.`,
    social: () => `The days are absorbed quietly, so nobody else registers them as a cost at all.`,
    conflict: (t) => ({
      wants: `wants the days back more than the outcome ${t.category} advertises`,
      but: `is only ever offered the outcome`,
    }),
    desire: () => `For someone to count the time as though it were a real cost.`,
    truth: () => `People measure a burden in the ordinary days it takes, not in the outcome it is described by.`,
    mechanism: () => `Providers measure what they control, which is the outcome. The person measures what they spend, which is time. The two accounts never meet, so the cost that is actually felt is never the cost that is addressed.`,
  },
  {
    id: "ASKING_IS_COSTLY",
    label: "the question that does not get asked",
    match: /\b(?:unasked|did not ask|didn't ask|afraid to ask|asking feels like|too embarrassed|hesitat\w*|wouldn't ask|reluctant to ask|wasting the|not confident (?:she|he|they) would|unsure what is appropriate)\b/i,
    functional: (t) => `The information ${t.who} need is available on request, and the request is the part that does not happen.`,
    emotional: () => `Asking would reveal not knowing, and not knowing feels like it should have been avoided.`,
    hidden: () => `They left with the question unasked and have been carrying it since.`,
    social: () => `Asking takes up an expert's time, and taking up an expert's time has to be earned.`,
    conflict: (t) => ({
      wants: `wants to understand ${t.thing} properly`,
      but: `would have to display the not-understanding in order to end it`,
    }),
    desire: () => `To be told the thing without having had to ask for it.`,
    truth: () => `The most important question is the one that would cost something to ask.`,
    mechanism: () => `Access is designed around availability, not around the social cost of use. Making something available on request quietly assigns the cost of the request to the person least able to bear it.`,
  },
  {
    id: "STIGMA_OF_COMMONNESS",
    label: "believing you are the unusual case",
    match: /\b(?:think (?:they|she|he) (?:are|is) unusual|only one|alone in|nobody else|stigma|ashamed|shame\w*|hide|hidden condition|common condition)\b/i,
    functional: (t) => `The condition ${t.thing} addresses is ordinary, and everyone who has it believes they are the exception.`,
    emotional: () => `Isolation is doing more damage than the thing they are isolated about.`,
    hidden: () => `They have never heard anyone describe it, so they have no evidence they are not unusual.`,
    social: (t) => `Nobody discusses it, which each person reads as proof that only they have it.`,
    conflict: (t) => ({
      wants: `wants to deal with it`,
      but: `dealing with it means being the first person they know to admit having it`,
    }),
    desire: () => `To find out how ordinary it is without having to be the one who says it first.`,
    truth: () => `Silence about a common thing convinces every single person who has it that they are the exception.`,
    mechanism: () => `Prevalence is invisible when disclosure is costly. Each person's silence becomes evidence for everybody else's conclusion, and the belief sustains itself without anyone holding it deliberately.`,
  },
  {
    id: "STOPPED_EARLY",
    label: "stopped, and now cannot go back",
    match: /\b(?:stopped (?:early|taking|going)|gave up|lapsed|dropped out|quit|abandon\w*|fell off|returning after)\b/i,
    functional: (t) => `${cap(t.who)} began with ${t.thing} and stopped, and returning now requires accounting for the gap.`,
    emotional: () => `Going back means arriving as someone who already failed at this once.`,
    hidden: () => `They stopped for an ordinary reason and have since converted it into a verdict about themselves.`,
    social: () => `Whoever they told about starting would have to be told about the return.`,
    conflict: (t) => ({
      wants: `wants to resume`,
      but: `would have to explain the interruption to resume`,
    }),
    desire: () => `To restart without the restart being an event.`,
    truth: () => `What stops people coming back is not the difficulty of starting again, it is having to account for having stopped.`,
    mechanism: () => `Re-entry is designed as a fresh start, which forces the lapse into the foreground. The cost is not effort, it is narrative — and the narrative cost is paid entirely by the person returning.`,
  },
  {
    id: "NOT_MADE_FOR_HERE",
    label: "built for somewhere else, used here",
    match: /\b(?:climate|humid\w*|temperate|local (?:condition|reality|climate)|formulated for|designed for (?:a|another)|imported|not made for|here)\b/i,
    functional: (t) => `${cap(t.thing)} was specified for conditions that are not the conditions it is used in.`,
    emotional: () => `When it underperforms, the conclusion drawn is about the user rather than about the fit.`,
    hidden: () => `They assume the failure is theirs, because the product is from somewhere that is supposed to know better.`,
    social: (t) => `Imported ${t.category} carries authority, so doubting it feels like provincialism.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} to work where they actually live`,
      but: `what is available was designed for somewhere else and says so nowhere`,
    }),
    desire: () => `Something made with their conditions as the starting assumption rather than an exception.`,
    truth: () => `People blame themselves for a poor fit long before they blame the thing that does not fit.`,
    mechanism: () => `Specification is invisible and outcome is not. When the two disagree, the only variable the user can see is themselves, so that is the variable they revise.`,
  },
  {
    id: "RECOMMENDING_RISK",
    label: "vouching for it puts your own standing at stake",
    match: /\b(?:recommend\w*|refer(?:ral|red|s)?\b|vouch|word of mouth|tell (?:their|her|his) friends|because a friend|introduc\w* (?:a|their) friend)\b/i,
    functional: (t) => `${cap(t.who)} are willing to return to ${t.thing} themselves and hesitant to attach their name to it for someone else.`,
    emotional: () => `A recommendation is a small loan of your own credibility, repayable if it goes badly.`,
    hidden: () => `They would recommend it if they could do so without being the one held responsible.`,
    social: () => `The person they recommend it to will report back, to them and to others.`,
    conflict: (t) => ({
      wants: `wants to pass on something good`,
      but: `would be underwriting an experience they do not control`,
    }),
    desire: () => `A way to pass it on that does not put their judgement on the line.`,
    truth: () => `People withhold recommendations they believe in, because a recommendation is made with their own reputation and spent on someone else's experience.`,
    mechanism: () => `The recommender bears the downside and the recipient takes the upside. Asking for referrals without lowering that asymmetry asks people to underwrite a risk for free.`,
  },
  {
    id: "SYMPTOM_DOUBT",
    label: "not sure it is bad enough to act on",
    match: /\b(?:delay\w* a visit|symptom|not sure (?:if|whether)|bad enough|whether this warrants|afraid of both|might be nothing|probably nothing|overreact\w*)\b/i,
    functional: (t) => `${cap(t.who)} cannot tell whether what they have warrants ${t.thing}, and the only way to find out is to go.`,
    emotional: () => `Both errors are humiliating: going for nothing, or having waited too long.`,
    hidden: () => `They are more afraid of being told it was nothing than of being told it was something.`,
    social: () => `Taking up a professional's time unnecessarily is the specific failure they are trying to avoid.`,
    conflict: (t) => ({
      wants: `wants to know`,
      but: `going in order to find out is itself the thing that might turn out to have been unwarranted`,
    }),
    desire: () => `Permission to check without having to justify the checking.`,
    truth: () => `People do not delay because they are unafraid; they delay because they are afraid of being told they were wrong to come.`,
    mechanism: () => `Access is gated by a self-assessment the person is not equipped to make, and the penalty for over-calling it is social while the penalty for under-calling it is deferred. The deferred cost loses every time.`,
  },
  {
    id: "GIFT_AS_VERDICT",
    label: "the gift will be read as a comment",
    match: /\b(?:gift|present for|buy(?:ing)? (?:her|him|them)|as a comment|read as|imply|hint)\b/i,
    functional: (t) => `${cap(t.thing)} given as a gift carries a statement about the recipient that the giver did not intend to make.`,
    emotional: () => `The wish to give something good is contaminated by the risk of it landing as criticism.`,
    hidden: () => `He does not know her well enough in this category to be sure, and would rather not reveal that.`,
    social: () => `A gift is opened in front of people, and the reading of it happens in front of them too.`,
    conflict: (t) => ({
      wants: `wants to give something she would actually want`,
      but: `anything specific enough to be wanted is specific enough to be a comment`,
    }),
    desire: () => `To give it in a way that says he was paying attention, not that he had notes.`,
    truth: () => `A gift is read as an opinion about the person receiving it.`,
    mechanism: () => `Gifts communicate the giver's model of the recipient. In categories organised around correcting something, that model is unavoidably a diagnosis, however it is wrapped.`,
  },
];

/**
 * The second batch is concatenated rather than inlined so the two remain
 * distinguishable: the first was authored from imagination and classified 31 of
 * 100 briefs, the second was authored from the 69 it declined. Which entries came
 * from evidence is worth being able to see.
 */
import { ARCHETYPES_BATCH_2 } from "./human-insight.archetypes.extra";
ARCHETYPES.push(...ARCHETYPES_BATCH_2);

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Which rung each archetype field supplies, after the 4.0.3.6 restructure.
 *
 * `hidden` no longer has a rung of its own: the identity conflict absorbed it,
 * and the conflict is the better carrier because it states both poles rather
 * than only the unsaid one. The archetype's `hidden` still reaches the output
 * through `HumanInsightGenerator`'s consumer insight.
 */
export const ARCHETYPE_RUNG: Record<
  Exclude<InsightLadderStep, "observed_reality">,
  keyof Omit<Archetype, "id" | "match" | "label">
> = {
  behavior: "functional",
  hidden_emotion: "emotional",
  identity_conflict: "conflict",
  social_fear: "social",
  human_truth: "truth",
  creative_opportunity: "desire",
};
