"""
TIDO Voice Performance Engine - Emphasis Processor
===================================================
Processes target emphasis words to calculate multi-dimensional emphasis plans.

SAFE MODE RULES:
- MUST ONLY CREATE METADATA (EmphasisExecutionPlan)
- MUST NOT EDIT OR REWRITE TEXT
- Capped gain boost to prevent extreme volume multiplier
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any

@dataclass
class WordEmphasisPlan:
    word: str
    emphasis_type: str                  # pitch_boost, volume_boost, length_stretch, pause_before
    emphasis_strength: float            # Capped safely
    duration_stretch_factor: float      # Fixed 1.0 in safe mode
    articulation_boost: str             # "normal" or "crisp"
    micro_pause_before_ms: int          # 0 in safe mode (metadata only)
    micro_pause_after_ms: int           # 0 in safe mode

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class EmphasisExecutionPlan:
    segment_id: str
    emphasis_words_plans: List[WordEmphasisPlan] = field(default_factory=list)
    overall_emphasis_boost: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "overall_emphasis_boost": self.overall_emphasis_boost,
            "words": [w.to_dict() for w in self.emphasis_words_plans]
        }

class EmphasisProcessor:
    """
    Computes word emphasis metadata without text rewriting or unsafe audio stretching.
    """

    @classmethod
    def process_segment_emphasis(
        cls,
        segment_id: str,
        text: str,
        emphasis_words_input: List[Dict[str, str]],
        pipeline_mode: str = "v2_safe"
    ) -> EmphasisExecutionPlan:
        plans: List[WordEmphasisPlan] = []
        
        # In v2_safe mode, clamp overall boost to max 1.03 to prevent audio clipping
        max_boost = 1.03 if pipeline_mode == "v2_safe" else 1.15

        for item in emphasis_words_input:
            word = item.get("word", "")
            e_type = item.get("type", "volume_boost")

            if not word:
                continue

            plans.append(WordEmphasisPlan(
                word=word,
                emphasis_type=e_type,
                emphasis_strength=1.05 if pipeline_mode == "v2_safe" else 1.15,
                duration_stretch_factor=1.0,  # Disabled duration stretching
                articulation_boost="crisp" if e_type == "pitch_boost" else "normal",
                micro_pause_before_ms=0,      # Disabled inline micro-pauses
                micro_pause_after_ms=0
            ))

        overall_boost = min(max_boost, 1.0 + (0.02 * len(plans))) if plans else 1.0

        return EmphasisExecutionPlan(
            segment_id=segment_id,
            emphasis_words_plans=plans,
            overall_emphasis_boost=round(overall_boost, 2)
        )
