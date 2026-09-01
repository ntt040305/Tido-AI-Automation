/**
 * Campaign Strategy Planner Component
 *
 * Formulates creative strategy based on CampaignContext.
 */

import { CampaignContext, CampaignStrategy } from "../interfaces/creative-director.interface";

export class CampaignStrategyPlanner {
  public planStrategy(context: CampaignContext): CampaignStrategy {
    let framework: "problem_solution" | "storytelling" | "product_demo" | "social_proof_cta" = "problem_solution";

    if (context.objective === "awareness") {
      framework = "storytelling";
    } else if (context.objective === "conversion") {
      framework = "social_proof_cta";
    } else if (context.objective === "consideration") {
      framework = "product_demo";
    }

    return {
      creative_angle: `${context.marketing_angle} tailored for ${context.audience}`,
      hook_strategy: `Visual interrupt highlighting core pain point of ${context.audience}`,
      emotional_direction: context.objective === "conversion" ? "urgent_authoritative" : "curious_inspiring",
      content_framework: framework,
      cta_strategy: `Direct action cue targeted for ${context.channel}`,
    };
  }
}
