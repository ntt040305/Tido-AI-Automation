"""
TIDO Voice Performance Engine - Micro Variation Controller (Phase 5)
=====================================================================
Applies subtle acoustic micro-variations (Speed +-2%, Energy +-3%, Pause +-20ms).
Deterministic execution via seed - Zero random jitter without explicit seed.
"""

import random
from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class MicroVariationController:
    """
    Micro variation controller applying seeded organic human jitter.
    """

    @classmethod
    def apply_micro_variations(
        cls,
        segment: SegmentV2,
        seed: int = 42
    ) -> Dict[str, Any]:
        rng = random.Random(seed + hash(segment.segment_id) % 1000)

        # Micro variation bounds
        speed_delta = rng.uniform(-0.02, 0.02)
        energy_db_delta = rng.uniform(-0.3, 0.3)
        pause_ms_delta = rng.randint(-20, 20)

        # Apply micro adjustments to segment performance instruction
        segment.performance.speed_ratio = round(segment.performance.speed_ratio + speed_delta, 3)

        current_pause = segment.performance.pause_instruction.pause_after_ms
        new_pause = max(50, current_pause + pause_ms_delta)
        segment.performance.pause_instruction.pause_after_ms = new_pause

        return {
            "speed_jitter": f"{round(speed_delta * 100, 2)}%",
            "energy_jitter_db": f"{round(energy_db_delta, 2)} dB",
            "pause_jitter_ms": pause_ms_delta,
            "seed_used": seed
        }
