import { ArtDirectionDimension } from "../service/ArtDirectionResolverService";
import { CreativeConcept } from "./creative-concept.types";
import { CreativeDirection } from "../service/CreativeKnowledgeService";
import {
  CreativeDecision,
  CreativeDecisionSet,
  CreativeDecisionTrace,
  DecisionTarget,
  SupersededDecision,
  UnmappedDecision,
} from "./creative-decision.types";
import { ReasoningKnowledgeRetriever } from "./ReasoningKnowledgeRetriever";
import {
  AntiPattern,
  CreativeStage,
  DirectionSlot,
  ReasoningKnowledgeObject,
  ReasoningRetrievalQuery,
  ScoredReasoningKnowledge,
} from "./reasoning-knowledge.types";

/**
 * Reasoning-to-Decision transformation.
 *
 * Retrieved knowledge is situational advice; the resolver needs a single value per
 * visual dimension. This layer performs that conversion and nothing else — it does
 * not retrieve, does not score knowledge, and does not resolve conflicts between
 * tiers. Those jobs already belong to ReasoningKnowledgeRetriever and
 * ArtDirectionResolverService respectively, and duplicating either would create a
 * second source of truth for the same decision.
 *
 * Deterministic by design. Every mapping below is a rule, not a model call, so a
 * decision can be explained exactly and a test can assert it. LLM-assisted
 * synthesis belongs at the reasoning stages that produce concepts, not at the
 * mechanical step that routes a decision to a dimension.
 *
 * Governance §1 is enforced structurally: only `decision` text is ever placed on
 * the CreativeDirection handed to the resolver. Every other field of a knowledge
 * object stays inside the trace.
 */

/**
 * Which CreativeDirection slot each art direction dimension fills.
 *
 * Phase 3.1.6 replaced a whitelist of "dimensions the KNOWLEDGE tier can reach"
 * with this map. The whitelist answered a yes/no question and left the follow-up
 * — which field does it land in? — restated separately in `toCreativeDirection`,
 * so `materials` passed the whitelist test in one place and had nowhere to go in
 * the other. Now a dimension is reachable exactly when it has a slot here.
 *
 * `environment` is deliberately absent: it has no CreativeDirection field, and
 * environment decisions are still recorded as unmapped rather than dropped.
 */
const DIMENSION_SLOT: Partial<Record<ArtDirectionDimension, DirectionSlot>> = {
  camera: "camera_direction",
  lighting: "lighting_direction",
  composition: "composition_strategy",
  colour: "color_strategy",
  atmosphere: "visual_style",
  materials: "material_direction",
  typography: "typography_strategy",
};

const STRATEGY_DOMAINS = new Set(["strategy", "audience", "category", "concept", "differentiation"]);
/**
 * Reasoning-time domains with no visual destination.
 *
 * `typography` used to be listed here. That was defensible when the corpus held
 * five typography objects; after Batch 4 it held 169, and the V1 benchmark
 * measured 48 typography retrievals across 30 cases producing exactly nothing.
 * Typography now routes to its own slot — see the switch below.
 */
const ADVISORY_DOMAINS = new Set(["critic", "channel", "production", "examples"]);

const CAMERA_HINTS = /\b(lens|focal|mm\b|angle|perspective|depth of field|framing|shot|crop|viewpoint|eye[- ]level)\b/i;
const LIGHTING_HINTS = /\b(light|lit|lighting|shadow|highlight|diffus|backlit|key ?light|rim|softbox|contrast ratio|exposure)\b/i;
const COMPOSITION_HINTS = /\b(composition|negative space|layout|balance|hierarchy|grid|placement|spacing|rule of thirds|centre|center)\b/i;
const ENVIRONMENT_HINTS = /\b(environment|background|setting|scene|surface|backdrop|location|context of the shot)\b/i;
const MATERIAL_HINTS = /\b(material|texture|surface finish|glass|metal|fabric|ceramic|paper|liquid)\b/i;
const COLOUR_HINTS = /\b(colour|color|palette|hue|tone|saturation|tint|monochrome)\b/i;

function asArray(value: unknown): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v).trim()).filter(Boolean);
}

function firstStage(stage: CreativeStage | CreativeStage[]): CreativeStage {
  return Array.isArray(stage) ? stage[0] : stage;
}

function flattenTradeOff(t: ReasoningKnowledgeObject["trade_off"]): string | undefined {
  if (!t) return undefined;
  if (typeof t === "string") return t;
  const parts = [t.advantage && `gains ${t.advantage}`, t.limitation && `costs ${t.limitation}`].filter(Boolean);
  const conditions = t.unsuitable_conditions ? ` — unsuitable when ${t.unsuitable_conditions}` : "";
  return parts.join("; ") + conditions;
}

function antiPatternToAvoid(ap: AntiPattern): string {
  return `${ap.problem} (fails because ${ap.why_it_fails}; instead: ${ap.replacement})`;
}

export interface DecisionRouting {
  target: DecisionTarget;
  dimension?: ArtDirectionDimension;
  /**
   * The CreativeDirection field this decision fills.
   *
   * Usually derived from `dimension`. Set directly only for typography, which has
   * a destination field but no resolver dimension.
   */
  slot?: DirectionSlot;
  rule: string;
}

/** The slot a routing lands in, whether stated directly or via its dimension. */
function slotFor(routing: DecisionRouting): DirectionSlot | undefined {
  return routing.slot || (routing.dimension ? DIMENSION_SLOT[routing.dimension] : undefined);
}

export class CreativeDecisionEngine {
  /**
   * Routes a knowledge object to a target and, for visual knowledge, a dimension.
   *
   * Domain decides the target: strategic knowledge must not be written into a
   * camera instruction, because "use identity-preservation storytelling" is not a
   * thing a camera can do. Within visual domains the decision text picks the
   * dimension, since a photography rule may be about the lens or about the light.
   */
  public static route(obj: ReasoningKnowledgeObject): DecisionRouting {
    const domain = String(obj.domain || "");
    const text = `${obj.decision || ""} ${obj.sub_domain || ""}`;

    if (STRATEGY_DOMAINS.has(domain)) {
      return { target: "STRATEGY", rule: `domain "${domain}" is strategic — informs concept, not execution` };
    }
    if (ADVISORY_DOMAINS.has(domain)) {
      return { target: "ADVISORY", rule: `domain "${domain}" is reasoning-time only — never enters a prompt` };
    }

    switch (domain) {
      // camera and lighting were split out of photography in Phase 2.1 and this
      // switch was not updated with them, so both fell through to the default
      // and were held as advisory. The V1 benchmark measured the cost: lighting
      // absent from 30 of 30 cases, camera from 25 of 30. Splitting a domain
      // means revisiting every set that named its parent.
      case "camera":
        return { target: "ART_DIRECTION", dimension: "camera", rule: "camera domain → camera" };
      case "lighting":
        return { target: "ART_DIRECTION", dimension: "lighting", rule: "lighting domain → lighting" };
      case "typography":
        // Phase 3.1.6.6 made typography a resolver dimension, so it now routes
        // exactly like every other visual domain: by dimension, with the slot
        // derived from DIMENSION_SLOT. The slot-only routing it used before was
        // a workaround for the dimension not existing, and keeping it would have
        // left typography as the one decision the resolver never arbitrated.
        return { target: "ART_DIRECTION", dimension: "typography", rule: "typography domain → typography" };
      case "photography": {
        const dimension: ArtDirectionDimension = LIGHTING_HINTS.test(text) && !CAMERA_HINTS.test(text) ? "lighting" : "camera";
        return { target: "ART_DIRECTION", dimension, rule: `photography → ${dimension} (by decision wording)` };
      }
      case "color":
        return { target: "ART_DIRECTION", dimension: "colour", rule: "color domain → colour" };
      case "layout":
        return { target: "ART_DIRECTION", dimension: "composition", rule: "layout domain → composition" };
      case "material":
        return { target: "ART_DIRECTION", dimension: "materials", rule: "material domain → materials" };
      case "visual_direction": {
        let dimension: ArtDirectionDimension = "atmosphere";
        let why = "default for visual direction";
        if (COMPOSITION_HINTS.test(text)) { dimension = "composition"; why = "composition wording"; }
        else if (LIGHTING_HINTS.test(text)) { dimension = "lighting"; why = "lighting wording"; }
        else if (COLOUR_HINTS.test(text)) { dimension = "colour"; why = "colour wording"; }
        else if (ENVIRONMENT_HINTS.test(text)) { dimension = "environment"; why = "environment wording"; }
        else if (MATERIAL_HINTS.test(text)) { dimension = "materials"; why = "material wording"; }
        return { target: "ART_DIRECTION", dimension, rule: `visual_direction → ${dimension} (${why})` };
      }
      default:
        return { target: "ADVISORY", rule: `domain "${domain}" has no visual route — held as advisory` };
    }
  }

  private static toDecision(item: ScoredReasoningKnowledge, routing: DecisionRouting): CreativeDecision {
    const o = item.object;
    const avoid = [...asArray(o.avoid_when), ...(o.anti_patterns || []).map(antiPatternToAvoid)];

    return {
      decision_id: `dec_${o.knowledge_id}`,
      stage: firstStage(o.creative_stage),
      target: routing.target,
      art_direction_dimension: routing.dimension,
      direction_slot: slotFor(routing),
      decision: o.decision,
      reasoning: o.reasoning,
      expected_impact: o.impact,
      derived_from: [o.knowledge_id],
      context_relevance: item.context_relevance,
      confidence: o.confidence ?? 0.5,
      score: item.score,
      avoid,
      trade_off: flattenTradeOff(o.trade_off),
      alternatives: asArray(o.alternatives),
    };
  }

  /**
   * Measures how well a decision serves the campaign concept.
   *
   * Returns a multiplier, not a veto. The concept is one voice among several and
   * the resolver downstream still arbitrates; a decision that merely fails to
   * reinforce the idea is worth less, not worthless. A decision that lands in
   * territory the concept explicitly rejects IS vetoed, because that is the one
   * case where proceeding contradicts a stated creative position.
   */
  public static conceptAlignment(
    decision: CreativeDecision,
    concept?: CreativeConcept
  ): { multiplier: number; vetoed: boolean; note: string } {
    if (!concept) return { multiplier: 1, vetoed: false, note: "no concept supplied" };

    const text = decision.decision.toLowerCase();
    const significant = (s: string) =>
      s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 5);

    // Veto: the decision restates something the concept rules out.
    for (const avoid of concept.avoid_direction) {
      const words = significant(avoid);
      if (!words.length) continue;
      const overlap = words.filter((w) => text.includes(w)).length / words.length;
      if (overlap > 0.6) {
        return { multiplier: 0, vetoed: true, note: `contradicts concept avoid_direction: "${avoid}"` };
      }
    }

    // Reinforcement: shared vocabulary with the concept's world and direction.
    const conceptWords = new Set([
      ...significant(concept.visual_world),
      ...concept.execution_direction.flatMap(significant),
      ...significant(concept.big_idea),
    ]);
    const hits = [...conceptWords].filter((w) => text.includes(w)).length;
    if (hits >= 2) return { multiplier: 1.25, vetoed: false, note: `reinforces concept (${hits} shared terms)` };
    if (hits === 1) return { multiplier: 1.1, vetoed: false, note: "partially reinforces concept" };
    return { multiplier: 1, vetoed: false, note: "concept-neutral" };
  }

  /**
   * Builds the decision set from retrieved knowledge, steered by the concept.
   *
   * Where two decisions target the same dimension the higher-scoring one wins and
   * the other is recorded as superseded rather than dropped — the same discipline
   * the art direction resolver applies to its own candidates, for the same reason:
   * a decision that vanished without explanation is indistinguishable from a bug.
   */
  public static decide(
    retrieved: ScoredReasoningKnowledge[],
    concept?: CreativeConcept
  ): CreativeDecisionSet {
    // Contention is per CreativeDirection slot. Keying on dimension instead left
    // typography — which has a slot but no dimension — with nowhere to compete.
    const artBySlot = new Map<DirectionSlot, CreativeDecision>();
    const strategy: CreativeDecision[] = [];
    const advisory: CreativeDecision[] = [];
    const superseded: SupersededDecision[] = [];
    const unmapped: UnmappedDecision[] = [];
    const warnings: string[] = [];

    for (const item of retrieved) {
      const routing = this.route(item.object);
      const decision = this.toDecision(item, routing);

      // The concept reweights visual decisions before they compete for a
      // dimension, so the campaign idea shapes execution rather than merely
      // sitting alongside it.
      const alignment = this.conceptAlignment(decision, concept);
      decision.concept_alignment = alignment.multiplier;
      decision.concept_note = alignment.note;
      if (alignment.vetoed) {
        unmapped.push({
          decision_id: decision.decision_id,
          decision: decision.decision,
          derived_from: decision.derived_from,
          intended_dimension: routing.dimension,
          reason: `Vetoed by concept — ${alignment.note}.`,
        });
        continue;
      }
      decision.score = Number((decision.score * alignment.multiplier).toFixed(6));

      if (routing.target === "STRATEGY") { strategy.push(decision); continue; }
      if (routing.target === "ADVISORY") { advisory.push(decision); continue; }

      const slot = slotFor(routing);

      // `environment` still has no CreativeDirection field. Recorded explicitly
      // instead of quietly discarded — an unmapped decision that vanished is
      // indistinguishable from a routing bug.
      if (!slot) {
        unmapped.push({
          decision_id: decision.decision_id,
          decision: decision.decision,
          derived_from: decision.derived_from,
          intended_dimension: routing.dimension,
          reason: `"${routing.dimension ?? "unknown"}" has no CreativeDirection field; it is reachable only via the STRATEGY tier.`,
        });
        continue;
      }

      const held = artBySlot.get(slot);
      if (!held) { artBySlot.set(slot, decision); continue; }

      const [winner, loser] = decision.score > held.score ? [decision, held] : [held, decision];
      artBySlot.set(slot, winner);
      superseded.push({
        decision_id: loser.decision_id,
        art_direction_dimension: loser.art_direction_dimension,
        decision: loser.decision,
        derived_from: loser.derived_from,
        score: loser.score,
        reason: "OUTRANKED_ON_DIMENSION",
        superseded_by: winner.decision_id,
      });
    }

    if (artBySlot.size === 0 && retrieved.length > 0) {
      warnings.push(
        "NO_ART_DIRECTION_DECISIONS: retrieved knowledge produced no visual decisions. The render will fall back to strategy and asset defaults."
      );
    }
    if (unmapped.length) {
      warnings.push(`UNMAPPED_DIMENSIONS: ${unmapped.length} decision(s) could not reach the resolver at the KNOWLEDGE tier.`);
    }

    return {
      art_direction: [...artBySlot.values()].sort((a, b) => b.score - a.score),
      strategy: strategy.sort((a, b) => b.score - a.score),
      advisory: advisory.sort((a, b) => b.score - a.score),
      superseded,
      unmapped,
      warnings,
    };
  }

  /**
   * Adapts decisions into the CreativeDirection the resolver already accepts.
   *
   * This is the integration point, and it is deliberately narrow: only `decision`
   * text crosses. The resolver then treats these exactly as it treats any other
   * KNOWLEDGE-tier candidate — scored on tier weight × confidence × specificity,
   * outrankable by client instruction. No resolver change is required, and Layer 2
   * gains no authority it did not earn.
   */
  public static toCreativeDirection(set: CreativeDecisionSet): CreativeDirection {
    // Read by slot. The previous version read by dimension and then hardcoded
    // typography_strategy to "", which is why 169 typography objects reached the
    // resolver as an empty string on every run.
    const bySlot = (slot: DirectionSlot): string =>
      set.art_direction.find((x) => x.direction_slot === slot)?.decision || "";

    return {
      visual_style: bySlot("visual_style"),
      camera_direction: bySlot("camera_direction"),
      lighting_direction: bySlot("lighting_direction"),
      composition_strategy: bySlot("composition_strategy"),
      color_strategy: bySlot("color_strategy"),
      typography_strategy: bySlot("typography_strategy"),
      material_direction: bySlot("material_direction"),
      // Quality checks are reasoning-time guardrails. They are carried here for
      // the compiler's existing use, not as visual instructions.
      quality_checks: set.art_direction.flatMap((d) => d.avoid).slice(0, 3),
    };
  }

  /**
   * Full pipeline: query → retrieve → decide → adapt, with a complete trace.
   */
  public static run(
    query: ReasoningRetrievalQuery,
    retriever: ReasoningKnowledgeRetriever,
    concept?: CreativeConcept
  ): { set: CreativeDecisionSet; creativeDirection: CreativeDirection; trace: CreativeDecisionTrace } {
    const retrieval = retriever.retrieve(query);
    const set = this.decide(retrieval.results, concept);
    const creativeDirection = this.toCreativeDirection(set);

    const trace: CreativeDecisionTrace = {
      query,
      retrieved: retrieval.results.map((r) => ({
        knowledge_id: r.object.knowledge_id,
        name: r.object.name,
        domain: String(r.object.domain),
        knowledge_type: String(r.object.knowledge_type),
        context_relevance: r.context_relevance,
        score: r.score,
        matched_axes: r.matches.filter((m) => m.matched && !m.wildcard).map((m) => String(m.axis)),
      })),
      candidates_evaluated: retrieval.candidates_evaluated,
      reasoning_applied: retrieval.results.map((r) => {
        const routing = this.route(r.object);
        return {
          knowledge_id: r.object.knowledge_id,
          domain: String(r.object.domain),
          routed_to: routing.target,
          art_direction_dimension: routing.dimension,
          rule: routing.rule,
        };
      }),
      decisions: set,
      art_direction_input: Object.fromEntries(
        Object.entries(creativeDirection).filter(([, v]) => (Array.isArray(v) ? v.length : v))
      ),
      warnings: [...retrieval.warnings, ...set.warnings],
    };

    return { set, creativeDirection, trace };
  }
}
