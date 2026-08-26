"""
TIDO Voice Performance Engine - Natural Speech Micro Dynamics Layer (Phase 7)
=============================================================================
Voice-agnostic natural micro-dynamics layer:
- Micro Prosody Variation (speed +-3%, energy +-2%, pitch +-0.5 semitones, deterministic seed)
- Biological Breath Controller (context-aware breath probability)
- Vowel Duration Controller (timing-based emphasis: duration +8%, pitch +0.3)
- Sentence Flow Controller (smooth multi-sentence energy transitions)
- Natural Ending Controller (warm_drop, curiosity_rise, confident_close, emotional_decay)
"""

from tido_engine.humanization.micro_dynamics.micro_prosody_variation import MicroProsodyVariation
from tido_engine.humanization.micro_dynamics.biological_breath_controller import BiologicalBreathController
from tido_engine.humanization.micro_dynamics.vowel_duration_controller import VowelDurationController
from tido_engine.humanization.micro_dynamics.sentence_flow_controller import SentenceFlowController
from tido_engine.humanization.micro_dynamics.natural_ending_controller import NaturalEndingController
from tido_engine.humanization.micro_dynamics.micro_dynamics_pipeline import MicroDynamicsPipeline

__all__ = [
    "MicroProsodyVariation",
    "BiologicalBreathController",
    "VowelDurationController",
    "SentenceFlowController",
    "NaturalEndingController",
    "MicroDynamicsPipeline"
]
