"""
TIDO Voice Performance Engine - Acoustic Human Behavior Layer (Phase 5)
=======================================================================
Isolated package generating acoustic behavioral metadata:
- Breath behavior
- Dynamic sentence rhythm speed curves
- Natural acoustic emphasis
- Ending style resolution
- Micro-variation control
"""

from tido_engine.humanization.acoustic.breath_behavior import BreathBehaviorPlanner
from tido_engine.humanization.acoustic.sentence_rhythm_model import SentenceRhythmPlanner
from tido_engine.humanization.acoustic.acoustic_emphasis_planner import AcousticEmphasisPlanner
from tido_engine.humanization.acoustic.ending_behavior import EndingStyleResolver
from tido_engine.humanization.acoustic.micro_variation_controller import MicroVariationController
from tido_engine.humanization.acoustic.acoustic_behavior_pipeline import AcousticBehaviorPipeline

__all__ = [
    "BreathBehaviorPlanner",
    "SentenceRhythmPlanner",
    "AcousticEmphasisPlanner",
    "EndingStyleResolver",
    "MicroVariationController",
    "AcousticBehaviorPipeline"
]
