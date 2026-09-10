import { CulturalContext, NO_CULTURE } from "./cultural-context.types";
import { CulturalContextResolver } from "./CulturalContextResolver";
import {
  HumanMotivationStack,
  LATENT_PATTERNS,
  LatentHumanSituation,
  MOTIVATION_FAMILIES,
  MotivationFamily,
} from "./human-motivation.types";
import {
  ExpandedHumanSituation,
  expansionFor,
} from "./human-situation-expansion.types";
import { similarity } from "./OriginalityEvaluator";

/**
 * CIOS Phase 4.0.3.6 — discovery before classification, with reconstruction.
 *
 * The problem this solves
 * -----------------------
 * Phase 4.0.3's archetype library classified 95 of 100 briefs and produced 39
 * distinct human truths from them, because a taxonomy of N entries can produce at
 * most N truths however many briefs it sees. The archetypes are not the problem —
 * they supply the structural descent from a complaint to a truth, and they still
 * run. What they cannot supply is anything their author did not write down.
 *
 * So this layer runs first, from a different source: the brief's own sentence,
 * decomposed into the observable parts of a human situation.
 *
 *   brief → situation → behaviour (read, or reconstructed) → motivation stack
 *         → social force → contradiction → tension
 *
 * Two stages, in this order, and the order is Task 1 of 4.0.3.6
 * -------------------------------------------------------------
 * A brief that says what someone *does* is read. A brief that says only what is
 * *true* — "every competitor uses steam, pour and bean close-ups" — has the doing
 * reconstructed from the shape of the condition. In 4.0.3.5 the second case
 * simply failed, which is why discovery fired on 45 of 100.
 *
 * A reconstruction is an inference and is marked as one everywhere it travels:
 * `source` says LATENT, `confidence` is capped below what a reading earns, and
 * the `latent` block carries what was assumed. A reconstruction presented as a
 * reading is a claim about a person the brief never made.
 *
 * What it is not
 * --------------
 * It is not comprehension. The extraction is syntactic — actors, verbs, clause
 * relations — and the psychology is a lookup from behaviour to a motivation
 * family. That mapping is a real regularity and it is not a reading of a person.
 *
 * The one thing it must never do is restate the brief. A "discovered tension"
 * that is the input sentence with the words moved would raise every downstream
 * number while nothing improved, so `restatement` is measured and a near-copy is
 * rejected.
 */

export interface DynamicHumanTension {
  /** The concrete circumstance, in the brief's own particulars. */
  situation: string;
  /** What the person does. Read from the brief, or reconstructed — see `source`. */
  observable_behavior: string;
  /** The feeling the behaviour implies and the brief does not name. */
  hidden_emotion: string;
  /**
   * The identity layer of the stack, kept under its 4.0.3.5 name.
   *
   * Nothing downstream had to change at once when the flat need became a stack;
   * `motivation` is what new code should read.
   */
  psychological_need: string;
  /** Who is watching and what they would conclude. Culture enters here. */
  social_force: string;
  /** Two things that are both true and cannot both be satisfied. */
  contradiction: string;
  /** The tension, as one sentence. */
  tension_statement: string;
  /** 0-1. How much was extracted rather than defaulted. Capped for LATENT. */
  confidence: number;
  /** 0-1 similarity to the brief's own sentence. High is a failure. */
  restatement: number;
  /** Phase 4.0.3.6. The five-layer motivation, replacing the flat need. */
  motivation: HumanMotivationStack;
  /** Set where the situation was reconstructed rather than read. */
  latent?: LatentHumanSituation;
  /** Set where the situation was assembled from the family and the brief. */
  expanded?: ExpandedHumanSituation;
  /**
   * How the behaviour was obtained, and therefore how much to trust it.
   *
   * EXPLICIT — read out of the brief's own sentence.
   * LATENT   — inferred from the shape of a condition the brief states.
   * EXPANDED — assembled from the motivation family and the brief's other
   *            fields, because neither of the above produced anything.
   */
  source: "EXPLICIT" | "LATENT" | "EXPANDED";
  notes: string[];
}

/** Verbs that report what someone does, as opposed to what is true of a market. */
const BEHAVIOUR_VERB =
  /\b(?:reject\w*|refus\w*|delay\w*|avoid\w*|wait\w*|compar\w*|check\w*|read\w*|ask\w*|buy\w*|choos\w*|chose|calculat\w*|apologi[sz]\w*|hesitat\w*|stopp?\w*|switch\w*|scroll\w*|remember\w*|assum\w*|blam\w*|hide|hid\w*|tidy|tidies|explain\w*|learn\w*|spend\w*|pay\w*|walk\w*|arriv\w*|return\w*|recommend\w*|tell\w*|say\w*|admit\w*|open\w*|sign\w*|evaluat\w*|research\w*|order\w*|left|leave\w*|carry|carries|postpon\w*|want\w*|know\w*|like[sd]?|sign\w*|compet\w*|sold|sell\w*|bought|watch\w*|see|sees|saw|feel\w*|expect\w*|treat\w*)\b/i;

/**
 * Agent nouns that a verb pattern matches by accident.
 *
 * `buy\w*` matches "buyers", so "Mature buyers reject correction language"
 * yielded the behaviour "buyer reject correction language" and the truth built on
 * it read as nonsense. A verb pattern cannot tell a verb from the noun that
 * shares its stem; this list can.
 */
const AGENT_NOUN =
  /^(?:buyers?|readers?|payers?|users?|owners?|sellers?|shoppers?|customers?|workers?|viewers?|renters?|writers?|makers?|planners?|advisers?|advisors?|orders?|competitors?|competition|brands?|products?|listings?|sellers?|signs?|wants?|likes?|treatments?|expectations?)$/i;

export class DynamicHumanTensionDiscovery {
  /**
   * Works the brief's sentence into the parts of a human situation.
   *
   * Returns null where neither a behaviour nor a reconstructable condition is
   * present — a real outcome, not an error. The archetype layer then carries the
   * brief alone, as it did before this file existed.
   */
  public static discover(input: {
    challenge: string;
    audience: string;
    product: string;
    category?: string;
    culture?: CulturalContext;
  }): DynamicHumanTension | null {
    const notes: string[] = [];
    const challenge = String(input.challenge || "").replace(/\s+/g, " ").trim();
    if (!challenge) return null;

    const culture = input.culture || NO_CULTURE;
    const who = shortAudience(input.audience);

    const situation = this.situationOf(challenge);
    if (!situation) return null;

    // ── Explicit behaviour, then latent reconstruction ─────────────────
    let behaviour = this.behaviourOf(challenge, situation);
    let latent: LatentHumanSituation | null = null;
    let source: "EXPLICIT" | "LATENT" | "EXPANDED" = "EXPLICIT";

    let expanded: ExpandedHumanSituation | null = null;

    if (!behaviour) {
      latent = this.reconstructLatent(challenge);
      if (latent && !latent.missing_behavior) {
        notes.push(
          "The brief states a production constraint. There is no human situation behind a panel " +
            "size, and inventing one would be the failure this layer exists to prevent."
        );
        return null;
      }
      if (latent) {
        behaviour = latent.missing_behavior;
        source = "LATENT";
        notes.push("Situation reconstructed from a stated condition rather than read from a stated act.");
      }
    }

    // ── Motivation stack ───────────────────────────────────────────────
    // Matched before expansion, because expansion is built *from* the family.
    // The family is the finding in these cases: it was matched on evidence in
    // the brief's own words, and what is missing is only a sentence to carry it.
    const family = this.familyFor(
      `${challenge} ${situation} ${latent?.missing_behavior || ""} ${latent?.avoidance_behavior || ""}`
    );
    if (!family) {
      notes.push("No motivation family matched the described or reconstructed behaviour.");
      return null;
    }

    // ── Stage three: situation expansion ───────────────────────────────
    if (!behaviour) {
      expanded = this.expandSituation(challenge, family, { audience: input.audience, product: input.product, category: input.category });
      if (!expanded) {
        notes.push("No behaviour, no reconstructable condition, and no expansion template for this family.");
        return null;
      }
      behaviour = expanded.implied_behavior;
      source = "EXPANDED";
      notes.push(
        "Situation assembled from the motivation family and the brief's own fields. No behaviour " +
          "was stated and none could be reconstructed, so this is the least-evidenced of the three routes."
      );
    }

    const motivation = this.buildStack(family, { behaviour, situation, latent, expanded });

    // ── Social force ───────────────────────────────────────────────────
    // Culture enters exactly here and nowhere earlier. It supplies a force the
    // brief did not state; it never contradicts one the brief did.
    const cultural = CulturalContextResolver.forceFor(culture, `${challenge} ${situation}`);
    const social_force = cultural
      ? `${cap(cultural)} — which is the audience this is performed in front of.`
      : sentence(`${cap(motivation.social_consequence)} is what ${who} are avoiding here`);
    if (cultural) notes.push("Social force supplied by cultural context.");

    // ── Contradiction ──────────────────────────────────────────────────
    // Built across two layers of the stack rather than from one need, which is
    // what lets it say more than "they want X and cannot have it".
    // Anchored on the behaviour, not only on the stack.
    //
    // Built from the stack's generic layers alone, the contradiction shared
    // almost no vocabulary with the brief and WRONG_SUBJECT went from 7 of 100
    // to 21 — a regression the 4.0.3 test suite caught. The stack supplies the
    // depth; the behaviour is what keeps the sentence about *this* brief.
    const contradiction = sentence(
      `${cap(who)} ${lower(strip(behaviour))} — they need ` +
        `${lower(strip(motivation.functional_need)).replace(/^to /, "")}, and getting it would cost them ` +
        `${lower(strip(motivation.identity_need)).replace(/^to be /, "being ").replace(/^to /, "")}`
    );

    // ── The tension ────────────────────────────────────────────────────
    const tension_statement = sentence(
      source === "EXPANDED"
        ? `For ${who}, ${lower(strip(expanded!.occasion))} is where ${lower(strip(family.stake))} is decided`
        : source === "LATENT"
          ? `For ${who}, ${lower(strip(latent!.moment_of_tension))} is where ${lower(strip(family.stake))} is decided`
          : `${cap(who)} ${behaviour} — not because of ${lower(trimStop(situation))}, but because ${lower(family.stake)} is what is actually at stake`
    );

    // ── Restatement guard ──────────────────────────────────────────────
    const restatement = similarity(tension_statement, challenge);
    const base = {
      situation,
      observable_behavior: behaviour,
      hidden_emotion: motivation.emotional_need,
      psychological_need: motivation.identity_need,
      social_force,
      contradiction,
      motivation,
      latent: latent || undefined,
      expanded: expanded || undefined,
      source,
    };

    if (restatement >= 0.72) {
      notes.push(
        `RESTATEMENT: the discovered tension is ${restatement.toFixed(2)} similar to the brief's own ` +
          "sentence, which makes it a paraphrase rather than a discovery. Declined."
      );
      return { ...base, tension_statement: "", confidence: 0, restatement, notes };
    }

    // ── Confidence ─────────────────────────────────────────────────────
    // The LATENT cap is applied last, so no accumulation of other signals can
    // lift a reconstruction to the confidence of a reading.
    let confidence = 0.25;
    if (behaviour) confidence += 0.3;
    if (cultural) confidence += 0.15;
    if (situation !== challenge) confidence += 0.15;
    confidence += Math.min(0.15, (1 - restatement) * 0.2);
    confidence = Math.min(confidence, source === "EXPANDED" ? 0.45 : source === "LATENT" ? 0.62 : 1);

    return {
      ...base,
      tension_statement,
      confidence: Number(Math.min(1, confidence).toFixed(3)),
      restatement: Number(restatement.toFixed(3)),
      notes,
    };
  }

  /**
   * The circumstance, separated from the brief's framing of it.
   *
   * Three sentence shapes carry a situation explicitly and cover most real
   * briefs: a contrast that names the real barrier, a cause, and a consequence.
   * Where none applies the whole sentence is the situation — honest but weaker,
   * and `confidence` reflects it.
   */
  public static situationOf(challenge: string): string {
    const c = challenge.replace(/\s+/g, " ").trim();
    if (!c) return "";

    const notBut = c.match(/\bis not\s+(?:.+?),\s*(?:it is|it's)\s+(.+?)[.;]?$/i);
    if (notBut) return strip(notBut[1]);

    const because = c.match(/^(?:.+?)\s+because\s+(.+?)[.;]?$/i);
    if (because) return strip(because[1]);

    const so = c.match(/^(.+?),\s+so\s+(?:.+?)[.;]?$/i);
    if (so) return strip(so[1]);

    const and = c.match(/^(.+?),\s+and\s+(.+?)[.;]?$/i);
    if (and) return strip(and[2].length > 20 ? and[2] : and[1]);

    return strip(c);
  }

  /**
   * The verb phrase describing what the person does.
   *
   * Four words from the first genuine verb. A longer window spanned clause
   * boundaries on most sentences and the result was rejected downstream, so the
   * wider grab was costing phrases rather than catching them.
   */
  public static behaviourOf(challenge: string, situation: string): string {
    for (const source of [situation, challenge]) {
      const words = strip(source).split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if (!BEHAVIOUR_VERB.test(words[i])) continue;
        if (AGENT_NOUN.test(words[i].replace(/[^a-z]/gi, ""))) continue;
        // A verb inside a negated clause cannot be lifted out of it. "At two in
        // the morning she does not want the best food" yielded the behaviour
        // "want the best food", and the truth composed from it said the opposite
        // of what the brief said — and read as a platitude while doing it.
        const preceding = words.slice(Math.max(0, i - 3), i).join(" ");
        if (/\b(?:not|never|n't|rarely|seldom|without|no)\b/i.test(preceding)) continue;
        const phrase = words
          .slice(i, i + 4)
          .join(" ")
          .split(/[,;:.]/)[0]
          .trim();
        if (phrase.split(/\s+/).length < 2) continue;
        // Normalise to a bare plural verb so it agrees with a plural subject.
        //
        // The earlier rule stripped "es" wholesale and turned "leaves" into
        // "leav". English inflection is irregular enough that the safe move is to
        // strip only a trailing "s", handle the "ies" case, and leave everything
        // else alone — a verb that stays inflected reads worse than one that is
        // wrong, but a non-word reads worse than both.
        return lower(phrase).replace(/^(\w+?)(ies|es|s)\b/, (m, stem, suffix) => {
          if (/(?:ss|us|is)$/.test(m)) return m;
          if (suffix === "ies") return `${stem}y`;
          // "es" after a sibilant is a real plural ending ("watches"); after
          // anything else it is usually part of the stem ("leaves", "makes").
          if (suffix === "es") return /(?:s|x|z|ch|sh)$/.test(stem) ? stem : `${stem}e`;
          return stem;
        });
      }
    }
    return "";
  }

  /** The motivation family the described behaviour belongs to, or null. */
  public static familyFor(text: string): MotivationFamily | null {
    let best: MotivationFamily | null = null;
    let bestScore = 0;
    for (const rule of MOTIVATION_FAMILIES) {
      const global = new RegExp(rule.match.source, rule.match.flags + "g");
      const hits = [...String(text || "").matchAll(global)];
      if (!hits.length) continue;
      const score = hits.length * 10 + hits.reduce((n, m) => n + m[0].length, 0);
      if (score > bestScore) {
        bestScore = score;
        best = rule;
      }
    }
    return best;
  }

  /**
   * Reconstructs the situation a condition-only brief implies.
   *
   * Returns null where no condition shape matches, and an empty reconstruction
   * for a production constraint — a warning panel competing for space is a real
   * problem with no human situation behind it, and the honest output is to say so
   * rather than to invent someone feeling something about layout.
   */
  public static reconstructLatent(challenge: string): LatentHumanSituation | null {
    const c = String(challenge || "").replace(/\s+/g, " ").trim();
    if (!c) return null;

    let best: (typeof LATENT_PATTERNS)[number] | null = null;
    let bestScore = 0;
    for (const p of LATENT_PATTERNS) {
      const global = new RegExp(p.match.source, p.match.flags + "g");
      const hits = [...c.matchAll(global)];
      if (!hits.length) continue;
      const score = hits.length * 8 + hits.reduce((n, m) => n + m[0].length, 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) return null;

    if (!best.missing_behavior) {
      return {
        surface_statement: c,
        missing_behavior: "",
        daily_context: "",
        moment_of_tension: "",
        trigger_event: "",
        avoidance_behavior: "",
        desired_state: "",
        confidence: 0,
      };
    }

    return {
      surface_statement: c,
      missing_behavior: best.missing_behavior,
      daily_context: best.daily_context,
      moment_of_tension: best.moment_of_tension,
      trigger_event: best.trigger_event,
      avoidance_behavior: best.avoidance_behavior,
      desired_state: best.desired_state,
      // Capped below explicit extraction on purpose. This is inferred from the
      // shape of a sentence, not read out of it, and a reconstruction that scored
      // like a reading would make the two indistinguishable downstream.
      confidence: 0.55,
    };
  }

  /**
   * Assembles a situation from a matched family and the brief's own fields.
   *
   * The third and last route to a behaviour, used only when the brief states
   * neither an act nor a recognisable condition. What it supplies is structure —
   * a moment, an act, a thing being weighed — and never a feeling: every
   * emotional term in the result belongs to the family, and the family was
   * matched on words that are actually in the brief.
   *
   * Returns null where the family has no expansion template, which is the
   * honest outcome rather than a generic one.
   */
  public static expandSituation(
    challenge: string,
    family: MotivationFamily,
    brief: { audience?: string; product?: string; category?: string }
  ): ExpandedHumanSituation | null {
    const template = expansionFor(family);
    if (!template) return null;

    const who = shortAudience(brief.audience || "");
    const thing = String(brief.product || "").trim().toLowerCase();
    const category = String(brief.category || "").trim().toLowerCase();

    const built_from: string[] = ["motivation family"];
    if (brief.audience) built_from.push("audience");
    if (thing) built_from.push("product");
    if (category) built_from.push("category");

    const constructed_situation = sentence(
      `${cap(who)} ${lower(strip(template.implied_behavior))}` +
        (thing ? `, where ${thing} is concerned` : "")
    );

    return {
      surface_statement: strip(challenge),
      constructed_situation,
      implied_behavior: strip(template.implied_behavior),
      occasion: strip(template.occasion),
      what_is_weighed: strip(family.stake),
      built_from,
      // Below reconstruction, which is below reading. Three routes, three
      // ceilings, so a brief the system had least to go on for stays visible as
      // one.
      confidence: 0.42,
    };
  }

  /**
   * Builds the five-layer stack.
   *
   * `depth_score` is the honest part: it counts the layers established from this
   * brief rather than inherited whole from the family. A stack that is entirely
   * inherited is a richer vocabulary for a motive, not evidence about one.
   */
  public static buildStack(
    family: MotivationFamily,
    evidence: {
      behaviour: string;
      situation: string;
      latent?: LatentHumanSituation | null;
      expanded?: ExpandedHumanSituation | null;
    }
  ): HumanMotivationStack {
    const established: string[] = [];
    if (evidence.behaviour) established.push("behaviour");
    if (evidence.latent?.desired_state) established.push("desired state");
    if (evidence.latent?.moment_of_tension) established.push("moment");
    // An expanded situation contributes structure, not evidence, so it adds no
    // depth. A stack assembled from a family alone should score as one.
    if (evidence.expanded) established.length = Math.max(0, established.length - 1);

    return {
      functional_need: evidence.latent?.desired_state || family.functional_need,
      emotional_need: family.emotional_need,
      identity_need: family.identity_need,
      social_consequence: family.social_consequence,
      existential_tension: family.existential_tension,
      depth_score: Number(Math.min(1, 0.35 + established.length * 0.22).toFixed(3)),
      family: family.id,
    };
  }

  /**
   * A human truth composed from what was discovered, rather than looked up.
   *
   * Five constructions, each drawing on a different layer of the stack. That is
   * what the stack buys over the flat need it replaced: a truth about identity
   * reads differently from one about social consequence, and a single need could
   * only ever produce one of them.
   *
   * Universality is protected by construction — every subject is "people", and
   * the only material spliced in is generic already.
   */
  public static composeTruth(t: DynamicHumanTension): string {
    if (!t.tension_statement) return "";
    const stake = lower(strip(stakeOf(t)));
    if (!stake) return "";

    const behaviour = generalise(t.observable_behavior);
    const identity = lower(strip(t.motivation.identity_need)).replace(/^to be /, "");
    const existential = lower(strip(t.motivation.existential_tension));
    const social = lower(strip(t.motivation.social_consequence));

    const emotion = lower(strip(t.motivation.emotional_need)).replace(/^to not /, "").replace(/^to /, "");
    const occasion = lower(strip(t.expanded?.occasion || t.latent?.moment_of_tension || ""));

    // Eight constructions rather than five. Ten families against five frames
    // produced 42 distinct truths across 93 briefs, with one of them leading ten
    // campaigns — and `familiarity` scored that collision correctly. Each frame
    // below draws on a different layer, so the variety comes from the material
    // rather than from paraphrase.
    const candidates = [
      behaviour ? `What looks like people ${behaviour} is usually ${stake} being protected` : "",
      identity ? `People will give up ${stake} before they will stop being ${identity}` : "",
      social ? `The cost people are weighing is not the price; it is ${social}` : "",
      existential ? `${cap(existential)}, and everyone inside it is deciding alone` : "",
      emotion ? `What people describe as ${emotion} is ${stake} going unprotected` : "",
      occasion ? `Everything is decided in ${occasion}, and nobody plans for it` : "",
      social && identity ? `People would rather risk ${social} than admit they are no longer ${identity}` : "",
      `People give up ${stake} long before they will ask to keep it`,
    ].filter(Boolean);

    // Rotated by the stack, so two briefs sharing a family but differing in what
    // was discovered do not share a sentence. Deterministic, and deliberately not
    // a choice by score: selecting on the reported metric is what collapsed the
    // lens distribution in Phase 4.0.3.
    const index =
      Math.abs(hash(`${t.motivation.family}|${t.observable_behavior}|${t.source}`)) % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const composed = sentence(candidates[(index + i) % candidates.length]);
      if (wellFormed(composed)) return composed;
    }
    return "";
  }

  /** The ten motivation families, for reporting and for tests. */
  public static families(): string[] {
    return MOTIVATION_FAMILIES.map((f) => f.id);
  }
}

/** Stable small hash, so the same input always picks the same construction. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

/** The stake, recovered from the family the stack names. */
function stakeOf(t: DynamicHumanTension): string {
  const family = MOTIVATION_FAMILIES.find((f) => f.id === t.motivation.family);
  return family ? family.stake : "";
}

/**
 * Turns an observed behaviour into a form that can follow a generic subject.
 *
 * The extraction upstream takes a window from the first verb it finds, which is
 * fine for a contradiction clause and not fine for splicing into a truth. It
 * produced "What looks like people buyer reject correction language because it
 * frames is usually…" — a fragment carrying a subordinating conjunction into a
 * sentence with nowhere to put it.
 *
 * So the bar here is high and the failure is silent: anything that is not a clean
 * verb phrase returns empty, and `composeTruth` falls back to a form that needs
 * none. A truth is the most reused sentence this system produces, and a malformed
 * one is worse than a generic one.
 */
function generalise(behaviour: string): string {
  const raw = strip(String(behaviour || ""));
  if (!raw) return "";
  const b = raw.toLowerCase();
  const words = b.split(/\s+/).filter(Boolean);

  if (words.length < 2 || words.length > 6) return "";
  if (/\b(?:because|that|which|while|although|whether|when|since|so that|if)\b/.test(b)) return "";
  if (/\b(?:is|are|was|were|has|have|does|do|will|would|can|could)\b/.test(b)) return "";
  if (/^(?:the|a|an|of|to|and|or|but|in|on|for|with|it|its)\b/.test(b)) return "";
  if (/\b(?:the|a|an|of|to|and|or|but|in|on|for|with|it|its|their|her|his)$/.test(b)) return "";
  if (/[A-Z]/.test(raw.slice(1))) return "";
  if (AGENT_NOUN.test(words[0])) return "";
  return b;
}

/**
 * Refuses a composed sentence that reads badly.
 *
 * The review layer scores content, not grammar, and gave 94 of 100 to a spliced
 * fragment before it was taught to look. Nothing downstream was going to catch
 * that, so it is caught here.
 */
function wellFormed(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length < 6 || words.length > 26) return false;
  for (const marker of ["usually", "looks like", "rather than"]) {
    const n = (t.toLowerCase().match(new RegExp(marker, "g")) || []).length;
    if (n > 1) return false;
  }
  if (/\b(\w+)\s+\1\b/i.test(t)) return false;
  return true;
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
  return (words.join(" ") || "people").toLowerCase();
}

/** Drops a leading article or conjunction so a clause reads inside a sentence. */
function trimStop(text: string): string {
  return String(text || "")
    .replace(/^(?:and|but|so|because|that|which|the|a|an)\s+/i, "")
    .trim();
}

function strip(text: string): string {
  return String(text || "").replace(/[.]+$/, "").trim();
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
