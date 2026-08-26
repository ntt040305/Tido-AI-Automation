"""
TIDO Voice Performance Engine - Voice Feedback System
======================================================
Collects user ratings, selected candidate preferences, and quality feedback
to create a continuous learning loop for voice quality optimization.
"""

import json
import os
import time
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

@dataclass
class FeedbackEntry:
    feedback_id: str
    user_id: str
    voice_id: str
    candidate_id: str
    selected_candidate: str
    rating: float                      # 1.0 to 5.0
    quality_score: float               # Audio quality score
    comment: Optional[str] = None
    timestamp: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VoiceFeedbackSystem:
    """
    Feedback collection system.
    """

    def __init__(self, feedback_db_path: str = r"d:\Tido\Assets\Voices\voice_feedback_history.json"):
        self.feedback_db_path = feedback_db_path
        self._entries: List[FeedbackEntry] = []
        self._load_entries()

    def _load_entries(self) -> None:
        self._entries.clear()
        if os.path.exists(self.feedback_db_path):
            try:
                with open(self.feedback_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data.get("feedbacks", []):
                        self._entries.append(FeedbackEntry(
                            feedback_id=item["feedback_id"],
                            user_id=item["user_id"],
                            voice_id=item["voice_id"],
                            candidate_id=item["candidate_id"],
                            selected_candidate=item["selected_candidate"],
                            rating=float(item["rating"]),
                            quality_score=float(item["quality_score"]),
                            comment=item.get("comment"),
                            timestamp=float(item.get("timestamp", 0.0))
                        ))
            except Exception as e:
                print(f"[WARNING] Could not read feedback history JSON: {e}")

    def record_feedback(
        self,
        user_id: str,
        voice_id: str,
        candidate_id: str,
        selected_candidate: str,
        rating: float,
        quality_score: float,
        comment: Optional[str] = None
    ) -> FeedbackEntry:
        fb = FeedbackEntry(
            feedback_id=f"fb_{int(time.time() * 1000)}",
            user_id=user_id,
            voice_id=voice_id,
            candidate_id=candidate_id,
            selected_candidate=selected_candidate,
            rating=min(5.0, max(1.0, rating)),
            quality_score=quality_score,
            comment=comment,
            timestamp=time.time()
        )
        self._entries.append(fb)
        self._save_entries()
        return fb

    def _save_entries(self) -> None:
        os.makedirs(os.path.dirname(self.feedback_db_path), exist_ok=True)
        data = {
            "total_feedbacks": len(self._entries),
            "feedbacks": [e.to_dict() for e in self._entries]
        }
        with open(self.feedback_db_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_voice_average_rating(self, voice_id: str) -> float:
        fbs = [e for e in self._entries if e.voice_id == voice_id]
        if not fbs:
            return 5.0
        return round(sum(e.rating for e in fbs) / float(len(fbs)), 2)
