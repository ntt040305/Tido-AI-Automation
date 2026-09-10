import { ConceptQualityGate } from "./ConceptQualityGate";
import { CreativeConceptGenerator } from "./CreativeConceptGenerator";
import { CreativeDiversityController } from "./CreativeDiversityController";
import { ConceptGenerationOutput } from "./concept-generation.types";
import { CONCEPT_LEAD_DOMAINS, CONCEPT_LEAD_PRIORITY } from "./concept-validation.types";
import {
  ConceptCriterionScore,
  ConceptEvaluation,
  ConceptGenerationResult,
  CreativeConcept,
  CreativeConceptTrace,
  EMOTIONAL_DEPTH_MARKERS,
  GENERIC_MARKERS,
  TECHNICAL_LEAK_MARKERS,
} from "./creative-concept.types";
import { ReasoningKnowledgeRetriever } from "./ReasoningKnowledgeRetriever";
import {
  ReasoningKnowledgeObject,
  ReasoningRetrievalQuery,
  ScoredReasoningKnowledge,
} from "./reasoning-knowledge.types";

/**
 * Creative Concept Engine.
 *
 * Synthesises retrieved reasoning knowledge into one campaign-level idea, then
 * grades it and is willing to reject it.
 *
 * Deterministic, like the decision engine before it. A concept assembled by rule
 * from real knowledge is explainable field by field and testable across runs; an
 * LLM-authored one is neither, and this layer's job is to be inspectable. The
 * seam for model-assisted phrasing is `ConceptSynthesisOverrides` — a later phase
 * can supply better wording without changing what the concept is derived FROM,
 * which is the part that must stay traceable.
 *
 * Two hard rules, both enforced by test:
 *   1. No technical instruction may appear in a concept. Camera and light are
 *      decisions, and decisions are downstream where the resolver can weigh them.
 *   2. Nothing here reaches the image model. The concept steers which decisions
 *      are taken; the decisions travel the existing art direction flow.
 */

/** Optional externally-authored phrasing. Sources and scoring stay derived. */
export interface ConceptSynthesisOverrides {
  big_idea?: string;
  concept_name?: string;
  core_message?: string;
}

const STRATEGIC_DOMAINS = new Set(["strategy", "audience", "category", "concept", "differentiation"]);
const WORLD_DOMAINS = new Set(["visual_direction", "layout", "color"]);

/**
 * Domains whose decisions are technical execution, excluded from concept text.
 *
 * Phase 2.1 split `camera` and `lighting` out of `photography`. This set was not
 * updated with them, so lens and lighting decisions began arriving in
 * `execution_direction` and carried technical vocabulary into the concept — the
 * exact leak the layer separation test exists to catch. Splitting a domain means
 * revisiting every set that named its parent.
 */
const TECHNICAL_DOMAINS = new Set([
  "photography",
  "camera",
  "lighting",
  "material",
  "production",
  "typography",
]);

function asArray(v: unknown): string[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
}

function sentenceCase(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
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
  return sentenceCase(String(decision || "").replace(/\.$/, "").trim());
}

/** knowledge_id that supplied a given concept field, from the source notes. */
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

export class CreativeConceptEngine {
  // ── Synthesis ─────────────────────────────────────────────────────────

  private static pickStrategic(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge[] {
    return retrieved.filter((r) => STRATEGIC_DOMAINS.has(String(r.object.domain)));
  }

  /**
   * Chooses the object the big idea is built from.
   *
   * Score alone picks the wrong lead. A differentiation object says what NOT to
   * do, and an anti_pattern is an avoidance rule; either can outscore a strategy
   * object and turn the campaign's central thought into a prohibition. The lead is
   * therefore chosen by what a domain is FOR, and only ranked by score within that.
   * Differentiation still shapes the concept — through `differentiation` and
   * `avoid_direction`, which is where a rejection belongs.
   */
  private static pickLead(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge | undefined {
    // A `framework` or `principle` describes HOW to build a concept; an
    // `anti_pattern` describes what to avoid. None of the three is a campaign
    // idea, and letting one lead produced the same big idea for a skincare launch
    // and a fashion social ad — methodology restated as creative.
    const eligible = (r: ScoredReasoningKnowledge) =>
      !["anti_pattern", "framework", "principle", "evaluation_rule", "production_rule"].includes(
        String(r.object.knowledge_type)
      );

    // Phase 4.0 — walk the concept-lead priority rather than a fixed triple. A
    // human tension is a better origin for a campaign idea than a strategy rule,
    // and the priority order is stated once in concept-validation.types.
    for (const domain of CONCEPT_LEAD_PRIORITY) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }

    // Phase 3.1.8.1. This function used to end with
    //
    //     ... || retrieved.filter(eligible)[0] || retrieved[0];
    //
    // Two fallbacks that accepted ANY domain. Measured across the thirty
    // benchmark cases, they made the campaign's central thought a layout rule
    // twenty times out of thirty — "the subject within the upper 65 percent and
    // reserve the lower 35 percent for platform interface" as a big idea — and
    // only four ideas came from `strategy` at all.
    //
    // The lead is now confined to domains that answer "why should anyone care".
    // When none was retrieved there is no idea to have, and the engine says so
    // rather than promoting an execution decision into the concept layer. An
    // absent idea is a corpus gap that shows up as one; a fabricated idea is a
    // corpus gap that hides.
    const leadable = retrieved.filter(
      (r) => CONCEPT_LEAD_DOMAINS.has(String(r.object.domain)) && eligible(r)
    );
    return leadable[0];
  }

  private static pickWorld(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge[] {
    return retrieved.filter((r) => WORLD_DOMAINS.has(String(r.object.domain)));
  }

  /**
   * Names the concept from its own idea.
   *
   * Takes the most substantive words of the big idea rather than inventing a
   * label, so the name and the idea cannot drift apart.
   */
  private static nameFrom(bigIdea: string, brand?: string): string {
    const stop = new Set([
      "the", "a", "an", "of", "and", "or", "to", "for", "with", "without", "than",
      "rather", "instead", "not", "that", "this", "is", "are", "it", "its", "in",
      "on", "as", "by", "be", "but", "into", "from", "their", "her", "his",
    ]);
    const words = bigIdea
      .toLowerCase()
      .replace(/[^a-z0-9\sÀ-ỹ]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w));
    const core = words.slice(0, 4).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    return brand ? `${brand} — ${core}` : core || "Untitled Concept";
  }

  /**
   * Builds the concept.
   *
   * Every field names the knowledge object it came from, so a weak concept can be
   * traced to weak knowledge rather than blamed on the synthesis.
   */
  public static synthesise(
    retrieved: ScoredReasoningKnowledge[],
    query: ReasoningRetrievalQuery,
    overrides: ConceptSynthesisOverrides = {},
    brand?: string,
    briefText?: string,
    synthesisContext: {
      diversity?: CreativeDiversityController;
      brand_objective?: string;
      audience?: string;
      differentiation?: string;
      avoid?: string[];
    } = {}
  ): {
    concept: CreativeConcept;
    sources: CreativeConceptTrace["concept_sources"];
    warnings: string[];
    generation?: ConceptGenerationOutput;
  } {
    const warnings: string[] = [];
    const sources: CreativeConceptTrace["concept_sources"] = [];
    const note = (field: keyof CreativeConcept, id: string | null, derivation: string) =>
      sources.push({ field, knowledge_id: id, derivation });

    const strategic = this.pickStrategic(retrieved);
    const world = this.pickWorld(retrieved);
    const lead = this.pickLead(retrieved);

    if (!lead) {
      warnings.push("NO_KNOWLEDGE_FOR_CONCEPT: nothing retrieved; concept cannot be grounded.");
    }
    if (strategic.length === 0 && retrieved.length > 0) {
      warnings.push(
        "NO_STRATEGIC_KNOWLEDGE: concept synthesised from execution knowledge only. Expect weak insight and tension."
      );
    }

    const leadObj: ReasoningKnowledgeObject | undefined = lead?.object;

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
      briefText || [query.industry, query.category, query.audience, query.objective].filter(Boolean).join(" "),
      synthesisContext
    );
    const core = generation.concept;
    warnings.push(...generation.trace.warnings);
    const chainSource = (step: string) =>
      generation.trace.chain.find((c) => c.step === step)?.source ?? null;

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
      core.consumer_insight ||
      pattern?.consumer_insight ||
      leadObj?.human_insight?.emotional_need ||
      leadObj?.why_this_works ||
      "";
    note("consumer_insight", core.consumer_insight ? chainSource("consumer_insight") : leadObj?.knowledge_id ?? null,
      core.consumer_insight ? "chain.consumer_insight" : pattern ? "concept_pattern.consumer_insight" : "why_this_works");

    const chainTension = generation.trace.chain.find((c) => c.step === "human_tension")?.value || "";
    const audience_tension = chainTension || pattern?.human_tension || leadObj?.problem || "";
    note("audience_tension", chainTension ? chainSource("human_tension") : leadObj?.knowledge_id ?? null,
      chainTension ? "chain.human_tension" : pattern ? "concept_pattern.human_tension" : "problem");

    const emotional_goal =
      core.emotional_trigger ||
      pattern?.emotional_trigger ||
      leadObj?.human_insight?.social_need ||
      leadObj?.impact ||
      "";
    note("emotional_goal", leadObj?.knowledge_id ?? null,
      pattern ? "concept_pattern.emotional_trigger" : leadObj?.human_insight ? "human_insight.social_need" : "impact");

    const brand_role = leadObj?.human_insight?.functional_need
      ? `Enable the practical outcome — ${leadObj.human_insight.functional_need.toLowerCase()} — while carrying the emotional weight above.`
      : "Enable the outcome the audience already wants, without claiming credit for it.";
    note("brand_role", leadObj?.knowledge_id ?? null, "human_insight.functional_need");

    // ── The idea ──
    const big_idea = overrides.big_idea || generation.synthesis?.big_idea || core.big_idea || (leadObj ? toIdea(leadObj.decision) : "");
    note("big_idea",
      overrides.big_idea ? null : core.big_idea ? chainSource("big_idea") : leadObj?.knowledge_id ?? null,
      overrides.big_idea ? "override" : core.big_idea ? "chain.big_idea" : "decision");

    const concept_name = overrides.concept_name || this.nameFrom(big_idea, brand);
    note("concept_name", null, overrides.concept_name ? "override" : "derived from big_idea");

    const core_message = overrides.core_message || leadObj?.impact || big_idea;
    note("core_message", overrides.core_message ? null : leadObj?.knowledge_id ?? null, overrides.core_message ? "override" : "impact");

    const story_angle = leadObj?.reasoning || "";
    note("story_angle", leadObj?.knowledge_id ?? null, "reasoning");

    // ── Differentiation, drawn from what the category already does ──
    //
    // Anti-patterns are collected from concept-bearing domains only. A layout
    // anti-pattern's `replacement` is a layout instruction, so drawing
    // differentiation from one produced "in favour of the subject within the
    // upper 65 percent" — the same contamination as the big idea, one field
    // over, and it survived the first pass of this repair because only the lead
    // had been confined. Any field built from retrieved text needs the same
    // domain restriction, not just the one that was noticed first.
    const conceptual = retrieved.filter((r) => CONCEPT_LEAD_DOMAINS.has(String(r.object.domain)));
    const allAntiPatterns = (conceptual.length ? conceptual : []).flatMap((r) =>
      (r.object.anti_patterns || []).map((ap) => ({ id: r.object.knowledge_id, ap }))
    );
    const differentiation = allAntiPatterns.length
      ? `Rejects the category default — ${allAntiPatterns[0].ap.problem.toLowerCase()} — in favour of ${allAntiPatterns[0].ap.replacement.toLowerCase()}.`
      : "";
    note("differentiation", allAntiPatterns[0]?.id ?? null, allAntiPatterns.length ? "anti_patterns[0]" : "none available");
    if (!allAntiPatterns.length) {
      warnings.push("NO_ANTI_PATTERNS: no category clichés known, so differentiation is unproven.");
    }

    const creative_hook = allAntiPatterns.length
      ? `Show what the category never shows: ${allAntiPatterns[0].ap.replacement.toLowerCase()}.`
      : big_idea;
    note("creative_hook", allAntiPatterns[0]?.id ?? null, "anti_patterns[0].replacement");

    // ── The world: emotional, never technical ──
    const worldSource = world[0];
    const visual_world = worldSource
      ? sentenceCase(toIdea(worldSource.object.decision))
      : leadObj?.human_insight?.emotional_need
      ? `A world built around ${leadObj.human_insight.emotional_need.toLowerCase()}.`
      : "";
    note("visual_world", worldSource?.object.knowledge_id ?? null, worldSource ? "visual/world domain decision" : "derived from emotional need");

    // Execution direction stays at direction level: technical domains excluded so
    // no lens or lighting instruction can be smuggled into the concept.
    const execution_direction = retrieved
      .filter((r) => !TECHNICAL_DOMAINS.has(String(r.object.domain)))
      .filter((r) => r !== lead)
      // A differentiation object's decision is a prohibition ("reject the four
      // saturated beauty defaults - water splash, floating petals..."). Placed in
      // execution_direction it becomes positive concept text that quotes the very
      // cliches it exists to reject, which the genericness scan then counts
      // against the concept. Prohibitions belong in avoid_direction, where they
      // already are.
      .filter((r) => String(r.object.domain) !== "differentiation")
      .filter((r) => String(r.object.knowledge_type) !== "anti_pattern")
      .filter((r) => !/^(reject|avoid|do not|never)\b/i.test((r.object.decision || "").trim()))
      .map((r) => sentenceCase(toIdea(r.object.decision)))
      .slice(0, 4);
    note("execution_direction", null, "positive non-technical decisions only; prohibitions routed to avoid_direction");

    const avoid_direction = [
      ...allAntiPatterns.map(({ ap }) => ap.problem),
      ...retrieved.flatMap((r) => asArray(r.object.avoid_when)),
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6);
    note("avoid_direction", null, "anti_patterns + avoid_when");

    const derived_from = retrieved.map((r) => r.object.knowledge_id);
    const confidence = retrieved.length
      ? Number((retrieved.reduce((s, r) => s + (r.object.confidence ?? 0.5), 0) / retrieved.length).toFixed(3))
      : 0;
    const score = retrieved.length
      ? Number((retrieved.reduce((s, r) => s + r.score, 0) / retrieved.length).toFixed(4))
      : 0;

    return {
      concept: {
        big_idea,
        concept_name,
        core_message,
        emotional_goal,
        audience_tension,
        consumer_insight,
        brand_role,
        story_angle,
        visual_world,
        creative_hook,
        differentiation,
        execution_direction,
        avoid_direction,
        derived_from,
        confidence,
        score,
      },
      sources,
      warnings,
    };
  }

  // ── Evaluation ────────────────────────────────────────────────────────

  /**
   * The concept's POSITIVE text — what the campaign is, not what it rejects.
   *
   * `differentiation` quotes the category cliche in order to reject it, and
   * `avoid_direction` exists to name clichés outright. Scanning either for
   * clichés penalises exactly the concepts that did the differentiating work, so
   * genericness is measured on what the campaign proposes.
   */
  private static positiveProse(c: CreativeConcept): string {
    return [
      c.big_idea, c.concept_name, c.core_message, c.emotional_goal, c.audience_tension,
      c.consumer_insight, c.brand_role, c.story_angle, c.visual_world, c.creative_hook,
      ...c.execution_direction,
    ].join(" | ");
  }

  /** Everything narrative, including stated differentiation. Depth and leak checks. */
  private static conceptProse(c: CreativeConcept): string {
    return [this.positiveProse(c), c.differentiation].join(" | ");
  }

  /**
   * Grades the concept on four criteria and decides whether it survives.
   *
   * Genericness is scored so that HIGHER IS WORSE, then inverted for the overall.
   * Keeping it in its natural direction means the number reads the way a creative
   * director would say it out loud.
   */
  public static evaluate(
    concept: CreativeConcept,
    retrieved: ScoredReasoningKnowledge[],
    query: ReasoningRetrievalQuery
  ): ConceptEvaluation {
    const positive = this.positiveProse(concept).toLowerCase();
    const prose = this.conceptProse(concept).toLowerCase();
    const scores: ConceptCriterionScore[] = [];
    const rejection_reasons: string[] = [];

    // ── Genericness (higher = worse) ──
    const markerHits = GENERIC_MARKERS.filter((m) => positive.includes(m));
    const knownCliches = retrieved.flatMap((r) => (r.object.anti_patterns || []).map((ap) => ap.problem));
    // A cliché the campaign is supposed to reject appearing in the concept's own
    // positive text is the strongest possible generic signal.
    // Scattered-word overlap was workable against a dozen objects and produced
    // false positives as soon as the corpus reached a hundred: with twelve
    // objects retrieved, the positive prose is long enough that six unrelated
    // words from a cliche appear somewhere in it by chance. Restating a cliche
    // means reproducing its phrase, so three consecutive significant words is the
    // signal — far harder to trip accidentally and far closer to what it means to
    // actually repeat a category default.
    const clicheHits = knownCliches.filter((c) => {
      const words = c.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
      if (words.length < 3) return false;
      for (let i = 0; i + 2 < words.length; i++) {
        const phrase = words.slice(i, i + 3);
        const pattern = phrase.join("[^a-z0-9]+");
        if (new RegExp(pattern, "i").test(positive)) return true;
      }
      return false;
    });

    let genericness = 0;
    genericness += markerHits.length * 3;
    genericness += clicheHits.length * 4;
    if (!concept.big_idea || concept.big_idea.length < 25) genericness += 4;
    if (!concept.differentiation) genericness += 3;
    if (!concept.consumer_insight) genericness += 2;
    genericness = Math.min(10, genericness);

    scores.push({
      criterion: "genericness",
      score: genericness,
      finding: genericness === 0
        ? "No generic markers or known category clichés in the concept text."
        : [
            markerHits.length ? `${markerHits.length} filler phrase(s): ${markerHits.join(", ")}` : "",
            clicheHits.length ? `${clicheHits.length} category cliché(s) present: ${clicheHits.join("; ")}` : "",
            !concept.big_idea || concept.big_idea.length < 25 ? "big_idea is missing or too thin to carry a campaign" : "",
            !concept.differentiation ? "no differentiation stated" : "",
            !concept.consumer_insight ? "no consumer insight" : "",
          ].filter(Boolean).join(" · "),
      improvement: genericness > 3 ? "Replace stated qualities with a specific human situation the category ignores." : undefined,
    });

    // ── Differentiation ──
    let differentiation = 0;
    if (concept.differentiation) differentiation += 5;
    if (concept.avoid_direction.length >= 2) differentiation += 2;
    if (concept.creative_hook && concept.creative_hook !== concept.big_idea) differentiation += 2;
    if (knownCliches.length > 0) differentiation += 1;
    differentiation = Math.min(10, differentiation);
    scores.push({
      criterion: "differentiation",
      score: differentiation,
      finding: concept.differentiation
        ? `States what it rejects and why; ${concept.avoid_direction.length} territory exclusion(s) recorded.`
        : "No stated departure from the category default.",
      improvement: differentiation < 6 ? "Name the category cliché explicitly and state the replacement." : undefined,
    });

    // ── Emotional depth ──
    const depthHits = EMOTIONAL_DEPTH_MARKERS.filter((m) => prose.includes(m));
    let emotional = 0;
    if (concept.consumer_insight) emotional += 3;
    if (concept.audience_tension) emotional += 3;
    if (concept.emotional_goal) emotional += 2;
    emotional += Math.min(2, depthHits.length);
    emotional = Math.min(10, emotional);
    scores.push({
      criterion: "emotional_depth",
      score: emotional,
      finding: `insight=${concept.consumer_insight ? "yes" : "no"} · tension=${concept.audience_tension ? "yes" : "no"} · goal=${concept.emotional_goal ? "yes" : "no"} · ${depthHits.length} emotional marker(s)`,
      improvement: emotional < 6 ? "Ground the idea in a named tension the audience actually feels." : undefined,
    });

    // ── Brand fit ──
    let brandFit = 5;
    const position = query.brand_position;
    const sourcePositions = retrieved.flatMap((r) => asArray(r.object.context?.brand_position)).filter((p) => p !== "*");
    if (position && sourcePositions.includes(position)) brandFit += 3;
    if (position && sourcePositions.length === 0) brandFit -= 1;
    if (concept.brand_role) brandFit += 2;
    brandFit = Math.max(0, Math.min(10, brandFit));
    scores.push({
      criterion: "brand_fit",
      score: brandFit,
      finding: position
        ? `Brief position "${position}"; ${sourcePositions.filter((p) => p === position).length} source(s) authored for it.`
        : "No brand position resolved from the brief — fit is unverified.",
      improvement: brandFit < 6 ? "Resolve brand position from the brief, or author knowledge for this position." : undefined,
    });

    // ── Overall + hard gates ──
    const inverted = 10 - genericness;
    const overall = Number(((inverted + differentiation + emotional + brandFit) / 4).toFixed(2));

    if (genericness >= 7) rejection_reasons.push(`Concept is generic (genericness ${genericness}/10).`);
    if (differentiation <= 2) rejection_reasons.push(`Concept does not differentiate (differentiation ${differentiation}/10).`);
    if (emotional <= 2) rejection_reasons.push(`Concept has no emotional grounding (emotional_depth ${emotional}/10).`);
    if (!concept.big_idea) rejection_reasons.push("Concept has no big idea.");

    return {
      scores,
      overall,
      accepted: rejection_reasons.length === 0,
      rejection_reasons,
      cliches_detected: [...markerHits, ...clicheHits],
    };
  }

  /** Guard for rule 1: a concept must contain no technical instruction. */
  public static findTechnicalLeaks(concept: CreativeConcept): string[] {
    const prose = this.conceptProse(concept);
    return TECHNICAL_LEAK_MARKERS.filter((re) => re.test(prose)).map((re) => String(re));
  }

  // ── Pipeline ──────────────────────────────────────────────────────────

  public static generate(
    query: ReasoningRetrievalQuery,
    retriever: ReasoningKnowledgeRetriever,
    options: {
    overrides?: ConceptSynthesisOverrides;
    brand?: string;
    briefText?: string;
    /** Phase 4.0.1.5 — run-level diversity plus the brief's own strategy fields. */
    synthesis?: {
      diversity?: CreativeDiversityController;
      brand_objective?: string;
      audience?: string;
      differentiation?: string;
      avoid?: string[];
    };
  } = {}
  ): ConceptGenerationResult & { trace: CreativeConceptTrace } {
    const retrieval = retriever.retrieve(query);
    const { concept, sources, warnings, generation } = this.synthesise(
      retrieval.results,
      query,
      options.overrides || {},
      options.brand,
      options.briefText,
      options.synthesis
    );
    const evaluation = this.evaluate(concept, retrieval.results, query);

    const leaks = this.findTechnicalLeaks(concept);
    if (leaks.length) {
      warnings.push(`TECHNICAL_LEAK_IN_CONCEPT: ${leaks.length} technical marker(s) found; a concept must stay direction-level.`);
    }

    // Phase 3.1.8.1 — the concept/art-direction separation gate.
    //
    // `findTechnicalLeaks` above only ever warned, and its marker list covered
    // lenses and apertures but not frame percentages, so twenty of thirty
    // benchmark concepts passed it while being layout rules. This gate rejects
    // rather than annotates, and it checks the lead's domain as well as the
    // wording — a concept built from a layout object is wrong at the root even
    // when its sentence happens to carry no numbers.
    // The lead's domain is read back from the trace rather than re-picked, so the
    // gate judges the object the concept was actually built from.
    const leadId = sources.find((x) => x.field === "big_idea")?.knowledge_id || undefined;
    const leadDomain = leadId ? leadId.split(".")[0] : undefined;
    const separation = ConceptQualityGate.validate(concept, leadDomain);
    if (!separation.valid) {
      for (const v of separation.violations.slice(0, 4)) {
        warnings.push(`CONCEPT_SEPARATION(${v.kind}): ${v.reason}${v.evidence ? ` — "${v.evidence}"` : ""}`);
      }
    }

    // Phase 4.0 Task 4 — the chain a planner walks, recorded so a weak concept
    // can be traced to the step that failed rather than blamed on synthesis.
    // Read from the generator's own chain where one was produced, so the trace
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
    };

    const trace: CreativeConceptTrace = {
      brief_query: query,
      reasoning_chain,
      retrieved: retrieval.results.map((r) => ({
        knowledge_id: r.object.knowledge_id,
        domain: String(r.object.domain),
        score: r.score,
        context_relevance: r.context_relevance,
      })),
      concept_sources: sources,
      concept,
      evaluation,
      warnings: [...retrieval.warnings, ...warnings],
    };

    return { concept, evaluation, separation, warnings: trace.warnings, trace };
  }
}
