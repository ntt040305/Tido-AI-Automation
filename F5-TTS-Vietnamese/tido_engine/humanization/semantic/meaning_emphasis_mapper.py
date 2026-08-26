"""
TIDO Voice Performance Engine - Meaning Emphasis Mapper (Phase 6)
==================================================================
Maps semantic meaning targets into nuanced emphasis metadata.
Output: phrase, importance, energy_boost, duration_scale.
"""

from typing import Dict, Any, List
from tido_engine.v2_schemas import SegmentV2

class MeaningEmphasisMapper:
    """
    Maps semantic intents into acoustic emphasis metadata.
    """

    @classmethod
    def map_meaning_emphasis(cls, segment: SegmentV2, intent_meta: Dict[str, Any]) -> List[Dict[str, Any]]:
        text = segment.text.strip() if segment.text else ""
        intent = intent_meta.get("intent", "EXPLANATION")
        emphasis_list = []

        # Identify key phrases by intent
        words = text.split()
        if intent == "HOOK":
            if len(words) > 3:
                target_phrase = " ".join(words[-4:]).strip("?")
                emphasis_list.append({
                    "phrase": target_phrase,
                    "importance": "high",
                    "energy_boost": "+1.5 dB",
                    "duration_scale": 1.10
                })
        elif intent == "CTA":
            target_phrase = " ".join(words[:4])
            emphasis_list.append({
                "phrase": target_phrase,
                "importance": "critical",
                "energy_boost": "+2.0 dB",
                "duration_scale": 1.15
            })
        elif intent in ["BENEFIT", "TRUST"]:
            if len(words) > 2:
                target_phrase = " ".join(words[2:5])
                emphasis_list.append({
                    "phrase": target_phrase,
                    "importance": "medium",
                    "energy_boost": "+1.2 dB",
                    "duration_scale": 1.08
                })

        return emphasis_list
