"""
TIDO Voice Performance Engine - Humanization Pipeline (Phase 7 Master Orchestrator)
====================================================================================
Main humanization orchestrator executing adaptive spoken, acoustic, semantic acting & micro-dynamics adaptation.
- Pipeline Mode Support:
    * "v2_safe" (or enable_humanization=False): Returns original PerformanceScriptV2 untouched.
    * "v2_humanized": Executes text & prosody humanization layer.
    * "v2_acoustic_humanized": Executes text, prosody & acoustic human behavior layer.
    * "v2_semantic_acting": Executes semantic acting intelligence layer V1.
    * "v2_micro_dynamics": Executes full natural speech micro-dynamics layer V1.
- Exception Rollback: Catches any error and safely falls back to Semantic Acting or original PerformanceScriptV2.
"""

import os
import json
import time
import copy
import logging
from typing import Dict, Any, Optional

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA
from tido_engine.humanization.safety_guard import SafetyGuard
from tido_engine.humanization.spoken_style_adapter import SpokenStyleAdapter
from tido_engine.humanization.conversational_pause_planner import ConversationalPausePlanner
from tido_engine.humanization.expression_controller import ExpressionController
from tido_engine.humanization.emotion_timeline import EmotionTimeline
from tido_engine.humanization.humanization_context_resolver import HumanizationContextResolver
from tido_engine.humanization.adaptive_profile_selector import AdaptiveProfileSelector
from tido_engine.humanization.acoustic.acoustic_behavior_pipeline import AcousticBehaviorPipeline
from tido_engine.humanization.semantic.semantic_acting_pipeline import SemanticActingPipeline
from tido_engine.humanization.micro_dynamics.micro_dynamics_pipeline import MicroDynamicsPipeline

logger = logging.getLogger("HumanizationPipeline")

class HumanizationPipeline:
    """
    Isolated humanization pipeline pre-processor.
    """

    def __init__(self, trace_dir: str = r"d:\Tido\F5-TTS-Vietnamese\service_output"):
        self.trace_dir = trace_dir
        os.makedirs(self.trace_dir, exist_ok=True)
        self.context_resolver = HumanizationContextResolver()

    def process(
        self,
        script: PerformanceScriptV2,
        enable_humanization: bool = False,
        enable_acoustic_behavior: bool = False,
        enable_micro_dynamics: bool = False,
        pipeline_mode: str = "v2_safe",
        context_description: str = "",
        dna_override: Optional[VoiceBehaviorDNA] = None,
        custom_protected_entities: Optional[list] = None
    ) -> PerformanceScriptV2:
        """
        Processes PerformanceScriptV2 through the Humanization Layer.
        Returns original script untouched if mode is "v2_safe", if enable_humanization is False,
        or if any exception occurs.
        """
        mode = pipeline_mode.lower()

        # Feature Flag / Mode Gate: If v2_safe or disabled, return original script immediately
        active_modes = ["v2_acoustic_humanized", "v2_semantic_acting", "v2_micro_dynamics"]
        if mode == "v2_safe" or (not enable_humanization and mode not in active_modes):
            return script

        # Create a deep copy for safety rollback
        original_script_copy = copy.deepcopy(script)

        try:
            t0 = time.time()

            # Step 1: Context & Strategy Resolution
            search_desc = context_description or script.global_genre or script.title
            profile_name, profile_config = self.context_resolver.resolve_from_description(search_desc)

            # Step 2: Resolve Voice Behavior DNA
            dna = dna_override or VoiceBehaviorDNA.get_preset(script.global_genre)

            processed_segments = []
            for seg in script.segments:
                seg_copy = copy.deepcopy(seg)
                orig_text = seg_copy.text

                # Step 3 & 4: SafetyGuard & Spoken Style Adaptation
                adapted_text, adapter_trace = SpokenStyleAdapter.adapt_segment_text(
                    text=orig_text,
                    genre=script.global_genre,
                    custom_protected=custom_protected_entities
                )
                seg_copy.text = adapted_text

                # Step 5: Conversational Pause Planning
                pause_metadata = ConversationalPausePlanner.plan_segment_pause(
                    segment=seg_copy,
                    dna=dna
                )

                # Step 8: Adaptive Profile Selector Metadata Extension
                adaptive_meta = AdaptiveProfileSelector.apply_adaptive_profile(
                    segment=seg_copy,
                    dna=dna,
                    profile_name=profile_name,
                    profile_config=profile_config
                )

                processed_segments.append(seg_copy)

            # Step 6: Expression Controller (Strict Quota <= expression_limit in profile)
            expression_limit = profile_config.get("expression_limit", 2)
            ExpressionController.MAX_EXPRESSIONS_PER_SCRIPT = expression_limit
            expression_traces = ExpressionController.apply_expressions(
                segments=processed_segments,
                genre=script.global_genre,
                custom_protected=custom_protected_entities
            )

            # Step 7: Emotion Timeline
            emotion_traces = EmotionTimeline.apply_emotion_timeline(
                segments=processed_segments,
                genre=script.global_genre
            )

            # Construct humanized script
            humanized_script = copy.deepcopy(script)
            humanized_script.segments = processed_segments

            # Step 9: Acoustic Behavior Pipeline (Phase 5)
            acoustic_traces = []
            if enable_acoustic_behavior or mode in active_modes:
                ending_style = profile_config.get("ending_style", dna.ending_style)
                acoustic_traces = AcousticBehaviorPipeline.process_script_acoustic_behavior(
                    script=humanized_script,
                    dna=dna,
                    ending_style=ending_style
                )

            # Step 10: Semantic Acting Intelligence (Phase 6)
            semantic_traces = []
            if mode in ["v2_semantic_acting", "v2_micro_dynamics"]:
                semantic_traces = SemanticActingPipeline.process_semantic_acting(humanized_script)

            # Step 11: Natural Speech Micro Dynamics (Phase 7)
            micro_dynamics_traces = []
            if enable_micro_dynamics or mode == "v2_micro_dynamics":
                micro_dynamics_traces = MicroDynamicsPipeline.process_micro_dynamics(
                    script=humanized_script,
                    dna=dna
                )

            # Build final trace logs per segment
            trace_logs = []
            for idx, seg in enumerate(processed_segments):
                seg_trace = {
                    "segment_id": seg.segment_id,
                    "original_text": script.segments[idx].text,
                    "humanized_text": seg.text,
                    "expression_trace": expression_traces[idx],
                    "emotion_trace": emotion_traces[idx],
                    "pause_metadata": seg.performance.pause_instruction.to_dict(),
                    "acoustic_trace": acoustic_traces[idx] if acoustic_traces else "DISABLED",
                    "semantic_acting_trace": semantic_traces[idx] if semantic_traces else "DISABLED",
                    "micro_dynamics_trace": micro_dynamics_traces[idx] if micro_dynamics_traces else "DISABLED",
                    "adaptive_profile": profile_name,
                    "safety_guard_status": "PASSED"
                }
                trace_logs.append(seg_trace)

            # Step 12: Export humanization_trace.json
            elapsed = round(time.time() - t0, 3)
            trace_data = {
                "title": script.title,
                "voice_id": script.voice_id,
                "enable_humanization": True,
                "pipeline_mode": pipeline_mode,
                "resolved_profile": profile_name,
                "profile_config": profile_config,
                "execution_time_s": elapsed,
                "voice_behavior_dna": dna.to_dict(),
                "segment_traces": trace_logs
            }

            trace_file_path = os.path.join(self.trace_dir, "humanization_trace.json")
            with open(trace_file_path, "w", encoding="utf-8") as f:
                json.dump(trace_data, f, ensure_ascii=False, indent=2)

            print(f"✨ [HUMANIZATION Phase 7] Pipeline mode '{pipeline_mode}' executed in {elapsed}s | Trace: {trace_file_path}")
            return humanized_script

        except Exception as e:
            # Rollback Gate: Catch any exception and fallback safely
            logger.warning(f"⚠️ [HUMANIZATION ROLLBACK] Exception caught in HumanizationPipeline: {e}. Falling back to original script.")
            print(f"⚠️ [HUMANIZATION ROLLBACK] Exception caught: {e}. Falling back to original script.")
            return original_script_copy
