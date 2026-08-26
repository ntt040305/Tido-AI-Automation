"""
TIDO Voice Performance Engine - Micro Prosody Variation (Phase 7)
===================================================================
Applies deterministic biological micro-variations.
Limits: Speed +-3%, Energy +-2%, Pitch +-0.5 semitones.
Deterministic seed = hash(voice_id + segment_id).
"""

import random
from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class MicroProsodyVariation:
    """
    Deterministic micro-prosody variation generator.
    """

    @classmethod
    def generate_variation(
        cls,
        segment: SegmentV2,
        voice_id: str = "default_voice"
    ) -> Dict[str, Any]:
        # Hash deterministic seed
        seed_str = f"{voice_id}_{segment.segment_id}"
        seed = int(abs(hash(seed_str)) % (2**31))
        rng = random.Random(seed)

        # Micro variation bounds
        speed_var = round(rng.uniform(-0.03, 0.03), 4)       # +-3%
        energy_var = round(rng.uniform(-0.2, 0.2), 2)        # +-2% (in dB)
        pitch_var = round(rng.uniform(-0.5, 0.5), 2)         # +-0.5 semitones

        # Apply to segment performance instruction metadata
        segment.performance.speed_ratio = round(segment.performance.speed_ratio + speed_var, 3)
        segment.performance.pitch_behavior.pitch_shift_semitones = round(
            segment.performance.pitch_behavior.pitch_shift_semitones + pitch_var, 2
        )

        return {
            "speed_variation": f"{round(speed_var * 100, 2)}%",
            "energy_variation": f"{energy_var} dB",
            "pitch_variation": f"{pitch_var} semitones",
            "seed_used": seed
        }
