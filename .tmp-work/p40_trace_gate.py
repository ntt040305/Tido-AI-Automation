# -*- coding: utf-8 -*-
"""Phase 4.0 Tasks 4-5 — concept reasoning chain and the four-element gate."""
import io

# ── Task 4: draw the human layer from the concept pattern, and record the chain ──
p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''    const leadObj: ReasoningKnowledgeObject | undefined = lead?.object;

    // ── Human layer ──
    const consumer_insight =
      leadObj?.human_insight?.emotional_need ||
      leadObj?.why_this_works ||
      "";
    note("consumer_insight", leadObj?.knowledge_id ?? null, leadObj?.human_insight ? "human_insight.emotional_need" : "why_this_works");

    const audience_tension = leadObj?.problem || "";
    note("audience_tension", leadObj?.knowledge_id ?? null, "problem");

    const emotional_goal =
      leadObj?.human_insight?.social_need ||
      leadObj?.impact ||
      "";
    note("emotional_goal", leadObj?.knowledge_id ?? null, leadObj?.human_insight ? "human_insight.social_need" : "impact");'''

NEW = '''    const leadObj: ReasoningKnowledgeObject | undefined = lead?.object;

    // Phase 4.0 — a creative_concept_pattern carries the human layer explicitly,
    // in fields authored for it. Before these existed the engine reverse-engineered
    // an insight from `why_this_works` and a tension from `problem`, which is why
    // the insight so often read as a rationale rather than as an observation about
    // a person. Fall back to the old derivation when the lead is not a pattern.
    const pattern =
      (leadObj?.domain_profile as { kind?: string } | undefined)?.kind === "creative_concept_pattern"
        ? (leadObj!.domain_profile as unknown as {
            human_tension: string;
            consumer_insight: string;
            emotional_trigger: string;
            belief_shift: string;
            campaign_territory: string;
          })
        : undefined;

    // ── Human layer ──
    const consumer_insight =
      pattern?.consumer_insight ||
      leadObj?.human_insight?.emotional_need ||
      leadObj?.why_this_works ||
      "";
    note("consumer_insight", leadObj?.knowledge_id ?? null,
      pattern ? "concept_pattern.consumer_insight" : leadObj?.human_insight ? "human_insight.emotional_need" : "why_this_works");

    const audience_tension = pattern?.human_tension || leadObj?.problem || "";
    note("audience_tension", leadObj?.knowledge_id ?? null, pattern ? "concept_pattern.human_tension" : "problem");

    const emotional_goal =
      pattern?.emotional_trigger ||
      leadObj?.human_insight?.social_need ||
      leadObj?.impact ||
      "";
    note("emotional_goal", leadObj?.knowledge_id ?? null,
      pattern ? "concept_pattern.emotional_trigger" : leadObj?.human_insight ? "human_insight.social_need" : "impact");'''
assert OLD in s, "human layer anchor missing"
s = s.replace(OLD, NEW)

# The visual world should prefer the campaign territory when one exists.
OLD_W = '''    note("visual_world"'''
NEW_W = '''    note("visual_world"'''
# (left as-is; territory is recorded on the chain below rather than overwriting
#  visual_world, which is an art direction field and must stay one.)

# Record the chain on the trace.
OLD_T = '''    const trace: CreativeConceptTrace = {
      brief_query: query,'''
NEW_T = '''    // Phase 4.0 Task 4 — the chain a planner walks, recorded so a weak concept
    // can be traced to the step that failed rather than blamed on synthesis.
    const reasoning_chain = {
      human_tension: { value: conceptResult.concept.audience_tension, source: leadIdOf(sources, "audience_tension") },
      consumer_insight: { value: conceptResult.concept.consumer_insight, source: leadIdOf(sources, "consumer_insight") },
      campaign_territory: { value: territoryOf(retrieval.results), source: territorySourceOf(retrieval.results) },
      big_idea: { value: conceptResult.concept.big_idea, source: leadIdOf(sources, "big_idea") },
    };

    const trace: CreativeConceptTrace = {
      brief_query: query,
      reasoning_chain,'''
assert OLD_T in s, "trace anchor missing"
s = s.replace(OLD_T, NEW_T)

# Helpers.
OLD_H = '''export class CreativeConceptEngine {'''
NEW_H = '''/** knowledge_id that supplied a given concept field, from the source notes. */
function leadIdOf(
  sources: { field: string; knowledge_id: string | null }[],
  field: string
): string | null {
  return sources.find((s) => s.field === field)?.knowledge_id ?? null;
}

/** The campaign territory available to this brief, if any was retrieved. */
function territoryOf(retrieved: ScoredReasoningKnowledge[]): string {
  const hit = retrieved.find(
    (r) => (r.object.domain_profile as { kind?: string; campaign_territory?: string } | undefined)?.campaign_territory
  );
  return (hit?.object.domain_profile as { campaign_territory?: string } | undefined)?.campaign_territory || "";
}

function territorySourceOf(retrieved: ScoredReasoningKnowledge[]): string | null {
  const hit = retrieved.find(
    (r) => (r.object.domain_profile as { campaign_territory?: string } | undefined)?.campaign_territory
  );
  return hit?.object.knowledge_id ?? null;
}

export class CreativeConceptEngine {'''
assert OLD_H in s, "class anchor missing"
s = s.replace(OLD_H, NEW_H, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("Task 4: reasoning chain recorded")

# ── Trace type ──────────────────────────────────────────────────────────
p = "lib/image-engine/reasoning/creative-concept.types.ts"
s = io.open(p, encoding="utf-8").read()
OLD_TT = '''export interface CreativeConceptTrace {
  brief_query: ReasoningRetrievalQuery;'''
NEW_TT = '''/**
 * Phase 4.0 — the four steps a planner walks, each with its source.
 *
 * Recorded so a weak concept can be traced to the step that failed. Before this
 * existed the only diagnostic was the finished concept, which made "the idea is
 * poor" and "no tension was retrieved" indistinguishable.
 */
export interface ConceptReasoningChain {
  human_tension: { value: string; source: string | null };
  consumer_insight: { value: string; source: string | null };
  campaign_territory: { value: string; source: string | null };
  big_idea: { value: string; source: string | null };
}

export interface CreativeConceptTrace {
  brief_query: ReasoningRetrievalQuery;
  /** Phase 4.0 — tension → insight → territory → big idea. */
  reasoning_chain?: ConceptReasoningChain;'''
assert OLD_TT in s, "trace type anchor missing"
s = s.replace(OLD_TT, NEW_TT)
io.open(p, "w", encoding="utf-8").write(s)
print("Task 4: trace type extended")

# ── Task 5: the gate requires the four elements ─────────────────────────
p = "lib/image-engine/reasoning/concept-validation.types.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace('''  /** No idea was produced at all. */
  | "MISSING_BIG_IDEA";''', '''  /** No idea was produced at all. */
  | "MISSING_BIG_IDEA"
  /**
   * Phase 4.0 — a required element of a complete concept is absent.
   *
   * A valid concept needs a tension, an insight, an emotional direction and a
   * differentiation. Before Phase 4.0 the corpus could not supply the first
   * three, so requiring them would have rejected everything; the Creative
   * Concept Intelligence layer is what makes the requirement enforceable.
   */
  | "INCOMPLETE_CONCEPT";''')
io.open(p, "w", encoding="utf-8").write(s)
print("Task 5: violation kind added")
