import { ARCHETYPES } from "./human-insight.archetypes";
import { CulturalContextResolver } from "./CulturalContextResolver";
import { DynamicHumanTensionDiscovery } from "./DynamicHumanTensionDiscovery";
import { HumanTensionAnalyzer, TensionAnalysisInput } from "./HumanTensionAnalyzer";
import {
  EMPTY_ABSTRACTIONS,
  HumanInsight,
  HumanInsightAuthor,
  SHALLOW_PROPOSITIONS,
} from "./human-insight.types";

/**
 * Turns a completed ladder into the four things a planner hands over.
 *
 * The ladder produces eight rungs; a creative team needs four statements. This
 * class does that reduction and refuses the two ways it usually goes wrong.
 *
 * The first is shallowness. "Customers want quality" is not rejected because
 * "quality" is a banned word but because the proposition survives having its
 * audience and its category replaced — it is true of everyone and therefore about
 * nobody. `SHALLOW_PROPOSITIONS` encodes that test as patterns, and a shallow
 * output is reported as a defect rather than passed on with a low score.
 *
 * The second is manufactured urgency. `why_now` is the field most likely to be
 * filled with an invented reason, because something always sounds better than
 * nothing there. It is derived only from things the brief actually supplies — a
 * stated change, a stated objective, a seasonal or launch trigger — and where the
 * brief supplies none it says the truth is standing rather than new. A campaign
 * built on a standing truth is a normal campaign; a campaign built on a fabricated
 * urgency is a campaign whose central claim is false.
 */

export interface InsightGenerationInput extends TensionAnalysisInput {
  /** Used only to decide whether a "now" exists. Never invents one. */
  objectiveKind?: string;
  author?: HumanInsightAuthor;
  /** Brand name. Used only as a market signal for cultural resolution. */
  brand?: string;
  /** Explicit market, where the caller knows it. Beats inference. */
  market?: string;
  /** Set false to run the 4.0.3 path — archetypes alone. For A/B measurement. */
  useDiscovery?: boolean;
  /** Set false to build the insight without cultural grounding. */
  useCulture?: boolean;
}

/** Objectives that carry their own moment. */
const TIMED_OBJECTIVE =
  /\b(launch|entry|opening|listing|seasonal|rebrand\w*|new (?:store|collection|range))\b/i;
/** Language in the challenge that reports a change rather than a condition. */
const CHANGE_MARKER =
  /\b(no longer|has changed|have changed|since|now that|recently|used to|increasingly|has become|are starting to|first time)\b/i;

export class HumanInsightGenerator {
  public static generate(input: InsightGenerationInput): HumanInsight {
    // ── Culture, then discovery, then the ladder ───────────────────────
    //
    // Phase 4.0.3.5 puts two stages in front of archetype matching, and the
    // order is load-bearing. Culture resolves first because the discovery layer
    // uses it for the social force. Discovery runs second because the ladder
    // uses its emotion, force and contradiction in place of the archetype's
    // templates — which is where twelve briefs sharing an archetype became
    // twelve briefs sharing a sentence.
    //
    // Both stages decline. An unresolvable market yields no cultural grounding,
    // and a sentence with no observable behaviour yields no discovered tension;
    // in either case the 4.0.3 path runs unchanged, which is why `useDiscovery`
    // and `useCulture` exist as switches rather than as assumptions.
    const wantCulture = input.useCulture !== false;
    const cultural = wantCulture
      ? CulturalContextResolver.resolve({
          audience: input.audience,
          product: input.product,
          brand: input.brand,
          challenge: input.challenge,
          market: input.market,
          industry: input.category,
        })
      : null;

    const discovered =
      input.useDiscovery === false
        ? null
        : DynamicHumanTensionDiscovery.discover({
            challenge: input.challenge,
            audience: input.audience,
            product: input.product,
            category: input.category,
            culture: cultural?.context,
          });

    const analysis = HumanTensionAnalyzer.analyze({
      ...input,
      discovered: discovered && discovered.tension_statement ? discovered : null,
      culture: cultural?.context,
    });
    const warnings = [...analysis.warnings, ...(cultural?.warnings || [])];
    if (discovered?.notes.length) warnings.push(...discovered.notes.map((n) => `DISCOVERY: ${n}`));
    if (discovered && !discovered.tension_statement) {
      warnings.push(
        "DISCOVERY_DECLINED: the discovered tension was a paraphrase of the brief, so it was not used. " +
          "The archetype path carried this brief alone."
      );
    }
    const t = analysis.terms;
    const at = (s: Parameters<typeof HumanTensionAnalyzer.at>[1]) =>
      HumanTensionAnalyzer.at(analysis.ladder, s)?.statement || "";

    const human_truth = at("human_truth");
    const conflict = at("identity_conflict");
    const emotional = at("hidden_emotion");
    const hidden = at("identity_conflict");
    const social = at("social_fear");
    const desire = at("creative_opportunity");
    const functional = at("behavior");

    // ── Consumer insight ───────────────────────────────────────────────
    // What follows from the truth for *this* audience in *this* category. The
    // truth is universal by construction, so this is where the brief comes back
    // in; without it the two fields say the same thing twice.
    const consumer_insight = human_truth
      ? sentence(
          `For ${t.who}, that shows up as this: ${lower(strip(hidden || emotional || functional))}` +
            // The rung's own full stop is stripped before concatenation, so it
            // has to come back or the two sentences run together.
            (desire ? `. What would settle it is ${lower(strip(desire))}` : "")
        )
      : sentence(strip(emotional || functional));

    // ── Why people feel this ───────────────────────────────────────────
    // The mechanism, not a restatement. An archetype supplies it; a structural
    // derivation cannot, and says so instead of paraphrasing the rung above.
    const arch = ARCHETYPES.find((a) => a.id === analysis.archetype);
    const why_people_feel_this = arch
      ? sentence(arch.mechanism(t))
      : sentence(
          "Not established. No problem shape matched this brief, so the ladder reached the " +
            "emotional rung by sentence structure alone and cannot say why the feeling arises"
        );
    if (!arch) {
      warnings.push("NO_MECHANISM: why_people_feel_this is unestablished for this brief.");
    }

    // ── Why now ────────────────────────────────────────────────────────
    const why_now = this.whyNow(input, analysis.terms.challenge, warnings, cultural?.context);

    // ── Cultural grounding ─────────────────────────────────────────────
    // How the truth shows up here, kept out of the truth itself. A truth that
    // names a market is a local observation; `universality` scores it as one,
    // and correctly.
    let cultural_grounding = "";
    if (cultural?.resolved && human_truth) {
      const symbol = CulturalContextResolver.symbolFor(cultural.context, `${t.challenge} ${social}`);
      const force = CulturalContextResolver.forceFor(cultural.context, `${t.challenge} ${social}`);
      if (force || symbol) {
        cultural_grounding = sentence(
          `In this market it shows up as ${lower(strip(force || symbol))}` +
            (force && symbol ? `, and ${lower(strip(symbol))} is where it is visible` : "")
        );
      } else {
        warnings.push(
          "NO_CULTURAL_FIT: a market was established and none of its forces bear on this situation, " +
            "so no cultural grounding is asserted. An irrelevant one would be worse than none."
        );
      }
    }

    let insight: HumanInsight = {
      human_truth,
      consumer_insight,
      why_people_feel_this,
      why_now,
      ladder: analysis.ladder,
      archetype: analysis.archetype,
      truncated_at: analysis.truncated_at,
      dynamic_tension: discovered && discovered.tension_statement ? discovered : null,
      cultural_grounding: cultural_grounding || undefined,
      cultural_market: cultural?.resolved
        ? `${cultural.context.country}/${cultural.context.generation}`
        : "unspecified",
      warnings,
    };

    // ── The authoring seam ─────────────────────────────────────────────
    // Synchronous callers only; an async author is the caller's to await. The
    // refinement faces the same quality gate the derived version does.
    if (input.author) {
      const refined = input.author.refine(insight, {
        challenge: t.challenge,
        audience: input.audience,
        product: input.product,
      });
      if (refined && !(refined instanceof Promise)) {
        insight = { ...insight, ...refined, warnings: [...warnings, "AUTHORED: rungs replaced by HumanInsightAuthor."] };
      }
    }

    // ── Shallowness ────────────────────────────────────────────────────
    const shallow = this.shallowHits(insight);
    if (shallow.length) {
      insight.warnings.push(
        `SHALLOW_INSIGHT: ${shallow.length} statement(s) are true of every audience in every ` +
          `category — ${shallow.map((s) => `"${s}"`).join(", ")}.`
      );
    }
    if (!human_truth) {
      insight.warnings.push(
        `NO_HUMAN_TRUTH: the ladder stopped at ${analysis.truncated_at || "an early rung"}, so no ` +
          "truth was derived. Reported empty rather than filled with the rung above it."
      );
    }
    if (conflict && !/\band\b|\byet\b|\bwhile\b/i.test(conflict)) {
      insight.warnings.push("WEAK_CONFLICT: the internal conflict does not hold two things against each other.");
    }

    return insight;
  }

  /**
   * Why the truth is live now, or an honest statement that it is standing.
   *
   * Three sources, all supplied by the brief: a change reported in the challenge,
   * an objective that carries its own moment, or nothing. There is deliberately
   * no fourth branch inventing a cultural trend.
   */
  private static whyNow(
    input: InsightGenerationInput,
    challenge: string,
    warnings: string[],
    culture?: import("./cultural-context.types").CulturalContext
  ): string {
    const change = challenge.match(CHANGE_MARKER);
    const objective = String(input.objectiveKind || input.objective || "");
    const timed = objective.match(TIMED_OBJECTIVE);

    // A measured behaviour shift in the market is the strongest "now" available,
    // because it is the only one that is about the audience rather than about the
    // brand's calendar. It is used only where one actually bears on the situation.
    if (culture) {
      const shift = CulturalContextResolver.shiftFor(culture, challenge);
      if (shift) {
        return sentence(
          `A shift in this market makes it live: ${lower(strip(shift))} — which changes who the ` +
            "audience is comparing against and how quickly"
        );
      }
    }

    if (change) {
      return sentence(
        `The brief reports this as a change rather than a constant — "${change[0]}" — so the truth is ` +
          "live for this audience now in a way it was not previously"
      );
    }
    if (timed) {
      return sentence(
        `The moment is the brand's, not the audience's: a ${timed[0].toLowerCase()} is the occasion on which ` +
          "a standing truth can be raised"
      );
    }
    warnings.push(
      "NO_TRIGGER: the brief supplies neither a reported change nor a timed objective, so why_now " +
        "states the truth as standing rather than inventing an occasion."
    );
    return sentence(
      "Nothing in the brief makes this newly true. It is a standing condition, and the campaign's " +
        "timing is a business decision rather than a cultural one"
    );
  }

  /** Statements that survive substitution of audience and category. */
  public static shallowHits(insight: HumanInsight): string[] {
    const fields = [insight.human_truth, insight.consumer_insight, insight.why_people_feel_this];
    const hits: string[] = [];
    for (const f of fields) {
      for (const p of SHALLOW_PROPOSITIONS) {
        // Every occurrence, not the first: one sentence can carry two of these
        // ("customers want quality and people need convenience"), and reporting
        // one of them understates how shallow the statement is.
        const global = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
        for (const m of String(f || "").matchAll(global)) hits.push(m[0]);
      }
      const abstractions = EMPTY_ABSTRACTIONS.filter((a) =>
        new RegExp(`\\b${a}\\b`, "i").test(String(f || ""))
      );
      // One abstraction in a long sentence is ordinary English. Three is a
      // sentence made of them.
      if (abstractions.length >= 3) hits.push(abstractions.join(" + "));
    }
    return hits;
  }

  /** True when the insight is safe to express. Used by the gate and by tests. */
  public static isUsable(insight: HumanInsight): boolean {
    return Boolean(insight.human_truth) && this.shallowHits(insight).length === 0;
  }
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}

function strip(text: string): string {
  return String(text || "").replace(/[.]+$/, "").trim();
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
