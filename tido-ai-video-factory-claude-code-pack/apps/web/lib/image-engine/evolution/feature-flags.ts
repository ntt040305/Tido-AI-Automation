import fs from "fs";
import path from "path";
import { ComponentName, PipelineId } from "./pipeline-versions";

/**
 * The flag store.
 *
 * Three rules decide everything in this file:
 *
 *   1. The safe value is the default. An absent file, a corrupt file, a key
 *      nobody has heard of, a disk that will not read — every one of those
 *      resolves to stable with all features off. A flag system that fails into
 *      the experiment is worse than no flag system.
 *
 *   2. Rollback beats rollout. `TIDO_PIPELINE_KILL_SWITCH` overrides the file,
 *      the mode and every individual flag, so a bad experiment can be stopped
 *      from the environment without waiting for a write to succeed.
 *
 *   3. Turning the experiment ON is not itself a change. The experiment pipeline
 *      runs the stable components until a specific feature flag is set, so
 *      `active_pipeline: "experiment"` with no features enabled produces the
 *      same output as stable. The routing decision and the behaviour change are
 *      deliberately separate switches.
 */

export type RolloutMode = "production" | "internal_only" | "ab_testing";

export interface FeatureFlags {
  /** Which pipeline handles traffic when the mode allows it. */
  active_pipeline: PipelineId;
  /** Who the experiment is allowed to reach. */
  rollout_mode: RolloutMode;
  /** Share of traffic on the experiment when `rollout_mode` is "ab_testing", 0-100. */
  ab_percentage: number;
  /** Opaque tester ids allowed through in "internal_only". Never personal data. */
  internal_testers: string[];
  /** Behaviour switches. Every one is false by default and opt-in individually. */
  features: {
    creative_judgment_v2: boolean;
    adaptive_prompt_length: boolean;
    creative_exploration: boolean;
    visual_self_review: boolean;
    /**
     * Creative Judgment V1, experiment-only.
     *
     * Three switches rather than one because they fail differently. Exploration
     * costs an extra LLM call and can produce a worse direction than the first
     * idea; reasoning lengthens the prompt; the anti-generic check can talk the
     * model out of a choice that was right. Being able to turn one off without
     * losing the other two is the difference between diagnosing a regression and
     * reverting the phase.
     */
    creative_exploration_v1: boolean;
    creative_reasoning_v1: boolean;
    anti_generic_check_v1: boolean;
    /**
     * Creative Director Intelligence V2, experiment-only.
     *
     * Five more dimensions of the same judgement, split the same way and for the
     * same reason: they fail differently. Brand inference can invent a heritage
     * the client never claimed; consumer psychology can talk itself into a
     * stereotype; the review step can reject a direction that was fine. Turning
     * one off without losing the rest is what makes a regression diagnosable.
     *
     * They are also independent of the V1 three, so a run can carry strategy
     * without review, or semantics without exploration.
     */
    creative_strategy_intelligence_v1: boolean;
    consumer_psychology_v1: boolean;
    brand_positioning_v1: boolean;
    visual_semantics_v1: boolean;
    creative_review_v1: boolean;
    /**
     * Creative Director Control.
     *
     * Changes what the judgment IS, not how much of it there is. With this off,
     * the director's direction is appended beside the scene the Marketing Brain
     * invented independently — measured at 0.04 similarity, with 3 of 12 prompts
     * disagreeing about whether anyone is in the picture. With it on, the
     * direction is written into the brief the brain receives, so there is one
     * scene rather than two.
     *
     * Separate from the eight judgment flags because it is a different kind of
     * risk: those add reasoning, this transfers authority. If a direction is
     * wrong, this flag makes the whole image wrong rather than adding a
     * contradictory paragraph to it.
     */
    creative_director_control_v1: boolean;
    /**
     * Asset Type Intelligence.
     *
     * The director received `FORMAT: poster` as one line and had no instruction
     * anywhere telling it what a poster is — measured: zero references to any
     * format name in its entire prompt. This gives it the communication problem
     * the format represents, so its decisions can differ by format for a reason
     * rather than by accident.
     *
     * Separate from control because they compose in one direction only: context
     * improves the director's reasoning whether or not the director is in
     * control, but it only reaches art direction and typography when control is
     * also on, since that is what routes decisions into the USER tier.
     */
    asset_type_intelligence_v1: boolean;
    /**
     * Creative Decision Bridge.
     *
     * Measured: the director produces brand intelligence, consumer psychology and
     * visual semantics on every run — `has_brand: true`, `has_consumer: true`,
     * `semantics: 5` in the logs — and none of it reaches the renderer. Control
     * mode removed the appended block that used to carry it, which fixed the
     * duplicate-scene defect and threw away the payload with it. The cost is paid
     * either way: roughly 75 seconds of reasoning per render, discarded.
     *
     * This flag carries that reasoning through `hardRequirements`, which is the
     * only channel that both survives the optimizer (USER HARD REQUIREMENTS is
     * P0, present 5/5; BRAND KNOWLEDGE is P1, present 0/5) and has no length
     * ceiling.
     *
     * It deliberately carries no scene. A second description of what the picture
     * shows is what caused the original defect, and nothing here describes the
     * frame — only what the frame has to honour.
     */
    creative_bridge_v1: boolean;

    /**
     * Typography Foundation Cleanup V1 — who each string is.
     *
     * Stable infers copy roles in `SimpleInputAdapterService`, and the inference
     * cannot express the answer: measured on the Centella brief, "Ra mắt" and
     * "Giảm 20%" both typed `headline` on all five asset types, and the branch
     * order makes `price` and `product_name` unreachable for any brief that
     * arrives through `contentMessage`.
     *
     * This does not fix that inference — it is stable, and nothing here may
     * touch it. It replaces the ROLE LINES in the compiled prompt with roles the
     * director reasoned about, each carrying the reason it was assigned. A role
     * is only applied to a string already present in the prompt, so a director
     * that invents copy changes nothing.
     */
    typography_roles_v1: boolean;

    /**
     * Typography Foundation Cleanup V1 — breaking the font feedback loop.
     *
     * Measured on four of five asset types: the director writes a typography
     * decision naming a typeface, `applyCreativeDecision` puts it in the
     * concept, `VisualDirectionResolver.detectIn` reads the literal words
     * "serif" or "sans" out of that concept, and stable injects a fixed string
     * — "elegant high-contrast serif typography, refined proportions, premium
     * editorial typesetting" — into USER_HARD_CONSTRAINTS, which CONFLICT
     * PRIORITY ranks above art direction.
     *
     * So the system's own output became a client instruction with an authority
     * the client never granted it, and the reasoning that produced it was
     * discarded on the way.
     *
     * This substitutes the decision, with its reason, for that fixed string —
     * unless the user actually clicked a typography control, in which case the
     * user still wins and nothing is touched.
     */
    typography_control_priority_v1: boolean;
  };
  /** Which component builds an experiment run may use. */
  components: Record<ComponentName, boolean>;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  active_pipeline: "stable",
  // Internal-only by default so that enabling the experiment reaches nobody
  // until a tester is explicitly added. "Default: Stable + Internal Only".
  rollout_mode: "internal_only",
  ab_percentage: 0,
  internal_testers: [],
  features: {
    creative_judgment_v2: false,
    adaptive_prompt_length: false,
    creative_exploration: false,
    visual_self_review: false,
    creative_exploration_v1: false,
    creative_reasoning_v1: false,
    anti_generic_check_v1: false,
    creative_strategy_intelligence_v1: false,
    consumer_psychology_v1: false,
    brand_positioning_v1: false,
    visual_semantics_v1: false,
    creative_review_v1: false,
    creative_director_control_v1: false,
    asset_type_intelligence_v1: false,
    creative_bridge_v1: false,
    typography_roles_v1: false,
    typography_control_priority_v1: false,
  },
  components: {
    prompt_compiler: false,
    creative_engine: false,
    knowledge_base: false,
    evaluation: false,
  },
};

export const FEATURE_NAMES = Object.keys(DEFAULT_FLAGS.features) as (keyof FeatureFlags["features"])[];

const FLAGS_PATH = process.env.TIDO_FLAGS_PATH
  ? path.resolve(process.env.TIDO_FLAGS_PATH)
  : path.join(process.cwd(), "data", "evolution", "feature-flags.json");

/** Deep-copies the defaults so a caller can never mutate the baseline. */
function baseline(): FeatureFlags {
  return JSON.parse(JSON.stringify(DEFAULT_FLAGS));
}

/**
 * Merges stored values onto the defaults, one key at a time.
 *
 * Not `{...DEFAULT_FLAGS, ...stored}`: a stored `features` object missing a key
 * would drop that key entirely, and `undefined` is not `false` at a call site
 * that reads `flags.features.x`. Every value is also type-checked, because this
 * file is hand-editable and an operator typing `"true"` should not silently
 * enable anything.
 */
export function normalize(stored: unknown): FeatureFlags {
  const out = baseline();
  if (!stored || typeof stored !== "object") return out;
  const s = stored as Record<string, any>;

  if (s.active_pipeline === "experiment" || s.active_pipeline === "stable") {
    out.active_pipeline = s.active_pipeline;
  }
  if (s.rollout_mode === "production" || s.rollout_mode === "internal_only" || s.rollout_mode === "ab_testing") {
    out.rollout_mode = s.rollout_mode;
  }
  if (typeof s.ab_percentage === "number" && Number.isFinite(s.ab_percentage)) {
    out.ab_percentage = Math.max(0, Math.min(100, Math.round(s.ab_percentage)));
  }
  if (Array.isArray(s.internal_testers)) {
    out.internal_testers = s.internal_testers.filter((t: unknown) => typeof t === "string" && t.trim()).map(String);
  }
  if (s.features && typeof s.features === "object") {
    for (const k of FEATURE_NAMES) {
      if (s.features[k] === true) out.features[k] = true;
    }
  }
  if (s.components && typeof s.components === "object") {
    for (const k of Object.keys(out.components) as ComponentName[]) {
      if (s.components[k] === true) out.components[k] = true;
    }
  }
  return out;
}

/**
 * The flags in force right now.
 *
 * Read on every call rather than cached. A cache would make rollback depend on a
 * restart or a TTL, and "instant" is the requirement this file exists to meet.
 * The file is small and the read is dwarfed by the generation it precedes.
 */
export function readFlags(): FeatureFlags {
  // The kill switch is checked first and needs no file at all, so it still works
  // when the file is missing, unreadable, or being written.
  if (String(process.env.TIDO_PIPELINE_KILL_SWITCH || "").toLowerCase() === "true") {
    return baseline();
  }
  try {
    if (!fs.existsSync(FLAGS_PATH)) return baseline();
    return normalize(JSON.parse(fs.readFileSync(FLAGS_PATH, "utf-8")));
  } catch (err: any) {
    // Loud, because silently serving defaults while an operator believes an
    // experiment is running is its own kind of outage.
    console.warn("[EVOLUTION][FLAGS] unreadable, using stable defaults", {
      path: FLAGS_PATH,
      error: err?.message || String(err),
    });
    return baseline();
  }
}

/** Writes flags atomically so a reader never sees a half-written file. */
export function writeFlags(next: unknown): FeatureFlags {
  const normalized = normalize(next);
  fs.mkdirSync(path.dirname(FLAGS_PATH), { recursive: true });
  const tmp = `${FLAGS_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), "utf-8");
  fs.renameSync(tmp, FLAGS_PATH);
  console.log("[EVOLUTION][FLAGS] updated", {
    active_pipeline: normalized.active_pipeline,
    rollout_mode: normalized.rollout_mode,
    ab_percentage: normalized.ab_percentage,
    features_on: FEATURE_NAMES.filter((f) => normalized.features[f]),
  });
  return normalized;
}

export function flagsPath(): string {
  return FLAGS_PATH;
}
