"""
TIDO Voice Performance Engine - Render Optimizer
================================================
Evaluates multiple synthesized audio candidates using VoiceQualityAnalyzer
and automatically selects the best output WAV based on the highest composite score.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Tuple
from tido_engine.voice_quality_analyzer import VoiceQualityAnalyzer, VoiceQualityReport

@dataclass
class CandidateInput:
    candidate_id: str
    wave_path: str
    seed: int
    cfg_strength: float
    speed: float

@dataclass
class OptimizationResult:
    selected_candidate_id: str
    best_wave_path: str
    best_composite_score: float
    total_candidates_evaluated: int
    all_reports: List[VoiceQualityReport]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "selected_candidate_id": self.selected_candidate_id,
            "best_wave_path": self.best_wave_path,
            "best_composite_score": self.best_composite_score,
            "total_candidates_evaluated": self.total_candidates_evaluated,
            "reports": [r.to_dict() for r in self.all_reports]
        }

class RenderOptimizer:
    """
    Automatic candidate selection loop for quality assurance.
    """

    @classmethod
    def select_best_candidate(
        cls,
        candidates: List[CandidateInput],
        target_text: str,
        ref_wave_path: str = None
    ) -> OptimizationResult:
        if not candidates:
            raise ValueError("Candidates list cannot be empty!")

        reports: List[VoiceQualityReport] = []

        for cand in candidates:
            report = VoiceQualityAnalyzer.analyze(
                candidate_id=cand.candidate_id,
                wave_path=cand.wave_path,
                target_text=target_text,
                ref_wave_path=ref_wave_path
            )
            reports.append(report)

        # Sort candidates descending by composite_quality_score
        reports.sort(key=lambda r: r.composite_quality_score, reverse=True)

        best = reports[0]

        return OptimizationResult(
            selected_candidate_id=best.candidate_id,
            best_wave_path=best.wave_path,
            best_composite_score=best.composite_quality_score,
            total_candidates_evaluated=len(reports),
            all_reports=reports
        )
