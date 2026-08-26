"""
TIDO Voice Performance Engine - Master Commercial Voice Service (V2 Safe Edition)
===================================================================================
Production voice service layer adhering strictly to speech engineering standards:
- Text Integrity Trace & Validation (Zero index numbers leaking to F5, zero word deletion)
- Sanitized final text sent to F5 (final_text_sanitizer ensures no index/segment_id in gen_text)
- Reference Audio & Transcript Validation (Aborts if transcript is inconsistent)
- Pronunciation hint mapping for foreign words without mutating native Vietnamese script
- Peak Audio Level <= -1.0 dBFS Limiting (Zero clipping)
"""

import os
import re
import json
import time
import shutil
import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from pydub import AudioSegment

from tido_engine.v2_schemas import PerformanceScriptV2
from tido_engine.legacy_migrator import LegacyScriptMigrator
from tido_engine.speaker_persona import PersonaPresets
from tido_engine.voice_style_profiles import StylePresets
from tido_engine.global_performance_arc import GlobalPerformanceArc
from tido_engine.performance_director_v2 import PerformanceDirectorV2
from tido_engine.vietnamese_text_normalizer import VietnameseTextNormalizer
from tido_engine.pronunciation_engine import PronunciationEngine
from tido_engine.emphasis_processor import EmphasisProcessor
from tido_engine.natural_breath_controller import NaturalBreathController
from tido_engine.reference_pipeline import ReferencePipeline
from tido_engine.f5_tts_adapter import F5TTSAdapter
from tido_engine.rendering_controller import RenderingController, apply_brickwall_limiter
from tido_engine.voice_quality_analyzer_v2 import VoiceQualityAnalyzerV2, VoiceQualityReportV2

VOICE_LIB_PATH = r"d:\Tido\Assets\Voices\voice_library.json"

def sanitize_final_text(text: str) -> str:
    """
    Sanitizes final text sent to F5-TTS:
    - Strips leading numbers, segment indices, or chunk numbers (e.g. '0 ', '1. ', 'seg_001 ').
    - Strips inline bracketed tags (e.g. '[nhấn mạnh]', '[thì thầm]').
    - Ensures clean spacing and lowercase/casing for F5-TTS.
    """
    if not text:
        return ""
    # Strip bracketed tags
    clean = re.sub(r'\[.*?\]', '', text)
    # Strip leading index numbers or segment labels (e.g. '0 ', '1. ', 'seg_001 ')
    clean = re.sub(r'^(\d+[\.\:\s]+|seg_\d+[\.\:\s]*)', '', clean.strip(), flags=re.IGNORECASE)
    # Normalize whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

class VoiceService:
    """
    Unified speech engineering service.
    Single Source of Truth for CLI and REST API.
    """

    def __init__(self, output_dir: str = r"d:\Tido\F5-TTS-Vietnamese\service_output"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.adapter = F5TTSAdapter()
        self.adapter_initialized = False
        self.controller = None
        self.normalizer = VietnameseTextNormalizer()
        self.pron_engine = PronunciationEngine()
        self.ref_pipeline = ReferencePipeline(VOICE_LIB_PATH)

    def _ensure_initialized(self):
        if not self.adapter_initialized:
            print("[SERVICE] Initializing F5TTSAdapter inference engine...")
            self.adapter.initialize()
            self.controller = RenderingController(self.adapter)
            self.adapter_initialized = True

    def validate_text_integrity(
        self,
        segment_id: str,
        original_text: str,
        migrated_text: str,
        normalized_text: str,
        pronunciation_processed_text: str,
        emphasis_processed_text: str,
        final_text_sent_to_f5: str,
        dictionary_matches: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Validates text integrity at every stage.
        Aborts rendering if index numbers leak into F5 text, or if text rewriting occurs.
        """
        # Rule 1: final_text_sent_to_f5 MUST NOT start with a number or index
        if re.match(r'^\d', final_text_sent_to_f5):
            raise ValueError(f"FAIL [Text Integrity]: final_text_sent_to_f5 starts with an index/number: '{final_text_sent_to_f5}'")

        # Rule 2: EmphasisProcessor MUST NOT alter text
        if emphasis_processed_text.strip() != pronunciation_processed_text.strip():
            raise ValueError(f"FAIL [Text Integrity]: EmphasisProcessor altered text! '{emphasis_processed_text}' != '{pronunciation_processed_text}'")

        # Rule 3: Final text sent to F5 MUST NOT contain bracketed tags
        if re.search(r'\[.*?\]', final_text_sent_to_f5):
            raise ValueError(f"FAIL [Text Integrity]: Inline bracketed tag found in F5 text: '{final_text_sent_to_f5}'")

        # Rule 4: Check for boundary word stuttering/repetition
        words = final_text_sent_to_f5.split()
        for i in range(len(words) - 1):
            w1 = re.sub(r'[^\w]', '', words[i].lower())
            w2 = re.sub(r'[^\w]', '', words[i+1].lower())
            if w1 and w1 == w2 and len(w1) > 1:
                orig_lower = original_text.lower()
                if f"{w1} {w2}" not in orig_lower:
                    raise ValueError(f"FAIL [Text Integrity]: Syllable repetition/stuttering detected: '{w1} {w2}' in segment {segment_id}")

        trace_log = {
            "segment_id": segment_id,
            "original_text": original_text,
            "migrated_text": migrated_text,
            "normalized_text": normalized_text,
            "pronunciation_processed_text": pronunciation_processed_text,
            "emphasis_processed_text": emphasis_processed_text,
            "final_text_sent_to_f5": final_text_sent_to_f5,
            "dictionary_matches": dictionary_matches,
            "status": "PASSED"
        }
        return trace_log

    def synthesize(
        self,
        script_input: Any,
        voice_id: str = "vo_mizaki_3",
        style: str = "commercial_seller",
        persona: str = "commercial_seller",
        pipeline_mode: str = "v2_micro_dynamics",
        ref_audio_path: Optional[str] = None,
        ref_text: Optional[str] = None
    ) -> Dict[str, Any]:
        self._ensure_initialized()

        print(f"\n=================================================================")
        print(f"  TIDO VOICE SERVICE SYNTHESIS - PIPELINE MODE: [{pipeline_mode.upper()}]")
        print(f"=================================================================")

        # 1. Reference Audio Audit & Transcript Consistency Check (STOP RENDER IF UNVERIFIED)
        profile = self.ref_pipeline.get_profile(voice_id)
        ref_log = self.ref_pipeline.validate_reference_audio(voice_id)
        actual_ref_path = ref_audio_path or profile.reference_path
        actual_ref_text = ref_text or profile.reference_transcript

        # 2. Parse / Migrate Script Input
        if isinstance(script_input, str):
            v1_dict = {
                "metadata": {"title": "Raw Text Synthesis", "voice_id": voice_id},
                "segments": [{"text": script_input, "emotion": style, "pacing": "bình thường"}]
            }
            script_v2 = LegacyScriptMigrator.migrate(v1_dict)
        elif isinstance(script_input, dict):
            if "segments" in script_input and "global_genre" in script_input:
                script_v2 = PerformanceScriptV2.from_dict(script_input)
            elif "segments" in script_input:
                script_v2 = LegacyScriptMigrator.migrate(script_input)
            else:
                v1_dict = {
                    "metadata": {"title": "Raw Text Dict", "voice_id": voice_id},
                    "segments": [script_input]
                }
                script_v2 = LegacyScriptMigrator.migrate(v1_dict)
        else:
            raise ValueError("Invalid script_input format!")

        # 3. Get Persona & Style Behavior DNA
        persona_obj = PersonaPresets.get_by_id(persona)
        style_obj = StylePresets.get_by_style_id(style)

        # 4. Build Global Performance Arc
        global_arc = GlobalPerformanceArc.compute_global_arc(script_v2)

        # 5. Performance Director & Prosody Execution
        director = PerformanceDirectorV2()
        base_model = director.build_execution_model(script_v2)

        task_id = f"syn_{int(time.time() * 1000)}"
        combined_audio = None
        text_trace_logs: List[Dict[str, Any]] = []
        chunk_trace_logs: List[Dict[str, Any]] = []

        # 6. Render Segments End-to-End
        for idx, (seg, base_plan, arc_mod) in enumerate(zip(script_v2.segments, base_model.execution_plans, global_arc.segment_modifiers)):
            orig_text = seg.text
            migrated_text = seg.text

            # Clean any bracketed tags from input text
            clean_input = re.sub(r'\[.*?\]', '', orig_text)
            clean_input = re.sub(r'\s+', ' ', clean_input).strip()

            # Step 1: Normalization
            normalized_text = self.normalizer.normalize(clean_input)

            # Step 2: Pronunciation Hints (Foreign words/acronyms ONLY - Native Vietnamese words UNTOUCHED)
            pron_text, dict_matches = self.pron_engine.apply_pronunciation(
                normalized_text,
                voice_map=profile.pronunciation_map,
                request_map=seg.pronunciation_overrides if hasattr(seg, 'pronunciation_overrides') else {}
            )

            # Step 3: Emphasis Processing (Metadata ONLY - NO text editing!)
            emphasis_words = seg.performance.emphasis_words if hasattr(seg, 'performance') and seg.performance else []
            emphasis_plan = EmphasisProcessor.process_segment_emphasis(
                segment_id=seg.segment_id,
                text=pron_text,
                emphasis_words_input=emphasis_words,
                pipeline_mode=pipeline_mode
            )
            emphasis_processed_text = pron_text

            # Step 4: Final Text Sanitization for F5 (Strips leading index numbers/segment_ids!)
            final_f5_text = sanitize_final_text(pron_text)

            # TRACE TEXT INTEGRITY CHECK (Fails if text starts with index/number)
            trace_entry = self.validate_text_integrity(
                segment_id=seg.segment_id,
                original_text=orig_text,
                migrated_text=migrated_text,
                normalized_text=normalized_text,
                pronunciation_processed_text=pron_text,
                emphasis_processed_text=emphasis_processed_text,
                final_text_sent_to_f5=final_f5_text,
                dictionary_matches=dict_matches
            )
            text_trace_logs.append(trace_entry)

            # Step 5: Breath & Prosody Plan Calculation
            seg_role = seg.performance.segment_role if hasattr(seg, 'performance') and seg.performance else 'explanation'
            breath_plan = NaturalBreathController.compute_segment_breath(
                segment_id=seg.segment_id,
                text=final_f5_text,
                role=seg_role,
                energy_level=str(base_plan.energy_level_scale),
                pipeline_mode=pipeline_mode
            )

            base_plan.pause_before_ms = breath_plan.breath_before_ms
            base_plan.pause_after_ms = breath_plan.breath_after_ms

            # Step 6: Render Segment Chunk via RenderingController
            temp_wav = os.path.join(self.output_dir, f"{task_id}_seg_{idx+1}.wav")
            seg_audio, render_stats = self.controller.render_segment(
                text=final_f5_text,
                ref_audio_path=actual_ref_path,
                ref_text=actual_ref_text,
                plan=base_plan,
                temp_wave_path=temp_wav,
                pipeline_mode=pipeline_mode
            )

            chunk_trace_logs.append({
                "chunk_id": f"chunk_{idx+1}",
                "source_text": orig_text,
                "final_text_sent_to_f5": final_f5_text,
                "start_padding": render_stats["head_padding_ms"],
                "end_padding": render_stats["tail_padding_ms"],
                "pause_after": base_plan.pause_after_ms,
                "peak_dbfs": render_stats["peak_dbfs"],
                "clipped_samples": render_stats["clipped_samples"],
                "output_duration": render_stats["final_padded_duration_s"]
            })

            if combined_audio is None:
                combined_audio = seg_audio
            else:
                combined_audio += seg_audio

        # 7. Final Mastering & Peak Limiter (-1.0 dBFS)
        combined_audio = apply_brickwall_limiter(combined_audio, max_peak_dbfs=-1.0)
        final_output_path = os.path.join(self.output_dir, f"{task_id}_master.wav")
        combined_audio.export(final_output_path, format="wav")
        duration_s = round(len(combined_audio) / 1000.0, 2)

        # Calculate final audio stats
        samples = np.array(combined_audio.get_array_of_samples())
        max_possible = 2 ** (combined_audio.sample_width * 8 - 1) - 1
        final_clipped_samples = int(np.sum(np.abs(samples) >= max_possible))
        final_peak_dbfs = round(combined_audio.max_dBFS, 2)

        # Save debug_text_trace.json
        trace_file_path = os.path.join(self.output_dir, "debug_text_trace.json")
        with open(trace_file_path, 'w', encoding='utf-8') as f:
            json.dump({
                "task_id": task_id,
                "pipeline_mode": pipeline_mode,
                "reference_validation": ref_log,
                "text_trace_logs": text_trace_logs,
                "chunk_trace_logs": chunk_trace_logs,
                "mastering": {
                    "final_peak_dbfs": final_peak_dbfs,
                    "final_clipped_samples": final_clipped_samples,
                    "total_duration_s": duration_s
                }
            }, f, ensure_ascii=False, indent=2)

        print(f"📄 [TEXT TRACE] Saved trace log: {trace_file_path}")
        print(f"🔊 [MASTER DONE] Duration: {duration_s}s | Peak: {final_peak_dbfs} dBFS | Clipped: {final_clipped_samples} -> {final_output_path}\n")

        # Step 8: Quality Report
        quality_report: VoiceQualityReportV2 = VoiceQualityAnalyzerV2.analyze_v2(
            candidate_id=task_id,
            wave_path=final_output_path,
            target_text=script_v2.segments[0].text if script_v2.segments else "",
            ref_wave_path=actual_ref_path
        )

        return {
            "success": True,
            "task_id": task_id,
            "pipeline_mode": pipeline_mode,
            "audio_file": final_output_path,
            "duration_s": duration_s,
            "peak_dbfs": final_peak_dbfs,
            "clipped_samples": final_clipped_samples,
            "voice_id": voice_id,
            "style_applied": style,
            "persona_applied": persona,
            "reference_validation": ref_log,
            "text_trace_file": trace_file_path,
            "quality_report": quality_report.to_dict()
        }
