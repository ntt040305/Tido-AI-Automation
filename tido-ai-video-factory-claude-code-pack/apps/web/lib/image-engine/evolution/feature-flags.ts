import fs from "fs";
import path from "path";
import { ComponentName } from "./pipeline-versions";

/**
 * The feature store.
 *
 * Phase 5.5.5 — Experience consolidation. There is ONE creative pipeline, and
 * its architecture lives in code, not in a file. That changes what a flag is:
 *
 *   1. CORE features are the architecture. They are always on and no file can
 *      turn them off. Before consolidation every one of them defaulted to off
 *      and the whole design ran only because of a gitignored JSON file on one
 *      machine -- so any fresh deployment silently served the bare render core.
 *
 *   2. EXPERIMENTS are the only switches left: built, not validated, off by
 *      default, opt-in one at a time through the file or the admin surface.
 *
 *   3. The kill switch still beats everything. `TIDO_PIPELINE_KILL_SWITCH`
 *      turns every feature off, core included, and the pipeline then renders
 *      through the core without the director -- the degraded path it already
 *      takes when the director fails. That is a reliability escape hatch for
 *      an outage (the LLM proxy down), not a second pipeline.
 */

export interface FeatureFlags {
  /**
   * Behaviour switches. CORE_FEATURES are always true (unless the kill switch
   * is set); every other key is an experiment, false unless opted in.
   */
  features: {
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

    /**
     * AssetIntent V2 — the format offers routes instead of assigning one.
     *
     * Three fields in `AssetContext` answered the question rather than asking
     * it: banner named a layout, and the thumbnail entry required a person and
     * then wrote type around that person's face. Measured on a live run, the
     * director read the banner line back and returned it as its own creative
     * idea, so the template travelled in as context and came out as a decision.
     *
     * On, the format also states the routes that legitimately solve it and the
     * ways it fails while still being a competent picture. Both are inputs for
     * the director to reason with; neither reaches the prompt, because a list of
     * strategies the renderer can read is a menu, which is the same defect
     * wearing a different name.
     *
     * Off, `assetContextFor` and `assetContextBrief` return exactly what they
     * returned before this flag existed, character for character.
     */
    asset_intent_v2: boolean;

    /**
     * The director's brief, assembled through a typed context instead of inline.
     *
     * The nine-field object literal in `ExperimentPipeline` was built from three
     * places in the request with nothing naming or typing the result, so what a
     * decision rested on could not be answered after the fact. This routes the
     * same nine fields through `buildContext` and `toDirectorBrief`, and records
     * the evidence — product image, logo, recognised format, stated industry —
     * that was previously invisible.
     *
     * It infers nothing and decides nothing. On and off must produce the same
     * `DirectorBriefInput`, and a test asserts that across a matrix of requests;
     * the flag exists so the claim can be withdrawn in one line rather than
     * because the two paths are expected to differ.
     */
    creative_decision_context_v1: boolean;

    /**
     * The director reads the client's own attachments.
     *
     * Until now the product photograph and the logo reached Nano Banana as
     * reference images and no reasoning layer had seen either: camera, lighting
     * and composition were decided for a product from a description of it. On,
     * one vision call reads the attachments and the director is handed a bounded
     * summary that keeps observation and interpretation apart.
     *
     * Requires `creative_decision_context_v1`, because the result lives on the
     * context. Enabled alone it is a switch with nothing behind it, and the
     * pipeline treats it as off.
     *
     * Every failure — no image, an unparseable answer, an answer that survives no
     * filtering, a thrown error — yields null. There is deliberately no fallback
     * description: a plausible sentence about a product nobody looked at is worse
     * than none, because it is indistinguishable from evidence.
     */
    visual_dna_v1: boolean;

    /**
     * The route is chosen, not assigned.
     *
     * Three direction names were written into the director's JSON contract —
     * Commercial Safe, Premium Brand, Creative Exploration — so every brief came
     * back answered by the same three commercial attitudes regardless of product,
     * audience, objective or format. On, the director develops three of the routes
     * the format actually offers, judges each against the product, the audience,
     * the objective, the brand, the channel and what can be produced, and quotes
     * the words each judgement rests on.
     *
     * Requires `asset_intent_v2`, which is where the routes come from. Without
     * routes there is nothing to choose between and the flag is treated as off.
     *
     * It REPLACES the fixed triad rather than joining it: two systems inventing
     * directions for one brief is the two-scene defect at the strategy layer.
     */
    creative_strategy_selection_v1: boolean;

    /**
     * Several products, one photograph.
     *
     * Measured on a three-product render: the compiled prompt ran to 21,684
     * characters and contained zero lines describing any relationship between
     * the products. Everything that mentioned them told the renderer to keep
     * them apart — three separate identities, do not clone, do not average,
     * three reference priorities at 0.9 — and the layout reserved one
     * PRODUCT_FOCAL zone for all three. The render was three glasses in a row,
     * evenly spaced, equally lit, with no contact shadow under any of them.
     * That is the prompt working as written.
     *
     * On, and only when two or more products are attached, the director is
     * asked why these products belong in one frame and what that makes
     * physically true: one ground, one key light, a depth order, contact. The
     * isolation instructions are untouched — they are why two products do not
     * become a hybrid. This adds the counterweight nobody had written.
     *
     * It is not a layout. It says what must be true of the scene and leaves the
     * arrangement to the renderer.
     */
    multi_product_staging_v1: boolean;
    /**
     * Layout Context Bridge V1. Carries decisions already made to where
     * layout is described. Adds no reasoning of its own, so it is inert
     * unless a director flag is also on to produce something to carry.
     */
    layout_context_bridge_v1: boolean;
    /**
     * Layout Priority Alignment V1. Rewrites the one clause that made
     * COMMERCIAL LAYOUT the final authority on composition, so geometry
     * stays binding and creative intent stops arriving pre-outranked.
     * Rides on the bridge: without a context block there is nothing for
     * the replacement clause to name.
     */
    layout_priority_alignment_v1: boolean;
    /**
     * Creative Constraint Calibration V1. States what creative intent governs
     * and what it does not license, so a direction written in words stops
     * being read as a list of props to build. Independent of the bridge.
     */
    creative_constraint_calibration_v1: boolean;
    /**
     * Format Challenge V1. Turns the format's failure modes from a list the
     * director eliminates with into a set of tests a route has to answer.
     *
     * Rides on `creative_strategy_selection_v1`: the requirement it adds is a
     * requirement on a candidate, and without route selection there are no
     * candidates. Inert on its own, and the brief it renders is byte-identical
     * to the V2 brief when this is off.
     */
    format_challenge_v1: boolean;
    /**
     * Product Truth V1. Assembles what is known about the product — functional
     * truth from the client's declared sales context, sensory reality from the
     * VisualDNA observation — with every claim labelled by how it is known.
     *
     * Rides on `creative_decision_context_v1`: the truth lives on the decision
     * context, so enabling it alone would build an object nothing holds. The
     * sensory tier additionally needs `visual_dna_v1`, without which it is
     * ABSENT rather than wrong.
     *
     * Assembly only in this phase. Nothing reads it, no prompt changes, and the
     * three fields that would need a judgement stay ABSENT.
     */
    product_truth_v1: boolean;
    /**
     * Creative Director Authority V1.
     *
     * `lockedIntent` is not the client. It is produced by
     * `CreativeInterpretation`, whose three sources are all LLM readings OF the
     * brief, and its camera/lighting/composition/material/environment arrays
     * were pushed at USER — the top tier — and printed as "EXPLICIT CLIENT
     * DIRECTIVES ... never substitute a house default".
     *
     * With this on, those dimensions are tiered CREATIVE_DIRECTOR unless the
     * client actually locked them in the visual direction panel. A real lock
     * still wins; an inference no longer impersonates one.
     *
     * Wired by Route 1: this pipeline resolves the flag and the user's real
     * locks, hands both to the orchestrator as options, and the orchestrator
     * puts them on `MasterPromptCompilerInput`. The compiler forwards two
     * booleans to the resolver and never learns what a flag is — the boundary
     * that has always held in this engine still holds.
     */
    creative_director_authority_v1: boolean;
    /**
     * Phase 1.1B. Assembles ProductTruth + VisualDNA + Marketing Strategy into
     * a Creative Brief and puts it in front of the director.
     *
     * Off by default like every flag here. Its cost is prompt characters and a
     * brief the director may or may not use better than the raw truth object,
     * which is a question for a render benchmark rather than an assumption.
     */
    creative_brief_v1: boolean;
    /**
     * Phase 1. Who is buying and what they are trying to solve, assembled
     * deterministically from ProductTruth and the marketing strategy.
     */
    marketing_insight_v1: boolean;
    /**
     * Phases 2–5. The unified creative reasoning layer: concept, art direction,
     * photography, typography and layout resolved in one place and carried to
     * the renderer as a single blueprint.
     *
     * Off by default. Its cost is prompt characters and a block the renderer
     * may or may not execute better than the composed director output, which is
     * a question for a render benchmark rather than an assumption.
     */
    professional_creative_brain_v1: boolean;
    /**
     * Phase 5. Runs the marketing brain BEFORE the Creative Director instead of
     * after it.
     *
     * The strategy was produced inside the stable orchestrator, which runs
     * downstream of the director: the director chose a direction and only then
     * did anything reason about the customer. Measured consequence,
     * `grounded_in_strategy_score` was 0 on 12/12 renders of every live run,
     * because the insight layer ran before its only source existed.
     *
     * Adds no LLM call. The same single marketing-brain call happens earlier and
     * its result is handed down, so the stable pipeline does not repeat it.
     */
    strategy_first_v1: boolean;
    /**
     * Phase 1.5. The first use of `reasoning/` from the render path.
     *
     * `HumanTensionAnalyzer` is pure, static and covered by the registered
     * suites; it was simply never imported by anything that renders. It builds
     * an insight ladder from the brief's own stated challenge and refuses to
     * pass the rung its evidence supports -- which is why it is the one module
     * worth wiring first, and why wiring it adds intelligence rather than
     * prompt length.
     *
     * It grounds `concept.creative_tension`, which until now had exactly one
     * source: the route the director rejected.
     */
    reasoning_tension_v1: boolean;
    /**
     * Phase 2-4. The commercial design production layer: design system, layer
     * composition, asset admission, campaign structure, format adaptation and
     * the design-project record.
     *
     * One flag for six modules because they are one decision -- each reads the
     * blueprint and none is useful alone. Six flags would be six ways to get a
     * half-configured frame.
     */
    design_production_v1: boolean;
    /**
     * Execution layer: layout geometry, render-ready typography, the commercial
     * critic and the creative document.
     *
     * One flag because they are one chain -- typography places against the
     * geometry, the document is built from both, and the critic scores all
     * three. Enabling a subset produces a half-placed frame.
     */
    execution_layer_v1: boolean;
    /** Phase 1. One validated context per render; nothing bypasses the chain. */
    production_pipeline_v2: boolean;
    /** Phase 2. Vision reading of the render. Costs one model call per render. */
    vision_iteration_v1: boolean;
    /** Phase 3. We set the type ourselves instead of asking the image model. */
    real_typography_v1: boolean;
    /** Phase 4. SVG, Canva and PSD-model export from the creative document. */
    export_layer_v1: boolean;
    /**
     * Typography Composition Hardening V1.
     *
     * The typography plan -- how many lines each string runs to, how much of
     * the frame the copy needs, which area the picture must leave quiet --
     * built before the image prompt is written, transmitted to the renderer as
     * SPACE rather than as words, and read back by the compositor when it sets
     * the type.
     *
     * One flag for the chain because it is one decision: the plan is what the
     * prompt reserves space for AND what the layout engine sets into. Enabling
     * half of it would reserve an area nothing uses, or set type into an area
     * nothing reserved -- which is the defect this phase exists to remove.
     *
     * Rides on the execution layer, where the geometry and the typography
     * system it reads are built. Off, the prompt and the document are exactly
     * what they were before the plan existed.
     *
     * The compositor's own hardening -- line breaking, one base size so
     * hierarchy cannot invert, contrast measured against the render -- is NOT
     * behind this flag. It is a correctness fix to code that was producing a
     * headline smaller than its own subheadline, and a correctness fix does
     * not get an off switch.
     */
    typography_plan_v1: boolean;
  };
  /** Which component builds an experiment run may use. */
  components: Record<ComponentName, boolean>;
}

/**
 * The architecture. Each was built, validated live and has been running as the
 * Experience pipeline; consolidation makes them the product rather than a
 * setting. Removing one is a code change, reviewed like any other.
 */
export const CORE_FEATURES = [
  "creative_reasoning_v1",
  "creative_strategy_intelligence_v1",
  "consumer_psychology_v1",
  "brand_positioning_v1",
  "creative_director_control_v1",
  "asset_type_intelligence_v1",
  "creative_bridge_v1",
  "typography_roles_v1",
  "asset_intent_v2",
  "creative_decision_context_v1",
  "visual_dna_v1",
  "creative_strategy_selection_v1",
  "multi_product_staging_v1",
  "product_truth_v1",
  "creative_director_authority_v1",
  "creative_brief_v1",
  "marketing_insight_v1",
  "professional_creative_brain_v1",
  "execution_layer_v1",
  "vision_iteration_v1",
  "typography_plan_v1",
] as const satisfies readonly (keyof FeatureFlags["features"])[];

export type CoreFeature = (typeof CORE_FEATURES)[number];

/** Everything off: what the kill switch serves. */
const ALL_OFF: FeatureFlags = {
  features: {
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
    asset_intent_v2: false,
    creative_decision_context_v1: false,
    visual_dna_v1: false,
    creative_strategy_selection_v1: false,
    multi_product_staging_v1: false,
    layout_context_bridge_v1: false,
    layout_priority_alignment_v1: false,
    creative_constraint_calibration_v1: false,
    format_challenge_v1: false,
    product_truth_v1: false,
    creative_director_authority_v1: false,
    creative_brief_v1: false,
    marketing_insight_v1: false,
    professional_creative_brain_v1: false,
    strategy_first_v1: false,
    reasoning_tension_v1: false,
    design_production_v1: false,
    execution_layer_v1: false,
    production_pipeline_v2: false,
    vision_iteration_v1: false,
    real_typography_v1: false,
    export_layer_v1: false,
    typography_plan_v1: false,
  },
  components: {
    prompt_compiler: false,
    creative_engine: false,
    knowledge_base: false,
    evaluation: false,
  },
};

export const FEATURE_NAMES = Object.keys(ALL_OFF.features) as (keyof FeatureFlags["features"])[];

/** The features that can still be switched: everything that is not core. */
export const EXPERIMENT_FEATURES = FEATURE_NAMES.filter((f) => !(CORE_FEATURES as readonly string[]).includes(f));

/** The architecture with every experiment off: what a missing file resolves to. */
export const DEFAULT_FLAGS: FeatureFlags = (() => {
  const d: FeatureFlags = JSON.parse(JSON.stringify(ALL_OFF));
  for (const f of CORE_FEATURES) d.features[f] = true;
  return d;
})();

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
 *
 * Only EXPERIMENTS are read from the file. A core feature set to false there
 * is ignored: the file cannot switch the architecture off. Keys from before
 * consolidation (`active_pipeline`, `rollout_mode`, `ab_percentage`,
 * `internal_testers`) and flags that no longer exist are ignored too, so an
 * old file keeps working.
 */
export function normalize(stored: unknown): FeatureFlags {
  const out = baseline();
  if (!stored || typeof stored !== "object") return out;
  const s = stored as Record<string, any>;

  if (s.features && typeof s.features === "object") {
    for (const k of EXPERIMENT_FEATURES) {
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
  // when the file is missing, unreadable, or being written. It turns EVERYTHING
  // off, core included: the pipeline then renders without the director.
  if (String(process.env.TIDO_PIPELINE_KILL_SWITCH || "").toLowerCase() === "true") {
    return JSON.parse(JSON.stringify(ALL_OFF));
  }
  try {
    if (!fs.existsSync(FLAGS_PATH)) return baseline();
    return normalize(JSON.parse(fs.readFileSync(FLAGS_PATH, "utf-8")));
  } catch (err: any) {
    // Loud, because silently serving defaults while an operator believes an
    // experiment is running is its own kind of outage.
    console.warn("[EVOLUTION][FLAGS] unreadable, using the core architecture with experiments off", {
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
    experiments_on: EXPERIMENT_FEATURES.filter((f) => normalized.features[f]),
  });
  return normalized;
}

export function flagsPath(): string {
  return FLAGS_PATH;
}
