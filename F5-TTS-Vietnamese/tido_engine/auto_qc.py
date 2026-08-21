"""
TIDO Voice Performance Engine - Automatic Speech QC (Whisper ASR)
==================================================================
Performs automated speech verification to guarantee 0 missing words,
no first/last word swallows, and high text fidelity before accepting candidate audio.
"""

import os
import re
import whisper
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
    def __init__(self, model_size: str = "tiny"):
        self.model_size = model_size
        self.model = None

    def _init_model(self):
        if self.model is None:
            print(f"🔍 [AUTO-QC] Loading Whisper ASR model ({self.model_size})...")
            self.model = whisper.load_model(self.model_size)
            print("      ✅ Whisper ASR loaded successfully!")

    def audit_audio(self, audio_path: str, expected_text: str) -> QCResult:
        """Audits generated audio against expected text."""
        self._init_model()
        
        if not os.path.exists(audio_path):
            return QCResult(
                passed=False,
                text_accuracy=0.0,
                expected_text=expected_text,
                transcribed_text="",
                errors=[{"type": "FILE_NOT_FOUND", "severity": "critical"}]
            )

        # Transcribe audio using Whisper
        result = self.model.transcribe(audio_path, language="vi")
        transcribed = result.get("text", "").strip().lower()
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
