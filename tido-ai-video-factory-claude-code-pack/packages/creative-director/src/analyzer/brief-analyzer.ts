/**
 * Brief Analyzer Component
 *
 * Analyzes Brief inputs and extracts structured CampaignContext.
 */

import { Brief } from "@tido/contracts";
import { CampaignContext } from "../interfaces/creative-director.interface";

export class BriefAnalyzer {
  public analyzeBrief(brief: Brief): CampaignContext {
    const marketingAngle =
      brief.key_selling_points.length > 0
        ? brief.key_selling_points[0]
        : `High-value solution for ${brief.product_name}`;

    return {
      industry: brief.industry,
      audience: brief.target_audience,
      objective: brief.campaign_objective,
      channel: brief.target_channel,
      marketing_angle: marketingAngle,
      brand_tone: brief.brand_tone,
    };
  }
}
