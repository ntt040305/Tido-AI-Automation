"""
TIDO Voice Performance Engine - Global Continuity Engine
========================================================
Ensures loudness & energy continuity across voice segments, preventing volume jumps.
"""

from pydub import AudioSegment

class GlobalContinuityEngine:
    def __init__(self, target_segment_dbfs: float = -18.0):
        self.target_segment_dbfs = target_segment_dbfs

    def process_continuity(self, seg: AudioSegment) -> AudioSegment:
        if seg.dBFS == float('-inf'):
            return seg
        diff = self.target_segment_dbfs - seg.dBFS
        # Smoothly adjust gain if segment loudness drifts by more than 1.5 dBFS
        if abs(diff) > 1.5:
            seg = seg.apply_gain(diff)
        return seg
