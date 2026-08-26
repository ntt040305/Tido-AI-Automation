"""
TIDO Voice Performance Engine - Vowel Duration Controller (Phase 7)
===================================================================
Models human temporal emphasis via vowel elongation and minor pitch shifts.
Example: "rất tốt" -> duration +8%, pitch +0.3 semitones (instead of +20% volume).
Outputs metadata only - Zero text mutation guarantee.
"""

from typing import Dict, Any, List
from tido_engine.v2_schemas import SegmentV2

class VowelDurationController:
    """
    Timing-based emphasis controller via vowel duration scaling.
    """

    @classmethod
    def calculate_vowel_emphasis(cls, segment: SegmentV2) -> List[Dict[str, Any]]:
        text = segment.text.strip() if segment.text else ""
        words = text.split()
        emphasis_targets = []

        # Identify key adjectives or emphasis words
        keywords = ["rất", "hoàn toàn", "tối ưu", "khoa học", "hiện đại", "tuyệt vời", "khó khăn"]
        for idx, word in enumerate(words):
            word_clean = word.strip(",.?!").lower()
            if word_clean in keywords:
                phrase = " ".join(words[max(0, idx):min(len(words), idx + 2)])
                emphasis_targets.append({
                    "target_phrase": phrase,
                    "duration_scale": 1.08,        # +8% duration
                    "pitch_adjustment": "+0.3"     # +0.3 semitones pitch rise
                })

        # Fallback target if no keyword matched
        if not emphasis_targets and len(words) > 3:
            phrase = " ".join(words[1:3])
            emphasis_targets.append({
                "target_phrase": phrase,
                "duration_scale": 1.05,
                "pitch_adjustment": "+0.2"
            })

        return emphasis_targets
