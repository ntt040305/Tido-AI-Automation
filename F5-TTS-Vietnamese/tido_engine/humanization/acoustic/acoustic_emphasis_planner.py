"""
TIDO Voice Performance Engine - Acoustic Emphasis Planner (Phase 5)
====================================================================
Generates nuanced acoustic word emphasis metadata without text mutation.
Outputs: word, energy_boost, duration_scale, pause_after_ms.
"""

from typing import Dict, Any, List
from tido_engine.v2_schemas import SegmentV2

class AcousticEmphasisPlanner:
    """
    Nuanced acoustic emphasis planner avoiding aggressive volume spikes.
    """

    @classmethod
    def plan_segment_emphasis(cls, segment: SegmentV2) -> List[Dict[str, Any]]:
        emphasis_words_input = segment.performance.emphasis_words or []
        emphasis_meta_list = []

        for item in emphasis_words_input:
            word = item.get("word") if isinstance(item, dict) else str(item)
            level = item.get("level", "moderate") if isinstance(item, dict) else "moderate"

            if level == "strong":
                energy_boost = "+1.8 dB"
                duration_scale = 1.12
                pause_after_ms = 40
            else:
                energy_boost = "+1.0 dB"
                duration_scale = 1.06
                pause_after_ms = 20

            emphasis_meta_list.append({
                "word": word,
                "energy_boost": energy_boost,
                "duration_scale": duration_scale,
                "pause_after_ms": pause_after_ms
            })

        return emphasis_meta_list
