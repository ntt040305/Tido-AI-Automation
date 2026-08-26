"""
TIDO Voice Performance Engine - Breath Behavior Planner (Phase 5)
==================================================================
Calculates natural breath placement metadata based on sentence length and DNA.
Metadata generator only - Zero text mutation guarantee.
"""

from typing import Dict, Any, Optional
from tido_engine.v2_schemas import SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA

class BreathBehaviorPlanner:
    """
    Calculates acoustic breath metadata for segments.
    """

    @classmethod
    def plan_breath_behavior(
        cls,
        segment: SegmentV2,
        dna: Optional[VoiceBehaviorDNA] = None
    ) -> Dict[str, Any]:
        text = segment.text.strip() if segment.text else ""
        word_count = len(text.split()) if text else 0

        breath_style = dna.breath_style if dna else "balanced"
        
        # Calculate breath probability based on sentence length
        if word_count > 15 or breath_style == "deep":
            breath_before = True
            duration_ms = 220
            intensity = 0.65
        elif word_count > 8 and breath_style != "minimal":
            breath_before = True
            duration_ms = 160
            intensity = 0.45
        else:
            breath_before = False
            duration_ms = 0
            intensity = 0.0

        return {
            "breath_before_sentence": breath_before,
            "breath_duration_ms": duration_ms,
            "breath_intensity": intensity,
            "breath_style": breath_style
        }
