"""
TIDO Voice Performance Engine - Voice A/B Testing Framework
============================================================
Manages candidate A/B testing evaluations and computes win rates across audio choices.
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any

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
