# -*- coding: utf-8 -*-
"""Phase 4.0.1.5 — the big idea comes from synthesis, not from a decision field."""
import io

p = "lib/image-engine/reasoning/CreativeConceptGenerator.ts"
s = io.open(p, encoding="utf-8").read()

# 1. Imports and options.
s = s.replace('import { ConceptConflictResolver } from "./ConceptConflictResolver";',
'''import { ConceptConflictResolver } from "./ConceptConflictResolver";
import { CreativeCombinationEngine } from "./CreativeCombinationEngine";
import { CreativeDiversityController } from "./CreativeDiversityController";
import { OriginalityEvaluator } from "./OriginalityEvaluator";''')
s = s.replace('} from "./concept-generation.types";',
'''} from "./concept-generation.types";
import {
  CampaignAngle,
  CreativeSynthesisInput,
  CreativeSynthesisOutput,
  OriginalityAssessment,
} from "./creative-synthesis.types";''')

# 2. generate() accepts the synthesis context and the run-level diversity state.
OLD_SIG = '''  public static generate(
    candidates: ConceptCandidate[],
    query: ReasoningRetrievalQuery,
    briefText: string
  ): ConceptGenerationOutput {'''
NEW_SIG = '''  public static generate(
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
  ): ConceptGenerationOutput {'''
assert OLD_SIG in s, "generate signature anchor missing"
s = s.replace(OLD_SIG, NEW_SIG)

# 3. After the chain is built, synthesise the idea rather than lifting a decision.
OLD_CORE = '''    const concept: ConceptCore = {
      big_idea: stepValue("big_idea"),'''
NEW_CORE = '''    // ── Phase 4.0.1.5 — synthesis ─────────────────────────────────────
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
      big_idea: synthesised?.big_idea || stepValue("big_idea"),'''
assert OLD_CORE in s, "concept core anchor missing"
s = s.replace(OLD_CORE, NEW_CORE)

# 4. Return the synthesis alongside the concept.
s = s.replace('''    return { concept, trace: { query, chain, conflicts, scores: allScores, warnings }, complete };''',
'''    return {
      concept,
      synthesis: synthesised,
      originality,
      trace: { query, chain, conflicts, scores: allScores, warnings },
      complete,
    };''')

io.open(p, "w", encoding="utf-8").write(s)
print("synthesis wired into the generator")

# 5. Output type carries the synthesis.
p = "lib/image-engine/reasoning/concept-generation.types.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace('''export interface ConceptGenerationOutput {
  concept: ConceptCore;''',
'''export interface ConceptGenerationOutput {
  concept: ConceptCore;
  /**
   * Phase 4.0.1.5 — the composed idea and its reasoning.
   *
   * Absent when the material supported no composition, in which case `concept`
   * falls back to the retrieved decision and says so in the trace warnings.
   */
  synthesis?: import("./creative-synthesis.types").CreativeSynthesisOutput;
  originality?: import("./creative-synthesis.types").OriginalityAssessment;''')
io.open(p, "w", encoding="utf-8").write(s)
print("output type extended")
