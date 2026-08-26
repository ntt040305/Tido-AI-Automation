"""
TIDO Voice Performance Engine - Adaptive Profile Selector
==========================================================
Fuses VoiceBehaviorDNA personality traits with content strategy profile rules
to calculate adaptive weights for expressions, pauses, emotions, and spoken style.
Extends humanization_metadata without overwriting core performance parameters.
"""

from typing import Dict, Any, Optional
from tido_engine.v2_schemas import SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA

class AdaptiveProfileSelector:
    """
    Adaptive profile selector combining speaker DNA and content strategy.
    """

    @classmethod
    def apply_adaptive_profile(
        cls,
        segment: SegmentV2,
        dna: VoiceBehaviorDNA,
        profile_name: str,
        profile_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extends segment humanization_metadata with adaptive execution weights.
        """
        # Calculate adaptive weights
        expression_limit = profile_config.get("expression_limit", 2)
        pause_intensity = profile_config.get("pause_intensity", 0.5)
        emotion_strength = profile_config.get("emotion_strength", 0.7)
        spoken_style_strength = profile_config.get("spoken_style_strength", 0.6)
        ending_style = profile_config.get("ending_style", dna.ending_style)

        adaptive_metadata = {
          "resolved_profile": profile_name,
          "expression_limit": expression_limit,
          "pause_intensity": pause_intensity,
          "emotion_strength": emotion_strength,
          "spoken_style_strength": spoken_style_strength,
          "ending_style": ending_style,
          "speaker_dna": dna.to_dict()
        }

        return adaptive_metadata
