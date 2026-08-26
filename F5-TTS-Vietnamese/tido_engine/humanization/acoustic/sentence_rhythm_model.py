"""
TIDO Voice Performance Engine - Sentence Rhythm Planner (Phase 5)
==================================================================
Computes dynamic cadence speed curves per segment progression.
Opening (0.95 - 1.0) -> Middle (1.0) -> CTA (1.05 - 1.08).
"""

from typing import Dict, Any, List
from tido_engine.v2_schemas import SegmentV2

class SentenceRhythmPlanner:
    """
    Sentence rhythm planner generating dynamic speed curves.
    """

    @classmethod
    def compute_rhythm_curve(
        cls,
        segments: List[SegmentV2],
        genre: str = "commercial"
    ) -> List[Dict[str, Any]]:
        total_segs = len(segments)
        rhythm_meta_list = []

        for idx, seg in enumerate(segments):
            seg_role = seg.performance.segment_role.lower()

            if idx == 0 or seg_role == "hook":
                speed_ratio = 0.96
                rhythm_phase = "opening_settle"
            elif seg_role in ["call_to_action", "cta"] or idx == total_segs - 1:
                speed_ratio = 1.06
                rhythm_phase = "cta_acceleration"
            else:
                speed_ratio = 1.00
                rhythm_phase = "middle_cadence"

            seg.performance.speed_ratio = speed_ratio

            rhythm_meta_list.append({
                "segment_id": seg.segment_id,
                "speed_ratio": speed_ratio,
                "rhythm_phase": rhythm_phase
            })

        return rhythm_meta_list
