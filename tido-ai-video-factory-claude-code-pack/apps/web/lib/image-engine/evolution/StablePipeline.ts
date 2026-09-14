import { SimpleImageGenerationOrchestratorService } from "../service/SimpleImageGenerationOrchestratorService";
import { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";

/**
 * V4.0.4_STABLE.
 *
 * A pass-through, and it has to stay one. Every line added here is a line that
 * runs in production, so this file holds no validation, no normalisation, no
 * logging and no error handling of its own: the orchestrator already does all of
 * that, and a second opinion at this level would be a behaviour change wearing a
 * safety label.
 *
 * The point of the indirection is not to do anything. It is to give the router a
 * symmetrical pair of call targets, so that "which pipeline ran" is a fact about
 * routing rather than a branch buried inside the API handler.
 *
 * A test asserts that a call through here is argument-for-argument identical to
 * calling the orchestrator directly.
 */
export class StablePipeline {
  public static readonly VERSION = "V4.0.4_STABLE";

  public static run(
    request: SimpleInputRequestV1,
    options?: Parameters<typeof SimpleImageGenerationOrchestratorService.generateSimpleImage>[1]
  ): Promise<SimpleImageGenerationResultV1> {
    return SimpleImageGenerationOrchestratorService.generateSimpleImage(request, options);
  }
}
