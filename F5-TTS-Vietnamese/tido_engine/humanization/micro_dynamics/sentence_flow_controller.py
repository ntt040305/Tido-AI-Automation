"""
TIDO Voice Performance Engine - Sentence Flow Controller (Phase 7)
==================================================================
Models natural multi-sentence speech flow and energy transitions.
Prevents isolated robotic sentence feeling.
Transitions: smooth_rise, smooth_decay, maintain, reset.
"""

from typing import List, Dict, Any
from tido_engine.v2_schemas import SegmentV2

class SentenceFlowController:
    """
    Multi-sentence continuity and energy transition controller.
    """

    @classmethod
    def calculate_sentence_flow(cls, segments: List[SegmentV2]) -> List[Dict[str, Any]]:
        flow_logs = []
        prev_energy = 0.0

        total_segs = len(segments)
        for idx, seg in enumerate(segments):
            if idx == 0:
                current_target_energy = 0.5
                transition_curve = "smooth_rise"
            elif idx == total_segs - 1:
                current_target_energy = 0.85
                transition_curve = "smooth_rise"
            else:
                if prev_energy > 0.7:
                    current_target_energy = 0.60
                    transition_curve = "smooth_decay"
                else:
                    current_target_energy = 0.70
                    transition_curve = "maintain"

            flow_logs.append({
                "segment_id": seg.segment_id,
                "previous_energy": prev_energy,
                "current_target_energy": current_target_energy,
                "transition_curve": transition_curve
            })

            prev_energy = current_target_energy

        return flow_logs
