"""
TIDO Voice Performance Engine - Acoustic Behavior Pipeline (Phase 5 Orchestrator)
===================================================================================
Main orchestrator for Phase 5 Acoustic Human Behavior Layer.
Sequence:
1. VoiceBehaviorDNA
2. BreathBehaviorPlanner
3. SentenceRhythmPlanner
4. AcousticEmphasisPlanner
5. EndingStyleResolver
6. MicroVariationController

Outputs ONLY performance metadata. Zero text mutation guarantee.
"""

from typing import List, Dict, Any, Optional
from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA
from tido_engine.humanization.acoustic.breath_behavior import BreathBehaviorPlanner
from tido_engine.humanization.acoustic.sentence_rhythm_model import SentenceRhythmPlanner
from tido_engine.humanization.acoustic.acoustic_emphasis_planner import AcousticEmphasisPlanner
from tido_engine.humanization.acoustic.ending_behavior import EndingStyleResolver
from tido_engine.humanization.acoustic.micro_variation_controller import MicroVariationController

class AcousticBehaviorPipeline:
    """
    Orchestrator calculating acoustic human behavior metadata.
    """

    @classmethod
    def process_script_acoustic_behavior(
        cls,
        script: PerformanceScriptV2,
        dna: Optional[VoiceBehaviorDNA] = None,
        ending_style: str = "confident_close",
        seed: int = 42
    ) -> List[Dict[str, Any]]:
        segments = script.segments
        resolved_dna = dna or VoiceBehaviorDNA.get_preset(script.global_genre)

        # 1. Sentence Rhythm Curve
        rhythm_traces = SentenceRhythmPlanner.compute_rhythm_curve(segments, genre=script.global_genre)

        trace_logs = []
        for idx, seg in enumerate(segments):
            # 2. Breath Behavior Planning
            breath_meta = BreathBehaviorPlanner.plan_breath_behavior(seg, resolved_dna)

            # 3. Acoustic Emphasis Planning
            emphasis_meta = AcousticEmphasisPlanner.plan_segment_emphasis(seg)

            # 4. Ending Style Resolving
            ending_meta = EndingStyleResolver.resolve_ending_style(seg, ending_style)

            # 5. Micro Variation Control
            jitter_meta = MicroVariationController.apply_micro_variations(seg, seed=seed + idx)

            seg_trace = {
                "segment_id": seg.segment_id,
                "rhythm_trace": rhythm_traces[idx],
                "breath_meta": breath_meta,
                "emphasis_meta": emphasis_meta,
                "ending_meta": ending_meta,
                "micro_jitter_meta": jitter_meta
            }
            trace_logs.append(seg_trace)

        return trace_logs
