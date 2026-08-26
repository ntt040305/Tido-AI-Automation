"""
TIDO Voice Performance Engine - Vietnamese Prosody Engine V2
============================================================
Translates semantic performance instructions into precise acoustic controls
including speed, pauses, emphasis, articulation, and CFG scale.

V2 SAFE MODE CONSTRAINTS:
- Speed clamped: 0.95 to 1.05 (commercial: 1.03, warm_expert: 0.97, documentary: 0.95)
- CFG fixed: 1.50 to 1.52 (V1 baseline stability value, NO high CFG scaling!)
- Energy scale clamped: max 1.10 (max gain <= +1.5 dB)
- Bounded pauses (no pause < 60 ms)
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List

@dataclass
class ProsodyExecutionPlan:
    segment_id: str
    text: str
    speaking_speed: float              # 0.95 to 1.05 in safe mode
    pause_before_ms: int               # Pause duration before rendering segment
    pause_after_ms: int                # Pause duration after rendering segment
    emphasis_strength: float           # Multiplier for emphasis (1.0 to 1.05)
    energy_level_scale: float          # Dynamic scale multiplier (0.95 to 1.10 max)
    target_cfg_scale: float            # Fixed 1.50 to 1.52 in safe mode
    articulation_level: str            # "normal", "crisp"
    pitch_contour: str                 # "natural_flow"
    emphasis_words: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VietnameseProsodyEngineV2:
    """
    Core acoustic rules for Vietnamese language prosody.
    Converts semantic attributes into physical rendering parameters.
    """

    @classmethod
    def compute_segment_prosody(
        cls,
        text: str,
        perf_dict: Dict[str, Any],
        pipeline_mode: str = "v2_safe"
    ) -> ProsodyExecutionPlan:
        role = perf_dict.get("segment_role", "explanation")
        intent = perf_dict.get("speaking_intent", "inform")
        attitude = perf_dict.get("speaker_attitude", "friendly")
        energy_str = perf_dict.get("energy_level", "medium")
        base_speed = float(perf_dict.get("speed_ratio", 1.0))
        pause_inst = perf_dict.get("pause_instruction", {})

        pause_before_ms = int(pause_inst.get("pause_before_ms", 80))
        pause_after_ms = int(pause_inst.get("pause_after_ms", 250))

        if pipeline_mode == "v2_safe":
            # --- V2 SAFE MODE PARAMETERS ---
            # 1. Speed calculation: strictly clamped 0.95 to 1.05
            if role in ["commercial_seller", "hook", "call_to_action"]:
                speaking_speed = 1.03
            elif role in ["warm_expert", "testimonial"]:
                speaking_speed = 0.97
            elif role in ["documentary", "narration"]:
                speaking_speed = 0.95
            else:
                speaking_speed = 1.00

            # 2. CFG scale: FIXED strictly to V1 stable baseline (1.50 - 1.52)
            target_cfg = 1.50

            # 3. Energy scale: clamped to max 1.10 (+1.5 dB max boost)
            if energy_str in ["high", "explosive"]:
                energy_scale = 1.08
            elif energy_str in ["low", "whisper"]:
                energy_scale = 0.95
            else:
                energy_scale = 1.00

            # 4. Pauses: ensure bounded (comma 100-160ms, sentence 220-350ms, no < 60ms)
            pause_before_ms = max(60, min(120, pause_before_ms))
            pause_after_ms = max(160, min(350, pause_after_ms))

            return ProsodyExecutionPlan(
                segment_id=perf_dict.get("segment_id", "seg_000"),
                text=text,
                speaking_speed=speaking_speed,
                pause_before_ms=pause_before_ms,
                pause_after_ms=pause_after_ms,
                emphasis_strength=1.0,
                energy_level_scale=energy_scale,
                target_cfg_scale=target_cfg,
                articulation_level="normal",
                pitch_contour="natural_flow",
                emphasis_words=[]
            )

        # Full Mode (legacy behavior for experimental v2_full mode)
        speaking_speed = base_speed
        energy_scale = 1.00
        target_cfg = 1.52

        if energy_str == "explosive":
            energy_scale = 1.15
            target_cfg = 1.55
        elif energy_str == "high":
            energy_scale = 1.08
            target_cfg = 1.52

        return ProsodyExecutionPlan(
            segment_id=perf_dict.get("segment_id", "seg_000"),
            text=text,
            speaking_speed=speaking_speed,
            pause_before_ms=pause_before_ms,
            pause_after_ms=pause_after_ms,
            emphasis_strength=1.0,
            energy_level_scale=energy_scale,
            target_cfg_scale=target_cfg,
            articulation_level="normal",
            pitch_contour="natural_flow",
            emphasis_words=[]
        )
