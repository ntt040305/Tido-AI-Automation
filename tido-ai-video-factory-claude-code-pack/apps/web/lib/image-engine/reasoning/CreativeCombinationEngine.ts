import {
  CAMPAIGN_ANGLES,
  CampaignAngle,
  CreativeSynthesisInput,
} from "./creative-synthesis.types";

/**
 * Composes candidate big ideas from retrieved material.
 *
 * The material is a tension, an insight, a territory and a differentiation. None
 * of them is an idea; each is a fact about the situation. What turns them into an
 * idea is a *rhetorical move* — refusing what the category does, reversing the
 * accepted reading, naming what the audience privately recognises. Seven moves
 * across the available material is where the combinatorial range comes from.
 *
 * Why this is composition rather than templating
 * ----------------------------------------------
 * A template fills slots and produces the same sentence shape every time. These
 * constructions each make a different argument, and which ones are even available
 * depends on what the material contains: `ADMISSION` needs a differentiation that
 * names a limitation, `CONSEQUENCE` needs a tension with a cost in it. A brief
 * whose material supports three moves gets three candidates, not seven padded
 * ones — an unavailable move is skipped rather than filled badly.
 *
 * The output is still bounded by the material. This engine cannot have an idea
 * the material does not support, and it does not pretend to: the honest claim is
 * a large increase in distinct propositions from a fixed corpus, which is what
 * the diversity numbers measure.
 */

/** Trims a sentence to its substance, dropping a leading imperative and stops. */
function core(text: string): string {
  return String(text || "")
    .replace(/\.$/, "")
    .replace(
      /^(?:use|apply|choose|adopt|frame|anchor|lead with|set|build|place|hold|make|treat|position|address|state|give|show|argue|compete|describe|remove|reduce|present|write|design|limit|name|signpost|invite|claim)\s+/i,
      ""
    )
    .trim();
}

/** First clause, so a long tension can be used inside a longer sentence. */
function clause(text: string): string {
  const t = core(text);
  const cut = t.split(/[,;—]|\bbecause\b|\bwhich\b|\bso that\b/i)[0].trim();
  return cut.length > 15 ? cut : t;
}

function lower(text: string): string {
  const t = clause(text);
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1) + ".";
}

/**
 * Reduces an audience descriptor to a usable plural subject.
 *
 * Takes the head noun phrase before any qualifying clause, caps the length, and
 * lowercases it so it reads inside a sentence rather than as a label.
 */
function shortAudience(raw?: string): string {
  const t = String(raw || "").replace(/\.$/, "").trim();
  if (!t) return "people";
  const head = t.split(/\s+who\b|\s+that\b|,|\bin\b|\bwith\b/i)[0].trim();
  const words = head.split(/\s+/).slice(0, 4).join(" ");
  const out = (words || head || t).toLowerCase();
  return out.length > 3 ? out : "people";
}

/**
 * The thing a REFUSAL actually refuses.
 *
 * `differentiation` arrives as a sentence *about* the differentiation — the
 * concept engine builds it as "Rejects the category default - <the default> - in
 * favour of <the replacement>." Dropped into `Refuse ...` that produced "Refuse
 * rejects the category default, and offer X instead" on half the benchmark run:
 * ungrammatical, and identical across every brief that shared an anti-pattern,
 * because the part that varies sits after the clause boundary.
 *
 * So pull out the category default itself. Where the sentence does not carry one,
 * return empty and let the caller skip the move: an unavailable construction is
 * skipped rather than filled badly, which is this engine's rule everywhere else.
 */
function refusable(differentiation: string): string {
  const raw = String(differentiation || "").replace(/\.$/, "").trim();
  if (!raw) return "";

  // "Rejects the category default - <default> - in favour of <replacement>"
  const framed = raw.match(/(?:category default|default)\s*[-—–:]\s*(.+?)\s*[-—–]\s*in favour of/i);
  if (framed) return framed[1].trim();

  // A leading verb of rejection leaves a noun phrase behind.
  const stripped = raw.replace(/^(?:rejects?|refuses?|declines?|avoids?|resists?)\s+/i, "").trim();
  if (stripped !== raw) {
    // "the category default" on its own names nothing refusable.
    if (/^(?:the\s+)?category default$/i.test(stripped)) return "";
    return stripped;
  }

  // Otherwise it must already read as a noun phrase: no leading finite verb.
  if (/^(?:is|are|was|were|has|have|does|do|makes?|shows?|uses?|takes?)\b/i.test(raw)) return "";
  return clause(raw);
}

/** Does the material contain something that reads as a cost or a loss? */
const COST_MARKERS = /\b(cost|lose|lost|miss|waste|risk|fail|delay|regret|blame|guilt|afraid|fear|anxiet)\w*/i;
/** Does the differentiation name a limitation the brand is admitting? */
const ADMISSION_MARKERS = /\b(not|without|less|fewer|refus|limit|only|no\b|absen|decline)\w*/i;

export interface CandidateIdea {
  big_idea: string;
  angle: CampaignAngle;
  why_it_works: string;
  emotional_hook: string;
  strategic_reason: string;
}

export class CreativeCombinationEngine {
  /**
   * Produces every candidate the material genuinely supports.
   *
   * Returns them unranked and unfiltered. Selection is the caller's job, because
   * originality and diversity are properties of a *run* rather than of a single
   * idea and this engine has no view of what came before.
   */
  public static combine(input: CreativeSynthesisInput): CandidateIdea[] {
    const tension = clause(input.human_tension);
    const insight = clause(input.consumer_insight);
    const territory = clause(input.campaign_territory);
    // A brief's audience field is a descriptor — "Women 30 to 45 who buy premium
    // skincare and read ingredient lists" — and dropping it whole into a sentence
    // produced twenty-word subjects with subject-verb disagreement. Reduced to a
    // short plural noun phrase, which is what a sentence can actually carry.
    const audience = shortAudience(input.audience);
    const objective = String(input.brand_objective || "").replace(/\.$/, "").trim();

    if (!tension && !territory) return [];

    const out: CandidateIdea[] = [];
    const add = (
      angle: CampaignAngle,
      idea: string,
      hook: string,
      reason: string,
      works: string
    ) => {
      const text = sentence(idea);
      // Below this it is a fragment rather than a proposition, and a fragment
      // scored as an idea is how a diversity number gets inflated.
      if (text.split(/\s+/).length < 6) return;
      out.push({
        big_idea: text,
        angle,
        why_it_works: sentence(works),
        emotional_hook: sentence(hook),
        strategic_reason: sentence(reason),
      });
    };

    // ── REFUSAL — name the category default and decline it ───────────────
    const refused = refusable(input.differentiation);
    if (refused && territory) {
      add(
        "REFUSAL",
        `Refuse ${lower(refused)}, and offer ${lower(territory)} instead`,
        `The relief of a brand that will not do the thing everyone else does`,
        `Declines the category default, which is the only claim a competitor cannot also make`,
        `A refusal costs something, and a claim that costs something is believed`
      );
    }

    // ── REVERSAL — invert the accepted reading of the problem ────────────
    if (tension && insight) {
      add(
        "REVERSAL",
        `Make this the reason to choose rather than the thing to fix: ${lower(tension)}`,
        `Recognition, arriving where criticism was expected`,
        `Reframes the audience's stated problem as the basis of the proposition`,
        `The audience has been told this is a defect; being told otherwise is new information`
      );
    }

    // ── RECOGNITION — make the private experience the public subject ─────
    if (tension) {
      add(
        "RECOGNITION",
        `Say out loud what ${audience} already know but never hear: ${lower(tension)}`,
        `Being seen — the specific relief of an unspoken thing being named`,
        `Names a tension the category leaves unaddressed, which makes it ownable`,
        `An audience that hears its own experience described trusts what comes next`
      );
    }

    // ── ELEVATION — make the ordinary thing the remarkable one ───────────
    if (territory) {
      add(
        "ELEVATION",
        `Make ${lower(territory)} the whole point rather than a detail`,
        `Respect for something ordinary treated as though it mattered`,
        `Builds the campaign on an asset competitors treat as incidental`,
        `Focus is expensive to imitate and immediately legible`
      );
    }

    // ── ADMISSION — volunteer what a competitor would hide ───────────────
    if (refused && ADMISSION_MARKERS.test(refused)) {
      add(
        "ADMISSION",
        `Admit ${lower(refused)} before anyone asks`,
        `Trust, arriving through candour rather than through insistence`,
        `Volunteering a limitation is costly, which is why the rest of the claim is believed`,
        `A brand that concedes something real has spent something the audience can see`
      );
    }

    // ── TENSION — hold two true things against each other ────────────────
    if (tension && territory) {
      add(
        "TENSION",
        `${lower(territory)}, and say so knowing this: ${lower(tension)}`,
        `The pull of two things that are both true at once`,
        `Holds the audience's real constraint alongside the brand's real offer`,
        `An idea that concedes the obstacle is more credible than one that ignores it`
      );
    }

    // ── CONSEQUENCE — state the cost of doing nothing ────────────────────
    if (tension && COST_MARKERS.test(tension)) {
      add(
        "CONSEQUENCE",
        `Count what ${audience} pay for leaving this unsaid: ${lower(tension)}`,
        `The discomfort of a cost that had not been counted`,
        `Converts an accepted condition into a decision, which is where action starts`,
        `A cost that has been named is harder to keep paying`
      );
    }

    // Objective is appended to the strategic reason rather than the idea: a big
    // idea that states its own business goal is a brief, not an idea.
    if (objective) {
      for (const c of out) {
        c.strategic_reason = sentence(`${c.strategic_reason.replace(/\.$/, "")}, in service of ${lower(objective)}`);
      }
    }

    return out;
  }

  /** Which moves the material could support, for diagnostics. */
  public static availableAngles(input: CreativeSynthesisInput): CampaignAngle[] {
    const produced = new Set(this.combine(input).map((c) => c.angle));
    return CAMPAIGN_ANGLES.filter((a) => produced.has(a));
  }
}
