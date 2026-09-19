import type { CreativeJudgment } from "../evolution/experiment/CreativeDirectorV1";

/**
 * Phase 0.4 — Benchmark Render Validation.
 *
 * What this is for
 * ----------------
 * Phases 0.1 to 0.3 repaired creative decision TRANSMISSION: the director chose a
 * direction, and until 0.1 the block announcing it never rendered on the strategy
 * branch. Every claim made about that repair so far is a claim about code — 1,035
 * passing tests say the resolver returns the right object, and not one of them
 * says a picture got better.
 *
 * This schema exists to stop that gap being closed by assertion. It measures two
 * different things and refuses to add them together:
 *
 *   STAGE 1  TRANSMISSION. What reaches the prompt, with the Phase 0 flags off
 *            and then on. Deterministic, offline, free, and runnable today. This
 *            is the half Phase 0 actually touched.
 *
 *   STAGE 2  RENDER. What reaches the picture. Needs real renders and human
 *            eyes, and no amount of text analysis substitutes for it.
 *
 * The honesty rule, inherited from `creative-benchmark.types.ts`
 * --------------------------------------------------------------
 * Every dimension declares how it is scored at the prompt stage:
 *
 *   AUTOMATED       — a literal property of the prompt text. Trustworthy alone.
 *   PROXY           — a measurable stand-in for something not directly
 *                     measurable. Directional evidence, never a verdict.
 *   NOT_MEASURABLE  — no honest prompt-stage proxy exists. Scored `null` and
 *                     excluded from every average, rather than given a number
 *                     that would look like knowledge.
 *
 * `ai_artifact_level` is the load-bearing example. Whether a render has six
 * fingers is not a property of the prompt, and a benchmark that scored it from
 * text would be grading its own vocabulary. It stays NOT_MEASURABLE until an
 * image exists.
 */

// ── 1. Scenarios ──────────────────────────────────────────────────────────

/** The six asset situations Phase 0.4 covers. */
export type AssetScenarioKind =
  | "product_hero"
  | "ugc"
  | "poster"
  | "social_ad"
  | "banner"
  | "multi_product";

export const ASSET_SCENARIO_KINDS: AssetScenarioKind[] = [
  "product_hero",
  "ugc",
  "poster",
  "social_ad",
  "banner",
  "multi_product",
];

/**
 * What the case is designed to expose.
 *
 * Cases are chosen, not sampled. Each names a situation where transmission has a
 * specific reason to fail, so a null result is informative instead of being an
 * artefact of a brief that asked nothing of the system.
 */
export type TransmissionChallenge =
  /** Nothing in the frame but the product — direction has nowhere to hide. */
  | "BARE_SUBJECT"
  /** A human and a real environment compete with the product for the frame. */
  | "HUMAN_CONTEXT"
  /** A reserved typographic area has to survive the creative direction. */
  | "TYPE_AREA"
  /** The asset must work at thumbnail size in a hostile feed. */
  | "ATTENTION_HOSTILE"
  /** Extreme aspect ratio forces a reading order the direction must respect. */
  | "WIDE_FORMAT"
  /** Several products must read as one photograph without losing identity. */
  | "IDENTITY_UNDER_GROUPING";

/** The brief, exactly as a client would state it. */
export interface ScenarioBrief {
  concept: string;
  brandName: string;
  /** Brand tone and position, used to score `brand_consistency`. */
  brandTone: string;
  objective: string;
  audience: string;
  useCase: string;
  aspectRatio: string;
}

/** What is physically attached to the render. */
export interface ScenarioProducts {
  count: number;
  /** One line per product, as the reference manifest would describe it. */
  items: string[];
  /** Identity features that must survive: label, shape, colour. */
  identityAnchors: string[];
}

/** Non-negotiables the render has to respect whatever the direction says. */
export interface ScenarioConstraints {
  /** Areas reserved for compositing. Creative must not occupy them. */
  reservedZones: string[];
  /** Copy that will be composited later, NOT drawn by the model. */
  copyItems: string[];
  /** Anything the model must never draw. */
  forbidden: string[];
}

/** The parts of a compiled prompt that do not move when the request is rewritten. */
export interface CompiledTemplate {
  role: string;
  strategy: string;
  identity: string[];
  artDirection: string;
  layout: string[];
  typography: string[];
}

export interface Phase0Scenario {
  id: string;
  kind: AssetScenarioKind;
  title: string;
  challenge: TransmissionChallenge;
  /** One line naming the transmission problem in plain terms. */
  transmission_challenge: string;
  brief: ScenarioBrief;
  products: ScenarioProducts;
  constraints: ScenarioConstraints;
  /**
   * The brief as the request carries it, before control mode rewrites anything.
   *
   * Control mode does not append the direction to the prompt — it rewrites the
   * REQUEST via `applyCreativeDecision`, and the compiler emits the rewritten
   * concept. A harness that skipped that step would compose against a prompt the
   * real pipeline never produces, and would then report the missing direction
   * block as a system defect rather than as its own omission. It did, on the
   * first run of this benchmark.
   */
  baseConcept: string;
  baseHardRequirements: string[];
  /**
   * The static half of the compiled prompt.
   *
   * A FIXTURE, and labelled as one everywhere it is reported. The real
   * `MasterPromptCompilerService` is async and repository-backed, and every
   * benchmark in this codebase treats it as a stable file whose bytes are
   * asserted rather than a service to drive. The section headings are the real
   * ones, because the composer reorders by heading.
   */
  template: CompiledTemplate;
  /**
   * The judgment this scenario feeds the composer.
   *
   * Also a FIXTURE, and this is the more important label of the two. A fixture
   * judgment measures whether the composer TRANSMITS a decision. It says nothing
   * about whether the director would have PRODUCED that decision, and reading it
   * that way is the single easiest mistake to make with these numbers.
   */
  judgment: CreativeJudgment;
  /** Flags for the OFF arm and the ON arm. Everything else identical. */
  flags: { off: Phase0Flags; on: Phase0Flags };
  /** Answerable yes or no by looking at the two renders side by side. */
  renderCriteria: string[];
  /** What makes the case a failure rather than a null result. */
  regressions: string[];
}

/**
 * The flags Phase 0.4 moves, and only these.
 *
 * Named explicitly rather than as `Record<string, boolean>` so a typo becomes a
 * compile error instead of a silently inert arm — which is the exact failure
 * `creative_bridge_v1` survived for its whole life before Phase 0.3.
 */
export interface Phase0Flags {
  creative_director_control_v1: boolean;
  creative_bridge_v1: boolean;
  creative_exploration_v1: boolean;
  creative_strategy_selection_v1: boolean;
  multi_product_staging_v1: boolean;
}

export interface Phase0Dataset {
  dataset_id: string;
  version: string;
  scenarios: Phase0Scenario[];
}

// ── 2. The seven dimensions ───────────────────────────────────────────────

export type Phase0DimensionId =
  | "product_identity_preservation"
  | "creative_concept_strength"
  | "composition_quality"
  | "commercial_usability"
  | "typography_readiness"
  | "brand_consistency"
  | "ai_artifact_level";

export type PromptStageMethod = "AUTOMATED" | "PROXY" | "NOT_MEASURABLE";

export interface Phase0DimensionDefinition {
  id: Phase0DimensionId;
  /** Scored 1-10 by a human at the render stage. Printed in the packet. */
  question: string;
  /** How, or whether, stage 1 can say anything about it from the prompt. */
  prompt_method: PromptStageMethod;
  /** For PROXY: what is actually being counted, stated plainly. */
  proxy_note?: string;
  /**
   * True where 10 is worst rather than best. `ai_artifact_level` is the only
   * one, and every aggregate has to invert it or the direction of the whole
   * benchmark silently flips on one column.
   */
  inverted?: boolean;
}

export const PHASE0_DIMENSIONS: Phase0DimensionDefinition[] = [
  {
    id: "product_identity_preservation",
    question: "Is the product in the frame the product that was uploaded — same label, same shape, same colour?",
    prompt_method: "PROXY",
    proxy_note:
      "Counts identity-lock instructions present in the prompt and checks no creative line licenses altering the product. Presence of the instruction is not preservation of the identity; only the render shows that.",
  },
  {
    id: "creative_concept_strength",
    question: "Is there an idea here, or is this a competent photograph of an object?",
    prompt_method: "PROXY",
    proxy_note:
      "Checks a NAMED direction reached the prompt carrying both halves — what happens in the frame and how it is rendered. This is exactly what Phases 0.1 and 0.2 repaired, so it is the strongest proxy in the set, and it still measures transmission rather than quality.",
  },
  {
    id: "composition_quality",
    question: "Does the eye land somewhere deliberate first, and move somewhere deliberate next?",
    prompt_method: "PROXY",
    proxy_note:
      "Checks a concrete, executable composition instruction is present and non-contradictory. A prompt can carry a good instruction and still render badly.",
  },
  {
    id: "commercial_usability",
    question: "Could this ship as-is, or does it need work before a client would use it?",
    prompt_method: "PROXY",
    proxy_note:
      "Checks reserved zones and compositing areas are declared and not contradicted by the creative direction.",
  },
  {
    id: "typography_readiness",
    question: "Is there clean, uncluttered space where the real copy will be composited?",
    prompt_method: "AUTOMATED",
    proxy_note:
      "A literal property of the prompt: a text-safe area is declared AND model-drawn text is forbidden. Both are checkable without judgement.",
  },
  {
    id: "brand_consistency",
    question: "Could this only be this brand, given its stated tone and position?",
    prompt_method: "PROXY",
    proxy_note:
      "Checks brand tone and positioning vocabulary survived into the transmitted direction. Detects absence; cannot confirm fit.",
  },
  {
    id: "ai_artifact_level",
    question: "How much of the frame betrays that a model made it? (10 = worst)",
    prompt_method: "NOT_MEASURABLE",
    inverted: true,
  },
];

// ── 3. What is recorded per render ────────────────────────────────────────

/** The creative pipeline's own account of what it decided. */
export interface CreativeOutputRecord {
  /** Resolved through `CreativeDirectionResolver` — the single reader, since 0.1. */
  selected_direction: string | null;
  /** Which branch answered: exploration or strategy. */
  direction_source: "exploration" | "strategy" | null;
  /** How the frame is rendered. Phase 0.2 is why this is non-empty on the strategy branch. */
  visual_language: string[];
  /** Why this direction, and why not the others. */
  reasoning: string;
  rejected_reasons: string[];
  /** The layout instruction that reached the prompt, if any. */
  layout_strategy: string | null;
  /**
   * How the decision travelled to the renderer on this arm.
   *
   *   control_rewrite  the request was rewritten, so the scene is IN the brief
   *   appended_block   a `## CREATIVE DIRECTION` section was appended
   *   none             neither — the decision did not reach the prompt at all
   *
   * Recorded because the two modes use different carriers, and a scorer that
   * only knew about one would report the other as a total transmission failure.
   */
  carrier: "control_rewrite" | "appended_block" | "none";
  /** The concept after control mode rewrote it. Equal to the brief when uncontrolled. */
  effective_concept: string;
  /** Hard requirements after the rewrite. This is where `Render it as:` lands, when it lands. */
  effective_hard_requirements: string[];
}

/** Everything the render needed, and everything it produced. */
export interface Phase0Record {
  scenario_id: string;
  kind: AssetScenarioKind;
  arm: "OFF" | "ON";

  input: {
    brief: ScenarioBrief;
    asset_type: AssetScenarioKind;
    products: ScenarioProducts;
    constraints: ScenarioConstraints;
    flags: Phase0Flags;
  };

  creative: CreativeOutputRecord;

  final: {
    /** The prompt as the provider would receive it. */
    generated_prompt: string;
    prompt_chars: number;
    /** What the composer added on top of the compiled prompt. */
    delta_chars: number;
    /**
     * Null until stage 2 runs. Named here so the record shape does not change
     * between stages and a stage-1 report cannot be mistaken for a full one.
     */
    provider_used: string | null;
    rendered_image_path: string | null;
  };
}

// ── 4. Scoring ────────────────────────────────────────────────────────────

export interface Phase0DimensionScore {
  dimension: Phase0DimensionId;
  prompt_method: PromptStageMethod;
  /** 1-10, or null where stage 1 has no honest basis for a number. */
  score: number | null;
  /** One line a reviewer can check against the evidence. */
  finding: string;
  /** Concrete text the score was derived from. */
  evidence: string[];
}

export interface Phase0ArmScore {
  scenario_id: string;
  arm: "OFF" | "ON";
  dimensions: Phase0DimensionScore[];
  /** Mean of scored dimensions only. Unscored are excluded, never zeroed. */
  transmission_overall: number;
  scored_count: number;
  unscored: Phase0DimensionId[];
}

export interface Phase0DimensionDelta {
  dimension: Phase0DimensionId;
  off: number | null;
  on: number | null;
  /** Positive means the ON arm scored higher. Null when either side is unscored. */
  delta: number | null;
}

export interface Phase0ScenarioResult {
  scenario_id: string;
  kind: AssetScenarioKind;
  challenge: TransmissionChallenge;
  off: Phase0Record;
  on: Phase0Record;
  off_score: Phase0ArmScore;
  on_score: Phase0ArmScore;
  deltas: Phase0DimensionDelta[];
  /** True when the two prompts are byte-identical — the flags did nothing. */
  inert: boolean;
  warnings: string[];
}

/**
 * A named weakness with its evidence attached.
 *
 * The report is written as findings rather than as a league table because the
 * decision it feeds is go / no-go on Phase 1, and that is made from the specific
 * things that are broken, not from a mean.
 */
export interface Phase0Bottleneck {
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  dimension?: Phase0DimensionId;
  summary: string;
  affected_scenarios: string[];
  evidence: string[];
}

export interface Phase0Report {
  report_id: string;
  dataset_id: string;
  generated_at: string;
  stage: "TRANSMISSION" | "RENDER";
  scenario_count: number;

  results: Phase0ScenarioResult[];

  summary: {
    off_mean: number;
    on_mean: number;
    delta: number;
    /** Scenarios where ON and OFF produced identical prompts. */
    inert_scenarios: string[];
  };

  by_dimension: {
    dimension: Phase0DimensionId;
    prompt_method: PromptStageMethod;
    off_mean: number | null;
    on_mean: number | null;
    delta: number | null;
  }[];

  bottlenecks: Phase0Bottleneck[];
  /**
   * Dimensions stage 1 could not score. Reported at the top level so a reader
   * cannot mistake the transmission result for the whole picture.
   */
  requires_render: Phase0DimensionId[];
  warnings: string[];
}
