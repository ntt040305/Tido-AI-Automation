"""
TIDO Voice Performance Engine - Semantic Acting Intelligence Layer (Phase 6)
=============================================================================
Voice-agnostic semantic acting intelligence pre-processor:
- Semantic intent detection (HOOK, PAIN_POINT, BENEFIT, TRUST, CTA, etc.)
- Meaning-based word/phrase emphasis mapping
- Semantic pause planning
- Pitch contour modeling (question_rise, cta_energy_rise, statement_fall)
- Emotion transition curves
"""

from tido_engine.humanization.semantic.semantic_intent_analyzer import SemanticIntentAnalyzer
from tido_engine.humanization.semantic.meaning_emphasis_mapper import MeaningEmphasisMapper
from tido_engine.humanization.semantic.semantic_pause_planner import SemanticPausePlanner
from tido_engine.humanization.semantic.pitch_contour_planner import PitchContourPlanner
from tido_engine.humanization.semantic.emotion_transition_engine import EmotionTransitionEngine
from tido_engine.humanization.semantic.semantic_acting_pipeline import SemanticActingPipeline

__all__ = [
    "SemanticIntentAnalyzer",
    "MeaningEmphasisMapper",
    "SemanticPausePlanner",
    "PitchContourPlanner",
    "EmotionTransitionEngine",
    "SemanticActingPipeline"
]
