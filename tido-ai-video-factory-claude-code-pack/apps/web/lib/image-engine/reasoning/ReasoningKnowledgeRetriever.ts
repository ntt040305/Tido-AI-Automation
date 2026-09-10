import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeQualityGate } from "./KnowledgeQualityGate";
import { CONCEPT_GROUP, retrievalGroup } from "./reasoning-knowledge.types";

/**
 * Minimum retrieval slots for concept-bearing knowledge.
 *
 * Five, for two reasons that compound. The top-scoring concept object is often a
 * framework, which can supply an insight but cannot be an idea. And the chain has
 * four steps: with three slots it had to reuse a source, which is the sameness
 * this phase set out to remove. Five leaves one spare for the framework case.
 */
const CONCEPT_GROUP_MIN = 5;
import { ReasoningKnowledgeRepository } from "./ReasoningKnowledgeRepository";
import {
  ContextMatchDetail,
  ReasoningContext,
  ReasoningKnowledgeObject,
  ReasoningRetrievalQuery,
  ReasoningRetrievalResult,
  ScoredReasoningKnowledge,
} from "./reasoning-knowledge.types";

/**
 * Retrieval for CIOS Layer 2.
 *
 * Governance §12: selection must use industry, category, audience, objective,
 * channel, asset_type, brand_position and creative_stage. Keyword matching alone
 * is insufficient — which is precisely the failure the audit measured, where nine
 * retrieval stages returned the same seven blocks for every campaign in every
 * industry.
 *
 * Selection here is deterministic and explainable: every result carries the per-
 * axis match detail that produced its score, so a surprising retrieval can be
 * read rather than guessed at. That mirrors the provenance model the art
 * direction resolver already uses, and it is the reason no embedding step is
 * needed to make this layer useful.
 *
 * Semantic ranking is a later addition, not a missing piece: with no knowledge
 * authored there is nothing to embed, and context matching is a stronger signal
 * than similarity for a corpus whose whole point is situational fit.
 *
 * This class is not imported by the image generation pipeline. Its output feeds
 * the reasoning stages, whose conclusions reach the renderer only through the
 * art direction flow that already exists.
 */

const CONTEXT_AXES: (keyof ReasoningContext)[] = [
  "industry",
  "category",
  "audience",
  "objective",
  "channel",
  "asset_type",
  "brand_position",
];

/**
 * Axis weights.
 *
 * Industry and brand position dominate because they change what a decision
 * should be, not merely where it applies: the same layout rule is right for a
 * luxury launch and wrong for a discount promotion. Channel and asset type
 * refine execution rather than direction, so they carry less.
 */
const AXIS_WEIGHT: Record<keyof ReasoningContext, number> = {
  industry: 1.0,
  brand_position: 0.9,
  audience: 0.85,
  objective: 0.8,
  category: 0.6,
  asset_type: 0.5,
  channel: 0.45,
};

function asArray(value: unknown): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value.map((v) => String(v).trim()) : [String(value).trim()];
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Whether the quality gate filters what may be retrieved.
 *
 * Default is "off" so every corpus assembled before the gate existed keeps
 * behaving identically. Disk-loaded production corpora should run "strict":
 * knowledge that cannot pass the gate should never reach a campaign, and a
 * corpus that quietly serves weak objects is the failure the gate exists to stop.
 */
export type AdmissionMode = "off" | "warn" | "strict";

export class ReasoningKnowledgeRetriever {
  private readonly repo: ReasoningKnowledgeRepository;
  private readonly admission: AdmissionMode;
  private readonly quota: { enabled: boolean; maxShare: number };

  constructor(
    repo?: ReasoningKnowledgeRepository,
    options: { admission?: AdmissionMode; quota?: { enabled?: boolean; maxShare?: number } } = {}
  ) {
    this.repo = repo || new ReasoningKnowledgeRepository();
    this.admission = options.admission || "off";
    // On by default. A global top-k was measurably wrong for this corpus, and a
    // correction that has to be switched on is a correction most callers miss.
    this.quota = {
      enabled: options.quota?.enabled !== false,
      maxShare: options.quota?.maxShare ?? 0.35,
    };
  }

  /**
   * Scores one axis.
   *
   * A wildcard means the object does not constrain that axis. It is treated as
   * applicable but NOT as evidence of fit — otherwise an object declaring "*"
   * everywhere would outrank one written specifically for the request, which is
   * exactly backwards.
   */
  private static matchAxis(
    axis: keyof ReasoningContext,
    queryValue: string | undefined,
    objectValue: unknown
  ): ContextMatchDetail {
    const objectValues = asArray(objectValue);
    const wildcard = objectValues.some((v) => v === "*") || objectValues.length === 0;

    if (wildcard) {
      return { axis, queryValue, objectValue: "*", matched: true, wildcard: true };
    }
    if (!queryValue) {
      // Object is specific, query says nothing: applicable, unproven.
      return { axis, queryValue, objectValue: objectValues.join("|"), matched: true, wildcard: true };
    }

    const q = normalise(queryValue);
    const matched = objectValues.some((v) => {
      const o = normalise(v);
      return o === q || o.includes(q) || q.includes(o);
    });

    return { axis, queryValue, objectValue: objectValues.join("|"), matched, wildcard: false };
  }

  private static scoreObject(
    obj: ReasoningKnowledgeObject,
    query: ReasoningRetrievalQuery
  ): { relevance: number; matches: ContextMatchDetail[]; excluded: boolean } {
    const matches: ContextMatchDetail[] = [];
    let earned = 0;
    let available = 0;
    let excluded = false;

    for (const axis of CONTEXT_AXES) {
      const detail = ReasoningKnowledgeRetriever.matchAxis(axis, (query as any)[axis], obj.context?.[axis]);
      matches.push(detail);

      // A specific mismatch on a specific query is a hard exclusion: knowledge
      // written for luxury must not surface for a budget brief.
      if (!detail.wildcard && !detail.matched) excluded = true;

      if (!detail.wildcard) {
        available += AXIS_WEIGHT[axis];
        if (detail.matched) earned += AXIS_WEIGHT[axis];
      }
    }

    // creative_stage is a filter, not a weighted axis.
    if (query.creative_stage) {
      const stages = asArray(obj.creative_stage);
      const matched = stages.includes(query.creative_stage);
      matches.push({
        axis: "creative_stage",
        queryValue: query.creative_stage,
        objectValue: stages.join("|"),
        matched,
        wildcard: false,
      });
      if (!matched) excluded = true;
    }

    // No specific axis to prove fit against — applicable, but relevance is
    // unestablished rather than perfect.
    const relevance = available === 0 ? 0.35 : earned / available;
    return { relevance, matches, excluded };
  }

  /**
   * Final ranking (Governance §11).
   *
   * Context relevance multiplies rather than adds: a highly-rated object that
   * does not fit the situation is not a good result, it is the wrong result.
   */
  private static finalScore(obj: ReasoningKnowledgeObject, relevance: number): number {
    const priority = (obj.priority ?? 5) / 10;
    const impact = (obj.impact_score ?? 5) / 10;
    const confidence = obj.confidence ?? 0.5;
    const quality = 0.4 * priority + 0.3 * impact + 0.3 * confidence;
    return Number((relevance * quality).toFixed(6));
  }

  public retrieve(query: ReasoningRetrievalQuery): ReasoningRetrievalResult {
    const warnings: string[] = [];
    const all = this.repo.getAll();

    const loadErrors = this.repo.getLoadErrors();
    if (loadErrors.length) {
      warnings.push(
        `REASONING_KNOWLEDGE_LOAD_ERRORS: ${loadErrors.length} file(s) could not be parsed and were skipped.`
      );
    }
    if (all.length === 0) {
      warnings.push(
        "REASONING_CORPUS_EMPTY: no Layer 2 knowledge authored yet. Reasoning stages will fall back to Layer 1 behaviour."
      );
    }

    let pool = query.domains?.length ? all.filter((o) => query.domains!.includes(o.domain)) : all;

    // Quality gate. Rejected knowledge is named in the warnings rather than
    // disappearing, so a missing decision can be traced to the object that failed.
    if (this.admission !== "off" && pool.length) {
      const graded = pool.map((o) => ({ o, report: KnowledgeQualityGate.evaluate(o) }));
      const rejected = graded.filter((g) => !g.report.admitted);
      if (rejected.length) {
        warnings.push(
          `KNOWLEDGE_QUALITY_GATE(${this.admission}): ${rejected.length} object(s) failed — ` +
            rejected.map((g) => `${g.o.knowledge_id} [${g.report.rejection_reasons[0]}]`).join("; ")
        );
      }
      if (this.admission === "strict") pool = graded.filter((g) => g.report.admitted).map((g) => g.o);
    }

    const scored: ScoredReasoningKnowledge[] = [];
    for (const obj of pool) {
      const { relevance, matches, excluded } = ReasoningKnowledgeRetriever.scoreObject(obj, query);
      if (excluded) continue;
      scored.push({
        object: obj,
        context_relevance: Number(relevance.toFixed(4)),
        score: ReasoningKnowledgeRetriever.finalScore(obj, relevance),
        matches,
      });
    }

    scored.sort((a, b) => b.score - a.score || a.object.knowledge_id.localeCompare(b.object.knowledge_id));

    const limit = query.limit ?? IMAGE_ENGINE_CONFIG.REASONING_RETRIEVAL_DEFAULT_LIMIT;
    const results = this.quota.enabled
      ? ReasoningKnowledgeRetriever.allocate(scored, limit, this.quota.maxShare, warnings)
      : scored.slice(0, limit);

    return {
      query,
      results,
      candidates_evaluated: pool.length,
      warnings,
    };
  }

  /**
   * Allocates the retrieval budget across destination groups.
   *
   * A global top-k is the right default when every candidate competes for the
   * same thing. These do not: a decision can only fill the CreativeDirection slot
   * its domain feeds, so ten excellent layout objects and zero colour objects
   * leaves colour empty no matter how high the ten score.
   *
   * The V1 benchmark measured exactly that. Layout took 184 of 360 retrieval
   * slots across 30 cases, 154 of those decisions were superseded the moment they
   * arrived — because only one can win a slot — and colour, camera and lighting
   * went unfilled while their objects sat below the cut.
   *
   * Two passes, in this order:
   *
   *   1. Coverage. One object per group that has any candidate, taken in order of
   *      each group's best score. This is what stops a slot going empty while a
   *      qualified object waits outside the budget.
   *   2. Depth. The remaining budget by global score, with each group capped at
   *      `maxShare` of the total so no single group can retake the majority.
   *
   * Ordering matters: depth-first with a cap would still let the largest group
   * fill its cap before a smaller group is considered at all.
   */
  public static allocate(
    scored: ScoredReasoningKnowledge[],
    limit: number,
    maxShare: number,
    warnings: string[]
  ): ScoredReasoningKnowledge[] {
    if (scored.length <= limit) return scored;

    const groups = new Map<string, ScoredReasoningKnowledge[]>();
    for (const item of scored) {
      const key = retrievalGroup(String(item.object.domain));
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }

    // Groups in order of their strongest candidate, so coverage is granted to the
    // best-supported slots first when the budget cannot reach every group.
    const ordered = [...groups.entries()].sort((a, b) => b[1][0].score - a[1][0].score);
    const cap = Math.max(1, Math.ceil(limit * maxShare));
    const taken = new Map<string, number>();
    const picked: ScoredReasoningKnowledge[] = [];
    const cursor = new Map<string, number>();

    const take = (key: string): boolean => {
      const list = groups.get(key)!;
      const at = cursor.get(key) ?? 0;
      if (at >= list.length) return false;
      if ((taken.get(key) ?? 0) >= cap) return false;
      picked.push(list[at]);
      cursor.set(key, at + 1);
      taken.set(key, (taken.get(key) ?? 0) + 1);
      return true;
    };

    // Pass 1 — coverage.
    for (const [key] of ordered) {
      if (picked.length >= limit) break;
      take(key);
    }

    // Pass 1b — top up the concept group.
    //
    // Phase 4.0. One slot is not enough for the concept layer: the highest-scoring
    // concept-group object is frequently a `framework` or `principle`, which
    // describes how to build an idea and cannot be one. Measured on the coffee
    // brief, the group's single pick was `concept.construction.tension_first` and
    // the layer had nothing to lead from despite a hundred usable objects sitting
    // below the cut. Three slots give it a realistic chance of reaching one.
    for (let i = 0; i < CONCEPT_GROUP_MIN - 1; i++) {
      if (picked.length >= limit) break;
      if (!groups.has(CONCEPT_GROUP)) break;
      take(CONCEPT_GROUP);
    }

    // Pass 2 — depth, by global score, respecting the per-group cap.
    for (const item of scored) {
      if (picked.length >= limit) break;
      const key = retrievalGroup(String(item.object.domain));
      const list = groups.get(key)!;
      const at = cursor.get(key) ?? 0;
      // Only advance a group in its own score order, so pass 2 never picks a
      // weaker object ahead of a stronger one from the same group.
      if (list[at] !== item) continue;
      take(key);
    }

    const dominant = [...taken.entries()].find(([, n]) => n > cap);
    if (dominant) {
      warnings.push(
        `RETRIEVAL_QUOTA: group "${dominant[0]}" exceeded its cap of ${cap}; allocation is not behaving as configured.`
      );
    }

    // Re-sorted so downstream consumers still see the strongest first. The budget
    // decides which objects are in; score still decides what leads.
    return picked.sort((a, b) => b.score - a.score || a.object.knowledge_id.localeCompare(b.object.knowledge_id));
  }

  /**
   * Renders retrieved knowledge for an LLM message.
   *
   * Structure is preserved rather than flattened to prose: `use_when`,
   * `avoid_when` and `anti_patterns` are what separate a decision from a
   * description, and they only work if the model can see which is which.
   *
   * Budgeted against REASONING_CONTEXT_BUDGET_CHARS — the LLM context window —
   * never against the image prompt budget. The two must not share, or Layer 2
   * would start evicting campaign strategy from the render prompt.
   */
  public static toContextBlock(
    results: ScoredReasoningKnowledge[],
    budgetChars: number = IMAGE_ENGINE_CONFIG.REASONING_CONTEXT_BUDGET_CHARS
  ): { text: string; included: number; truncated: boolean } {
    const parts: string[] = [];
    let used = 0;
    let included = 0;

    for (const { object: o } of results) {
      const lines = [
        `[${o.knowledge_id}] ${o.name}`,
        `type: ${o.knowledge_type} · stage: ${asArray(o.creative_stage).join(", ")}`,
        `situation: ${CONTEXT_AXES.map((a) => `${a}=${asArray(o.context?.[a]).join("|") || "*"}`).join(" · ")}`,
        `problem: ${o.problem}`,
      ];

      if (o.human_insight) {
        lines.push(
          `human insight: functional=${o.human_insight.functional_need} · emotional=${o.human_insight.emotional_need} · social=${o.human_insight.social_need}`
        );
      }

      lines.push(`DECISION: ${o.decision}`, `reasoning: ${o.reasoning}`, `why this works: ${o.why_this_works}`);
      lines.push(`use when: ${asArray(o.use_when).join("; ")}`);
      lines.push(`AVOID when: ${asArray(o.avoid_when).join("; ")}`);

      if (o.trade_off) {
        const t = o.trade_off;
        lines.push(
          typeof t === "string"
            ? `trade-off: ${t}`
            : `trade-off: ${t.advantage} BUT ${t.limitation}${t.unsuitable_conditions ? ` — unsuitable when ${t.unsuitable_conditions}` : ""}`
        );
      }
      if (o.alternatives) lines.push(`alternatives: ${asArray(o.alternatives).join("; ")}`);
      for (const ap of o.anti_patterns || []) {
        lines.push(`ANTI-PATTERN: ${ap.problem} — fails because ${ap.why_it_fails}. Instead: ${ap.replacement}`);
      }
      lines.push(`expected impact: ${o.impact}`);

      const block = lines.join("\n");
      if (used + block.length > budgetChars) return { text: parts.join("\n\n"), included, truncated: true };

      parts.push(block);
      used += block.length + 2;
      included++;
    }

    return { text: parts.join("\n\n"), included, truncated: false };
  }
}
