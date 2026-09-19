import type { CreativeDirection, CreativeJudgment } from "./CreativeDirectorV1";

/**
 * One answer to "which creative direction was chosen".
 *
 * Why this exists
 * ---------------
 * The director fills one of two mutually exclusive branches. Exploration writes
 * `directions` and `selected`; strategy selection writes `strategy.selected` and
 * leaves the first two empty. They are the two arms of a single `if/else`, so a
 * judgment never carries both from one call.
 *
 * Four places in this codebase resolved that on their own, with two different
 * precedence orders:
 *
 *   NanoBananaPromptComposer   j.selected || j.strategy?.selected    exploration first
 *   CreativeDecision:247       j.strategy?.selected || j.selected    strategy first
 *   LayoutContextBridge:125    strategy, else j.selected             strategy first
 *   ExperimentPipeline:168     j.strategy?.selected only             strategy only
 *
 * So the prompt block, the control-mode brief, the layout context and the
 * telemetry could each name a different direction for one render — and for a
 * while the composer named none at all, because it read only the field the
 * branch in use had left empty. That is the defect this repairs: not a typo in
 * one access, but four independent readings of one decision.
 *
 * Precedence, and why
 * -------------------
 * Exploration wins where both somehow exist. Exploration produces a NAMED
 * direction with a body — what happens in the frame, how it is rendered, why
 * this brief earns it. Strategy selection produces a route: a sentence about
 * which commercial strategy the channel supports. They are different axes, and
 * the route already has its own section in the prompt. Choosing the route as the
 * "direction" would replace a described picture with a category.
 *
 * This reads. It never writes, never calls a model, and never invents a value:
 * a field the director did not fill comes back empty, and the caller omits the
 * line rather than printing a placeholder.
 */
export interface ResolvedDirection {
  /** The chosen direction's name, or the route when that is all there is. */
  name: string;
  /** Candidate directions, empty when exploration did not run. */
  directions: CreativeDirection[];
  /** Why this one was chosen. Empty when the director gave no reason. */
  reasoning: string;
  /** Why the others were not used. Empty when nothing was rejected. */
  rejectedReasons: string[];
  /**
   * Concrete lines about how the frame should look: what happens in it, then
   * how it is rendered. Both branches supply both halves since Phase 0.2; a
   * judgment produced before that carries one line instead of two.
   */
  appearance: string[];
  /** Which branch supplied the answer. Telemetry reads this to spot silent no-ops. */
  source: "exploration" | "strategy";
}

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * Reads the chosen direction out of a judgment, or returns null when none was made.
 *
 * Null rather than an empty object, so the caller's check is `if (direction)`
 * rather than a truthiness test on a field that may legitimately be blank.
 *
 * The shapes below are the ones the director can currently produce plus the one
 * a future branch would most plausibly add (`strategySelection`), read defensively
 * so a new branch does not require a fifth reader somewhere else in the tree.
 */
export function resolveSelectedDirection(
  judgment: CreativeJudgment | null | undefined
): ResolvedDirection | null {
  if (!judgment) return null;
  const j = judgment as CreativeJudgment & {
    strategySelection?: { selected?: string; selection_reason?: string; why_not_runner_up?: string };
  };

  const directions: CreativeDirection[] = Array.isArray(j.directions) ? j.directions : [];

  // ── exploration ───────────────────────────────────────────────────────────
  const exploredName = clean(j.selected);
  if (exploredName) {
    const chosen = directions.find((d) => clean(d?.name) === exploredName) || directions[0];
    const appearance: string[] = [];
    if (chosen?.core_idea) appearance.push(clean(chosen.core_idea));
    if (chosen?.visual_language) appearance.push(clean(chosen.visual_language));

    const reasonParts = [clean(j.selection_reason), clean(chosen?.why_it_fits)].filter(Boolean);
    return {
      name: exploredName,
      directions,
      reasoning: reasonParts.join(" "),
      rejectedReasons: [clean(j.rejected_reason)].filter(Boolean),
      appearance: appearance.filter(Boolean),
      source: "exploration",
    };
  }

  // ── strategy selection, current and hypothetical future shape ─────────────
  const strat = j.strategy || j.strategySelection;
  const routeName = clean((strat as any)?.selected);
  if (routeName) {
    const candidate = Array.isArray(j.strategy?.candidates)
      ? j.strategy!.candidates.find((c) => clean(c?.route) === routeName)
      : undefined;
    // Both halves of the picture, matching what the exploration branch supplies:
    // what happens in the frame, then how it is rendered. `visual_language` is
    // Phase 0.2 and is optional, so a judgment produced before it existed still
    // resolves — it simply contributes one appearance line instead of two.
    // `why_this_route` is a justification, so it belongs with the reasoning.
    const appearance = [clean(candidate?.core_idea), clean(candidate?.visual_language)].filter(
      Boolean
    );
    const reasonParts = [
      clean((strat as any)?.selection_reason),
      clean(candidate?.why_this_route),
    ].filter(Boolean);
    return {
      name: routeName,
      directions,
      reasoning: reasonParts.join(" "),
      rejectedReasons: [clean((strat as any)?.why_not_runner_up)].filter(Boolean),
      appearance,
      source: "strategy",
    };
  }

  return null;
}

/** Telemetry view. Counts and booleans plus the one name, never the full prose. */
export function directionTelemetry(resolved: ResolvedDirection | null) {
  return {
    creative_direction_present: Boolean(resolved),
    selected_direction: resolved?.name || null,
    direction_source: resolved?.source || null,
    reasoning_present: Boolean(resolved?.reasoning),
    directions_count: resolved?.directions.length ?? 0,
    rejected_reasons_count: resolved?.rejectedReasons.length ?? 0,
    appearance_lines: resolved?.appearance.length ?? 0,
  };
}
