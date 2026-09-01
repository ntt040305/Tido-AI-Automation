/**
 * Creative Director Orchestrator Facade V1.1
 *
 * Upgraded orchestrator transforming a Brief into ProductionScenePackages,
 * Reference Asset Requirements, and Creative Decision Traces.
 */

import { Brief } from "@tido/contracts";
import { BrandDNA, KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import { BriefAnalyzer } from "./analyzer/brief-analyzer";
import { CampaignStrategyPlanner } from "./planner/campaign-strategy-planner";
import { ScenePlanner } from "./planner/scene-planner";
import { ReferenceAssetPlanner } from "./planner/reference-asset-planner";
import { buildCreativeDecisionTraces } from "./trace/creative-decision-trace";
import { CompiledSceneEngineRequests, EngineDirector } from "./director/engine-director";
import { CreativePlan, ReferenceAssetRequirement } from "./interfaces/creative-director.interface";

export interface CreativeDirectorOutput {
  plan: CreativePlan;
  reference_assets: ReferenceAssetRequirement[];
  engine_requests: CompiledSceneEngineRequests[];
}

export class CreativeDirectorOrchestrator {
  private analyzer = new BriefAnalyzer();
  private strategyPlanner = new CampaignStrategyPlanner();
  private scenePlanner = new ScenePlanner();
  private referenceAssetPlanner = new ReferenceAssetPlanner();
  private engineDirector = new EngineDirector();

  public generateCreativePlan(
    brief: Brief,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): CreativeDirectorOutput {
    // Stage 1: Analyze Brief
    const context = this.analyzer.analyzeBrief(brief);

    // Stage 2: Formulate Campaign Strategy
    const strategy = this.strategyPlanner.planStrategy(context);

    // Stage 3: Plan Reference Assets (Use Case A: Video AI + Use Case B: Commercial Creative)
    const referenceAssets = this.referenceAssetPlanner.planReferenceAssets(
      brief,
      context,
      strategy,
      brandDna
    );

    // Stage 4: Plan Production Scene Packages (extending Scene)
    const scenePackages = this.scenePlanner.planProductionScenePackages(
      brief,
      context,
      strategy,
      referenceAssets,
      brandDna
    );

    // Stage 5: Build Lightweight Decision Traces
    const decisionTraces = buildCreativeDecisionTraces(
      context,
      strategy,
      nodes,
      techniqueCards
    );

    // Stage 6: Compile Engine Directives via EngineDirector
    const engineRequests = scenePackages.map((scenePkg) =>
      this.engineDirector.compileSceneEngineRequests(
        scenePkg,
        nodes,
        techniqueCards,
        brandDna
      )
    );

    const plan: CreativePlan = {
      project_id: brief.project_id,
      brief: brief,
      context: context,
      strategy: strategy,
      scenes: scenePackages,
      decision_traces: decisionTraces,
      generated_at: new Date().toISOString(),
    };

    return {
      plan,
      reference_assets: referenceAssets,
      engine_requests: engineRequests,
    };
  }
}
