import { ConceptConflictResolver } from "./ConceptConflictResolver";
import { CreativeCombinationEngine } from "./CreativeCombinationEngine";
import { CreativeDiversityController } from "./CreativeDiversityController";
import { OriginalityEvaluator } from "./OriginalityEvaluator";
import { ConceptRetrievalScorer } from "./ConceptRetrievalScorer";
import { ReasoningKnowledgeObject, ReasoningRetrievalQuery } from "./reasoning-knowledge.types";
import { ART_DIRECTION_DOMAINS, CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";
import {
  ConceptCandidate,
  ConceptChainStep,
  ConceptChainStepId,
  ConceptCore,
  ConceptGenerationOutput,
  ConceptRelevanceScore,
  ConflictResolution,
} from "./concept-generation.types";
import {
  CampaignAngle,
  CreativeSynthesisInput,
  CreativeSynthesisOutput,
  OriginalityAssessment,
} from "./creative-synthesis.types";

/**
 * Builds a concept by walking the chain, one step at a time.
 *
 * The difference from Phase 4.0 is what "chain" means. There, `pickLead` chose a
 * single object and every step was derived from it; the trace listed four steps
 * that were really one. Here each step selects its own object from the material
 * that suits *that* step, so a tension can come from one place and the territory
 * it opens from another.
 *
 * That matters for a reason the blindness audit already found: with one lead per
 * brief, thirty briefs produced ideas that repeated within an industry. Four
 * independent selections produce four times the combinations from the same
 * corpus.
 *
 * Output is restricted by construction
 * ------------------------------------
 * `ConceptCore` has five fields and no others. There is no code path in this
 * class that could emit a camera instruction, because there is nowhere to put
 * one. That is a stronger guarantee than validating afterwards — the Phase
 * 3.1.8.1 contamination happened precisely because the concept object had
 * somewhere for an art direction decision to land.
 */

/** Which domains can supply which step, in preference order. */
const STEP_DOMAINS: Record<ConceptChainStepId, string[]> = {
  human_tension: ["human_tension", "audience", "strategy"],
  consumer_insight: ["consumer_insight", "human_tension", "audience", "strategy"],
  campaign_territory: ["campaign_territory", "idea_pattern", "differentiation", "strategy"],
  big_idea: ["human_tension", "campaign_territory", "idea_pattern", "consumer_insight", "strategy", "concept"],
};

/** Knowledge types that describe method rather than material. */
const NON_LEADING_TYPES = new Set(["framework", "principle", "evaluation_rule", "production_rule"]);

/**
 * Reads a field off a concept pattern profile, or "" when absent.
 *
 * Accepts undefined. A chain step can legitimately find no object — seven of the
 * hundred benchmark briefs hit exactly that — and the callers were passing the
 * result through an `as` cast that told the compiler it could not happen. It
 * could, and it crashed the whole run for those briefs rather than degrading.
 */
function profileField(obj: ReasoningKnowledgeObject | undefined, field: string): string {
  if (!obj) return "";
  const p = obj.domain_profile as Record<string, unknown> | undefined;
  if (!p || p.kind !== "creative_concept_pattern") return "";
  return String(p[field] ?? "");
}

/**
 * Presents a decision as an idea.
 *
 * This used to strip the leading imperative — "Frame the campaign around X"
 * became "The campaign around X" — on the theory that an idea should not read as
 * an order. Two rounds of fragments later, the theory is wrong. Stripping the
 * verb leaves a fragment whenever the verb was carrying the sentence: "Give the
 * audience a reason" became "Audience a reason"; "Remove styling until the
 * garment carries the frame" became "Styling elements until...". Guarding on
 * length did not help, because the fragments were long.
 *
 * An imperative is a perfectly good statement of an idea. The decision is now
 * presented whole.
 */
function toIdea(decision: string): string {
  const t = String(decision || "").replace(/\.$/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export class CreativeConceptGenerator {
  /**
   * Generates a concept core from retrieved candidates.
   *
   * `briefText` is the brief's own prose. It is what the human-problem signal is
   * measured against, so passing a label instead of the real text silently
   * degrades every selection.
   */
  public static generate(
    candidates: ConceptCandidate[],
    query: ReasoningRetrievalQuery,
    briefText: string,
    synthesis: {
      /** Carried across cases, so between-brief repetition is visible. */
      diversity?: CreativeDiversityController;
      brand_objective?: string;
      audience?: string;
      differentiation?: string;
      /** Category defaults this brief must avoid. */
      avoid?: string[];
    } = {}
  ): ConceptGenerationOutput {
    const warnings: string[] = [];
    const chain: ConceptChainStep[] = [];
    const conflicts: ConflictResolution[] = [];
    const allScores: ConceptRelevanceScore[] = [];

    // Art direction objects are excluded here rather than filtered later. A
    // candidate set that contains them is one edit away from leaking one.
    const eligible = candidates.filter(
      (c) =>
        !ART_DIRECTION_DOMAINS.has(String(c.object.domain)) &&
        CONCEPT_LEAD_DOMAINS.has(String(c.object.domain))
    );

    if (!eligible.length) {
      warnings.push(
        "NO_CONCEPT_MATERIAL: retrieval returned no concept-bearing knowledge, so no idea could be formed. " +
          "This is a corpus or retrieval gap, not a weak concept."
      );
      return {
        concept: { big_idea: "", consumer_insight: "", emotional_trigger: "", belief_shift: "", campaign_territory: "" },
        trace: { query, chain: [], conflicts: [], scores: [], warnings },
        complete: false,
      };
    }

    const used = new Set<string>();

    for (const step of ["human_tension", "consumer_insight", "campaign_territory", "big_idea"] as ConceptChainStepId[]) {
      const domains = STEP_DOMAINS[step];
      let pool = eligible.filter((c) => domains.includes(String(c.object.domain)));

      // The big idea cannot come from a framework: a framework describes how to
      // build an idea and is not one. Earlier steps may use one, because a
      // framework can legitimately supply an insight.
      if (step === "big_idea") {
        pool = pool.filter((c) => !NON_LEADING_TYPES.has(String(c.object.knowledge_type)));
      }

      // Prefer an object not already used, so four steps do not collapse back
      // onto one source — which is the whole defect this phase repairs. Fall
      // back to the full pool when nothing else is available, because a repeated
      // source beats an empty step.
      const fresh = pool.filter((c) => !used.has(c.object.knowledge_id));
      const searchPool = fresh.length ? fresh : pool;
      if (!searchPool.length) {
        chain.push({
          step,
          value: "",
          source: null,
          source_domain: null,
          score: 0,
          rationale: `No candidate available from ${domains.join(", ")}.`,
          considered: [],
        });
        warnings.push(`CHAIN_STEP_EMPTY(${step}): no object was available from ${domains.join(", ")}.`);
        continue;
      }

      const ranked = ConceptRetrievalScorer.rank(searchPool, query, briefText);
      allScores.push(...ranked.map((r) => r.score));

      const { winner, resolution } = ConceptConflictResolver.resolve(step, ranked, query);
      if (resolution) conflicts.push(resolution);
      used.add(winner.candidate.object.knowledge_id);

      chain.push({
        step,
        value: this.valueFor(step, winner.candidate.object),
        source: winner.candidate.object.knowledge_id,
        source_domain: String(winner.candidate.object.domain),
        score: winner.score.total,
        rationale:
          resolution?.rationale ||
          `Highest concept relevance (${winner.score.total.toFixed(2)}) on ${winner.score.matched.join(", ") || "no specific signal"}.`,
        considered: ranked.slice(1, 4).map((r) => ({ knowledge_id: r.score.knowledge_id, score: r.score.total })),
      });
    }

    const stepValue = (id: ConceptChainStepId) => chain.find((c) => c.step === id)?.value || "";
    const stepObject = (id: ConceptChainStepId) =>
      candidates.find((c) => c.object.knowledge_id === chain.find((x) => x.step === id)?.source)?.object;

    // The belief shift is the one field with no step of its own: it belongs to
    // whichever object supplied the idea, because it is what that idea is trying
    // to change.
    const ideaObject = stepObject("big_idea");
    const belief_shift =
      profileField(ideaObject, "belief_shift") ||
      String(ideaObject?.impact || "");

    // ── Phase 4.0.1.5 — synthesis ─────────────────────────────────────
    //
    // Up to here the chain has assembled material. The big idea is now composed
    // from it rather than lifted out of it: `stepValue("big_idea")` was a
    // knowledge object's `decision` field with the full stop removed, which is
    // why thirty briefs produced sixteen ideas that all already existed in the
    // corpus.
    const synthesisInput: CreativeSynthesisInput = {
      human_tension: stepValue("human_tension"),
      consumer_insight: stepValue("consumer_insight"),
      campaign_territory: stepValue("campaign_territory"),
      brand_objective: synthesis.brand_objective || String(query.objective || ""),
      differentiation: synthesis.differentiation || "",
      audience: synthesis.audience || String(query.audience || "the audience"),
      industry: String(query.industry || ""),
      brand_position: String(query.brand_position || ""),
      avoid: synthesis.avoid || [],
    };

    const diversity = synthesis.diversity;
    const combined = CreativeCombinationEngine.combine(synthesisInput);
    const sourceMaterial = [
      synthesisInput.human_tension,
      synthesisInput.consumer_insight,
      synthesisInput.campaign_territory,
    ].filter(Boolean);

    let synthesised: CreativeSynthesisOutput | undefined;
    let originality: OriginalityAssessment | undefined;

    if (combined.length) {
      // Diversity suppresses near-duplicates before originality ranks what is
      // left, so a run cannot spend its best originality score on an idea it has
      // already produced.
      const permitted = combined.filter((c) => {
        if (!diversity) return true;
        return diversity.assess({
          angle: c.angle,
          territory: stepValue("campaign_territory") || null,
          tension: stepValue("human_tension") || null,
          big_idea: c.big_idea,
        }).allowed;
      });
      const pool = permitted.length ? permitted : combined;

      const best = OriginalityEvaluator.selectBest(
        pool,
        sourceMaterial,
        diversity ? diversity.ideas() : [],
        synthesisInput.avoid
      );
      if (best) {
        originality = best.assessment;
        synthesised = {
          big_idea: best.chosen.big_idea,
          why_it_works: best.chosen.why_it_works,
          emotional_hook: best.chosen.emotional_hook,
          strategic_reason: best.chosen.strategic_reason,
          originality_score: best.assessment.score,
          angle: best.chosen.angle,
          derived_from: chain.map((c) => c.source).filter(Boolean) as string[],
        };
        diversity?.record({
          angle: best.chosen.angle,
          territory: stepValue("campaign_territory") || null,
          tension: stepValue("human_tension") || null,
          big_idea: best.chosen.big_idea,
        });
        if (best.rejected) {
          warnings.push(
            `ORIGINALITY_REJECTED: ${best.rejected} candidate(s) were too close to an idea already produced in this run.`
          );
        }
      }
    } else {
      warnings.push(
        "NO_SYNTHESIS_MATERIAL: the chain produced no tension or territory, so no idea could be composed. " +
          "Falling back to the retrieved decision."
      );
    }

    const concept: ConceptCore = {
      big_idea: synthesised?.big_idea || stepValue("big_idea"),
      consumer_insight: stepValue("consumer_insight"),
      emotional_trigger:
        profileField(ideaObject, "emotional_trigger") ||
        profileField(stepObject("human_tension"), "emotional_trigger") ||
        "",
      belief_shift,
      campaign_territory: stepValue("campaign_territory"),
    };

    const complete = Object.values(concept).every((v) => String(v).trim());
    if (!complete) {
      warnings.push(
        `INCOMPLETE_CONCEPT_CORE: ${Object.entries(concept)
          .filter(([, v]) => !String(v).trim())
          .map(([k]) => k)
          .join(", ")} could not be filled from the retrieved material.`
      );
    }

    return {
      concept,
      synthesis: synthesised,
      originality,
      trace: { query, chain, conflicts, scores: allScores, warnings },
      complete,
    };
  }

  /** What each step takes from its selected object. */
  private static valueFor(step: ConceptChainStepId, obj: ReasoningKnowledgeObject): string {
    switch (step) {
      case "human_tension":
        return profileField(obj, "human_tension") || String(obj.problem || "");
      case "consumer_insight":
        return profileField(obj, "consumer_insight") || String(obj.why_this_works || "");
      case "campaign_territory":
        // No fallback to `impact`. An impact is a business outcome — "raises brand
        // attribution and reduces category interchangeability" — and composing an
        // idea around one produced "Make raises brand attribution the whole point".
        // An empty territory costs one construction; a wrong one poisons every
        // construction that uses it.
        return profileField(obj, "campaign_territory");
      case "big_idea":
        return toIdea(String(obj.decision || ""));
    }
  }

  /** One-screen view of the chain. */
  public static formatChain(output: ConceptGenerationOutput): string {
    const lines = [output.complete ? "Concept chain: complete" : "Concept chain: INCOMPLETE"];
    for (const s of output.trace.chain) {
      lines.push(`  ${s.step.padEnd(20)} ${(s.source || "(none)").padEnd(46)} ${s.score.toFixed(2)}`);
      if (s.value) lines.push(`      ${s.value.slice(0, 96)}`);
    }
    for (const c of output.trace.conflicts) {
      lines.push(`  ! ${c.step}: ${c.decided_by} — ${c.rationale.slice(0, 90)}`);
    }
    return lines.join("\n");
  }
}
