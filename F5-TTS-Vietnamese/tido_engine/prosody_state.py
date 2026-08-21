"""
TIDO Voice Performance Engine - Prosody State Data Class
=======================================================
Tracks narrative flow and performance continuity across script segments.
"""

from dataclasses import dataclass, field

@dataclass
class ProsodyState:
    segment_index: int = 0
    previous_emotion: str = "neutral"
    current_emotion: str = "neutral"
    emotion_intensity: float = 0.5
    
    target_pace_syllables_per_sec: float = 3.5
    previous_actual_pace: float = 3.5
    
    target_cfg: float = 1.8
    narrative_phase: str = "body"  # 'intro', 'body', 'outro'
    continuity_score: float = 1.0
