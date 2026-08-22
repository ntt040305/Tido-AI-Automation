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
from typing import Dict, Any, Optional, List
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
# [FIX 7] Dùng paths.py thay vì hardcode checkpoint path Windows
from tido_engine.paths import CKPT_MODEL_FILE, CKPT_VOCAB_FILE, HF_CACHE_DIR, TEMP_DIR

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
            self.f5tts = F5TTS(
                model="F5TTS_Base",
                # [FIX 7] Dùng paths.py thay vì hardcode path Windows
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

    # [FIX 2] Method mới: vòng lặp render + Auto-QC + Adaptive Repair cho từng chunk.
    # Trước đây f5tts.infer() được gọi 1 lần thẳng ra file, không có bước kiểm tra ASR hay retry.
    def _render_chunk_with_qc(
        self,
        seg_profile: VoiceProfile,
        plan: DeliveryPlan,
        gen_text: str,
        prev_text: str,
        temp_wave: str,
    ) -> AudioSegment:
        """
        [FIX 2] Render 1 InferenceChunk với vòng lặp Auto-QC (Whisper) + Adaptive Repair.
        Trả về AudioSegment có text_accuracy cao nhất trong số các lần retry.
        Nếu không có qc_engine (FAST mode), render 1 lần và trả về ngay.
        """
        best_seg: Optional[AudioSegment] = None
        best_accuracy: float = -1.0
        current_gen_text = gen_text
        speed = plan.speed_effective
        remove_silence = True
        nfe_step = plan.target_nfe_step
        cfg_strength = plan.target_cfg

        max_attempts = 1 if self.qc_engine is None else (self.repair_manager.max_retries + 1)

        for attempt in range(max_attempts):
            try:
                self.f5tts.infer(
                    ref_file=seg_profile.reference_path,
                    ref_text=seg_profile.reference_transcript,
                    gen_text=current_gen_text,
                    file_wave=temp_wave,
                    speed=speed,
                    remove_silence=remove_silence,
                    nfe_step=nfe_step,
                    cfg_strength=cfg_strength
                )
            except Exception as e:
                print(f"    ❌ Inference error (attempt {attempt+1}): {e}")
                break

            if not os.path.exists(temp_wave):
                print(f"    ❌ Output file not created (attempt {attempt+1})")
                break

            chunk_seg = AudioSegment.from_file(temp_wave)

            # Nếu không có QC engine (FAST mode), trả về ngay
            if self.qc_engine is None:
                if os.path.exists(temp_wave):
                    try: os.remove(temp_wave)
                    except: pass
                return chunk_seg

            # [FIX 2] Gọi Whisper QC để kiểm tra chất lượng audio
            qc_result: QCResult = self.qc_engine.audit_audio(temp_wave, gen_text)
            print(f"     🔍 [QC: attempt {attempt+1}] accuracy={qc_result.text_accuracy:.2f} passed={qc_result.passed}")
            if qc_result.errors:
                for err in qc_result.errors:
                    print(f"         ⚠️ {err.get('type')} — expected: {err.get('expected','')} | detected: {err.get('detected','')}")

            # Giữ candidate có accuracy cao nhất làm best-effort fallback
            if qc_result.text_accuracy > best_accuracy:
                best_accuracy = qc_result.text_accuracy
                best_seg = chunk_seg

            if qc_result.passed:
                # QC passed — dừng lại, không cần retry
                if os.path.exists(temp_wave):
                    try: os.remove(temp_wave)
                    except: pass
                return chunk_seg

            # [FIX 2] Xác định chiến lược repair cho lần retry tiếp theo
            strategy = self.repair_manager.get_repair_strategy(attempt, qc_result)
            if not strategy.get("should_retry", False):
                break

            print(f"     🔧 [REPAIR] action={strategy['action']} — {strategy.get('reason','')}")
            action = strategy["action"]

            if action == "CONTEXT_OVERLAP":
                # Thêm context prefix từ câu trước để F5-TTS không nuốt chữ đầu
                current_gen_text = self.context_fallback.prepare_context_text(gen_text, prev_text)
            elif action == "INCREASE_TAIL_PAD":
                # Giảm speed nhẹ, tắt silence removal để giữ đuôi âm
                remove_silence = False
                speed = max(0.75, speed * 0.95)
            elif action == "ADJUST_CFG_SEED":
                # Điều chỉnh CFG ±0.1 để thay đổi mode sinh âm
                cfg_strength = max(1.0, min(2.5, cfg_strength + (0.1 if attempt % 2 == 0 else -0.1)))

            if os.path.exists(temp_wave):
                try: os.remove(temp_wave)
                except: pass

        # Hết lượt retry — trả về candidate có accuracy cao nhất (best-effort)
        if os.path.exists(temp_wave):
            try: os.remove(temp_wave)
            except: pass
        if best_seg is not None:
            print(f"     ⚠️ [QC] Best-effort result used (accuracy={best_accuracy:.2f})")
            return best_seg
        # Nếu không có candidate nào hợp lệ, báo lỗi và trả về silent segment
        print("     ❌ [QC] All attempts failed. Returning empty segment.")
        return AudioSegment.silent(duration=200)

    def process_script(self, script_path: str, output_path: str) -> str:
        """Processes a full script JSON through the complete 20-subsystem pipeline."""
        self.init_models()
        req_start_time = time.time()
        req_id = f"tido_{int(req_start_time*1000)}"

        with open(script_path, 'r', encoding='utf-8') as f:
            script_data = json.load(f)

        metadata = script_data.get('metadata', {})
        voice_id = metadata.get('voice_id', 'vo_motaro_kb19')
        
        # 1. REFERENCE VOICE LOCK & VOICE PROFILE
        profile: VoiceProfile = self.ref_pipeline.get_profile(voice_id)
        
        print(f"\n🎙️  Script: {metadata.get('title', 'TIDO Script')}")
        print(f"👤  Voice: {profile.name} (ID: {profile.voice_id} | Hash: {profile.reference_hash[:8]})")
        print(f"🎛️  Quality Mode: {self.quality_mode}\n")

        state = ProsodyState()
        rendered_chunks: List[tuple] = []  # [(AudioSegment, DeliveryPlan)]
        execution_logs: List[Dict[str, Any]] = []

        segments = script_data.get('segments', [])
        prev_segment_text = ""

        for seg_idx, seg in enumerate(segments):
            raw_text = seg.get('text', '')
            raw_emotion = seg.get('emotion', 'bình thường')
            raw_pacing = seg.get('pacing', 'bình thường')
            user_pause_after = seg.get('pause_after', None)
            
            # Resolve Voice Profile per segment for Multi-Character Dialogue Support
            seg_voice_id = seg.get('voice_id') or seg.get('speaker') or voice_id
            seg_profile: VoiceProfile = self.ref_pipeline.get_profile(seg_voice_id)

            print(f" ▶ [SEGMENT {seg_idx+1}/{len(segments)}] [{seg_profile.name}] {raw_emotion} | {raw_pacing}")
            print(f"    Raw Text: \"{raw_text}\"")

            # 2. TEXT NORMALIZATION
            normalized_text = self.text_normalizer.normalize(raw_text)

            # 3. PRONUNCIATION ENGINE
            spoken_text = self.pron_engine.apply_pronunciation(
                normalized_text,
                voice_map=seg_profile.pronunciation_map,
                project_map=metadata.get('project_pronunciation', {}),
                request_map=seg.get('pronunciation_overrides', {})
            )
            print(f"    Spoken Text: \"{spoken_text}\"")

            # 4. SEMANTIC PHRASE PLANNING
            phrases = self.phrase_planner.plan_phrases(spoken_text)

            # 5. BREATH-AWARE CHUNKING
            chunks: List[InferenceChunk] = self.chunker.create_chunks(phrases)
            print(f"    Generated {len(chunks)} breath-aware chunk(s)")

            for chunk in chunks:
                # 6. PROSODY DIRECTOR & DELIVERY PLAN
                # [FIX 4] Truyền boundary_pause_ms và vocal_tail vào create_delivery_plan
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
                    # [FIX 4] Truyền pause từ loại dấu câu vào prosody director
                    boundary_pause_ms=chunk.pause_after_ms,
                    vocal_tail=(seg.get('prosody') or {}).get('vocal_tail'),
                )

                # 7. F5 INFERENCE + AUTO-QC + ADAPTIVE REPAIR
                # Strip bracketed tags (e.g. [hào hứng], [tự tin]) so F5-TTS does not pronounce them
                clean_gen_text = re.sub(r'\[.*?\]', '', plan.text).strip()
                clean_gen_text = re.sub(r'\s+', ' ', clean_gen_text)

                # [FIX 7] Dùng TEMP_DIR thay vì dùng đường dẫn theo output_path cứng
                temp_wave = os.path.join(TEMP_DIR, f"_tmp_{seg_idx}_{chunk.chunk_index}.wav")
                t0 = time.time()

                # [FIX 2] Thay gọi trực tiếp f5tts.infer() bằng _render_chunk_with_qc()
                chunk_seg = self._render_chunk_with_qc(
                    seg_profile=seg_profile,
                    plan=plan,
                    gen_text=clean_gen_text,
                    prev_text=prev_segment_text,
                    temp_wave=temp_wave,
                )

                if len(chunk_seg) == 0:
                    continue

                print(f"     ✅ Rendered chunk in {time.time()-t0:.1f}s")

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
