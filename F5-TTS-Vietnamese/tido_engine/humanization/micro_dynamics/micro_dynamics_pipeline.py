"""
TIDO Voice Performance Engine - Micro Dynamics Pipeline (Phase 7 Orchestrator)
==============================================================================
Orchestrator for Phase 7 Natural Speech Micro Dynamics Layer:
1. VoiceBehaviorDNA
2. MicroProsodyVariation
3. BiologicalBreathController
4. VowelDurationController
5. SentenceFlowController
6. NaturalEndingController

Returns PerformanceScriptV2 compatible metadata. Zero text mutation.
"""

from typing import List, Dict, Any, Optional
from tido_engine.v2_schemas import PerformanceScriptV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA
from tido_engine.humanization.micro_dynamics.micro_prosody_variation import MicroProsodyVariation
from tido_engine.humanization.micro_dynamics.biological_breath_controller import BiologicalBreathController
from tido_engine.humanization.micro_dynamics.vowel_duration_controller import VowelDurationController
from tido_engine.humanization.micro_dynamics.sentence_flow_controller import SentenceFlowController
from tido_engine.humanization.micro_dynamics.natural_ending_controller import NaturalEndingController

class MicroDynamicsPipeline:
    """
    Master orchestrator for Phase 7 Micro Dynamics.
    """

    @classmethod
    def process_micro_dynamics(
        cls,
        script: PerformanceScriptV2,
        dna: Optional[VoiceBehaviorDNA] = None
    ) -> List[Dict[str, Any]]:
        segments = script.segments
        voice_id = script.voice_id or "default_voice"
        resolved_dna = dna or VoiceBehaviorDNA.get_preset(script.global_genre)

        # 5. Sentence Flow Continuity
        flow_logs = SentenceFlowController.calculate_sentence_flow(segments)

        trace_logs = []
        for idx, seg in enumerate(segments):
            # 2. Micro Prosody Variation (Deterministic Seed)
            prosody_meta = MicroProsodyVariation.generate_variation(seg, voice_id=voice_id)

            # 3. Biological Breathing
            breath_meta = BiologicalBreathController.calculate_breath_behavior(seg, genre=script.global_genre)

            # 4. Vowel Duration Emphasis
            vowel_meta = VowelDurationController.calculate_vowel_emphasis(seg)

            # 6. Natural Ending Behavior
            ending_meta = NaturalEndingController.calculate_ending_behavior(seg, genre=script.global_genre)

            seg_trace = {
                "segment_id": seg.segment_id,
                "dna_style": resolved_dna.pause_style,
                "micro_prosody_variation": prosody_meta,
                "biological_breath": breath_meta,
                "vowel_duration_emphasis": vowel_meta,
                "sentence_flow": flow_logs[idx],
                "natural_ending": ending_meta
            }
            trace_logs.append(seg_trace)

        return trace_logs
