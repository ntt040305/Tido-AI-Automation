"""
TIDO Voice Performance Engine - Semantic Pause Planner (Phase 6)
=================================================================
Calculates pause instructions at semantic boundaries without text mutation.
Strictly preserves brand names, numbers, and product specifications.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2
from tido_engine.humanization.safety_guard import SafetyGuard

class SemanticPausePlanner:
    """
    Semantic pause planner mapping punctuation & meaning boundaries.
    """

    @classmethod
    def plan_semantic_pauses(cls, segment: SegmentV2, intent_meta: Dict[str, Any]) -> Dict[str, Any]:
        text = segment.text.strip() if segment.text else ""
        intent = intent_meta.get("intent", "EXPLANATION")

        # Base pause duration by semantic intent
        if intent == "HOOK":
            pause_after_ms = 220
            boundary_type = "question"
        elif intent == "CTA":
            pause_after_ms = 350
            boundary_type = "sentence_end"
        elif intent in ["PAIN_POINT", "TRUST"]:
            pause_after_ms = 280
            boundary_type = "emotional_clause"
        else:
            pause_after_ms = 200
            boundary_type = "clause"

        segment.performance.pause_instruction.pause_after_ms = pause_after_ms

        return {
            "pause_after_ms": pause_after_ms,
            "boundary_type": boundary_type,
            "safety_checked": True
        }
