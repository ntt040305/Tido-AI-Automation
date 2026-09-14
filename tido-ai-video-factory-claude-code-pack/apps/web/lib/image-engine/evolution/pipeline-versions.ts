/**
 * What is running, named so a log line can be traced back to code.
 *
 * Versions are declared per component rather than for the pipeline as a whole.
 * The reason is practical: a future change is almost never "the whole pipeline",
 * it is the compiler, or the reasoning engine, or the knowledge base. Pinning
 * them separately means an experiment can move one of them and leave the rest on
 * the stable build, and a regression can be attributed to the component that
 * actually moved.
 *
 * Nothing here imports the engine. This module is read by logging and by the
 * admin surface, and a cycle between "what version am I" and "the thing that has
 * a version" would make both harder to test.
 */

export type PipelineId = "stable" | "experiment";

/**
 * The component registry.
 *
 * `stable` is the build the current production path runs. `experiment` names the
 * build an experiment would run IF the corresponding feature flag is on; with
 * every flag off the experiment pipeline executes the stable components, so
 * these two columns describe the same code until someone opts in.
 */
export const COMPONENT_VERSIONS = {
  prompt_compiler: { stable: "prompt_compiler_v4_stable", experiment: "prompt_compiler_v5_experiment" },
  creative_engine: { stable: "creative_engine_v4", experiment: "creative_engine_v5" },
  knowledge_base: { stable: "knowledge_v4", experiment: "knowledge_v5" },
  evaluation: { stable: "evaluation_v4", experiment: "evaluation_v5" },
} as const;

export type ComponentName = keyof typeof COMPONENT_VERSIONS;

export const COMPONENT_NAMES = Object.keys(COMPONENT_VERSIONS) as ComponentName[];

/** The pipeline release each component set belongs to. */
export const PIPELINE_VERSIONS: Record<PipelineId, string> = {
  stable: "V4.0.4_STABLE",
  experiment: "V4.0.5_EXPERIMENT",
};

/**
 * The versions in force for a resolved pipeline.
 *
 * A component only reports its experiment version when its own flag is on.
 * Reporting `prompt_compiler_v5_experiment` because the request was routed to
 * the experiment pipeline, while the v5 compiler flag was off and the v4
 * compiler actually ran, would put a false attribution in the logs the
 * comparison later depends on.
 */
export function resolveComponentVersions(
  pipeline: PipelineId,
  enabledComponents: Partial<Record<ComponentName, boolean>> = {}
): Record<ComponentName, string> {
  const out = {} as Record<ComponentName, string>;
  for (const name of COMPONENT_NAMES) {
    const useExperiment = pipeline === "experiment" && enabledComponents[name] === true;
    out[name] = COMPONENT_VERSIONS[name][useExperiment ? "experiment" : "stable"];
  }
  return out;
}
