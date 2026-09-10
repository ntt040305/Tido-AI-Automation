import { LLMProviderService } from "../llm/llm-provider.service";
import { CreativeSelfCritique, CritiqueIssue, CritiqueResult } from "./CreativeSelfCritique";

/**
 * CIOS Phase 4.0.7 — the same second look, asked of a model.
 *
 * Uses the existing `LLMProviderService`. No new client, no new key, no new
 * endpoint — the seam that already exists, with a different prompt on it.
 *
 * What it adds over the rule-based critique
 * ----------------------------------------
 * Three of the five questions are judgements a regex only approximates. Whether
 * you can imagine a film from a sentence is not a lexical property, and the rule
 * version substitutes "does it contain a concrete noun", which is a proxy and
 * says so. This asks the question.
 *
 * How disagreement is handled
 * --------------------------
 * The rule critique runs first and its verdict stands unless the model returns a
 * usable answer. Where both ran, a candidate is dropped if *either* drops it —
 * the union, not the average. A critic that has to be outvoted is not a critic,
 * and averaging two verdicts would produce a number, which is the thing this
 * layer is specifically not.
 *
 * Availability
 * -----------
 * Falls back silently in behaviour and loudly in reporting: an unreachable model
 * returns the rule verdict with `llm_reached: false` on it, so a run can always
 * say which reviews were actually seen by a model. Nothing here may report
 * rule-based output as model output — that confusion is exactly what Task 4 of
 * this phase exists to end.
 */

const SYSTEM_PROMPT = [
  "You are a creative director reviewing an idea before a pitch.",
  "",
  "Judge:",
  "1. Is this merely saying the human truth differently?",
  "2. Could another competitor say this?",
  "3. Can you imagine a film, activation or experience from this?",
  "4. Is there a specific human moment?",
  "5. Does it contain tension or only a nice sentence?",
  "",
  "Be strict. Most sentences that sound like ideas are not ideas.",
  "",
  "Return JSON only:",
  '{"reviews":[{"idea":"...","keep":true,"issues":["restates_truth"],"reasoning":"one sentence"}]}',
  "",
  "issues must be drawn from exactly these five:",
  "restates_truth, generic_category_claim, no_human_moment, not_brand_owned, no_tension",
].join("\n");

const VALID_ISSUES: CritiqueIssue[] = [
  "restates_truth",
  "generic_category_claim",
  "no_human_moment",
  "not_brand_owned",
  "no_tension",
];

export interface CriticResult extends CritiqueResult {
  /** True only where a model actually answered for this idea. */
  llm_reached: boolean;
}

export class LLMCreativeCriticProvider {
  public readonly name = "llm-critic";
  private readonly llm: LLMProviderService;
  private readonly timeoutMs: number;

  constructor(llm?: LLMProviderService, timeoutMs = 45000) {
    this.llm = llm || new LLMProviderService();
    this.timeoutMs = timeoutMs;
  }

  /** Configuration only. Reachability is `LLMProviderService.probe()`. */
  public available(): boolean {
    return this.llm.isConfigured();
  }

  /**
   * Reviews a whole pool in one call.
   *
   * One request per pool rather than per candidate: eighteen round trips per
   * brief across a hundred briefs is 1,800 calls for one benchmark arm, which is
   * not a review budget anyone would spend. Batching also lets the model see the
   * candidates against each other, which is how a director reads a page of them.
   */
  public async review(
    ideas: string[],
    context: { human_truth?: string; anchors?: string[]; brief?: string } = {}
  ): Promise<CriticResult[]> {
    // The rule critique is the floor and always runs. Its verdict is what stands
    // if the model cannot be reached, so a fallback run is never empty.
    const floor: CriticResult[] = ideas.map((idea) => ({
      ...CreativeSelfCritique.review(idea, context),
      llm_reached: false,
    }));
    if (!ideas.length || !this.available()) return floor;

    try {
      const raw = await this.llm.generateChatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: this.render(ideas, context) },
        ],
        "creative_self_critique",
        { temperature: 0.2, max_tokens: 1600, timeoutMs: this.timeoutMs }
      );

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return floor;
      const parsed = JSON.parse(match[0]) as { reviews?: unknown };
      const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
      if (!reviews.length) return floor;

      // Matched by text rather than by position: a model that returns nine
      // reviews for ten ideas would otherwise shift every verdict by one.
      const byIdea = new Map<string, { keep: boolean; issues: CritiqueIssue[]; reasoning: string }>();
      for (const r of reviews as Record<string, unknown>[]) {
        const key = String(r?.idea || "").trim().toLowerCase();
        if (!key) continue;
        const issues = (Array.isArray(r?.issues) ? r.issues : [])
          .map((i) => String(i))
          .filter((i): i is CritiqueIssue => VALID_ISSUES.includes(i as CritiqueIssue));
        byIdea.set(key, {
          keep: r?.keep !== false,
          issues,
          reasoning: String(r?.reasoning || ""),
        });
      }

      return floor.map((f) => {
        const hit = byIdea.get(f.idea.toLowerCase());
        if (!hit) return f;
        // The union. Either critic may drop a candidate; neither may rescue one
        // the other dropped.
        const issues = [...new Set([...f.issues, ...hit.issues])] as CritiqueIssue[];
        return {
          idea: f.idea,
          keep: f.keep && hit.keep,
          issues,
          reasoning: hit.reasoning ? `${f.reasoning} Director: ${hit.reasoning}` : f.reasoning,
          llm_reached: true,
        };
      });
    } catch {
      return floor;
    }
  }

  private render(ideas: string[], context: { human_truth?: string; anchors?: string[]; brief?: string }): string {
    const L: string[] = [];
    if (context.brief) L.push(`BRIEF: ${context.brief}`);
    if (context.human_truth) L.push(`HUMAN TRUTH: ${context.human_truth}`);
    if (context.anchors?.length) L.push(`THIS BRIEF'S OWN MATERIAL: ${context.anchors.join("; ")}`);
    L.push("", "IDEAS:");
    for (const idea of ideas) L.push(`  - ${idea}`);
    L.push("", "Return one review per idea, quoting the idea back verbatim.");
    return L.join("\n");
  }
}
