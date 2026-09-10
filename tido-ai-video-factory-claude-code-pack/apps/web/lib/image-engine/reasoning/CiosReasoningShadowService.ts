import { IMAGE_ENGINE_CONFIG } from "../config";
import { CampaignBriefInput, ArtDirectionDecisionRecord } from "../campaign/campaign.types";
import { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { CreativeDirection, CreativeKnowledgeService } from "../service/CreativeKnowledgeService";
import { CreativeConceptEngine } from "./CreativeConceptEngine";
import { CreativeContextExtractor } from "./CreativeContextExtractor";
import { CreativeDecisionEngine } from "./CreativeDecisionEngine";
import { CreativeDiversityController } from "./CreativeDiversityController";
import { ReasoningKnowledgeRepository } from "./ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./ReasoningKnowledgeRetriever";
import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./creative-decision.types";
import {
  CiosShadowReport,
  CiosShadowResult,
  ConceptComparison,
  DimensionAgreement,
  DimensionComparison,
  LayerSeparationAudit,
  SHADOW_DIMENSIONS,
  ShadowDimension,
} from "./cios-shadow.types";
import { ReasoningKnowledgeObject } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 3.1 — reasoning integration in shadow mode.
 *
 * Runs Context Extraction → Retrieval → Concept → Decision against a real campaign
 * brief, in parallel with the production pipeline, and reports the difference.
 * It writes nothing into the render path: the resolver, the compiler and the
 * provider never see any of this. That is the entire point of the phase — the
 * reasoning stack has only ever been exercised by tests, so the first contact
 * with real briefs happens where a wrong answer costs a diagnostic line rather
 * than a render.
 *
 * Two properties are load-bearing:
 *
 *   - It makes no network calls. Retrieval is local files, the concept and
 *     decision engines are deterministic. A shadow run adds no cost and no
 *     latency worth measuring, which is why it can be left on in staging.
 *   - It cannot fail the campaign. Every path is wrapped; a throw becomes a
 *     skipped report. A diagnostic feature that can break production is not a
 *     diagnostic feature.
 */

/** Words too common to count as agreement between two art direction phrases. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with", "from",
  "that", "this", "it", "its", "as", "by", "is", "are", "be", "keep", "use", "using",
  "set", "make", "one", "two", "into", "over", "under", "than", "so", "not", "no",
  "which", "what", "when", "where", "while", "very", "more", "most", "same", "own",
  "shot", "look", "style", "image", "visual", "photo", "photography", "commercial",
]);

function contentWords(value: string): Set<string> {
  return new Set(
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

/**
 * Classifies two values for one dimension.
 *
 * Agreement is measured on shared content words rather than string equality,
 * because the two paths phrase the same instruction differently — Layer 1 writes
 * "soft diffused daylight from a large source", CIOS writes "light with a large
 * diffused source at 45 degrees". Those agree. Requiring equality would report
 * every dimension as DIVERGENT and make the comparison useless.
 */
function compareValues(cios: string, legacy: string): { agreement: DimensionAgreement; shared: string[] } {
  const c = (cios || "").trim();
  const l = (legacy || "").trim();
  if (!c && !l) return { agreement: "BOTH_EMPTY", shared: [] };
  if (c && !l) return { agreement: "CIOS_ONLY", shared: [] };
  if (!c && l) return { agreement: "LEGACY_ONLY", shared: [] };

  const cw = contentWords(c);
  const lw = contentWords(l);
  const shared = [...cw].filter((w) => lw.has(w));
  // Two shared content words is the threshold. One is routinely coincidental
  // ("product" appears in almost every lighting note); two rarely is.
  return { agreement: shared.length >= 2 ? "ALIGNED" : "DIVERGENT", shared };
}

/** Dimension name as the resolver records it, for matching against asset output. */
const RESOLVER_DIMENSION: Record<ShadowDimension, string> = {
  camera: "camera",
  lighting: "lighting",
  composition: "composition",
  colour: "colour",
  atmosphere: "atmosphere",
};

export interface ShadowRunInput {
  brief: CampaignBriefInput;
  /** The marketing brain's output, for concept-level comparison. */
  strategy?: MarketingBrainStrategy;
  /** How the production concept was actually produced. */
  strategySource?: string;
  legacyBigIdea?: string;
  legacyCoreMessage?: string;
  /**
   * The art direction the resolver actually settled on for the shipped assets.
   * Used to establish whether a CIOS decision would have changed anything or
   * would have been outranked by a higher tier regardless.
   */
  resolvedArtDirection?: ArtDirectionDecisionRecord[];
  /** Injected in tests so the shadow path can be exercised without disk state. */
  repository?: ReasoningKnowledgeRepository;
  /**
   * Phase 4.0.1.5 — carried across cases so between-brief repetition is visible.
   *
   * Omitted for a single run, which is correct: one brief has nothing to repeat.
   * A benchmark passes one controller through every case.
   */
  diversity?: CreativeDiversityController;
  /** Category defaults this brief must avoid, from the case criteria. */
  avoidPhrases?: string[];
}

export class CiosReasoningShadowService {
  /**
   * Whether shadow reasoning should run.
   *
   * Default false. An explicit per-run override wins over the environment so a
   * debug session or a test can turn it on without changing process state, which
   * is what makes the flag usable from the campaign UI.
   */
  public static isEnabled(override?: boolean): boolean {
    if (typeof override === "boolean") return override;
    return IMAGE_ENGINE_CONFIG.CIOS_REASONING_ENABLED;
  }

  /**
   * Runs the parallel reasoning path.
   *
   * Never throws. A failure anywhere returns a skipped report carrying the
   * message, because the caller is a production campaign run that must not be
   * affected by a diagnostic.
   */
  public static run(input: ShadowRunInput, override?: boolean): CiosShadowReport {
    const startedAt = Date.now();

    if (!this.isEnabled(override)) {
      return { enabled: false, reason: "FLAG_DISABLED", duration_ms: Date.now() - startedAt };
    }

    try {
      return this.execute(input, startedAt);
    } catch (err: any) {
      return {
        enabled: false,
        reason: "ERROR",
        message: String(err?.message || err),
        duration_ms: Date.now() - startedAt,
      };
    }
  }

  private static execute(input: ShadowRunInput, startedAt: number): CiosShadowResult {
    const { brief } = input;
    const warnings: string[] = [];

    // ── 1. Brief → eight retrieval axes ───────────────────────────────────
    const query = CreativeContextExtractor.extract({
      brand: brief.brand,
      product: brief.product,
      industry: brief.industry,
      audience: brief.audience,
      objective: brief.objective,
      channel: brief.channel,
      tone: brief.tone,
      concept: brief.concept,
      brandInfo: brief.brandInfo,
      // The brief has carried this all along and the extractor was never given
      // it, which is why asset_type resolved on none of the 30 benchmark briefs
      // and every asset-type-scoped object stayed unreachable.
      assetType: brief.assetTypes?.[0],
    });
    const coverage = CreativeContextExtractor.coverage(query);
    if (coverage.resolved.length <= 2) {
      warnings.push(
        `THIN_CONTEXT: only ${coverage.resolved.length} of 8 axes resolved (${coverage.resolved.join(", ") || "none"}). ` +
          "Retrieval will be broad and the decisions correspondingly generic."
      );
    }

    // ── 2. Retrieval ──────────────────────────────────────────────────────
    // Strict admission: the corpus passes the gate in full today, so anything
    // rejected here is a regression in the knowledge rather than a tuning choice.
    const repo = input.repository || new ReasoningKnowledgeRepository();
    const retriever = new ReasoningKnowledgeRetriever(repo, { admission: "strict" });

    // ── 3. Concept ────────────────────────────────────────────────────────
    // Phase 4.0.1 — the brief's own prose drives the human-problem signal. Passing
    // only labels would leave the strongest of the five concept signals measuring
    // nothing.
    // The challenge leads, and is repeated, so the human-problem signal weighs the
    // statement of the difficulty above the product description. Without it the
    // signal scores against a blurb and the wrong tension wins.
    const briefText = [
      brief.creativeChallenge,
      brief.creativeChallenge,
      brief.concept,
      brief.audience,
      brief.product,
      brief.tone,
      brief.objective,
      brief.brandInfo,
    ]
      .filter(Boolean)
      .join(". ");
    const conceptResult = CreativeConceptEngine.generate(query, retriever, {
      brand: brief.brand,
      briefText,
      synthesis: {
        diversity: input.diversity,
        brand_objective: brief.objective,
        audience: brief.audience,
        avoid: input.avoidPhrases,
      },
    });
    warnings.push(...conceptResult.warnings);

    // ── 4. Decisions, aligned to that concept ─────────────────────────────
    const decisionResult = CreativeDecisionEngine.run(query, retriever, conceptResult.concept);
    warnings.push(...decisionResult.trace.warnings);

    const ciosDirection = decisionResult.creativeDirection;

    // ── 5. What Layer 1 produces for the same brief ───────────────────────
    // Same service and same call shape the compiler uses, minus the per-asset
    // knowledge package it does not have at campaign level. Noted rather than
    // hidden: the legacy side of this comparison is close to, not identical to,
    // what a single asset compilation would see.
    const legacyDirection = new CreativeKnowledgeService().resolveCreativeDirection({
      useCase: brief.assetTypes?.[0],
      brief: [brief.product, brief.concept, brief.tone, brief.brandInfo].filter(Boolean).join(". "),
    }).creativeDirection;

    // ── 6. Dimension-by-dimension comparison ──────────────────────────────
    const resolvedByDimension = new Map<string, ArtDirectionDecisionRecord>();
    for (const rec of input.resolvedArtDirection || []) {
      // First asset to resolve a dimension wins the sample. Campaign DNA makes
      // these consistent across assets by design; if they ever diverge, that is
      // a separate defect and not one this comparison should average away.
      if (!resolvedByDimension.has(rec.dimension)) resolvedByDimension.set(rec.dimension, rec);
    }

    const comparison: DimensionComparison[] = SHADOW_DIMENSIONS.map((dimension) => {
      const ciosValue = this.directionValue(ciosDirection, dimension);
      const legacyValue = this.directionValue(legacyDirection, dimension);
      const { agreement, shared } = compareValues(ciosValue, legacyValue);
      const resolved = resolvedByDimension.get(RESOLVER_DIMENSION[dimension]);

      return {
        dimension,
        cios_value: ciosValue,
        legacy_value: legacyValue,
        agreement,
        shared_terms: shared,
        resolved_value: resolved?.value,
        resolved_source: resolved?.source,
        // A dimension already owned above the KNOWLEDGE tier cannot change when
        // the KNOWLEDGE tier's contents change, however different they are.
        outranked_by_higher_tier: resolved
          ? resolved.source !== "KNOWLEDGE" && resolved.source !== "ASSET_DEFAULT"
          : undefined,
      };
    });

    // ── 7. Concept comparison ─────────────────────────────────────────────
    const strategy = input.strategy;
    const conceptComparison: ConceptComparison = {
      cios_big_idea: conceptResult.concept.big_idea,
      cios_concept_name: conceptResult.concept.concept_name,
      cios_core_message: conceptResult.concept.core_message,
      legacy_big_idea: input.legacyBigIdea || "",
      legacy_core_message: input.legacyCoreMessage || strategy?.creative_message || "",
      legacy_consumer_insight: strategy?.consumer_insight || "",
      legacy_strategy_source: input.strategySource || "UNKNOWN",
      cios_accepted: conceptResult.evaluation.accepted,
      cios_score: conceptResult.evaluation.overall,
      cios_rejection_reasons: conceptResult.evaluation.rejection_reasons,
      cios_cliches: conceptResult.evaluation.cliches_detected,
    };

    // ── 8. Governance §1 ──────────────────────────────────────────────────
    const layerSeparation = this.auditLayerSeparation(
      ciosDirection,
      decisionResult.trace.retrieved.map((r) => r.knowledge_id),
      repo
    );
    if (!layerSeparation.clean) {
      warnings.push(
        `LAYER_SEPARATION_BREACH: reasoning-only content reached the emitted direction (${layerSeparation.leaked_fields.join(", ")}). ` +
          "This blocks Phase 3.2."
      );
    }

    const wouldChange = comparison.filter(
      (c) =>
        (c.agreement === "CIOS_ONLY" || c.agreement === "DIVERGENT") &&
        c.outranked_by_higher_tier !== true
    ).length;

    return {
      enabled: true,
      query,
      context_coverage: coverage,
      retrieved_knowledge_ids: decisionResult.trace.retrieved.map((r) => r.knowledge_id),
      candidates_evaluated: decisionResult.trace.candidates_evaluated,
      concept: conceptResult.concept,
      concept_evaluation: conceptResult.evaluation,
      cios_direction: ciosDirection,
      legacy_direction: legacyDirection,
      comparison,
      concept_comparison: conceptComparison,
      layer_separation: layerSeparation,
      summary: {
        retrieved: decisionResult.trace.retrieved.length,
        art_direction_decisions: decisionResult.set.art_direction.length,
        strategy_decisions: decisionResult.set.strategy.length,
        advisory_decisions: decisionResult.set.advisory.length,
        superseded: decisionResult.set.superseded.length,
        unmapped: decisionResult.set.unmapped.length,
        dimensions_cios_only: comparison.filter((c) => c.agreement === "CIOS_ONLY").length,
        dimensions_divergent: comparison.filter((c) => c.agreement === "DIVERGENT").length,
        dimensions_that_would_change_output: wouldChange,
      },
      concept_trace: conceptResult.trace,
      decision_trace: decisionResult.trace,
      warnings: Array.from(new Set(warnings)),
      duration_ms: Date.now() - startedAt,
    };
  }

  /** Maps a shadow dimension onto the CreativeDirection field that carries it. */
  private static directionValue(direction: CreativeDirection, dimension: ShadowDimension): string {
    switch (dimension) {
      case "camera":
        return direction.camera_direction || "";
      case "lighting":
        return direction.lighting_direction || "";
      case "composition":
        return direction.composition_strategy || "";
      case "colour":
        return direction.color_strategy || "";
      case "atmosphere":
        return direction.visual_style || "";
    }
  }

  /**
   * Proves the membrane held on this run.
   *
   * Checks the emitted direction against the reasoning-only fields of the exact
   * objects that produced it, rather than against a vocabulary list. A generic
   * word-list test would fire on coincidence; this fires only when text that
   * genuinely came from `reasoning`, `problem` or `why_this_works` appears in
   * something bound for a prompt.
   */
  private static auditLayerSeparation(
    direction: CreativeDirection,
    knowledgeIds: string[],
    repo: ReasoningKnowledgeRepository
  ): LayerSeparationAudit {
    const emitted = [
      direction.visual_style,
      direction.camera_direction,
      direction.lighting_direction,
      direction.composition_strategy,
      direction.color_strategy,
    ]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase();

    const leaked: string[] = [];
    const evidence: string[] = [];
    if (!emitted.trim()) return { clean: true, leaked_fields: [], evidence: [] };

    for (const id of knowledgeIds) {
      const obj = repo.getById(id) as (ReasoningKnowledgeObject & Record<string, unknown>) | null;
      if (!obj) continue;

      for (const field of REASONING_ONLY_KNOWLEDGE_FIELDS) {
        const raw = obj[field];
        if (!raw) continue;
        for (const text of this.flattenText(raw)) {
          // A sentence-length overlap is a leak. Shorter fragments are shared
          // craft vocabulary and would make this check noise rather than signal.
          const probe = text.toLowerCase().trim();
          if (probe.length < 40) continue;
          if (emitted.includes(probe)) {
            if (!leaked.includes(field)) leaked.push(field);
            evidence.push(`${id}.${field}: "${text.slice(0, 90)}"`);
          }
        }
      }
    }

    return { clean: leaked.length === 0, leaked_fields: leaked, evidence };
  }

  /** Reasoning-only fields are strings, string arrays or objects of both. */
  private static flattenText(value: unknown): string[] {
    if (value == null) return [];
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap((v) => this.flattenText(v));
    if (typeof value === "object") return Object.values(value as object).flatMap((v) => this.flattenText(v));
    return [];
  }

  /** One-screen summary for a terminal or a debug panel. */
  public static formatSummary(report: CiosShadowReport): string {
    if (!report.enabled) {
      return `CIOS shadow: ${report.reason}${report.message ? ` — ${report.message}` : ""}`;
    }
    const lines: string[] = [];
    lines.push(
      `CIOS shadow: ${report.summary.retrieved} retrieved · ` +
        `${report.summary.art_direction_decisions} art-direction / ${report.summary.strategy_decisions} strategy / ` +
        `${report.summary.advisory_decisions} advisory · ${report.duration_ms}ms`
    );
    lines.push(
      `  concept: "${report.concept.big_idea}" (${report.concept_evaluation.overall.toFixed(1)}/10, ` +
        `${report.concept_evaluation.accepted ? "accepted" : "REJECTED"})`
    );
    for (const c of report.comparison) {
      const flag = c.outranked_by_higher_tier ? ` [outranked by ${c.resolved_source}]` : "";
      lines.push(`  ${c.dimension.padEnd(12)} ${c.agreement}${flag}`);
    }
    lines.push(
      `  would change ${report.summary.dimensions_that_would_change_output} of ${report.comparison.length} dimensions · ` +
        `layer separation ${report.layer_separation.clean ? "clean" : "BREACHED"}`
    );
    return lines.join("\n");
  }
}
