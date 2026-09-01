/**
 * Engine Director Component V1.1
 *
 * Combines ProductionScenePackage and Knowledge Layer Outputs to compile fully realized
 * requests for Picture Engine, Voice Engine, Video Engine, and Composer Engine using existing contracts.
 */

import {
  ComposerEngineRequest,
  PictureEngineRequest,
  VideoEngineRequest,
  VoiceEngineRequest,
} from "@tido/contracts";
import {
  BrandDNA,
  ComposerEngineKnowledgeAdapter,
  KnowledgeNode,
  PictureEngineKnowledgeAdapter,
  TechniqueCard,
  VideoEngineKnowledgeAdapter,
  VoiceEngineKnowledgeAdapter,
} from "@tido/knowledge-base";
import { ProductionScenePackage } from "../interfaces/creative-director.interface";

export interface CompiledSceneEngineRequests {
  scene_id: string;
  picture_request: PictureEngineRequest;
  voice_request: VoiceEngineRequest;
  video_request: VideoEngineRequest;
  composer_request: ComposerEngineRequest;
}

export class EngineDirector {
  private pictureAdapter = new PictureEngineKnowledgeAdapter();
  private voiceAdapter = new VoiceEngineKnowledgeAdapter();
  private videoAdapter = new VideoEngineKnowledgeAdapter();
  private composerAdapter = new ComposerEngineKnowledgeAdapter();

  public compileSceneEngineRequests(
    scenePackage: ProductionScenePackage,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): CompiledSceneEngineRequests {
    // 1. Compile Picture Engine Directives
    const pictureKnowledge = this.pictureAdapter.compilePictureDirectives(
      nodes,
      techniqueCards,
      brandDna
    );

    const compiledPictureRequest: PictureEngineRequest = {
      ...scenePackage.visual_direction,
      prompt: `${scenePackage.visual_direction.prompt}. Shot type: ${scenePackage.visual_production.shot_type}. Lighting: ${scenePackage.visual_production.lighting}. ${pictureKnowledge.lighting_instructions}`.trim(),
      negative_prompt: [
        ...pictureKnowledge.brand_negative_prompts,
        ...scenePackage.qc_rules.must_not_have,
      ].join(", "),
      style_modifiers: pictureKnowledge.style_preset_hints,
    };

    // 2. Compile Voice Engine Directives
    const voiceKnowledge = this.voiceAdapter.compileVoiceDirectives(
      nodes,
      techniqueCards,
      brandDna
    );

    const compiledVoiceRequest: VoiceEngineRequest = {
      ...scenePackage.voice_direction,
      script_text: scenePackage.voice_production.script_text,
      emotion: (scenePackage.voice_production.emotion as any) || scenePackage.voice_direction.emotion,
      pause_duration_ms: 300,
    };

    // 3. Compile Video Engine Directives
    const videoKnowledge = this.videoAdapter.compileVideoDirectives(
      nodes,
      techniqueCards
    );

    const compiledVideoRequest: VideoEngineRequest = {
      ...scenePackage.motion_direction,
      camera_motion: (scenePackage.video_production.camera_movement as any) || scenePackage.motion_direction.camera_motion,
      duration_seconds: scenePackage.video_production.duration_seconds,
      fps: videoKnowledge.fps_target || 30,
    };

    // 4. Compile Composer Engine Directives
    const composerKnowledge = this.composerAdapter.compileComposerDirectives(
      nodes,
      techniqueCards,
      brandDna
    );

    const compiledComposerRequest: ComposerEngineRequest = {
      ...scenePackage.production_instruction,
      background_color: composerKnowledge.brand_primary_color_hex || "#000000",
    };

    return {
      scene_id: scenePackage.scene_id,
      picture_request: compiledPictureRequest,
      voice_request: compiledVoiceRequest,
      video_request: compiledVideoRequest,
      composer_request: compiledComposerRequest,
    };
  }
}
