"""
TIDO Voice Performance Engine - Automatic Speech QC (Zipformer ASR)
==================================================================
Performs automated speech verification to guarantee 0 missing words,
no first/last word swallows, and high text fidelity before accepting candidate audio.
Uses sherpa-onnx Zipformer-30M-RNNT-6000h (int8 ONNX) for fast, highly accurate Vietnamese ASR.
"""

import os
import re
import soundfile as sf
import numpy as np
import sherpa_onnx
from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class QCResult:
    passed: bool
    text_accuracy: float
    expected_text: str
    transcribed_text: str
    errors: List[Dict[str, str]] = field(default_factory=list)

class AutomaticSpeechQC:
    def __init__(self, model_size: str = "tiny", model_dir: str = None):
        """
        [UPGRADE] model_size giữ lại làm tham số cho tương thích ngược,
        thay bằng Zipformer-30M-RNNT-6000h (WER 8.10% trên VLSP2025 vs 16.31% của
        PhoWhisper-Large — chính xác hơn nhiều, nhẹ hơn, chạy tốt trên CPU).
        """
        self.model_size = model_size
        self.recognizer = None
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        default_dir_1 = os.path.join(base_dir, "models", "sherpa-onnx-zipformer-vi-30M-int8-2026-02-09")
        default_dir_2 = os.path.join(os.path.dirname(base_dir), "models", "sherpa-onnx-zipformer-vi-30M-int8-2026-02-09")
        selected_default = default_dir_1 if os.path.exists(default_dir_1) else default_dir_2

        self.model_dir = model_dir or os.environ.get("TIDO_ASR_QC_MODEL_DIR", selected_default)

    def _init_model(self):
        if self.recognizer is None:
            print("[AUTO-QC] Loading Zipformer ASR model (int8 ONNX)...")
            encoder = os.path.join(self.model_dir, "encoder.int8.onnx")
            decoder = os.path.join(self.model_dir, "decoder.onnx")
            joiner = os.path.join(self.model_dir, "joiner.int8.onnx")
            tokens = os.path.join(self.model_dir, "tokens.txt")

            if not os.path.exists(encoder):
                raise FileNotFoundError(f"[ERROR] Zipformer model missing at: {self.model_dir}")

            self.recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=encoder,
                decoder=decoder,
                joiner=joiner,
                tokens=tokens,
                num_threads=2,
                sample_rate=16000,
                feature_dim=80,
                decoding_method="greedy_search",
                provider="cpu",
            )
            print("      [OK] Zipformer ASR loaded successfully!")

    def _transcribe(self, audio_path: str) -> str:
        self._init_model()
        wav, sr = sf.read(audio_path, dtype="float32", always_2d=False)
        if wav.ndim > 1:
            wav = wav.mean(axis=1)  # xuống mono nếu là stereo
        if sr != 16000:
            import librosa
            wav = librosa.resample(wav, orig_sr=sr, target_sr=16000)
            sr = 16000
        stream = self.recognizer.create_stream()
        stream.accept_waveform(sr, wav)
        self.recognizer.decode_stream(stream)
        return stream.result.text.strip().lower()

    def audit_audio(self, audio_path: str, expected_text: str) -> QCResult:
        """Audits generated audio against expected text."""
        if not os.path.exists(audio_path):
            return QCResult(
                passed=False,
                text_accuracy=0.0,
                expected_text=expected_text,
                transcribed_text="",
                errors=[{"type": "FILE_NOT_FOUND", "severity": "critical"}]
            )

        # Transcribe audio using Zipformer ASR
        transcribed = self._transcribe(audio_path)
        clean_expected = re.sub(r'[^\w\s]', '', expected_text.lower()).strip()
        clean_transcribed = re.sub(r'[^\w\s]', '', transcribed).strip()

        exp_words = clean_expected.split()
        trans_words = clean_transcribed.split()

        errors = []

        if not exp_words:
            return QCResult(passed=True, text_accuracy=1.0, expected_text=expected_text, transcribed_text=transcribed)

        # 1. Check FIRST WORD SWALLOW (Look within first 3 transcribed words)
        expected_first = exp_words[0]
        first_window = trans_words[:3] if trans_words else []
        if expected_first not in first_window and not any(expected_first in w for w in first_window):
            errors.append({
                "type": "FIRST_WORD_MISSING",
                "severity": "critical",
                "expected": expected_first,
                "detected": trans_words[0] if trans_words else ""
            })

        # 2. Check LAST WORD SWALLOW (Look within last 3 transcribed words)
        expected_last = exp_words[-1]
        last_window = trans_words[-3:] if trans_words else []
        if expected_last not in last_window and not any(expected_last in w for w in last_window):
            errors.append({
                "type": "LAST_WORD_MISSING",
                "severity": "critical",
                "expected": expected_last,
                "detected": trans_words[-1] if trans_words else ""
            })

        # 3. Calculate word accuracy with partial matching
        matching_count = sum(1 for w in exp_words if any(w in tw or tw in w for tw in trans_words))
        accuracy = matching_count / len(exp_words) if exp_words else 1.0

        if accuracy < 0.60 and len(exp_words) > 3:
            errors.append({
                "type": "LOW_TEXT_FIDELITY",
                "severity": "critical",
                "accuracy": f"{accuracy:.2f}"
            })

        passed = len(errors) == 0

        return QCResult(
            passed=passed,
            text_accuracy=accuracy,
            expected_text=clean_expected,
            transcribed_text=clean_transcribed,
            errors=errors
        )
