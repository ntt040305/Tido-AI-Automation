"""
TIDO Voice Performance Engine - Biological Breath Controller (Phase 7)
======================================================================
Generates biological breathing behavior metadata based on sentence length and genre.
Metadata generator only - Zero text mutation guarantee.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class BiologicalBreathController:
    """
    Biological breathing behavior generator.
    """

    @classmethod
    def calculate_breath_behavior(
        cls,
        segment: SegmentV2,
        genre: str = "commercial_seller"
    ) -> Dict[str, Any]:
        text = segment.text.strip() if segment.text else ""
        words = text.split()
        word_count = len(words)
        text_lower = text.lower()

        is_cta = any(k in text_lower for k in ["hãy", "ngay hôm nay", "bắt đầu", "đăng ký"])
        is_story = genre.lower() in ["story", "storytelling", "documentary"]

        if is_cta:
            breath_prob = 0.15
            breath_duration_ms = 80
            breath_strength = 0.15
        elif is_story or word_count > 14:
            breath_prob = 0.85
            breath_duration_ms = 240
            breath_strength = 0.55
        elif word_count < 7:
            breath_prob = 0.25
            breath_duration_ms = 120
            breath_strength = 0.25
        else:
            breath_prob = 0.60
            breath_duration_ms = 180
            breath_strength = 0.40

        return {
            "breath_probability": breath_prob,
            "breath_duration_ms": breath_duration_ms,
            "breath_strength": breath_strength
        }
