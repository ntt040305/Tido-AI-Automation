import { getInfrastructure } from "@tido/infrastructure";
import type { Actor, ConceptInput, ObservedPattern, PatternDimension } from "@tido/shared";
import { PatternExtractor } from "@/lib/image-engine/reasoning/PatternExtractor";
import { EmbeddingService } from "@/lib/image-engine/retrieval/EmbeddingService";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import type { SimpleImageGenerationResultV1 } from "@/lib/image-engine/types";

/** Approval kinds, as `UserKitLearning.APPROVAL_KINDS` defines them. */
const APPROVAL_EVENT_KINDS = new Set(["download", "save", "favorite", "approve"]);
/** Negative kinds, as `UserKitLearning.NEGATIVE_KINDS` defines them. */
const NEGATIVE_EVENT_KINDS = new Set(["reject", "repeat_edit"]);

/** New patterns embedded per render, at most. First renders learn the most. */
const MAX_PATTERN_EMBEDDINGS = 12;

/** Off by an env flag, and off when nothing can embed. Mirrors asset indexing. */
function patternEmbeddingsEnabled(): boolean {
  if (String(process.env.TIDO_PATTERN_EMBEDDINGS || "").toLowerCase() === "off") return false;
  return Boolean(process.env.GEMINI_API_KEY);
}

/** What a pattern's vector is built from. Kept in `source_text` so it is auditable. */
export function patternSourceText(p: { dimension: string; value: string }): string {
  return `${p.dimension}: ${p.value}`;
}

/**
 * The directions a brief could have gone, and what keeps recurring across them.
 *
 * Phases 3.3 and 4, in one module because they read the same render and write
 * in the same fire-and-forget step.
 *
 * NEITHER HALF ADDS INTELLIGENCE
 * -------------------------------
 * `CreativeDirectorV1` already generates several directions, evaluates them,
 * picks one, says why, and names the strongest one it turned down. All of that
 * reached the prompt and was then discarded -- only `selected_direction`
 * survived, which records what was decided while losing what it was decided
 * OVER. Phase 4 here is a mapping, not a concept engine.
 *
 * The patterns are counted from what the render already produced and what the
 * database already holds. The one piece of real analysis reuses
 * `PatternExtractor`, the existing module, to name the creative DEVICE the idea
 * used -- and it is used for exactly the question it was written to answer,
 * rather than being bent into a composition detector it was never meant to be.
 *
 * WHY PATTERNS ARE LEARNED UNAPPROVED
 * ------------------------------------
 * A render is evidence that something was MADE, not that it was any good.
 * Approval arrives later, when a person clicks something, so a pattern is
 * counted here with `approved: false` and promoted separately by
 * `markRunApproved` when the signal actually arrives. Counting a render as a
 * success at the moment it finishes is how a system ends up learning from its
 * own output -- the closed loop the Phase 3 audit named as the deepest problem.
 */

/** Trimmed, bounded, or nothing at all. */
const clean = (v: unknown, max = 300): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? s.slice(0, max) : s;
};

/** The shape the director returns, as loosely typed as it arrives here. */
interface Judgment {
  directions?: {
    name?: string;
    core_idea?: string;
    visual_language?: string;
    why_it_fits?: string;
  }[];
  selected?: string;
  selection_reason?: string;
  rejected_reason?: string;
  /**
   * Route selection (`creative_strategy_selection_v1`). The developed routes live
   * here, not in `directions` -- which is empty in this mode, so every live
   * concept row used to be a bare route name with no idea, no reason and no
   * rejection.
   */
  strategy?: {
    routes_offered?: string[];
    selected?: string;
    selection_reason?: string;
    runner_up?: string;
    why_not_runner_up?: string;
    candidates?: {
      route?: string;
      core_idea?: string;
      visual_language?: string;
      why_this_route?: string;
      composition?: string;
      typography?: string;
      lighting?: string;
      emotional_objective?: string;
      audience_reaction?: string;
      risks?: string;
      earns_it?: string;
      assessment?: Record<string, unknown>;
    }[];
  };
  /** Phase 4.2 / 4.3, attached by the pipeline. See `DirectionEvaluator`. */
  evaluation?: {
    evaluations?: { route?: string; score?: number; [k: string]: unknown }[];
    director_pick?: string;
    director_reason?: string;
    selected?: string;
    source?: string;
    reasoning?: string;
  };
  reasoning?: Record<string, { value?: string; decision?: string } | undefined>;
}

/**
 * Every direction the director considered, and which one ran.
 *
 * The rejected ones are the actual content of a creative decision. A record of
 * winners alone looks more certain than the decision was, and cannot answer
 * which directions keep losing for which kind of brief.
 */
export function conceptRows(result: SimpleImageGenerationResultV1): ConceptInput[] {
  const j = (result as unknown as Record<string, unknown>).creativeJudgment as Judgment | null;
  if (!j) return [];

  const selected = clean(j.selected || j.strategy?.selected, 200);
  const out: ConceptInput[] = [];
  const seen = new Set<string>();

  for (const d of j.directions || []) {
    const route = clean(d?.name, 200);
    if (!route || seen.has(route.toLowerCase())) continue;
    seen.add(route.toLowerCase());
    const isSelected = Boolean(selected) && route.toLowerCase() === selected.toLowerCase();
    out.push({
      route,
      coreIdea: clean(d?.core_idea, 2000) || null,
      visualLanguage: clean(d?.visual_language, 2000) || null,
      // The winner's reason is the director's selection reason; a losing route
      // carries its own words about why it fits, which is not the same claim.
      whyThisRoute: isSelected
        ? clean(j.selection_reason, 2000) || clean(d?.why_it_fits, 2000) || null
        : clean(d?.why_it_fits, 2000) || null,
      selected: isSelected,
      // Only the director's single named rejection is a real reason. Attaching
      // it to every losing route would put words in its mouth about directions
      // it never commented on.
      rejectedReason:
        !isSelected && out.every((c) => !c.rejectedReason) ? clean(j.rejected_reason, 2000) || null : null,
      origin: "authored",
    });
  }

  // Routes the director DEVELOPED under route selection. Each one is written up
  // -- an idea, how it renders, why it fits -- so it is authored, not merely
  // offered. The only rejection with a real reason is the runner-up's: the
  // director names it and says why it lost. Attaching that to every losing
  // candidate would put words in its mouth.
  const runnerUp = clean(j.strategy?.runner_up, 200).toLowerCase();
  const evaluations = j.evaluation?.evaluations || [];
  for (const c of j.strategy?.candidates || []) {
    const route = clean(c?.route, 200);
    if (!route || seen.has(route.toLowerCase())) continue;
    seen.add(route.toLowerCase());
    const isSelected = Boolean(selected) && route.toLowerCase() === selected.toLowerCase();
    // Phase 4.1: the concept as the director specified it. Phase 4.2: how it
    // was evaluated. The selected row also carries the selection itself --
    // who made it, the director's own reason, and why this direction won.
    const evaluated = evaluations.find((e) => clean(e?.route, 200).toLowerCase() === route.toLowerCase());
    const details = compact({
      composition: clean(c?.composition, 1000),
      typography: clean(c?.typography, 1000),
      lighting: clean(c?.lighting, 1000),
      emotional_objective: clean(c?.emotional_objective, 1000),
      audience_reaction: clean(c?.audience_reaction, 1000),
      risks: clean(c?.risks, 1000),
      earns_it: clean(c?.earns_it, 1000),
      assessment: c?.assessment && typeof c.assessment === "object" ? c.assessment : undefined,
    });
    const evaluation = evaluated
      ? {
          ...evaluated,
          ...(isSelected && j.evaluation
            ? {
                selection: {
                  source: j.evaluation.source,
                  director_pick: j.evaluation.director_pick,
                  director_reason: j.evaluation.director_reason,
                  reasoning: j.evaluation.reasoning,
                },
              }
            : {}),
        }
      : null;
    out.push({
      details,
      evaluation,
      score: typeof evaluated?.score === "number" ? evaluated.score : null,
      route,
      coreIdea: clean(c?.core_idea, 2000) || null,
      visualLanguage: clean(c?.visual_language, 2000) || null,
      whyThisRoute: isSelected
        ? clean(j.strategy?.selection_reason ?? j.selection_reason, 2000) || clean(c?.why_this_route, 2000) || null
        : clean(c?.why_this_route, 2000) || null,
      selected: isSelected,
      rejectedReason:
        !isSelected && runnerUp && route.toLowerCase() === runnerUp
          ? clean(j.strategy?.why_not_runner_up, 2000) || null
          : null,
      origin: "authored",
    });
  }

  // Routes that were offered and never written up. Recorded so "what was on the
  // table" is answerable, and distinguishable from what the director engaged
  // with -- `origin` is the difference.
  for (const offered of j.strategy?.routes_offered || []) {
    const route = clean(offered, 200);
    if (!route || seen.has(route.toLowerCase())) continue;
    seen.add(route.toLowerCase());
    out.push({
      route,
      selected: Boolean(selected) && route.toLowerCase() === selected.toLowerCase(),
      origin: "offered",
    });
  }

  // A selection the director named but never described. Without this the run
  // would have considered directions and chosen none of them.
  if (selected && !seen.has(selected.toLowerCase())) {
    out.push({ route: selected, whyThisRoute: clean(j.selection_reason, 2000) || null, selected: true, origin: "offered" });
  }

  return out;
}

/** An object without its empty fields, or null when nothing is left. */
function compact(o: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** Reads a `Decision`-ish value without caring which shape it arrived in. */
function valueOf(v: unknown): string {
  if (typeof v === "string") return clean(v);
  if (v && typeof v === "object") {
    const d = v as { value?: unknown; decision?: unknown; approach?: unknown };
    return clean(d.value ?? d.decision ?? d.approach);
  }
  return "";
}

/**
 * What this render did, as observations that can be counted across renders.
 *
 * Only dimensions the render actually produced. A null `typography` on the
 * blueprint means the layer that builds it did not run, and recording "no
 * typography" as a pattern would turn a disabled feature into a house style.
 */
export function patternRows(
  result: SimpleImageGenerationResultV1,
  runId: string,
  problems: number,
): ObservedPattern[] {
  const r = result as unknown as Record<string, unknown>;
  const out: ObservedPattern[] = [];
  const add = (dimension: PatternDimension, value: string) => {
    const v = clean(value);
    if (!v) return;
    out.push({ dimension, value: v, runId, approved: false, problems });
  };

  const intelligence = result.creativeIntelligence as Record<string, unknown> | undefined;
  const judgment = r.creativeJudgment as Judgment | null;

  const direction = clean(intelligence?.selected_direction ?? judgment?.selected, 300);
  add("direction", direction);

  // The director's own reasoning, one observation per axis it actually decided.
  for (const axis of ["composition", "typography", "lighting"] as const) {
    add(axis, valueOf(judgment?.reasoning?.[axis]));
  }

  // The design structures, where the layers that build them ran.
  const composition = r.visualComposition as Record<string, unknown> | undefined;
  add("composition", valueOf(composition?.approach));
  const layout = r.layoutGeometry as Record<string, unknown> | undefined;
  add("layout", valueOf(layout?.strategy ?? layout?.approach));

  // What the uploaded surface supports, which is a lighting fact about the
  // object rather than a preference about the frame.
  const assetDna = r.assetDna as Record<string, unknown> | undefined;
  const supports = (assetDna?.product as Record<string, unknown> | undefined)?.treatment as
    | { supports?: { value?: string }[] }
    | undefined;
  for (const s of supports?.supports || []) add("lighting", clean(s?.value));

  // The creative DEVICE the idea used. The existing module, asked the question
  // it was written to answer: what transfers between briefs.
  const idea = clean(
    (intelligence?.big_idea as { value?: string } | undefined)?.value ??
      intelligence?.creative_angle ??
      judgment?.directions?.[0]?.core_idea,
    600,
  );
  if (idea) {
    for (const d of PatternExtractor.extract(idea)) {
      // Weak detections are noise. The extractor reports strength precisely so
      // a caller can refuse to count a guess.
      if (d.strength >= 0.5) add("structure", d.structure);
    }
  }

  // What recurs TOGETHER. A direction is weak guidance on its own; a direction
  // that keeps arriving with a particular composition is the thing a creative
  // department would actually recognise.
  const composed = out.find((o) => o.dimension === "composition")?.value;
  if (direction && composed) add("combination", `${direction} + ${composed}`);

  return out;
}

export interface RecordCreativeMemoryInput {
  result: SimpleImageGenerationResultV1;
  runId: string;
  actor: Actor | null;
  orgId?: string | null;
  /** Vision problems found in this render, when a review ran. */
  problems?: number;
}

/**
 * Writes both. Never throws, never awaited for a value.
 *
 * Concepts are recorded for every render, signed in or not: they describe the
 * run, and the run is already stored. Patterns need an owner, because a pattern
 * is a property of somebody's body of work and one nobody owns can never be
 * retrieved.
 */
export async function recordCreativeMemory(input: RecordCreativeMemoryInput): Promise<void> {
  try {
    const infra = getInfrastructure();
    if (!infra.isConfigured() || !input.runId) return;

    const concepts = conceptRows(input.result);
    if (concepts.length) {
      const stored = await infra.creativeMemory.recordConcepts(input.runId, concepts);
      if (!stored.ok) {
        if (!stored.unavailable) console.warn("[CREATIVE_CONCEPTS] not recorded:", stored.error);
      } else {
        console.log("[CREATIVE_CONCEPTS]", {
          considered: concepts.length,
          ...stored.data,
          authored: concepts.filter((c) => c.origin === "authored").length,
        });
      }
    }

    if (!input.actor) return;
    const patterns = patternRows(input.result, input.runId, Math.max(0, Math.trunc(input.problems || 0)));
    if (!patterns.length) return;

    const learned = await infra.creativeMemory.learnPatterns(input.actor, patterns, input.orgId);
    if (!learned.ok) {
      if (!learned.unavailable) console.warn("[CREATIVE_PATTERNS] not learned:", learned.error);
      return;
    }
    // Counts and dimensions only. A pattern's value describes a customer's
    // creative work and does not belong in a log line.
    console.log("[CREATIVE_PATTERNS]", {
      observed: patterns.length,
      ...learned.data,
      dimensions: [...new Set(patterns.map((p) => p.dimension))].join(","),
    });

    // An approval that arrived BEFORE this render's patterns were stored.
    // `markRunApproved` runs when the signal lands and promotes the patterns
    // whose evidence includes this run -- if a person downloads within the few
    // seconds this background write takes, there are none yet and the approval
    // would be lost for good. So the check is repeated from this side. Both
    // paths go through `approved_runs`, so a run is credited once either way.
    await promoteIfAlreadyApproved(input);

    // Phase 3.4. Meaning for the patterns just learned, so recall can rank them
    // against a brief. `embedPattern` existed and nothing called it: every
    // pattern had a null vector and the brief-matching search returned nothing.
    await embedNewPatterns(input.actor, patterns);
  } catch (e) {
    console.warn("[CREATIVE_MEMORY] not recorded:", e instanceof Error ? e.message : String(e));
  }
}

async function promoteIfAlreadyApproved(input: RecordCreativeMemoryInput): Promise<void> {
  const engineId = input.result.generationId;
  if (!input.actor || !engineId) return;
  try {
    const infra = getInfrastructure();
    const events = await infra.memory.events(input.actor, 200);
    if (!events.ok) return;
    const mine = events.data.filter((e) => e.engine_generation_id === engineId);
    if (mine.some((e) => APPROVAL_EVENT_KINDS.has(e.kind))) {
      const promoted = await infra.creativeMemory.markRunApproved(input.actor, input.runId);
      if (promoted.ok && promoted.data) {
        console.log("[CREATIVE_PATTERNS][APPROVED]", { patterns: promoted.data, late: true });
      }
    }
    // Phase 4.6. The same race for the negative half: a reject clicked before
    // this background write stored the patterns would otherwise count nothing.
    if (mine.some((e) => NEGATIVE_EVENT_KINDS.has(e.kind))) {
      const demoted = await infra.creativeMemory.markRunRejected(input.actor, input.runId);
      if (demoted.ok && demoted.data) {
        console.log("[CREATIVE_PATTERNS][REJECTED]", { patterns: demoted.data, late: true });
      }
    }
  } catch (e) {
    console.warn("[CREATIVE_PATTERNS] promotion skipped:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Embeds the patterns this render touched that have no vector yet.
 *
 * One call per NEW pattern; a reinforced pattern already has its vector and
 * costs nothing. Failures leave the pattern usable by exact match, which is
 * what it was before this ran.
 */
export async function embedNewPatterns(
  actor: Actor | null,
  observed: { dimension: string; value: string }[],
): Promise<{ embedded: number; failed: number }> {
  const outcome = { embedded: 0, failed: 0 };
  if (!actor || !observed.length || !patternEmbeddingsEnabled()) return outcome;

  const infra = getInfrastructure();
  const wanted = new Set(observed.map((o) => `${o.dimension}|${o.value.trim().toLowerCase()}`));
  const listed = await infra.creativeMemory.listPatterns(actor, undefined, 500);
  if (!listed.ok) return outcome;

  const model = IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL;
  const missing = listed.data
    .filter((p) => wanted.has(`${p.dimension}|${p.value_key}`))
    .filter((p) => !(p as { embedding_model?: string | null }).embedding_model)
    .slice(0, MAX_PATTERN_EMBEDDINGS);

  for (const p of missing) {
    const sourceText = patternSourceText(p);
    try {
      const vector = await EmbeddingService.embedText(sourceText, false);
      const stored = await infra.creativeMemory.embedPattern(actor, p.id, sourceText, vector, model);
      if (stored.ok && stored.data) outcome.embedded++;
      else outcome.failed++;
    } catch (e) {
      outcome.failed++;
      console.warn("[CREATIVE_PATTERNS] not embedded:", e instanceof Error ? e.message : String(e));
    }
  }
  if (missing.length) console.log("[CREATIVE_PATTERNS][EMBEDDED]", { ...outcome, model });
  return outcome;
}
