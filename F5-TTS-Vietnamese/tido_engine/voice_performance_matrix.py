"""
TIDO Voice Performance Engine - Voice Performance Matrix
=========================================================
Builds a multi-dimensional performance matrix: voice_id x content_category x style -> score.
Allows data-driven score lookup based on historical category performance.
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any, Tuple

@dataclass
class PerformanceCell:
    voice_id: str
    content_category: str
    style: str
    quality_score: float = 85.0
    selection_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VoicePerformanceMatrix:
    """
    Multi-dimensional category x voice performance matrix.
    """

    def __init__(self):
        # Key: (voice_id, content_category, style) -> PerformanceCell
        self._matrix: Dict[Tuple[str, str, str], PerformanceCell] = {}

    def get_cell(self, voice_id: str, content_category: str, style: str) -> PerformanceCell:
        key = (voice_id, content_category.lower(), style.lower())
        if key not in self._matrix:
            self._matrix[key] = PerformanceCell(
                voice_id=voice_id,
                content_category=content_category.lower(),
                style=style.lower(),
                quality_score=85.0,
                selection_count=0
            )
        return self._matrix[key]

    def record_selection(self, voice_id: str, content_category: str, style: str, score: float):
        cell = self.get_cell(voice_id, content_category, style)
        cell.selection_count += 1
        # Moving average quality score update
        n = cell.selection_count
        cell.quality_score = round(((cell.quality_score * (n - 1)) + score) / float(n), 1)

    def get_score(self, voice_id: str, content_category: str, style: str) -> float:
        cell = self.get_cell(voice_id, content_category, style)
        return cell.quality_score
