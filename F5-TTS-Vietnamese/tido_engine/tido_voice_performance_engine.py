"""
TIDO Voice Performance Engine - Master Production Architecture v5.0
===================================================================
Master Orchestrator connecting all 20 subsystems:
Reference Locking -> Text Normalization -> Pronunciation -> Semantic Chunker ->
Prosody Director -> F5 Inference -> Automatic Speech QC (Whisper ASR) ->
Adaptive Repair & Context Fallback -> Boundary Stitching -> Mastering -> Observability.
"""

import os
import sys
import time
import json
import re
import torch
from typing import Dict, Any, Optional, List, Tuple
from pydub import AudioSegment

from tido_engine.reference_pipeline import ReferencePipeline
from tido_engine.voice_profile import VoiceProfile
from tido_engine.vietnamese_text_normalizer import VietnameseTextNormalizer
from tido_engine.pronunciation_engine import PronunciationEngine
from tido_engine.semantic_phrase_planner import SemanticPhrasePlanner
from tido_engine.semantic_chunker import BreathAwareChunker, InferenceChunk
from tido_engine.prosody_state import ProsodyState
from tido_engine.prosody_director import ProsodyDirector, DeliveryPlan
from tido_engine.f5_config import F5InferenceConfig
from tido_engine.audio_boundary import AudioStitcher
from tido_engine.auto_qc import AutomaticSpeechQC, QCResult
from tido_engine.repair_manager import RepairManager
from tido_engine.context_overlap_fallback import ContextOverlapFallback
from tido_engine.continuity_engine import GlobalContinuityEngine
from tido_engine.audio_mastering import AudioMastering
from tido_engine.observability import ObservabilityLogger
from tido_engine.emotion_modulator import EmotionModulator
# [FIX 7] Import các hằng số path cross-platform từ paths.py
from tido_engine.paths import CKPT_MODEL_FILE, CKPT_VOCAB_FILE, HF_CACHE_DIR

class TidoVoicePerformanceEngine:
    def __init__(self, voice_lib_path: str, quality_mode: str = "STUDIO"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.quality_mode = quality_mode.upper()  # 'FAST', 'BALANCED', 'STUDIO'
        
        # Initialize Subsystem Engines
        self.ref_pipeline = ReferencePipeline(voice_lib_path)
        self.text_normalizer = VietnameseTextNormalizer()
        self.pron_engine = PronunciationEngine()
        self.phrase_planner = SemanticPhrasePlanner()
        self.chunker = BreathAwareChunker()
        self.prosody_director = ProsodyDirector()
        self.stitcher = AudioStitcher()
        self.qc_engine = AutomaticSpeechQC(model_size="tiny") if self.quality_mode != "FAST" else None
        self.repair_manager = RepairManager()
        self.context_fallback = ContextOverlapFallback()
        self.continuity_engine = GlobalContinuityEngine()
        self.mastering = AudioMastering()
        self.emotion_modulator = EmotionModulator()
        self.logger = ObservabilityLogger()

        self.f5tts = None
        self.df_model = None
        self.df_state = None

    def init_models(self):
        """Loads F5-TTS model and DeepFilterNet lazily."""
        if self.f5tts is None:
            print(f"🚀 [INIT] Loading TIDO ViVoice Model on {self.device}...")
            from f5_tts.api import F5TTS
            # [FIX 7] Dùng hằng số path động từ paths.py thay vì hardcode drive letter Windows (r"d:\Tido\...")
            self.f5tts = F5TTS(
                model="F5TTS_Base",
                ckpt_file=CKPT_MODEL_FILE,
                vocab_file=CKPT_VOCAB_FILE,
                device=self.device,
                hf_cache_dir=HF_CACHE_DIR
            )
            print("      ✅ F5-TTS Model initialized!")

        if self.df_model is None:
            try:
                print("🚀 [INIT] Loading DeepFilterNet3...")
                from df.enhance import init_df
                self.df_model, self.df_state, _ = init_df()
                self.mastering.df_model = self.df_model
                self.mastering.df_state = self.df_state
                print("      ✅ DeepFilterNet initialized!")
            except Exception as e:
                print(f"⚠️ DeepFilterNet init skipped: {e}")

    def _render_chunk_with_qc(
        self,
        profile: VoiceProfile,
        plan: DeliveryPlan,
        gen_text: str,
        prev_text: str,
        temp_wave: str
    ) -> AudioSegment:
        """
        [FIX 2] Auto-QC Loop & Retry Strategy Engine Execution.
        Renders a chunk using F5-TTS, audits accuracy via Whisper ASR (if QC enabled),
        and dynamically retries with adjusted parameters if word swallowing or text errors occur.
        """
        attempt = 0
        best_candidate: Optional[AudioSegment] = None
        best_accuracy = -1.0

        current_gen_text = gen_text
        remove_silence = True
        speed_multiplier = 1.0
        current_cfg = plan.target_cfg

        while attempt <= self.repair_manager.max_retries:
            eff_speed = plan.speed_effective * speed_multiplier
            
            try:
                self.f5tts.infer(
                    ref_file=profile.reference_path,
                    ref_text=profile.reference_transcript,
                    gen_text=current_gen_text,
                    file_wave=temp_wave,
                    speed=eff_speed,
                    remove_silence=remove_silence,
                    nfe_step=plan.target_nfe_step,
                    cfg_strength=current_cfg
                )
            except Exception as e:
                print(f"    ❌ Inference error on attempt {attempt}: {e}")
                attempt += 1
                continue

            if not os.path.exists(temp_wave) or os.path.getsize(temp_wave) == 0:
                attempt += 1
                continue

            candidate_audio = AudioSegment.from_file(temp_wave)

            # Skip QC if QC engine is not initialized (e.g. FAST mode)
            if self.qc_engine is None:
                return candidate_audio

            # Run Whisper Auto-QC Audit
            qc_res = self.qc_engine.audit_audio(temp_wave, current_gen_text)
            print(f"    [QC: Attempt {attempt}] Pass: {qc_res.passed} | Acc: {qc_res.text_accuracy:.2f} | Issue: {qc_res.issue_type}")

            if qc_res.text_accuracy > best_accuracy:
                best_accuracy = qc_res.text_accuracy
                best_candidate = candidate_audio

            if qc_res.passed:
                return candidate_audio

            # Request repair strategy from RepairManager
            action = self.repair_manager.get_repair_strategy(attempt, qc_res)
            print(f"    [QC: Strategy] Action: {action}")

            if action == "CONTEXT_OVERLAP":
                current_gen_text = self.context_fallback.prepare_context_text(gen_text, prev_text)
            elif action == "INCREASE_TAIL_PAD":
                remove_silence = False
                speed_multiplier *= 0.95
            elif action == "ADJUST_CFG_SEED":
                current_cfg = max(1.35, min(1.85, current_cfg + (0.1 if attempt % 2 == 1 else -0.1)))
            else:
                break

            attempt += 1

        # Fallback to best effort candidate if retries exhausted
        return best_candidate if best_candidate is not None else AudioSegment.silent(duration=100)

    def process_script(self, script_path: str, output_path: str) -> str:
        """
        Executes full script generation pipeline:
        Normalization -> Dictionary -> Phrasing -> Chunking -> Prosody -> F5 TTS + Auto-QC -> Emotion Modulation -> Stitching -> Mastering.
        """
        self.init_models()
        req_start_time = time.time()
        req_id = f"req_{int(req_start_time*1000)}"

        with open(script_path, 'r', encoding='utf-8') as f:
            script_data = json.load(f)

        voice_id = script_data.get('voice_id', 'vo_motaro_kb19')
        profile = self.ref_pipeline.get_profile(voice_id)
        segments = script_data.get('segments', [])

        print(f"\n🎬 [TIDO PIPELINE] Processing script: {script_path}")
        print(f"   Voice: {profile.name} ({profile.voice_id}) | Mode: {self.quality_mode}")

        state = ProsodyState()
        rendered_chunks: List[Tuple[AudioSegment, DeliveryPlan]] = []
        execution_logs = []
        prev_segment_text = ""

        for seg_idx, seg in enumerate(segments):
            seg_voice = seg.get('voice_id', voice_id)
            seg_profile = self.ref_pipeline.get_profile(seg_voice)
            
            raw_text = seg.get('text', '')
            raw_emotion = seg.get('emotion', 'neutral')
            raw_pacing = seg.get('pacing', 'bình thường')
            user_pause_after = seg.get('pause_after_s')

            # 1. TEXT NORMALIZATION
            norm_text = self.text_normalizer.normalize(raw_text)

            # 2. PRONUNCIATION DICTIONARY MAP
            spoken_text = self.pron_engine.apply_pronunciation(norm_text, seg_profile.pronunciation_map)

            # 3. CONTEXT & EMOTION PLANNING
            print(f"\n 📌 Segment {seg_idx+1}/{len(segments)}: '{spoken_text[:35]}...'")

            # 4. SEMANTIC PHRASE PLANNING
            phrases = self.phrase_planner.plan_phrases(spoken_text)

            # 5. BREATH-AWARE CHUNKING
            chunks: List[InferenceChunk] = self.chunker.create_chunks(phrases)
            print(f"    Generated {len(chunks)} breath-aware chunk(s)")

            for chunk in chunks:
                # 6. PROSODY DIRECTOR & DELIVERY PLAN
                # [FIX 4] Truyền boundary_pause_ms=chunk.pause_after_ms và vocal_tail từ prosody config
                plan: DeliveryPlan = self.prosody_director.create_delivery_plan(
                    chunk_index=chunk.chunk_index,
                    text=chunk.text,
                    requested_emotion=raw_emotion,
                    requested_pacing=raw_pacing,
                    voice_profile=seg_profile,
                    state=state,
                    pause_after_user=user_pause_after,
                    intensity=seg.get('intensity'),
                    prosody_config=seg.get('prosody'),
                    boundary_pause_ms=chunk.pause_after_ms,
                    vocal_tail=(seg.get('prosody') or {}).get('vocal_tail')
                )

                # 7. F5 INFERENCE + AUTO-QC & STABILITY RENDER
                # Strip bracketed tags so F5-TTS does not pronounce them
                clean_gen_text = re.sub(r'\[.*?\]', '', plan.text).strip()
                clean_gen_text = re.sub(r'\s+', ' ', clean_gen_text)
                
                temp_wave = os.path.join(os.path.dirname(output_path), f"_tmp_{seg_idx}_{chunk.chunk_index}.wav")
                t0 = time.time()
                
                # [FIX 2] Thay lời gọi self.f5tts.infer(...) trực tiếp bằng self._render_chunk_with_qc(...)
                chunk_seg = self._render_chunk_with_qc(
                    profile=seg_profile,
                    plan=plan,
                    gen_text=clean_gen_text,
                    prev_text=prev_segment_text,
                    temp_wave=temp_wave
                )
                print(f"     ✅ Rendered & QC chunk in {time.time()-t0:.1f}s")

                if os.path.exists(temp_wave):
                    try: os.remove(temp_wave)
                    except: pass

                # Apply Continuity Gain Adjustment & Layer 2 Expressive Modulation
                chunk_seg = self.continuity_engine.process_continuity(chunk_seg)
                chunk_seg = self.emotion_modulator.modulate_emotion(chunk_seg, plan)
                rendered_chunks.append((chunk_seg, plan))

                execution_logs.append({
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "spoken_text": plan.text,
                })

            prev_segment_text = spoken_text

        # 9. AUDIO TIMELINE STITCHING
        print(f"\n🧵 Stitching {len(rendered_chunks)} rendered chunks...")
        stitched_audio = self.stitcher.stitch_chunks(rendered_chunks)

        # 10. AUDIO MASTERING (Bypass DeepFilterNet wet=0.0 for pure human clarity)
        print("🎛️ Mastering final studio audio track...")
        final_output_path = self.mastering.master_final_audio(stitched_audio, output_path, wet=0.0)

        # 11. OBSERVABILITY LOGGING
        self.logger.log_generation({
            "request_id": req_id,
            "voice_id": profile.voice_id,
            "voice_hash": profile.reference_hash,
            "total_duration_s": len(stitched_audio) / 1000.0,
            "quality_mode": self.quality_mode,
            "chunks_rendered": len(rendered_chunks),
            "execution_time_s": time.time() - req_start_time,
            "logs": execution_logs
        })

        print(f"🎉 MASTER DONE — {len(stitched_audio)/1000:.1f}s → {final_output_path}\n")
        return final_output_path
