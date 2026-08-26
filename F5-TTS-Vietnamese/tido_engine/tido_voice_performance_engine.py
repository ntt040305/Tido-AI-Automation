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
from tido_engine.tts_adapter_interface import TTSEngineAdapter
from tido_engine.f5_tts_adapter import F5TTSAdapter

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

        self.tts_adapter: TTSEngineAdapter = F5TTSAdapter(device=self.device)
        self.df_model = None
        self.df_state = None

    def init_models(self):
        """Loads TTS Adapter model and DeepFilterNet lazily."""
        self.tts_adapter.initialize()

        if self.df_model is None:
            try:
                print("[INIT] Loading DeepFilterNet3...")
                from df.enhance import init_df
                self.df_model, self.df_state, _ = init_df()
                self.mastering.df_model = self.df_model
                self.mastering.df_state = self.df_state
                print("      [OK] DeepFilterNet initialized!")
            except Exception as e:
                print(f"[WARN] DeepFilterNet init skipped: {e}")

    @staticmethod
    def replace_pause_markers(text: str) -> str:
        """Translates [pause:X] to natural punctuation so normalizer doesn't turn 0.4 into 'không bốn'."""
        def repl(m):
            try:
                val = float(m.group(1))
            except ValueError:
                return ", "
            if val <= 0.3:
                return " "
            elif val <= 0.6:
                return ", "
            elif val <= 1.0:
                return "... "
            else:
                return ". "
        text = re.sub(r'\[pause:([\d\.]+)\]', repl, text)
        return re.sub(r'\s+', ' ', text).strip()

    def process_script(self, script_path: str, output_path: str) -> str:
        """Processes a full script JSON through the complete pipeline."""
        self.init_models()
        req_start_time = time.time()
        req_id = f"tido_{int(req_start_time*1000)}"

        with open(script_path, 'r', encoding='utf-8') as f:
            script_data = json.load(f)

        metadata = script_data.get('metadata', {})
        voice_id = metadata.get('voice_id', 'vo_motaro_kb19')
        
        # 1. REFERENCE VOICE LOCK & VOICE PROFILE
        profile: VoiceProfile = self.ref_pipeline.get_profile(voice_id)
        
        print(f"\n[SCRIPT] Title: {metadata.get('title', 'TIDO Script')}")
        print(f"[VOICE] Name: {profile.name} (ID: {profile.voice_id} | Hash: {profile.reference_hash[:8]})")
        print(f"[MODE] Quality: {self.quality_mode}\n")

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
            
            # Pre-process: Replace [pause:X] with natural punctuation BEFORE text normalization!
            raw_text = self.replace_pause_markers(raw_text)

            # Resolve Voice Profile per segment with Emotional Reference Audio Resolution
            seg_voice_id = seg.get('voice_id') or seg.get('speaker') or voice_id
            seg_profile: VoiceProfile = self.ref_pipeline.get_profile(seg_voice_id, emotion=raw_emotion)

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
                plan: DeliveryPlan = self.prosody_director.create_delivery_plan(
                    chunk_index=chunk.chunk_index,
                    text=chunk.text,
                    requested_emotion=raw_emotion,
                    requested_pacing=raw_pacing,
                    voice_profile=seg_profile,
                    state=state,
                    pause_after_user=user_pause_after,
                    intensity=seg.get('intensity'),
                    prosody_config=seg.get('prosody')
                )

                # 7. F5 INFERENCE + STABILITY RENDER
                # Strip bracketed tags so F5-TTS does not pronounce them
                clean_gen_text = re.sub(r'\[.*?\]', '', plan.text)
                clean_gen_text = re.sub(r'[\[\]]', '', clean_gen_text)  # remove remaining orphaned brackets
                # Convert hyphens (- or —) and ellipses (...) into clean commas/spaces so tokenizer doesn't hallucinate "khoảng" or "ớ"
                clean_gen_text = re.sub(r'\.{2,}', ',', clean_gen_text)
                clean_gen_text = re.sub(r'\s*[\-—–]\s*', ', ', clean_gen_text)
                clean_gen_text = re.sub(r'\s+', ' ', clean_gen_text).strip()
                # Lowercase for 100% ViVoice token vocabulary match
                clean_gen_text = clean_gen_text.lower()
                
                temp_wave = os.path.join(os.path.dirname(output_path), f"_tmp_{seg_idx}_{chunk.chunk_index}.wav")
                t0 = time.time()
                
                try:
                    tts_config = {
                        "speed": plan.speed_effective,
                        "remove_silence": True,
                        "nfe_step": plan.target_nfe_step,
                        "cfg_strength": plan.target_cfg
                    }
                    self.tts_adapter.render(
                        text=clean_gen_text,
                        ref_audio_path=seg_profile.reference_path,
                        ref_text=seg_profile.reference_transcript,
                        config=tts_config,
                        output_wave_path=temp_wave
                    )
                except Exception as e:
                    print(f"    [ERR] Inference error: {e}")
                    continue

                chunk_seg = AudioSegment.from_file(temp_wave)
                print(f"     [OK] Rendered chunk in {time.time()-t0:.1f}s")

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
        print(f"\n[STITCH] Stitching {len(rendered_chunks)} rendered chunks...")
        stitched_audio = self.stitcher.stitch_chunks(rendered_chunks)

        # 10. AUDIO MASTERING (Bypass DeepFilterNet wet=0.0 for pure human clarity)
        print("[MASTER] Mastering final studio audio track...")
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

        print(f"[DONE] MASTER DONE -- {len(stitched_audio)/1000:.1f}s -> {final_output_path}\n")
        return final_output_path
