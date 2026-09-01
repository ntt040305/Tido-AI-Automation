/**
 * Voice Engine Integration Adapter
 *
 * Translates retrieved Knowledge Nodes, Technique Cards, and Brand DNA
 * into audio performance directives for Voice Engine V2 (F5-TTS Vietnamese).
 */

import { BrandDNA, KnowledgeNode, TechniqueCard } from "../types";

export interface VoiceEngineDirectivePayload {
  preferred_gender: "male" | "female" | "neutral" | "any";
  target_pacing_wpm: number;
  tone_descriptors: string[];
  pronunciation_lexicon: Record<string, string>;
  pause_strategy_hints: string[];
  emotion_profile_hints: string[];
}

export class VoiceEngineKnowledgeAdapter {
  public compileVoiceDirectives(
    nodes: KnowledgeNode[],
    techniqueCards: TechniqueCard[],
    brandDna?: BrandDNA
  ): VoiceEngineDirectivePayload {
    const toneDescriptors: string[] = [];
    const emotionProfileHints: string[] = [];
    const pauseStrategyHints: string[] = [];
    const lexicon: Record<string, string> = {};

    // 1. Process Brand DNA
    if (brandDna?.voice_identity) {
      toneDescriptors.push(...brandDna.voice_identity.tone_descriptors);
      if (brandDna.voice_identity.pronunciation_lexicon) {
        Object.assign(lexicon, brandDna.voice_identity.pronunciation_lexicon);
      }
    }

    // 2. Process Technique Cards
    for (const card of techniqueCards) {
      if (card.provider_hints?.voice_provider_emotion) {
        emotionProfileHints.push(card.provider_hints.voice_provider_emotion);
      }
    }

    // 3. Process Knowledge Nodes
    for (const node of nodes) {
      if (node.domain === "audio_directing") {
        pauseStrategyHints.push(...node.payload.core_directives);
      }
    }

    return {
      preferred_gender: brandDna?.voice_identity.preferred_speaker_gender || "any",
      target_pacing_wpm: 150,
      tone_descriptors: Array.from(new Set(toneDescriptors)),
      pronunciation_lexicon: lexicon,
      pause_strategy_hints: Array.from(new Set(pauseStrategyHints)),
      emotion_profile_hints: Array.from(new Set(emotionProfileHints)),
    };
  }
}
