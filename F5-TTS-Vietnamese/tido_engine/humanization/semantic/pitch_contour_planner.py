"""
TIDO Voice Performance Engine - Pitch Contour Planner (Phase 6)
===============================================================
Maps semantic intent to pitch contour behaviors:
- question_rise
- statement_fall
- cta_energy_rise
- emotional_soft_close
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class PitchContourPlanner:
    """
    Pitch contour behavior planner for semantic delivery.
    """

    @classmethod
    def plan_pitch_contour(cls, segment: SegmentV2, intent_meta: Dict[str, Any]) -> Dict[str, Any]:
        intent = intent_meta.get("intent", "EXPLANATION")
        text = segment.text.strip() if segment.text else ""

        if "?" in text or intent == "HOOK":
            contour = "question_rise"
            shift_semitones = 1.2
        elif intent == "CTA":
            contour = "cta_energy_rise"
            shift_semitones = 0.8
        elif intent in ["PAIN_POINT", "TRUST", "REFLECTION"]:
            contour = "emotional_soft_close"
            shift_semitones = -0.8
        else:
            contour = "statement_fall"
            shift_semitones = -0.5

        segment.performance.pitch_behavior.contour = contour
        segment.performance.pitch_behavior.pitch_shift_semitones = shift_semitones

        return {
            "contour": contour,
            "pitch_shift_semitones": shift_semitones
        }
