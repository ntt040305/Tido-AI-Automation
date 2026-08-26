"""
TIDO Voice Performance Engine - Natural Ending Controller (Phase 7)
===================================================================
Models organic sentence ending behaviors:
- statement: warm_drop
- question: curiosity_rise
- CTA: confident_close
- story: emotional_decay
Outputs metadata only.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class NaturalEndingController:
    """
    Natural ending behavior controller.
    """

    @classmethod
    def calculate_ending_behavior(
        cls,
        segment: SegmentV2,
        genre: str = "commercial_seller"
    ) -> Dict[str, Any]:
        text = segment.text.strip() if segment.text else ""
        text_lower = text.lower()

        is_question = "?" in text or any(k in text_lower for k in ["bạn có", "không", "bao giờ"])
        is_cta = any(k in text_lower for k in ["hãy", "ngay hôm nay", "bắt đầu"])
        is_story = genre.lower() in ["story", "storytelling", "documentary"]

        if is_question:
            ending_type = "curiosity_rise"
            pitch_shift_semitones = 1.0
            decay_ms = 40
        elif is_cta:
            ending_type = "confident_close"
            pitch_shift_semitones = -0.4
            decay_ms = 60
        elif is_story:
            ending_type = "emotional_decay"
            pitch_shift_semitones = -0.9
            decay_ms = 100
        else:  # statement
            ending_type = "warm_drop"
            pitch_shift_semitones = -0.6
            decay_ms = 70

        segment.performance.pitch_behavior.contour = ending_type
        segment.performance.pitch_behavior.pitch_shift_semitones = pitch_shift_semitones

        return {
            "ending_type": ending_type,
            "pitch_shift_semitones": pitch_shift_semitones,
            "decay_ms": decay_ms
        }
