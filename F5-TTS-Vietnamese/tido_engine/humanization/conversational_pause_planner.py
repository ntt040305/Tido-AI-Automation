"""
TIDO Voice Performance Engine - Conversational Pause Planner (Phase 2B)
========================================================================
Calculates human cadence pause metadata without mutating text.
- STRICT RULE: Text MUST NOT be modified or split mid-phrase.
- Allowed boundaries: Punctuation (, . ? !), sentence boundaries, emotional transitions.
- Forbidden: No pause insertion inside brand names, numbers, or word groups.
- Outputs metadata: pause_before_ms, pause_after_ms, breath_inset, phrase_boundary_type.
"""

from typing import Dict, Any, Optional
from tido_engine.v2_schemas import PauseInstructionV2, SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA

class ConversationalPausePlanner:
    """
    Calculates conversational pause metadata based on punctuation and speaker DNA.
    Zero text mutation guarantee.
    """

    @classmethod
    def plan_segment_pause(
        cls,
        segment: SegmentV2,
        dna: Optional[VoiceBehaviorDNA] = None
    ) -> Dict[str, Any]:
        """
        Plans pause metadata for a segment without altering its text.
        Returns pause metadata dict.
        """
        text = segment.text.strip() if segment.text else ""
        if not text:
            return {
                "pause_before_ms": 0,
                "pause_after_ms": 200,
                "breath_inset": False,
                "phrase_boundary_type": "none"
            }

        # Resolve timing multipliers from VoiceBehaviorDNA pause_style
        pause_style = dna.pause_style if dna else "balanced"
        multiplier = 0.85 if pause_style == "punchy" else (1.25 if pause_style == "deep" else 1.0)

        pause_before_ms = 0
        pause_after_ms = 200
        breath_inset = False
        boundary_type = "sentence_final"

        # Evaluate punctuation boundary at segment end
        if text.endswith("?"):
            boundary_type = "question"
            pause_after_ms = int(300 * multiplier)
            breath_inset = False
        elif text.endswith("!"):
            boundary_type = "exclamation"
            pause_after_ms = int(250 * multiplier)
            breath_inset = True
        elif text.endswith("..."):
            boundary_type = "hesitation"
            pause_after_ms = int(350 * multiplier)
            breath_inset = True
            pause_before_ms = int(100 * multiplier)
        elif text.endswith(",") or "," in text:
            boundary_type = "clause"
            pause_after_ms = int(180 * multiplier)
            breath_inset = False
        else:
            boundary_type = "sentence_final"
            pause_after_ms = int(250 * multiplier)
            breath_inset = True if pause_style != "punchy" else False

        # Construct updated PauseInstructionV2
        pause_instruction = PauseInstructionV2(
            pause_before_ms=pause_before_ms,
            pause_after_ms=pause_after_ms,
            breath_inset=breath_inset
        )

        # Apply metadata to segment performance instruction
        segment.performance.pause_instruction = pause_instruction

        pause_metadata = {
            "pause_before_ms": pause_before_ms,
            "pause_after_ms": pause_after_ms,
            "breath_inset": breath_inset,
            "phrase_boundary_type": boundary_type,
            "text_mutated": False
        }

        return pause_metadata
