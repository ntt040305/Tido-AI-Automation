"""
TIDO Voice Performance Engine - Recommendation Learner & A/B Testing
=====================================================================
Processes feedback history logs to adaptively optimize recommendation weights
and manages candidate A/B testing evaluations.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Tuple

from tido_engine.user_preference_model import UserPreferenceModel
from tido_engine.voice_performance_matrix import VoicePerformanceMatrix

class RecommendationLearner:
    """
    Adaptive learning engine updating performance matrix and recommendation weights.
    """

    def __init__(self, matrix: VoicePerformanceMatrix, pref_model: UserPreferenceModel):
        self.matrix = matrix
        self.pref_model = pref_model

    def learn_from_feedback_logs(self, feedback_logs: List[Dict[str, Any]]):
        for log in feedback_logs:
            user_id = log.get("user_id", "anon")
            voice_id = log.get("voice_id", "")
            category = log.get("content_category", "general")
            style = log.get("style", "warm_expert")
            rating = float(log.get("rating", 4.0))

            if not voice_id:
                continue

            # Update Voice Performance Matrix
            self.matrix.record_selection(
                voice_id=voice_id,
                content_category=category,
                style=style,
                score=rating * 20.0  # Scale 5.0 -> 100.0
            )

            # Update User Preference Profile
            self.pref_model.update_preference(
                user_id=user_id,
                selected_voice_id=voice_id,
                selected_style=style,
                rating=rating
            )

    def get_learned_compatibility_score(
        self,
        voice_id: str,
        category: str,
        style: str,
        user_id: str = None
    ) -> float:
        base_matrix_score = self.matrix.get_score(voice_id, category, style)

        user_boost = 1.0
        if user_id:
            prof = self.pref_model.get_or_create_profile(user_id)
            user_boost = prof.preferred_voices.get(voice_id, 1.0)

        learned_score = min(99.0, base_matrix_score * user_boost)
        return round(learned_score, 1)

@dataclass
class ABTestResult:
    test_id: str
    candidate_a_id: str
    candidate_b_id: str
    winner_candidate_id: str
    rating_delta: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VoiceABTesting:
    """
    Candidate A/B testing framework.
    """

    def __init__(self):
        self._tests: List[ABTestResult] = []

    def record_ab_test(
        self,
        test_id: str,
        candidate_a_id: str,
        candidate_b_id: str,
        selected_candidate_id: str,
        rating_a: float,
        rating_b: float
    ) -> ABTestResult:
        delta = abs(rating_a - rating_b)
        res = ABTestResult(
            test_id=test_id,
            candidate_a_id=candidate_a_id,
            candidate_b_id=candidate_b_id,
            winner_candidate_id=selected_candidate_id,
            rating_delta=round(delta, 2)
        )
        self._tests.append(res)
        return res

    def get_win_rate(self, candidate_id: str) -> float:
        total = [t for t in self._tests if t.candidate_a_id == candidate_id or t.candidate_b_id == candidate_id]
        if not total:
            return 50.0

        wins = [t for t in total if t.winner_candidate_id == candidate_id]
        return round((len(wins) / float(len(total))) * 100.0, 1)
