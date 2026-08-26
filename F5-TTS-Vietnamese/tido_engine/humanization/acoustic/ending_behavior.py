"""
TIDO Voice Performance Engine - Ending Style Resolver (Phase 5)
================================================================
Resolves sentence ending pitch contours and acoustic decay profiles.
Styles: warm_drop, confident_close, documentary_finish, conversational_soft.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class EndingStyleResolver:
    """
    Ending behavior resolver calculating pitch contour decay.
    """

    @classmethod
    def resolve_ending_style(
        cls,
        segment: SegmentV2,
        ending_style_preference: str = "confident_close"
    ) -> Dict[str, Any]:
        style = ending_style_preference.lower()

        if style == "warm_drop":
            pitch_shift_semitones = -0.75
            contour = "descending_warm"
            decay_ms = 80
        elif style == "documentary_finish":
            pitch_shift_semitones = -1.2
            contour = "deep_fade"
            decay_ms = 120
        elif style == "conversational_soft":
            pitch_shift_semitones = -0.3
            contour = "flat_soft"
            decay_ms = 50
        else:  # confident_close
            pitch_shift_semitones = -0.5
            contour = "punchy_drop"
            decay_ms = 60

        segment.performance.pitch_behavior.contour = contour
        segment.performance.pitch_behavior.pitch_shift_semitones = pitch_shift_semitones

        return {
            "ending_style": style,
            "contour": contour,
            "pitch_shift_semitones": pitch_shift_semitones,
            "decay_ms": decay_ms
        }
