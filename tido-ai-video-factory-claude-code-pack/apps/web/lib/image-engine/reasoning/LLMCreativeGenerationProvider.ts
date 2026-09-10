import { LLMProviderService } from "../llm/llm-provider.service";
import { similarity } from "./OriginalityEvaluator";
import {
  CreativeCandidate,
  CreativeGenerationProvider,
  GenerationRequest,
  MECHANISM_OBJECTIVES,
  STRUCTURE_DIRECTIONS,
} from "./creative-generation.types";

/**
 * CIOS Phase 4.0.7 — the provider that can actually write.
 *
 * Everything deterministic in this codebase splices material into a construction.
 * That is a hard ceiling: a construction can only recombine what the insight
 * already contains, so the population it produces is bounded by the insight's own
 * vocabulary. The audit's 234 distinct frames across 458 ideas is that ceiling
 * measured.
 *
 * This provider removes the ceiling by asking a model for the sentence. The
 * prompt gives it the same directions the deterministic provider gets — a
 * territory, optionally a structure, optionally a psychological objective — and
 * the same prohibition: do not restate the truth.
 *
 * Availability
 * -----------
 * The gateway at 127.0.0.1:8317 has been unreachable for every phase since 3.x,
 * so in practice `available()` returns true and `generate()` returns `[]` after a
 * failed call. That is the honest behaviour: the seam exists, is wired, and is
 * exercised by tests against a stub, but has never run against a live model. Any
 * benchmark number in this phase comes from the deterministic provider alone, and
 * the report says so rather than implying the LLM path contributed.
 *
 * Nothing here is trusted on return. Output is parsed, length-checked,
 * paraphrase-checked against `avoid`, and checked for restatement of the truth
 * before it becomes a candidate — a model that ignores the brief produces zero
 * candidates rather than bad ones.
 */

const SYSTEM_PROMPT = [
  "You are a creative director generating campaign ideas from a human insight.",
  "",
  "Rules:",
  "- Do NOT restate the insight. An idea that repeats the truth in other words is worthless. Transform it.",
  "- One sentence per idea. No headline formatting, no explanation, no campaign name.",
  "- Write about a specific situation, act, object or moment. Not about a category, a benefit or a feeling in the abstract.",
  "- Ideas must differ from each other in what they are ABOUT, not in wording.",
  "- If a direction is given, follow it. If none is given, go somewhere the directions would not have taken you.",
  "",
  'Reply with JSON only: {"ideas":["...","..."]}',
].join("\n");

export class LLMCreativeGenerationProvider implements CreativeGenerationProvider {
  public readonly name = "llm";
  public readonly asynchronous = true;
  private readonly llm: LLMProviderService;
  private readonly timeoutMs: number;

  constructor(llm?: LLMProviderService, timeoutMs = 40000) {
    this.llm = llm || new LLMProviderService();
    this.timeoutMs = timeoutMs;
  }

  public available(): boolean {
    return this.llm.isConfigured();
  }

  public async generate(request: GenerationRequest): Promise<CreativeCandidate[]> {
    if (!this.available()) return [];
    try {
      const raw = await this.llm.generateChatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: this.render(request) },
        ],
        "creative_candidate_generation",
        // Warmer than anything else in the codebase. This call exists to widen a
        // population that is provably too narrow; a low temperature here would
        // reproduce the deterministic provider at greater cost.
        { temperature: 0.95, max_tokens: 800, timeoutMs: this.timeoutMs }
      );

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      const ideas: string[] = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

      const out: CreativeCandidate[] = [];
      for (const rawIdea of ideas) {
        const idea = String(rawIdea || "").replace(/\s+/g, " ").trim();
        if (!this.acceptable(idea, request, out)) continue;
        out.push({
          idea,
          territory: request.territory.name,
          structure_direction: request.structure_direction,
          mechanism_objective: request.mechanism_objective,
          provider: this.name,
          derivation: this.derivation(request),
          unguided: !request.structure_direction && !request.mechanism_objective,
        });
        if (out.length >= request.count) break;
      }
      return out;
    } catch {
      // An unreachable or misbehaving model contributes nothing. It must never
      // fail a generation run — the deterministic provider is the floor.
      return [];
    }
  }

  /**
   * What a returned string has to clear before it counts as a candidate.
   *
   * The restatement check is the important one. Phase 4.0.4.1 measured that an
   * idea echoing the human truth scores well on truth-derived dimensions and is
   * still worthless, and a model asked for ideas about a truth will hand back the
   * truth unless something stops it. `similarity` is the same function the
   * originality evaluator uses, so the bar is the one already in force.
   */
  private acceptable(idea: string, request: GenerationRequest, sofar: CreativeCandidate[]): boolean {
    if (!idea) return false;
    const words = idea.split(/\s+/).length;
    if (words < 5 || words > 40) return false;
    if (/^(?:idea|concept|campaign|headline)\s*\d*\s*[:.-]/i.test(idea)) return false;
    if (similarity(idea, request.human_truth) >= 0.6) return false;
    if (request.avoid.some((a) => similarity(idea, a) >= 0.7)) return false;
    if (sofar.some((c) => similarity(idea, c.idea) >= 0.7)) return false;
    return true;
  }

  private derivation(r: GenerationRequest): string {
    const parts: string[] = [];
    if (r.structure_direction) parts.push(`structure:${r.structure_direction}`);
    if (r.mechanism_objective) parts.push(`mechanism:${r.mechanism_objective}`);
    if (!parts.length) parts.push("unguided");
    return `llm — ${parts.join(" + ")}`;
  }

  /**
   * The brief as the model sees it.
   *
   * The directions are stated as objectives verbatim from the shared tables, so
   * both providers are working to the same instruction and a difference in output
   * is a difference in capability rather than in what was asked.
   */
  private render(r: GenerationRequest): string {
    const L: string[] = [
      `BRAND: ${r.brief.brand} — ${r.brief.product}`,
      `CATEGORY: ${r.brief.category}`,
      `AUDIENCE: ${r.brief.audience}`,
      `CHALLENGE: ${r.brief.challenge}`,
      "",
      `HUMAN TRUTH (do not restate this): ${r.human_truth}`,
      `THEY WANT: ${r.contradiction.desire}`,
      `THEY FEAR: ${r.contradiction.fear}`,
      `IT WOULD COST THEM: ${r.contradiction.tradeoff}`,
    ];
    if (r.tension?.observable_behavior) L.push(`OBSERVED BEHAVIOUR: ${r.tension.observable_behavior}`);
    if (r.tension?.motivation.existential_tension) {
      L.push(`UNDERNEATH IT: ${r.tension.motivation.existential_tension}`);
    }
    L.push("", `TERRITORY: ${r.territory.name} — ${r.territory.central_tension}`);
    L.push(`THE BRAND ROLE HERE: ${r.territory.brand_role}`);
    if (r.brand_dna.history?.length) {
      L.push(`WHAT THE BRAND HAS ACTUALLY DONE: ${r.brand_dna.history.join("; ")}`);
    }

    L.push("");
    if (r.structure_direction) {
      L.push(`STRUCTURE TO SEARCH IN: ${STRUCTURE_DIRECTIONS[r.structure_direction]}`);
    }
    if (r.mechanism_objective) {
      const o = MECHANISM_OBJECTIVES[r.mechanism_objective];
      L.push(`PSYCHOLOGICAL OBJECTIVE: ${o.asks}`);
      L.push(`REACH FOR: ${o.reach_for}`);
    }
    if (!r.structure_direction && !r.mechanism_objective) {
      L.push("NO DIRECTION. Go somewhere a structure or an objective would not have taken you.");
    }
    if (r.avoid.length) {
      L.push("", "ALREADY WRITTEN — do not paraphrase any of these:");
      for (const a of r.avoid.slice(-12)) L.push(`  - ${a}`);
    }
    L.push("", `Return ${r.count} idea${r.count === 1 ? "" : "s"}.`);
    return L.join("\n");
  }
}
