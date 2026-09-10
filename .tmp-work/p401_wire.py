# -*- coding: utf-8 -*-
"""Phase 4.0.1 — drive the concept from the chain rather than from one lead."""
import io

p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

# 1. synthesise takes the brief text so the human-problem signal has something
#    to measure against.
OLD_SIG = '''  public static synthesise(
    retrieved: ScoredReasoningKnowledge[],
    query: ReasoningRetrievalQuery,
    overrides: ConceptSynthesisOverrides = {},
    brand?: string
  ): { concept: CreativeConcept; sources: CreativeConceptTrace["concept_sources"]; warnings: string[] } {'''
NEW_SIG = '''  public static synthesise(
    retrieved: ScoredReasoningKnowledge[],
    query: ReasoningRetrievalQuery,
    overrides: ConceptSynthesisOverrides = {},
    brand?: string,
    briefText?: string
  ): {
    concept: CreativeConcept;
    sources: CreativeConceptTrace["concept_sources"];
    warnings: string[];
    generation?: ConceptGenerationOutput;
  } {'''
assert OLD_SIG in s, "synthesise signature anchor missing"
s = s.replace(OLD_SIG, NEW_SIG)

# 2. Run the generator first; it supplies the concept core.
OLD_LEAD = '''    const leadObj: ReasoningKnowledgeObject | undefined = lead?.object;'''
NEW_LEAD = '''    const leadObj: ReasoningKnowledgeObject | undefined = lead?.object;

    // Phase 4.0.1 — the chain, walked properly.
    //
    // Every field below used to derive from `leadObj`, which made the four-step
    // trace a description of a one-step derivation. The generator selects an
    // object per step, so the tension, the insight, the territory and the idea
    // can come from different places — which is what stops thirty briefs
    // producing the same handful of ideas.
    const generation = CreativeConceptGenerator.generate(
      retrieved,
      query,
      briefText || [query.industry, query.category, query.audience, query.objective].filter(Boolean).join(" ")
    );
    const core = generation.concept;
    warnings.push(...generation.trace.warnings);
    const chainSource = (step: string) =>
      generation.trace.chain.find((c) => c.step === step)?.source ?? null;'''
assert OLD_LEAD in s, "leadObj anchor missing"
s = s.replace(OLD_LEAD, NEW_LEAD)

# 3. Fields now prefer the chain, falling back to the previous derivation.
s = s.replace('''    const consumer_insight =
      pattern?.consumer_insight ||
      leadObj?.human_insight?.emotional_need ||
      leadObj?.why_this_works ||
      "";
    note("consumer_insight", leadObj?.knowledge_id ?? null,
      pattern ? "concept_pattern.consumer_insight" : leadObj?.human_insight ? "human_insight.emotional_need" : "why_this_works");''',
'''    const consumer_insight =
      core.consumer_insight ||
      pattern?.consumer_insight ||
      leadObj?.human_insight?.emotional_need ||
      leadObj?.why_this_works ||
      "";
    note("consumer_insight", core.consumer_insight ? chainSource("consumer_insight") : leadObj?.knowledge_id ?? null,
      core.consumer_insight ? "chain.consumer_insight" : pattern ? "concept_pattern.consumer_insight" : "why_this_works");''')

s = s.replace('''    const audience_tension = pattern?.human_tension || leadObj?.problem || "";
    note("audience_tension", leadObj?.knowledge_id ?? null, pattern ? "concept_pattern.human_tension" : "problem");''',
'''    const chainTension = generation.trace.chain.find((c) => c.step === "human_tension")?.value || "";
    const audience_tension = chainTension || pattern?.human_tension || leadObj?.problem || "";
    note("audience_tension", chainTension ? chainSource("human_tension") : leadObj?.knowledge_id ?? null,
      chainTension ? "chain.human_tension" : pattern ? "concept_pattern.human_tension" : "problem");''')

s = s.replace('''    const emotional_goal =
      pattern?.emotional_trigger ||
      leadObj?.human_insight?.social_need ||
      leadObj?.impact ||
      "";''',
'''    const emotional_goal =
      core.emotional_trigger ||
      pattern?.emotional_trigger ||
      leadObj?.human_insight?.social_need ||
      leadObj?.impact ||
      "";''')

s = s.replace('''    const big_idea = overrides.big_idea || (leadObj ? toIdea(leadObj.decision) : "");
    note("big_idea", overrides.big_idea ? null : leadObj?.knowledge_id ?? null, overrides.big_idea ? "override" : "decision");''',
'''    const big_idea = overrides.big_idea || core.big_idea || (leadObj ? toIdea(leadObj.decision) : "");
    note("big_idea",
      overrides.big_idea ? null : core.big_idea ? chainSource("big_idea") : leadObj?.knowledge_id ?? null,
      overrides.big_idea ? "override" : core.big_idea ? "chain.big_idea" : "decision");''')

# 4. Return the generation output.
s = s.replace('''    return { concept, sources, warnings };''',
              '''    return { concept, sources, warnings, generation };''')

# 5. generate() passes the brief text through and records the real chain.
s = s.replace('''    const { concept, sources, warnings } = this.synthesise(
      retrieval.results,
      query,
      options.overrides || {},
      options.brand
    );''',
'''    const { concept, sources, warnings, generation } = this.synthesise(
      retrieval.results,
      query,
      options.overrides || {},
      options.brand,
      options.briefText
    );''')

s = s.replace('''    const reasoning_chain = {
      human_tension: { value: concept.audience_tension, source: leadIdOf(sources, "audience_tension") },
      consumer_insight: { value: concept.consumer_insight, source: leadIdOf(sources, "consumer_insight") },
      campaign_territory: { value: territoryOf(retrieval.results), source: territorySourceOf(retrieval.results) },
      big_idea: { value: concept.big_idea, source: leadIdOf(sources, "big_idea") },
    };''',
'''    // Read from the generator's own chain where one was produced, so the trace
    // reports the selections that were actually made rather than a reconstruction.
    const step = (id: string) => generation?.trace.chain.find((c) => c.step === id);
    const reasoning_chain = {
      human_tension: {
        value: step("human_tension")?.value || concept.audience_tension,
        source: step("human_tension")?.source ?? leadIdOf(sources, "audience_tension"),
      },
      consumer_insight: {
        value: step("consumer_insight")?.value || concept.consumer_insight,
        source: step("consumer_insight")?.source ?? leadIdOf(sources, "consumer_insight"),
      },
      campaign_territory: {
        value: step("campaign_territory")?.value || territoryOf(retrieval.results),
        source: step("campaign_territory")?.source ?? territorySourceOf(retrieval.results),
      },
      big_idea: {
        value: step("big_idea")?.value || concept.big_idea,
        source: step("big_idea")?.source ?? leadIdOf(sources, "big_idea"),
      },
    };''')

# 6. Options and imports.
s = s.replace('''  options: { overrides?: ConceptSynthesisOverrides; brand?: string } = {}''',
              '''  options: { overrides?: ConceptSynthesisOverrides; brand?: string; briefText?: string } = {}''')
s = s.replace('import { ConceptQualityGate } from "./ConceptQualityGate";',
              'import { ConceptQualityGate } from "./ConceptQualityGate";\n'
              'import { CreativeConceptGenerator } from "./CreativeConceptGenerator";\n'
              'import { ConceptGenerationOutput } from "./concept-generation.types";')

io.open(p, "w", encoding="utf-8").write(s)
print("generator wired into synthesise")
