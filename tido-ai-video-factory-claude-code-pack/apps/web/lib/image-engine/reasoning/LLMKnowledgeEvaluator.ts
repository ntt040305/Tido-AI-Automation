import { LLMProviderService } from "../llm/llm-provider.service";
import { ReasoningKnowledgeObject } from "./reasoning-knowledge.types";

/**
 * Optional LLM evaluation layer for the Knowledge Quality Gate.
 *
 * The rule-based gate catches what rules can catch: hedging, filler, missing
 * trade-offs, wildcard context. It cannot judge whether a decision would be
 * useful to a senior practitioner, whether it transfers beyond its example, or
 * whether it says anything the reader did not already know. Those are judgements,
 * and a regex will always approximate them.
 *
 * Deliberately additive and off by default. The rule gate stays the source of
 * truth for admission, so the corpus remains deterministic, offline-buildable and
 * reproducible in CI. This layer is a reviewer's assistant that flags weak objects
 * for human attention — it never silently admits or rejects on its own.
 *
 * Uses the existing LLMProviderService. No new client, no new provider.
 */

export type LLMQualityCriterion =
  /** Would a senior practitioner act on this, or is it already obvious? */
  | "expert_usability"
  /** Does it apply beyond the single situation it describes? */
  | "transferability"
  /** Does it say something the reader did not already know? */
  | "originality"
  /** Does acting on it change a commercial outcome? */
  | "strategic_value";

export const LLM_QUALITY_CRITERIA: LLMQualityCriterion[] = [
  "expert_usability",
  "transferability",
  "originality",
  "strategic_value",
];

export interface LLMCriterionScore {
  criterion: LLMQualityCriterion;
  /** 1-10. */
  score: number;
  justification: string;
}

export interface LLMKnowledgeEvaluation {
  knowledge_id: string;
  scores: LLMCriterionScore[];
  overall: number;
  /** Advisory only — the rule gate decides admission. */
  recommendation: "STRONG" | "ACCEPTABLE" | "NEEDS_WORK";
  notes: string;
  /** True when the model could not be reached; scores will be empty. */
  unavailable?: boolean;
  error?: string;
}

const SYSTEM_PROMPT = `You are a senior creative director reviewing entries in a creative decision knowledge base.

Each entry is meant to help an AI system make a professional creative decision in a specific situation. Score it on four criteria, 1-10:

expert_usability  — would a senior practitioner act on this, or is it already obvious to anyone in the field?
transferability   — does it apply beyond the one situation described, without becoming vague?
originality       — does it say something a competent practitioner would not already assume?
strategic_value   — does acting on it change a commercial outcome, or only an aesthetic one?

Be strict. A 7 means genuinely useful. A 9 means a senior practitioner would want it written down. Most competent-but-obvious entries are 4-6.

Reply with JSON only:
{"scores":[{"criterion":"expert_usability","score":7,"justification":"..."}],"notes":"one sentence"}`;

export class LLMKnowledgeEvaluator {
  private readonly llm: LLMProviderService;

  constructor(llm?: LLMProviderService) {
    this.llm = llm || new LLMProviderService();
  }

  /** The object as a reviewer sees it. Reasoning fields included — this never reaches an image model. */
  private static render(o: ReasoningKnowledgeObject): string {
    const arr = (v: unknown) => (Array.isArray(v) ? v.join("; ") : String(v ?? ""));
    const lines = [
      `id: ${o.knowledge_id}`,
      `domain: ${o.domain} / ${o.sub_domain}   type: ${o.knowledge_type}`,
      `context: ${Object.entries(o.context || {}).map(([k, v]) => `${k}=${arr(v)}`).join(" · ")}`,
      `problem: ${o.problem}`,
      `decision: ${o.decision}`,
      `reasoning: ${o.reasoning}`,
      `why_this_works: ${o.why_this_works}`,
      `use_when: ${arr(o.use_when)}`,
      `avoid_when: ${arr(o.avoid_when)}`,
      `impact: ${o.impact}`,
    ];
    if (o.trade_off) {
      lines.push(
        typeof o.trade_off === "string"
          ? `trade_off: ${o.trade_off}`
          : `trade_off: ${o.trade_off.advantage} BUT ${o.trade_off.limitation}`
      );
    }
    for (const ap of o.anti_patterns || []) {
      lines.push(`anti_pattern: ${ap.problem} -> ${ap.replacement}`);
    }
    return lines.join("\n");
  }

  /**
   * Evaluates one object.
   *
   * Never throws. An unreachable model returns `unavailable: true` so a corpus
   * build degrades to rule-based scoring instead of failing — the same discipline
   * the marketing brain's fallback follows, and reported just as loudly.
   */
  public async evaluate(o: ReasoningKnowledgeObject): Promise<LLMKnowledgeEvaluation> {
    try {
      const raw = await this.llm.generateChatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: LLMKnowledgeEvaluator.render(o) },
        ],
        "knowledge_quality_review",
        { temperature: 0.2, max_tokens: 700, timeoutMs: 45000 }
      );

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON object in response");
      const parsed = JSON.parse(match[0]);

      const scores: LLMCriterionScore[] = (parsed.scores || [])
        .filter((s: any) => LLM_QUALITY_CRITERIA.includes(s?.criterion))
        .map((s: any) => ({
          criterion: s.criterion,
          score: Math.max(1, Math.min(10, Number(s.score) || 0)),
          justification: String(s.justification || ""),
        }));

      if (scores.length === 0) throw new Error("No recognised criteria in response");

      const overall = Number((scores.reduce((t, s) => t + s.score, 0) / scores.length).toFixed(2));
      return {
        knowledge_id: o.knowledge_id,
        scores,
        overall,
        recommendation: overall >= 7.5 ? "STRONG" : overall >= 5.5 ? "ACCEPTABLE" : "NEEDS_WORK",
        notes: String(parsed.notes || ""),
      };
    } catch (err: any) {
      return {
        knowledge_id: o.knowledge_id,
        scores: [],
        overall: 0,
        recommendation: "NEEDS_WORK",
        notes: "",
        unavailable: true,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Evaluates a corpus with bounded concurrency.
   *
   * Sequential review of a thousand objects is unusable; unbounded parallelism
   * exhausts the provider. A small fixed window is the only setting that works
   * for both.
   */
  public async evaluateCorpus(
    objects: ReasoningKnowledgeObject[],
    concurrency = 4
  ): Promise<LLMKnowledgeEvaluation[]> {
    const out: LLMKnowledgeEvaluation[] = [];
    for (let i = 0; i < objects.length; i += concurrency) {
      const batch = objects.slice(i, i + concurrency);
      out.push(...(await Promise.all(batch.map((o) => this.evaluate(o)))));
    }
    return out;
  }
}
