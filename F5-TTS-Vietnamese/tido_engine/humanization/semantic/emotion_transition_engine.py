"""
TIDO Voice Performance Engine - Emotion Transition Engine (Phase 6)
===================================================================
Calculates smooth emotional progression curves over multi-segment scripts:
Hook (curiosity) -> Problem (empathy) -> Solution (trust) -> CTA (confidence).
"""

from typing import List, Dict, Any
from tido_engine.v2_schemas import SegmentV2

class EmotionTransitionEngine:
    """
    Emotion transition engine computing segment emotion states.
    """

    @classmethod
    def compute_emotion_transitions(cls, segments: List[SegmentV2], intent_metas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        emotion_curve = []

        for idx, (seg, intent_meta) in enumerate(zip(segments, intent_metas)):
            intent = intent_meta.get("intent", "EXPLANATION")

            if intent == "HOOK":
                primary = "curiosity"
                valence, arousal = 0.3, 0.7
            elif intent == "PAIN_POINT":
                primary = "empathy"
                valence, arousal = -0.4, 0.4
            elif intent in ["TRUST", "PROOF", "BENEFIT"]:
                primary = "trust"
                valence, arousal = 0.7, 0.5
            elif intent == "CTA":
                primary = "confidence"
                valence, arousal = 0.8, 0.85
            else:
                primary = "informative"
                valence, arousal = 0.1, 0.5

            seg.performance.emotion_state.primary_emotion = primary
            seg.performance.emotion_state.valence = valence
            seg.performance.emotion_state.arousal = arousal

            emotion_curve.append({
                "segment_id": seg.segment_id,
                "primary_emotion": primary,
                "valence": valence,
                "arousal": arousal
            })

        return emotion_curve
