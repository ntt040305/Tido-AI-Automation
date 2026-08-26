"""
TIDO Voice Performance Engine - Emotion Timeline (Phase 3)
===========================================================
Maps script-level emotional arcs and energy curves across segment progression.
Output metadata ONLY: primary_emotion, valence, arousal, energy_target.
"""

from typing import List, Dict, Any, Optional
from tido_engine.v2_schemas import SegmentV2, EmotionStateV2

class EmotionTimeline:
    """
    Computes script-level emotional progression per segment.
    Metadata only generator.
    """

    COMMERCIAL_ARC = [
        {"role": "hook", "emotion": "curiosity", "valence": 0.2, "arousal": 0.6, "energy_target": "medium_high"},
        {"role": "problem", "emotion": "empathy", "valence": -0.3, "arousal": 0.4, "energy_target": "medium_low"},
        {"role": "solution", "emotion": "trust", "valence": 0.7, "arousal": 0.5, "energy_target": "medium"},
        {"role": "call_to_action", "emotion": "energy", "valence": 0.8, "arousal": 0.8, "energy_target": "high"}
    ]

    STORYTELLING_ARC = [
        {"role": "hook", "emotion": "curiosity", "valence": 0.2, "arousal": 0.5, "energy_target": "medium"},
        {"role": "reflection", "emotion": "reflection", "valence": 0.1, "arousal": 0.3, "energy_target": "low"},
        {"role": "emotion", "emotion": "emotion", "valence": 0.5, "arousal": 0.6, "energy_target": "medium_high"},
        {"role": "resolution", "emotion": "resolution", "valence": 0.8, "arousal": 0.4, "energy_target": "warm_medium"}
    ]

    @classmethod
    def apply_emotion_timeline(
        cls,
        segments: List[SegmentV2],
        genre: str = "commercial"
    ) -> List[Dict[str, Any]]:
        """
        Applies emotional progression metadata across segments based on position and role.
        """
        arc = cls.STORYTELLING_ARC if "story" in genre.lower() else cls.COMMERCIAL_ARC
        total_segs = len(segments)
        trace_list = []

        for idx, seg in enumerate(segments):
            # Resolve arc step based on segment role or relative progress
            progress_ratio = idx / max(1, total_segs - 1)
            arc_index = min(int(progress_ratio * len(arc)), len(arc) - 1)
            arc_step = arc[arc_index]

            # Match exact segment role if specified
            seg_role = seg.performance.segment_role.lower()
            for step in arc:
                if step["role"] == seg_role:
                    arc_step = step
                    break

            # Populate EmotionStateV2 metadata
            seg.performance.emotion_state = EmotionStateV2(
                primary_emotion=arc_step["emotion"],
                valence=arc_step["valence"],
                arousal=arc_step["arousal"]
            )

            # Store energy target in performance instruction energy level
            seg.performance.energy_level = arc_step["energy_target"]

            trace_info = {
                "segment_id": seg.segment_id,
                "primary_emotion": arc_step["emotion"],
                "valence": arc_step["valence"],
                "arousal": arc_step["arousal"],
                "energy_target": arc_step["energy_target"]
            }
            trace_list.append(trace_info)

        return trace_list
