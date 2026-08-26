"""
TIDO Voice Performance Engine - Natural Breath Controller
=========================================================
Determines natural breathing pauses based on phrase boundaries and punctuation.

SAFE MODE RULES:
- ONLY insert pauses after punctuation (. ? ! ,) or between complete segments.
- NO pauses inserted between brand names ("Gym Toàn Thắng"), verb phrases, numbers & units.
- Pauses strictly bounded:
  - comma: 100–160 ms
  - sentence: 220–350 ms
  - paragraph: 400–600 ms
- NO pauses under 60 ms (prevents perceived audio clipping/clicks).
"""

from dataclasses import dataclass, asdict
from typing import Dict, Any

@dataclass
class BreathExecutionPlan:
    segment_id: str
    breath_before_ms: int
    breath_after_ms: int
    breath_intensity: float
    breath_strategy: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class NaturalBreathController:
    """
    Computes natural pauses bounded strictly by punctuation and segment boundaries.
    """

    @classmethod
    def compute_segment_breath(
        cls,
        segment_id: str,
        text: str,
        role: str,
        energy_level: str,
        pipeline_mode: str = "v2_safe"
    ) -> BreathExecutionPlan:
        clean_text = text.strip()

        if pipeline_mode == "v2_safe":
            # Safe Mode: Bounded pauses after punctuation
            if clean_text.endswith("!") or clean_text.endswith("?"):
                before_ms = 80
                after_ms = 300
                strategy = "exclamation_question_pause"
            elif clean_text.endswith("."):
                before_ms = 80
                after_ms = 280
                strategy = "sentence_end_pause"
            elif "," in clean_text:
                before_ms = 60
                after_ms = 140
                strategy = "comma_clause_pause"
            else:
                before_ms = 60
                after_ms = 220
                strategy = "segment_boundary_pause"

            return BreathExecutionPlan(
                segment_id=segment_id,
                breath_before_ms=before_ms,
                breath_after_ms=after_ms,
                breath_intensity=0.20,
                breath_strategy=strategy
            )

        # Full Mode rules
        if role == "call_to_action":
            return BreathExecutionPlan(
                segment_id=segment_id,
                breath_before_ms=60,
                breath_after_ms=180,
                breath_intensity=0.15,
                breath_strategy="cta_breath"
            )

        return BreathExecutionPlan(
            segment_id=segment_id,
            breath_before_ms=80,
            breath_after_ms=250,
            breath_intensity=0.30,
            breath_strategy="phrase_pause"
        )
