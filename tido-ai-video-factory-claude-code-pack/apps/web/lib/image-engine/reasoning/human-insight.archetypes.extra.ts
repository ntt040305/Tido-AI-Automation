import { Archetype } from "./human-insight.archetypes";

/**
 * The second batch, written from evidence rather than from imagination.
 *
 * The first twenty-one archetypes were authored before the hundred-brief run and
 * classified 31 of them. The 69 that missed were not vague briefs — they were
 * well-formed problems in shapes the first batch had not anticipated: a category
 * that has converged on one look, a thing measured in the wrong unit, a question
 * nobody in the category will answer, a fault the system creates and the customer
 * absorbs.
 *
 * That is the useful failure mode for a taxonomy: it declined 69 briefs instead of
 * forcing them onto the nearest fit, which made the gap countable and this file
 * writable. A retrieval scorer would have returned its best match for all 69 and
 * the gap would have shown up only as a low score with no indication where.
 *
 * One entry here does something the others do not. `EXECUTIONAL_CONSTRAINT`
 * matches briefs whose stated difficulty is a production problem — a warning
 * panel competing for space, a script that breaks a type system. Those are real
 * problems and they are not human tensions, so it classifies them in order to
 * decline them, rather than manufacturing a feeling about typography.
 */

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const ARCHETYPES_BATCH_2: Archetype[] = [
  {
    id: "CATEGORY_SAMENESS",
    label: "the whole category has converged on one look",
    match: /\b(?:every|all|each) (?:competitor|brand|product|listing|tutor|barber|company|other)\w*\b|\b(?:identical|converged?|the same (?:words|capability|adjectives|thing)|looks like one|so completely that|indistinguishable)\b/i,
    functional: (t) => `Every player in ${t.category} has arrived at the same execution, so ${t.thing} is invisible at the level buyers actually compare on.`,
    emotional: () => `Looking at the options produces no preference, only fatigue, and fatigue gets resolved by price.`,
    hidden: () => `She suspects the differences are real and has no way to see them from outside.`,
    social: () => `Choosing on price is the defensible answer when nothing else distinguishes the options.`,
    conflict: (t) => ({
      wants: `wants a reason to prefer one ${t.category} option over another`,
      but: `is shown the same evidence by all of them`,
    }),
    desire: () => `One thing that is true here and nowhere else, stated plainly enough to remember.`,
    truth: () => `When everyone says the same thing, nobody is heard saying anything.`,
    mechanism: () => `Convergence is rational for each competitor and ruinous for all of them: copying the leader is the safe move, and enough safe moves erase the category's ability to be distinguished at all.`,
  },
  {
    id: "WRONG_UNIT",
    label: "measured in one thing, experienced as another",
    match: /\b(?:described in .+ and experienced|in (?:kilometres|kilometers|minutes|numbers)|does not care about .+ (?:they|she|he) cares?|is really choosing|rather than money|not with another|actually keeps|what (?:she|he|they) will actually be able to)\b/i,
    functional: (t) => `${cap(t.category)} reports ${t.thing} in the unit it can measure, and ${t.who} live it in a different unit entirely.`,
    emotional: () => `The information arrives technically accurate and useless, which feels like being answered by someone who was not listening.`,
    hidden: () => `They have learned to translate it themselves and resent having to.`,
    social: () => `Everyone does this translation privately and assumes they are the only one who finds it hard.`,
    conflict: (t) => ({
      wants: `wants to know what ${t.thing} will actually be like`,
      but: `is only ever given the specification`,
    }),
    desire: () => `To be told the answer in the unit the question was asked in.`,
    truth: () => `People do not experience the thing that was measured; they experience the thing the measurement stood in for.`,
    mechanism: () => `Providers report what is countable because it is defensible. The lived quantity is neither, so it goes unstated — and the gap between the two is where every disappointment is manufactured.`,
  },
  {
    id: "NOBODY_WILL_SAY",
    label: "the question the category will not answer",
    match: /\b(?:nobody will (?:talk|tell|say|acknowledge)|none of them will say|no (?:brand|one) will acknowledge|will not tell (?:her|him|them)|never going to tell|refuses? to say|unanswered)\b/i,
    functional: (t) => `The question ${t.who} most need answered about ${t.thing} is the one nobody in ${t.category} answers.`,
    emotional: () => `The silence is read as an answer, and the answer it is read as is the bad one.`,
    hidden: () => `They have concluded the truth must be unflattering, or somebody would have said it.`,
    social: () => `Asking it directly marks you as the difficult customer, so it goes on not being asked.`,
    conflict: (t) => ({
      wants: `wants the honest answer about ${t.thing}`,
      but: `the only parties who have it are the parties it would cost`,
    }),
    desire: () => `For one of them to say the thing out loud, even if it is not the answer they wanted.`,
    truth: () => `A question everyone avoids answering has already been answered in the mind of everyone asking.`,
    mechanism: () => `Silence is not neutral. Where an obvious question goes unaddressed, people fill the space with the worst plausible answer, and the category's discretion becomes its own accusation.`,
  },
  {
    id: "DEADLINE_DRIVEN",
    label: "the clock made the decision, not the preference",
    match: /\b(?:there are \w+ days?|by (?:thursday|friday|monday|tomorrow|the weekend)|time pressure|under pressure|term starting|deadline|at two in the morning|before the|running out of time|last minute)\b/i,
    functional: (t) => `The decision about ${t.thing} is being made against a clock, so the choice set is whatever is reachable rather than whatever is best.`,
    emotional: () => `Choosing under time pressure feels like settling, and the feeling outlasts the deadline.`,
    hidden: () => `They would have chosen differently with a week more, and will remember that.`,
    social: () => `Arriving with the rushed option is visible to whoever the decision was made for.`,
    conflict: (t) => ({
      wants: `wants to choose ${t.thing} well`,
      but: `has to choose it now`,
    }),
    desire: () => `To be given the right answer quickly rather than all the answers slowly.`,
    truth: () => `Under a deadline people stop looking for the best option and start looking for a sufficient one they will not be blamed for.`,
    mechanism: () => `Time pressure changes the decision rule, not just its speed. Optimisation is abandoned for satisficing, and the criterion quietly becomes defensibility rather than quality.`,
  },
  {
    id: "LOCK_IN",
    label: "would leave, and everything is inside",
    match: /\b(?:would switch|switching|everything (?:she|he|they) (?:has|have) built|migrat\w*|locked in|export|already (?:has|have) \w+ (?:tools|apps)|cost of a tenth|inside the thing)\b/i,
    functional: (t) => `Leaving for ${t.thing} costs more than the thing itself, because the work already done lives in what they would be leaving.`,
    emotional: () => `Being stuck somewhere you have outgrown is a specific frustration: the trap was built by your own effort.`,
    hidden: () => `They have priced the move and stopped, more than once.`,
    social: () => `A migration that goes badly is attributed to whoever proposed it.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} does better`,
      but: `would have to abandon years of their own work to get it`,
    }),
    desire: () => `To bring the work with them, so the decision is about the tool and not about the history.`,
    truth: () => `People do not stay because they are satisfied; they stay because leaving would cost them something they made.`,
    mechanism: () => `Accumulated effort converts into switching cost automatically, without anyone intending it. The longer a thing works adequately, the more expensive it becomes to replace with something better.`,
  },
  {
    id: "BLAMED_FOR_SYSTEM_FAULT",
    label: "the system's fault, absorbed as a personal one",
    match: /\b(?:fault will feel like|was not the product's fault|blame (?:herself|himself|themselves)|feels like hers|assumes? (?:she|he|they) (?:did|had|got) (?:it )?wrong|opened it once|never went back)\b/i,
    functional: (t) => `When ${t.thing} does not work out, nothing in the experience indicates whether the fault was the product's or the person's.`,
    emotional: () => `In the absence of an explanation people supply the one that blames themselves, because it is the only variable they can see.`,
    hidden: () => `They stopped, concluded they were bad at it, and told nobody.`,
    social: () => `Admitting you could not make a simple thing work is worse than quietly not using it.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} to work`,
      but: `has no way to tell a design failure from a personal one`,
    }),
    desire: () => `To be told, once, that it was not them.`,
    truth: () => `People absorb a system's failures as their own, and stop using the system rather than complaining about it.`,
    mechanism: () => `Attribution needs a visible cause. Design is invisible and the user is not, so an unexplained failure is assigned to the only party present — which is why the churn is silent and the feedback never arrives.`,
  },
  {
    id: "UNREPRESENTED",
    label: "designed as though they were the exception",
    match: /\b(?:unrepresented|afterthought|as though that were|designed (?:as|for) (?:though|everyone)|leaving most|temporary condition|feel like everyone's|not depicted|never shown)\b/i,
    functional: (t) => `${cap(t.category)} depicts a default customer, and ${t.who} are handled as a variation on it.`,
    emotional: () => `Being accommodated is not the same as being expected, and the difference is legible every time.`,
    hidden: () => `They have adjusted to it so completely that they no longer notice doing the adjusting.`,
    social: () => `Asking to be catered for makes the need visible, which is the part they were avoiding.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} to work for how they actually live`,
      but: `is served as an exception to somebody else's normal`,
    }),
    desire: () => `To be the person the thing was designed for, once.`,
    truth: () => `Being accommodated tells people they were not expected.`,
    mechanism: () => `A default is a claim about who is ordinary. Every accommodation is an accurate reminder of which side of that line the person is on, regardless of how gracefully it is made.`,
  },
  {
    id: "ACCOUNTABLE_FOR_THE_TOOL",
    label: "the tool's mistake will carry her name",
    match: /\b(?:mistake will have (?:her|his|their) name|will be blamed|on the hook|held responsible|her name on it|carries the risk|answerable)\b/i,
    functional: (t) => `${cap(t.whoSingular)} is accountable for outcomes that ${t.thing} substantially determines and they do not control.`,
    emotional: () => `Delegating the work does not delegate the exposure, and knowing that makes every delegation deliberate.`,
    hidden: () => `They are checking its output manually, which removes most of the benefit and all of the time saved.`,
    social: () => `An error attributed to a tool they chose is still an error attributed to them.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} would save them`,
      but: `cannot transfer the responsibility along with the task`,
    }),
    desire: () => `Something that makes its own reasoning inspectable, so the accountability is bearable.`,
    truth: () => `People will not delegate a task whose failure they would still have to own.`,
    mechanism: () => `Automation moves the work without moving the blame. Until the reasoning is inspectable, adopting the tool means accepting an exposure that the previous manual process at least made visible.`,
  },
  {
    id: "ATTENTION_SCARCITY",
    label: "seen among forty others, for a second",
    match: /\b(?:remembers? none|thumbnail|forty|read \w+ (?:listings|options) this week|will not study|dim room|scroll\w*|glance|a second|skim\w*)\b/i,
    functional: (t) => `${cap(t.thing)} is not evaluated, it is glanced at, alongside a great many others that are also being glanced at.`,
    emotional: () => `The volume is exhausting rather than empowering, and exhaustion ends in remembering nothing.`,
    hidden: () => `They know they are not choosing well and have no better method available.`,
    social: () => `Having looked at forty and chosen badly is worse than having looked at three.`,
    conflict: (t) => ({
      wants: `wants to consider ${t.thing} properly`,
      but: `is operating in a format that permits about a second per option`,
    }),
    desire: () => `One thing worth remembering, so the decision has somewhere to start.`,
    truth: () => `Abundance does not produce better choices; it produces a decision made on whatever survived the glance.`,
    mechanism: () => `Comparison is capacity-limited. Past a small number of options the mechanism switches from evaluation to elimination, and elimination runs on whatever is salient rather than whatever is good.`,
  },
  {
    id: "PRICE_OPACITY",
    label: "no way to tell whether the price was fair",
    match: /\b(?:overcharg\w*|quoted one price|charged another|no way to check|opaque|hidden (?:fee|cost)|final bill|worried about the bill|what it will cost)\b/i,
    functional: (t) => `The price of ${t.thing} is settled after the work, and ${t.who} have no reference point to judge it against.`,
    emotional: () => `The suspicion of being overcharged sits on the whole transaction, including the parts that were fine.`,
    hidden: () => `They believe the price varies by customer and that they are on the wrong side of it.`,
    social: () => `Querying a bill in front of people costs more than the amount usually in dispute.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} done`,
      but: `cannot tell in advance what having it done will cost or whether that is the real price`,
    }),
    desire: () => `A number before the work, that turns out to be the number after it.`,
    truth: () => `An unpredictable price is experienced as dishonesty even when it is entirely honest.`,
    mechanism: () => `Without a reference price, a quote carries no information about fairness. The customer substitutes suspicion for the missing benchmark, and the suspicion attaches to the provider rather than to the pricing model.`,
  },
  {
    id: "CONFLICTED_ADVISER",
    label: "advised by people paid to reach one answer",
    match: /\b(?:paid only if|commission|people who sell|advising (?:her|him|them)|conflict of interest|whose interest|told constantly that)\b/i,
    functional: (t) => `Everyone offering ${t.who} guidance about ${t.thing} is compensated by one of the possible outcomes.`,
    emotional: () => `Advice that might be true is worth less than advice that might be true and is disinterested.`,
    hidden: () => `They discount everything they are told and have nothing to replace it with.`,
    social: () => `Admitting you took interested advice at face value is admitting to naivety.`,
    conflict: (t) => ({
      wants: `wants counsel about ${t.thing}`,
      but: `every available source is paid by the answer`,
    }),
    desire: () => `Someone whose advice would be the same if they earned nothing from it.`,
    truth: () => `People do not distrust advice because it is wrong; they distrust it because they can see who is paid when it is followed.`,
    mechanism: () => `Incentive is visible even when bias is not. Once the payment structure is understood, every recommendation is discounted by it — including the recommendations that were disinterested all along.`,
  },
  {
    id: "TWO_MASTERS",
    label: "written for two audiences and landing with neither",
    match: /\b(?:written for neither|for (?:her|his|their) team and every page|bilingual|one audience feel|investor wants .+ (?:and|but) .+ wants|both notice|two audiences|serves? both)\b/i,
    functional: (t) => `${cap(t.thing)} is addressed to two audiences with incompatible needs, and the compromise reaches neither.`,
    emotional: () => `Each side can tell it was not written for them, which reads as being the less important one.`,
    hidden: () => `They know which audience the material was really for, and it was not theirs.`,
    social: () => `Being visibly the secondary audience is a status statement made in public.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} to speak to them`,
      but: `it is simultaneously speaking to somebody with the opposite requirement`,
    }),
    desire: () => `To be addressed directly once, rather than included in something addressed to everyone.`,
    truth: () => `A message built for two audiences tells each of them they were the compromise.`,
    mechanism: () => `Averaging two requirements produces a position neither party holds. The compromise is invisible to whoever designed it and unmistakable to everyone receiving it.`,
  },
  {
    id: "EFFORT_EXCEEDS_BENEFIT",
    label: "the better option costs more effort than it returns",
    match: /\b(?:more effort than|not worth the|competes with the .+ already|hassle|too much (?:trouble|effort)|easier to just|already in (?:her|his|their))\b/i,
    functional: (t) => `${cap(t.thing)} is better than the alternative and requires more from ${t.who} than the alternative does.`,
    emotional: () => `Choosing the worse-but-easier option feels like a small personal failure, repeated.`,
    hidden: () => `They agree with the argument for it completely, and still do not do it.`,
    social: () => `Having tried the better option and abandoned it is worse than never having claimed to.`,
    conflict: (t) => ({
      wants: `wants what ${t.thing} makes possible`,
      but: `the effort falls entirely on them and the benefit is diffuse`,
    }),
    desire: () => `A version where the right choice is also the easy one.`,
    truth: () => `People do not choose the better thing; they choose the thing that asks less of them, and then feel bad about it.`,
    mechanism: () => `Effort is immediate and concentrated; benefit is delayed and distributed. The comparison is made in the moment of acting, where only one of the two is present.`,
  },
  {
    id: "APOLOGISING_FOR_A_NEED",
    label: "has learned to apologise for a requirement",
    match: /\b(?:apologi[sz]e|has learned to|sorry|awkward to ask|makes a fuss|special request|restriction|accommodat\w*)\b/i,
    functional: (t) => `Meeting ${t.who}'s stated requirement is treated by ${t.category} as an exception to be arranged rather than a case to be served.`,
    emotional: () => `Every request comes pre-apologised for, which converts a normal need into an imposition.`,
    hidden: () => `They often go without rather than ask, and describe that as not minding.`,
    social: () => `Asking makes the requirement everybody's business for the length of the transaction.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} on the same terms as anyone else`,
      but: `has to request it as a favour each time`,
    }),
    desire: () => `To have it already handled, so there is nothing to ask for.`,
    truth: () => `A need you have to ask for stops feeling like a need and starts feeling like an imposition.`,
    mechanism: () => `Where provision is by request, the social cost of requesting is paid by the person with the requirement. Making something available is not the same as making it usable, and the difference is borne entirely on one side.`,
  },
  {
    id: "DISCOUNT_AS_ADMISSION",
    label: "the discount confirms what they feared",
    match: /\b(?:sold as a discount|lesser version|off[- ]season|cheaper version|reduced|confirms? (?:the|their) fear|second best|leftover)\b/i,
    functional: (t) => `${cap(t.thing)} is presented at a lower price, and the price is read as a statement about the thing rather than about the timing.`,
    emotional: () => `Taking the discounted version feels like accepting a lesser experience, which contaminates the experience itself.`,
    hidden: () => `They would rather have paid full price for something described as complete.`,
    social: () => `The discount is legible to everyone who hears what they paid.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} at a price that suits them`,
      but: `the discount tells them what they are getting is the diminished one`,
    }),
    desire: () => `A different thing at a lower price, rather than the same thing marked down.`,
    truth: () => `A discount does not just lower the price; it tells people what the thing is now worth.`,
    mechanism: () => `Price is read as a quality signal before it is read as a cost. Reducing it without changing the description leaves only one explanation available, and buyers reliably find it.`,
  },
  {
    id: "SMALL_TREATED_AS_WEAK",
    label: "the size buyers like, sold as a shortcoming",
    match: /\b(?:small size is treated|treated as a weakness|niche|boutique|independent|too small|experience it as the advantage|not big enough)\b/i,
    functional: (t) => `${cap(t.category)} sells scale, and the thing ${t.who} actually value about ${t.thing} is the absence of it.`,
    emotional: () => `Choosing the smaller option feels like it needs defending, even by people who prefer it.`,
    hidden: () => `They chose it precisely because it is small and have never been given the words for that.`,
    social: () => `Recommending the small option means predicting it will still exist next year.`,
    conflict: (t) => ({
      wants: `wants what only a small ${t.category} provider gives them`,
      but: `has been taught to read small as risky`,
    }),
    desire: () => `Permission to prefer the smaller thing on purpose.`,
    truth: () => `People choose the small option for reasons the market has given them no language to defend.`,
    mechanism: () => `Scale is the industry's own success metric, so the vocabulary of quality was written by the largest players. The advantages of being small are real and unnamed, which makes them impossible to argue for.`,
  },
  {
    id: "PRESSURE_TO_ENJOY",
    label: "the occasion has to be worth what it cost",
    match: /\b(?:pressure to enjoy|waited a year|special occasion|make the most of|has to be perfect|once a year|worth the wait|itself unenjoyable)\b/i,
    functional: (t) => `${cap(t.thing)} carries an expectation of enjoyment proportional to what was spent and waited for.`,
    emotional: () => `The obligation to be having a good time is the single most reliable way of not having one.`,
    hidden: () => `They would like permission to find some of it boring.`,
    social: () => `The account given afterwards has to justify the expense to everyone who hears it.`,
    conflict: (t) => ({
      wants: `wants ${t.thing} to be worth it`,
      but: `wanting it to be worth it is the thing preventing it from being`,
    }),
    desire: () => `For the occasion to be allowed to be ordinary in places.`,
    truth: () => `Anticipation sets a standard that the thing itself is then measured against and usually fails.`,
    mechanism: () => `Expectation is formed in the absence of the experience, so it is unconstrained by it. The larger the investment, the higher the standard, and the more of the actual experience is spent auditing it.`,
  },
  {
    id: "STRANGER_IN_THE_HOUSE",
    label: "the barrier is admitting someone, not the price",
    match: /\b(?:stranger into the house|into (?:her|his|their) home|in (?:her|his|their) (?:house|flat|home)|let(?:ting)? someone|home visit|inside (?:her|his|their) home)\b/i,
    functional: (t) => `Using ${t.thing} requires admitting an unknown person into the place ${t.who} are least willing to be observed in.`,
    emotional: () => `Home is where you are not performing, and a visitor converts it back into somewhere being looked at.`,
    hidden: () => `They tidy before the cleaner arrives, and know how absurd that is.`,
    social: () => `The state of the house becomes a stranger's information, and strangers talk.`,
    conflict: (t) => ({
      wants: `wants the help ${t.thing} provides`,
      but: `the help arrives as a person in the one place nobody is invited into`,
    }),
    desire: () => `To be helped without being seen.`,
    truth: () => `The cost of help at home is not the price; it is being observed somewhere you had agreed with yourself you would not be.`,
    mechanism: () => `Domestic space is defined by the absence of an audience. Any service delivered there converts private evidence into shared evidence, and the exchange is made before the service begins.`,
  },
  {
    id: "ABSTRACTION_VS_PERSON",
    label: "choosing an institution, living with individuals",
    match: /\b(?:choosing an institution|four specific|buying a building|living with the people|the actual (?:teacher|doctor|staff)|who (?:she|he|they) will actually|day to day it is)\b/i,
    functional: (t) => `The choice about ${t.thing} is made at the level of the organisation and lived at the level of the specific people in it.`,
    emotional: () => `The decision feels consequential and is being made about the wrong object.`,
    hidden: () => `They know the individuals matter more than the institution and have no way to evaluate them.`,
    social: () => `The institution is what gets named when other people ask what was chosen.`,
    conflict: (t) => ({
      wants: `wants to choose well for the daily experience of ${t.thing}`,
      but: `can only see and compare the institution`,
    }),
    desire: () => `To meet the people it will actually be, before deciding.`,
    truth: () => `People choose institutions and then live with individuals, and nothing in the choosing is about the individuals.`,
    mechanism: () => `Reputation aggregates across people and time, which is what makes it comparable and what makes it uninformative about any particular case. The variance inside the average is the entire experience.`,
  },
  {
    id: "EXECUTIONAL_CONSTRAINT",
    label: "a production problem, not a human tension",
    match: /\b(?:compete (?:with the message )?for the same|small panel|type system|without breaking|character (?:count|limit)|legibility|file size|aspect ratio|required warning|ingredient list)\b/i,
    functional: (t) => `The stated difficulty with ${t.thing} is a constraint on the artwork rather than a difficulty in anyone's life.`,
    emotional: () => `Not established. Nobody feels anything about a panel size.`,
    hidden: () => `Not established.`,
    social: () => `Not established.`,
    conflict: () => ({ wants: "has no stated human conflict here", but: "the brief describes an execution problem" }),
    desire: () => `Not established.`,
    // Deliberately empty: a truth is not available and inventing one would be the
    // exact failure this phase exists to remove. The ladder truncates here.
    truth: () => ``,
    mechanism: () => `This brief states a production constraint. A human insight can be found for the product, but not from this sentence, and the insight layer declines rather than manufacturing a feeling about layout.`,
  },
];
