import { BrandDNA } from "./brand-dna.types";
import { CandidateSelfContainment } from "./CandidateSelfContainment";
import { CreativeSelfCritique, CritiqueResult } from "./CreativeSelfCritique";
import { LLMCreativeCriticProvider } from "./LLMCreativeCriticProvider";
import { CREATIVE_STRUCTURES, CreativeStructure } from "./creative-patterns.types";
import { CreativeTerritory } from "./creative-taste.types";
import { CreativeTerritoryEngine } from "./CreativeTerritoryEngine";
import { DeterministicGenerationProvider, opening } from "./DeterministicGenerationProvider";
import { HumanInsight } from "./human-insight.types";
import { InsightContradiction } from "./InsightContradictionEngine";
import { InsightTerms } from "./human-insight.archetypes";
import { MEMORY_MECHANISMS, MemoryMechanism } from "./emotional-mechanism.types";
import { similarity } from "./OriginalityEvaluator";
import {
  CreativeCandidate,
  CreativeGenerationProvider,
  GenerationRequest,
  POOL_TARGETS,
  PoolDiagnosis,
  RankableIdea,
  SelfContainmentResult,
} from "./creative-generation.types";

/**
 * CIOS Phase 4.0.7 — the pool a director is given.
 *
 * The problem this replaces
 * -----------------------
 * Six expression modes, fired once each, on one territory. 4.98 ideas per brief,
 * 0.92 territories per brief, two of five structures never produced at all. The
 * ranking layers built in 4.0.4–4.0.6 were choosing between six phrasings of one
 * strategy, and every "0 PURSUE" result since has been a measurement of that.
 *
 * What this does instead
 * ---------------------
 * Plans a search rather than enumerating an output. The plan spans several
 * territories, walks every structure and every mechanism as *directions*, and
 * reserves a third of its slots for generation with no direction at all. Each
 * slot is a request to a provider; providers return what they can honestly
 * produce and nothing is forced to fill a gap.
 *
 * Four things happen to what comes back, all upstream of the first evaluator:
 *
 *   1. paraphrase rejection — a candidate too close to one already held is dropped
 *   2. self-containment     — a candidate that cannot be read cold is retried once
 *                             on a different direction, then dropped
 *   3. diagnosis            — the pool is measured against POOL_TARGETS
 *   4. a gap pass           — missing structures, mechanisms or territories are
 *                             asked for specifically, once
 *
 * What it deliberately does not do
 * -------------------------------
 * No scoring, no ranking, no rubric. Nothing here reads a taste dimension, a
 * director dimension or a stress test, and no threshold in any evaluator moved
 * during this phase. That is the only way the benchmark at the end of the phase
 * is evidence rather than decoration: the judge did not change, the population
 * did.
 */

export interface PopulationInput {
  insight: HumanInsight;
  terms: InsightTerms;
  contradiction: InsightContradiction;
  brandDNA: BrandDNA;
  brief: GenerationRequest["brief"];
}

export interface PopulationOptions {
  /** Tried in order; the first that returns anything for a slot wins it. */
  providers?: CreativeGenerationProvider[];
  /** How many candidates to aim for. Clamped to POOL_TARGETS. */
  target?: number;
  /**
   * Run the self-critique pass. On by default.
   *
   * Off is for the benchmark's own use: measuring what the critique changes
   * requires a run without it, and a switch is more honest than a remembered
   * number from an earlier build.
   */
  critique?: boolean;
  /**
   * A model to ask as well as the rules. Async path only.
   *
   * Where it is supplied and reachable, both critics run and a candidate is
   * dropped if either drops it. Where it is not, the rule critique stands alone
   * and `critique.llm_reviewed` reports zero.
   */
  critic?: LLMCreativeCriticProvider;
}

export interface ContainmentSummary {
  checked: number;
  contained: number;
  /** Candidates sent back for a second attempt on a different direction. */
  retried: number;
  /** Retries that produced a candidate that did read cold. */
  recovered: number;
  /** Failed twice and never reached an evaluator. */
  dropped: number;
  mean_strength: number;
}

export interface PopulationResult {
  candidates: CreativeCandidate[];
  territories: CreativeTerritory[];
  diagnosis: PoolDiagnosis;
  containment: ContainmentSummary;
  /** Providers that actually contributed at least one candidate. */
  providers_used: string[];
  /** Whether the gap pass ran, and what it was asked for. */
  gap_pass: string[];
  /** What the self-critique did, before the diversity guard saw the pool. */
  critique: {
    reviewed: number;
    kept: number;
    dropped: number;
    by_issue: Record<string, number>;
    /** Reviews a model actually answered. Zero on every fallback run. */
    llm_reviewed: number;
  };
  notes: string[];
}

/** One request in the plan. */
interface Slot {
  territory: CreativeTerritory;
  structure?: CreativeStructure;
  mechanism?: MemoryMechanism;
  count: number;
}

// The top of the band POOL_TARGETS allows. The first run of the rebuilt pool
// landed at 11.05 per brief with a cap of 16, with a third of briefs pinned at
// the cap and the rest short on material — so the cap was binding on exactly the
// briefs that had more to give.
const DEFAULT_TARGET = 18;

export class CandidatePopulationBuilder {
  /**
   * The synchronous path, used by the benchmark.
   *
   * Providers whose `generate` returns a promise are skipped here and named in
   * the notes, rather than silently contributing nothing. The LLM provider is
   * async and therefore never contributes to a benchmark run — stated plainly so
   * no number in this phase can be read as evidence about a model that was never
   * reached.
   */
  public static buildSync(input: PopulationInput, options: PopulationOptions = {}): PopulationResult {
    return this.assemble(input, options, (provider, request) => {
      if (provider.asynchronous) return null;
      return provider.generate(request) as CreativeCandidate[];
    });
  }

  /**
   * The asynchronous path, which can use the LLM provider.
   *
   * Same plan, same guards, same diagnosis — only the awaiting differs. Kept as a
   * separate driver rather than making everything async because `runTasteBenchmark`
   * and eleven suites are synchronous, and converting them would be a change to
   * the test harness in a phase whose whole claim rests on the harness not moving.
   */
  public static async build(
    input: PopulationInput,
    options: PopulationOptions = {}
  ): Promise<PopulationResult> {
    const providers = this.providersFor(options);
    const state = this.begin(input, options);
    if (!state) return this.empty(["The insight supports no territory, so there is nothing to generate against."]);

    for (const slot of state.slots) {
      for (const provider of providers) {
        const got = await provider.generate(this.request(input, state, slot));
        if (this.take(got, state, input, slot)) break;
      }
      if (state.candidates.length >= state.max) break;
    }
    if (options.critique !== false) {
      if (options.critic) await this.cullWithCritic(state, input, options.critic);
      else this.cull(state, input);
    }
    await this.gapPassAsync(input, state, providers);
    return this.finish(state);
  }

  // ── Assembly ────────────────────────────────────────────────────────────

  private static assemble(
    input: PopulationInput,
    options: PopulationOptions,
    call: (p: CreativeGenerationProvider, r: GenerationRequest) => CreativeCandidate[] | null
  ): PopulationResult {
    const providers = this.providersFor(options);
    const state = this.begin(input, options);
    if (!state) return this.empty(["The insight supports no territory, so there is nothing to generate against."]);

    for (const p of providers) {
      if (p.asynchronous) {
        state.notes.push(`Provider "${p.name}" is asynchronous and was not used on the synchronous path.`);
      }
    }

    for (const slot of state.slots) {
      for (const provider of providers) {
        const got = call(provider, this.request(input, state, slot));
        if (got === null) continue;
        if (this.take(got, state, input, slot)) break;
      }
      if (state.candidates.length >= state.max) break;
    }

    // ── Self-critique, then the gap pass ───────────────────────────────
    // Order is the point. Culling first and refilling second means the gap pass
    // replaces what the critique removed, rather than the critique thinning a
    // pool the guard has already declared healthy.
    if (options.critique !== false) this.cull(state, input);

    for (const slot of this.gapSlots(state)) {
      for (const provider of providers) {
        const got = call(provider, this.request(input, state, slot));
        if (got === null) continue;
        if (this.take(got, state, input, slot)) break;
      }
    }
    return this.finish(state);
  }

  private static async gapPassAsync(
    input: PopulationInput,
    state: BuildState,
    providers: CreativeGenerationProvider[]
  ): Promise<void> {
    for (const slot of this.gapSlots(state)) {
      for (const provider of providers) {
        const got = await provider.generate(this.request(input, state, slot));
        if (this.take(got, state, input, slot)) break;
      }
    }
  }

  // ── Self-critique (Task 1) ──────────────────────────────────────────────

  /**
   * The rule critique, applied to the pool.
   *
   * A candidate carrying more issues than `CRITIQUE_ISSUE_LIMIT` is removed from
   * the pool and never reaches an evaluator. Its opening is left in place, so the
   * gap pass does not immediately regenerate the same sentence it just dropped.
   */
  private static cull(state: BuildState, input: PopulationInput): void {
    const anchors = this.anchorsFor(input);
    const truth = input.insight.human_truth;
    const kept: CreativeCandidate[] = [];
    for (const c of state.candidates) {
      const verdict = CreativeSelfCritique.review(c.idea, { human_truth: truth, anchors });
      state.critiques.push(verdict);
      if (verdict.keep) kept.push(c);
    }
    this.replaceCandidates(state, kept);
  }

  /** The same pass with a model consulted as well. Async path only. */
  private static async cullWithCritic(
    state: BuildState,
    input: PopulationInput,
    critic: LLMCreativeCriticProvider
  ): Promise<void> {
    const anchors = this.anchorsFor(input);
    const results = await critic.review(
      state.candidates.map((c) => c.idea),
      {
        human_truth: input.insight.human_truth,
        anchors,
        brief: `${input.brief.brand} — ${input.brief.product}. ${input.brief.challenge}`,
      }
    );
    const verdicts = new Map(results.map((r) => [r.idea.toLowerCase(), r]));
    const kept: CreativeCandidate[] = [];
    for (const c of state.candidates) {
      const verdict = verdicts.get(c.idea.toLowerCase());
      if (!verdict) {
        kept.push(c);
        continue;
      }
      state.critiques.push(verdict);
      if (verdict.llm_reached) state.llmReviewed++;
      if (verdict.keep) kept.push(c);
    }
    this.replaceCandidates(state, kept);
  }

  /**
   * Material only this brief supplies.
   *
   * Used by the critique to ask whether anything from the brief is load-bearing.
   * Deliberately the same three sources the generator anchors on, because the
   * question is whether the anchor actually survived into the sentence.
   */
  private static anchorsFor(input: PopulationInput): string[] {
    return [
      input.insight.dynamic_tension?.observable_behavior || "",
      input.brief.key_phrase || "",
      input.brief.product || "",
    ].filter(Boolean);
  }

  private static replaceCandidates(state: BuildState, kept: CreativeCandidate[]): void {
    state.candidates.length = 0;
    state.candidates.push(...kept);
    state.seen.length = 0;
    state.seen.push(...kept.map((c) => c.idea));
  }

  // ── The plan (Tasks 2, 3, 4) ────────────────────────────────────────────

  /**
   * Slots, before anything has been generated.
   *
   * Every structure and every mechanism gets a slot, so no direction can go
   * unexplored the way `emotional_reversal` and `human_ritual` did for three
   * phases. Territories are walked round-robin, which is what makes two
   * candidates aimed at the same structure land on different ground.
   *
   * The unguided reserve is sized here, at plan time, at a third of the slots.
   * Sizing it here rather than enforcing it on the output matters: a share
   * enforced on the output would mean discarding a directed candidate to hit a
   * ratio, which is optimising the diagnostic rather than the pool. The realised
   * share is measured and reported, and may drift below the planned one when a
   * direction yields nothing.
   */
  private static plan(territories: CreativeTerritory[], target: number): Slot[] {
    const at = (i: number) => territories[i % territories.length];
    let i = 0;

    const directed: Slot[] = [];
    for (const s of CREATIVE_STRUCTURES) directed.push({ territory: at(i++), structure: s, count: 2 });
    for (const m of MEMORY_MECHANISMS) directed.push({ territory: at(i++), mechanism: m, count: 2 });

    const unguidedCount = Math.max(3, Math.round(target * 0.33));
    const unguided: Slot[] = [];
    for (let k = 0; k < unguidedCount; k++) unguided.push({ territory: at(i++), count: 2 });

    // Interleaved rather than appended. Appended, the reserve sat behind ten
    // directed slots and the pool hit its cap before reaching it — the first run
    // came out 11% unguided against a 30% floor, which is the reserve quietly
    // going to zero exactly as the field comment warned. Interleaving spends the
    // cap proportionally instead of in plan order.
    const slots: Slot[] = [];
    const every = Math.max(1, Math.round(directed.length / unguided.length));
    let u = 0;
    directed.forEach((slot, k) => {
      slots.push(slot);
      if ((k + 1) % every === 0 && u < unguided.length) slots.push(unguided[u++]);
    });
    while (u < unguided.length) slots.push(unguided[u++]);
    return slots;
  }

  /**
   * What the pool is missing, as slots.
   *
   * Asks only for what the diagnosis says is absent, and asks for it on a
   * territory that is not already carrying it. One pass only — a guard that
   * regenerates until the diagnosis is satisfied would eventually force a fit,
   * which is the failure this whole phase exists to undo.
   */
  private static gapSlots(state: BuildState): Slot[] {
    const d = this.diagnose(state.candidates);
    if (d.healthy && state.candidates.length >= POOL_TARGETS.min_candidates) return [];

    const out: Slot[] = [];
    const at = (i: number) => state.territories[i % state.territories.length];
    let i = state.slots.length;

    for (const s of d.gaps.structures.slice(0, 3)) out.push({ territory: at(i++), structure: s, count: 2 });
    for (const m of d.gaps.mechanisms.slice(0, 3)) out.push({ territory: at(i++), mechanism: m, count: 2 });
    if (d.gaps.territories && state.territories.length > 1) {
      // More than one ground exists but the pool only landed on one. Ask the
      // unused ground for anything at all.
      const used = new Set(state.candidates.map((c) => c.territory));
      for (const t of state.territories.filter((t) => !used.has(t.name)).slice(0, 2)) {
        out.push({ territory: t, count: 2 });
      }
    }
    if (d.candidates < POOL_TARGETS.min_candidates) {
      for (let k = 0; k < 3; k++) out.push({ territory: at(i++), count: 2 });
    }
    state.gap_pass = out.map((s) =>
      s.structure ? `structure:${s.structure}` : s.mechanism ? `mechanism:${s.mechanism}` : `territory:${s.territory.name}`
    );
    return out;
  }

  // ── Intake (Task 5) ─────────────────────────────────────────────────────

  /**
   * Takes what a provider returned, and decides what survives.
   *
   * The retry is the part Task 5 asks for and it is deliberately narrow: one
   * further attempt, on a *different* direction, because retrying the same
   * direction on a deterministic provider returns the same sentence. A candidate
   * that fails twice is dropped here and never reaches an evaluator, so nothing
   * downstream is scoring a sentence that is about nothing.
   *
   * Returns true where the slot was satisfied, so the provider loop can stop.
   */
  private static take(
    got: CreativeCandidate[] | null | undefined,
    state: BuildState,
    input: PopulationInput,
    slot: Slot
  ): boolean {
    if (!got || !got.length) return false;
    let accepted = 0;

    for (const c of got) {
      if (state.candidates.length >= state.max) break;
      if (state.seen.some((s) => similarity(c.idea, s) >= 0.7)) continue;

      const check = CandidateSelfContainment.check(c.idea);
      state.checks.push(check);
      if (check.contained) {
        state.candidates.push(c);
        state.seen.push(c.idea);
        state.providers.add(c.provider);
        accepted++;
        continue;
      }

      // Failed cold reading. One retry, on a direction this slot was not using.
      state.containment.retried++;
      const retryDirection = this.otherDirection(slot, state);
      const retry = this.retryOnce(input, state, { ...slot, ...retryDirection, count: 1 });
      if (retry) {
        state.checks.push(retry.check);
        if (retry.check.contained) {
          state.candidates.push(retry.candidate);
          state.seen.push(retry.candidate.idea);
          state.providers.add(retry.candidate.provider);
          state.containment.recovered++;
          accepted++;
          continue;
        }
      }
      state.containment.dropped++;
    }
    return accepted > 0;
  }

  private static retryOnce(
    input: PopulationInput,
    state: BuildState,
    slot: Slot
  ): { candidate: CreativeCandidate; check: SelfContainmentResult } | null {
    // The retry always uses the deterministic provider: it is synchronous, always
    // available, and this path runs inside both drivers.
    const got = state.fallback.generate(this.request(input, state, slot));
    for (const c of got) {
      if (state.seen.some((s) => similarity(c.idea, s) >= 0.7)) continue;
      return { candidate: c, check: CandidateSelfContainment.check(c.idea) };
    }
    return null;
  }

  /** A direction the failing slot was not using, so the retry is a real retry. */
  private static otherDirection(slot: Slot, state: BuildState): Partial<Slot> {
    if (slot.structure) {
      const next = CREATIVE_STRUCTURES.find((s) => s !== slot.structure && !state.usedStructures().has(s));
      return { structure: next || undefined, mechanism: next ? undefined : "concretion" };
    }
    if (slot.mechanism) {
      const next = MEMORY_MECHANISMS.find((m) => m !== slot.mechanism && !state.usedMechanisms().has(m));
      return { mechanism: next || undefined, structure: next ? undefined : "object_carrying_truth" };
    }
    // An unguided slot that failed gets a direction, which is the one case where
    // the retry is a different kind of attempt rather than a different aim.
    return { structure: "object_carrying_truth" };
  }

  // ── Diagnosis (Task 7) ──────────────────────────────────────────────────

  /**
   * The pool, measured.
   *
   * `structures` and `mechanisms` count *directions aimed at*, not devices an
   * evaluator later detected — those are different claims and conflating them
   * would let the builder mark its own work. What an idea actually turned out to
   * be is `PatternExtractor`'s and `EmotionalMechanismExtractor`'s to say, and
   * neither ran here.
   */
  public static diagnose(candidates: CreativeCandidate[]): PoolDiagnosis {
    const structures = new Set(candidates.map((c) => c.structure_direction).filter(Boolean) as CreativeStructure[]);
    const mechanisms = new Set(candidates.map((c) => c.mechanism_objective).filter(Boolean) as MemoryMechanism[]);
    const territories = new Set(candidates.map((c) => c.territory));

    // Near-duplicates, at the same threshold intake rejects on, so the rate is a
    // real reading rather than a restatement of the intake rule.
    const clusters: string[] = [];
    for (const c of candidates) {
      if (!clusters.some((s) => similarity(c.idea, s) >= 0.7)) clusters.push(c.idea);
    }
    const n = candidates.length || 1;
    const duplicate_rate = Number((1 - clusters.length / n).toFixed(3));
    const unguided_share = Number((candidates.filter((c) => c.unguided).length / n).toFixed(3));

    const notes: string[] = [];
    if (candidates.length < POOL_TARGETS.min_candidates) {
      notes.push(`Only ${candidates.length} candidates; ${POOL_TARGETS.min_candidates} is the floor.`);
    }
    if (structures.size < POOL_TARGETS.min_structures) notes.push(`Only ${structures.size} structures explored.`);
    if (mechanisms.size < POOL_TARGETS.min_mechanisms) notes.push(`Only ${mechanisms.size} mechanisms aimed at.`);
    if (territories.size < POOL_TARGETS.min_territories) notes.push(`Only ${territories.size} territory in the pool.`);
    if (duplicate_rate > POOL_TARGETS.max_duplicate_rate) {
      notes.push(`${(duplicate_rate * 100).toFixed(0)}% of the pool is a near-duplicate of something else in it.`);
    }
    if (unguided_share < POOL_TARGETS.min_unguided_share) {
      notes.push(
        `Unguided share is ${(unguided_share * 100).toFixed(0)}%, below the ${(POOL_TARGETS.min_unguided_share * 100).toFixed(0)}% reserve.`
      );
    }

    return {
      candidates: candidates.length,
      distinct_ideas: clusters.length,
      duplicate_rate,
      structures: structures.size,
      mechanisms: mechanisms.size,
      territories: territories.size,
      unguided_share,
      gaps: {
        structures: CREATIVE_STRUCTURES.filter((s) => !structures.has(s)),
        mechanisms: MEMORY_MECHANISMS.filter((m) => !mechanisms.has(m)),
        territories: territories.size < POOL_TARGETS.min_territories,
      },
      healthy:
        candidates.length >= POOL_TARGETS.min_candidates &&
        structures.size >= POOL_TARGETS.min_structures &&
        mechanisms.size >= POOL_TARGETS.min_mechanisms &&
        territories.size >= POOL_TARGETS.min_territories &&
        duplicate_rate <= POOL_TARGETS.max_duplicate_rate,
      notes,
    };
  }

  // ── Handover ────────────────────────────────────────────────────────────

  /**
   * The pool, in the shape the ranker already accepts.
   *
   * `mode` carries the direction the candidate was generated under rather than
   * one of the six expression-mode labels. The old labels described a fixed
   * enumeration that no longer produces the pool, and stamping one on a candidate
   * that was not built that way would put a false provenance into taste memory.
   */
  public static toRankable(candidates: CreativeCandidate[], human_truth: string): RankableIdea[] {
    return candidates.map((c) => ({
      big_idea: c.idea,
      territory: c.territory,
      mode: c.structure_direction
        ? `structure:${c.structure_direction}`
        : c.mechanism_objective
          ? `mechanism:${c.mechanism_objective}`
          : "unguided",
      human_truth,
      why_it_works: c.derivation,
      emotional_hook: "",
      strategic_reason: `Generated on the territory "${c.territory}" by the ${c.provider} provider.`,
    }));
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private static providersFor(options: PopulationOptions): CreativeGenerationProvider[] {
    return options.providers?.length ? options.providers : [new DeterministicGenerationProvider()];
  }

  private static begin(input: PopulationInput, options: PopulationOptions): BuildState | null {
    const territories = CreativeTerritoryEngine.buildMany(input.insight, input.terms, input.contradiction);
    if (!territories.length) return null;
    const target = Math.min(
      POOL_TARGETS.max_candidates,
      Math.max(POOL_TARGETS.min_candidates, options.target || DEFAULT_TARGET)
    );
    const slots = this.plan(territories, target);
    return new BuildState(territories, slots, target);
  }

  private static request(input: PopulationInput, state: BuildState, slot: Slot): GenerationRequest {
    return {
      human_truth: input.insight.human_truth,
      contradiction: input.contradiction,
      tension: input.insight.dynamic_tension || null,
      brand_dna: input.brandDNA,
      territory: slot.territory,
      brief: input.brief,
      structure_direction: slot.structure,
      mechanism_objective: slot.mechanism,
      avoid: state.seen,
      avoid_openings: state.spentOpenings(),
      count: slot.count,
    };
  }

  private static finish(state: BuildState): PopulationResult {
    const agg = CandidateSelfContainment.aggregate(state.checks);
    const diagnosis = this.diagnose(state.candidates);
    const notes = [...state.notes, ...diagnosis.notes];
    if (!state.candidates.length) notes.push("No candidate survived the cold reading.");
    return {
      candidates: state.candidates,
      territories: state.territories,
      diagnosis,
      containment: {
        checked: agg.checked,
        contained: agg.contained,
        retried: state.containment.retried,
        recovered: state.containment.recovered,
        dropped: state.containment.dropped,
        mean_strength: agg.mean_strength,
      },
      providers_used: [...state.providers],
      gap_pass: state.gap_pass,
      critique: {
        ...CreativeSelfCritique.aggregate(state.critiques),
        llm_reviewed: state.llmReviewed,
      },
      notes,
    };
  }

  private static empty(notes: string[]): PopulationResult {
    return {
      candidates: [],
      territories: [],
      diagnosis: this.diagnose([]),
      containment: { checked: 0, contained: 0, retried: 0, recovered: 0, dropped: 0, mean_strength: 0 },
      providers_used: [],
      gap_pass: [],
      critique: { reviewed: 0, kept: 0, dropped: 0, by_issue: {}, llm_reviewed: 0 },
      notes,
    };
  }
}

/** Mutable state for one brief's build. Not exported; nothing outside reads it. */
class BuildState {
  public readonly candidates: CreativeCandidate[] = [];
  public readonly seen: string[] = [];
  public readonly checks: SelfContainmentResult[] = [];
  public readonly critiques: CritiqueResult[] = [];
  public llmReviewed = 0;
  public readonly providers = new Set<string>();
  public readonly notes: string[] = [];
  public readonly containment = { retried: 0, recovered: 0, dropped: 0 };
  public readonly fallback = new DeterministicGenerationProvider();
  public gap_pass: string[] = [];

  constructor(
    public readonly territories: CreativeTerritory[],
    public readonly slots: Slot[],
    public readonly max: number
  ) {}

  /**
   * Openings this pool already has its share of.
   *
   * Three is the cap. It is a judgement rather than a measurement: one opening
   * used twice reads as a pair of related ideas, and used five times reads as one
   * idea the writer could not get past.
   */
  public spentOpenings(): string[] {
    const counts = new Map<string, number>();
    for (const c of this.candidates) {
      const k = opening(c.idea);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n >= 3).map(([k]) => k);
  }

  public usedStructures(): Set<CreativeStructure> {
    return new Set(this.candidates.map((c) => c.structure_direction).filter(Boolean) as CreativeStructure[]);
  }

  public usedMechanisms(): Set<MemoryMechanism> {
    return new Set(this.candidates.map((c) => c.mechanism_objective).filter(Boolean) as MemoryMechanism[]);
  }
}
