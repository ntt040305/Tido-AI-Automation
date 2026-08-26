"""
TIDO Voice Performance Engine - Automated Regression Test Suite (V2 Safe)
===========================================================================
Automated Regression Test asserting:
1. Text integrity & Sanitization: Rejects index numbers prepended to F5 text.
2. Native Script Protection: Native Vietnamese words ("toàn thắng") are UNTOUCHED.
3. Reference Audio Audit: Transcript & audio waveform strict consistency check.
4. Audio Mastering: Peak dBFS <= -1.0 dBFS and zero clipped samples.
"""

import os
import sys
import json
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_service import VoiceService, sanitize_final_text
from tido_engine.pronunciation_engine import PronunciationEngine
from tido_engine.vietnamese_text_normalizer import VietnameseTextNormalizer
from tido_engine.reference_pipeline import ReferencePipeline

class TestV2SafeRegression(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.service = VoiceService(output_dir=r"d:\Tido\F5-TTS-Vietnamese\regression_test_outputs")
        cls.normalizer = VietnameseTextNormalizer()
        cls.pron_engine = PronunciationEngine()
        cls.ref_pipeline = ReferencePipeline(r"d:\Tido\Assets\Voices\voice_library.json")

    def test_01_final_text_sanitizer_removes_indices(self):
        """Test BUG 1 Fix: final_text_sanitizer strips leading numbers/indices and rejects them in validation."""
        raw_text_with_index = "0 bạn muốn thay đổi vóc dáng"
        sanitized = sanitize_final_text(raw_text_with_index)
        self.assertEqual(sanitized, "bạn muốn thay đổi vóc dáng")

        # Regression test MUST FAIL if final_text starts with a digit/index
        with self.assertRaises(ValueError):
            self.service.validate_text_integrity(
                segment_id="seg_fail",
                original_text="bạn muốn thay đổi vóc dáng",
                migrated_text="bạn muốn thay đổi vóc dáng",
                normalized_text="bạn muốn thay đổi vóc dáng",
                pronunciation_processed_text="bạn muốn thay đổi vóc dáng",
                emphasis_processed_text="bạn muốn thay đổi vóc dáng",
                final_text_sent_to_f5="0 bạn muốn thay đổi vóc dáng",
                dictionary_matches=[]
            )
        print("   ✅ Test 01 Passed: final_text_sanitizer strips indices and rejects text starting with numbers.")

    def test_02_pronunciation_hints_do_not_mutate_native_script(self):
        """Test BUG 3 Fix: Foreign word hints apply without mutating native Vietnamese script ('toàn thắng')."""
        original_text = "Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng."
        normalized = self.normalizer.normalize(original_text)
        pron_text, logs = self.pron_engine.apply_pronunciation(normalized)

        # Foreign word "gym" -> "dim" hint
        self.assertIn("dim", pron_text)
        # Native Vietnamese name "toàn thắng" -> UNTOUCHED
        self.assertIn("toàn thắng", pron_text)

        print("   ✅ Test 02 Passed: Foreign word hints applied without mutating native script.")

    def test_03_reference_audio_audit(self):
        """Test BUG 2 Fix: Reference audio & transcript consistency audit."""
        ref_log = self.ref_pipeline.validate_reference_audio("vo_mizaki_3")
        self.assertEqual(ref_log["reference_validation_status"], "PASSED")
        self.assertGreaterEqual(ref_log["reference_duration"], 3.0)
        self.assertIn("Ngay khi bước vào căn hộ", ref_log["reference_text"])
        print("   ✅ Test 03 Passed: Reference audio & transcript audit passed.")

    def test_04_mastering_peak_limit_and_zero_clipping(self):
        """Test Audio Mastering: Peak <= -1.0 dBFS and zero clipped samples."""
        test_script = {
            "global_genre": "commercial",
            "title": "Mastering Test",
            "segments": [
                {
                    "segment_id": "seg_clean",
                    "text": "Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng.",
                    "performance": {"segment_role": "call_to_action", "energy_level": "high"}
                }
            ]
        }
        res = self.service.synthesize(
            script_input=test_script,
            voice_id="vo_mizaki_3",
            pipeline_mode="v2_safe"
        )
        self.assertLessEqual(res["peak_dbfs"], -1.0)
        self.assertEqual(res["clipped_samples"], 0)

        # Verify final text sent to F5 does NOT start with a number
        trace_file = res["text_trace_file"]
        with open(trace_file, 'r', encoding='utf-8') as f:
            trace_data = json.load(f)
            final_f5 = trace_data["text_trace_logs"][0]["final_text_sent_to_f5"]
            self.assertFalse(final_f5[0].isdigit(), f"Final text sent to F5 starts with a number: {final_f5}")

        print(f"   ✅ Test 04 Passed: Peak dBFS ({res['peak_dbfs']} dBFS) <= -1.0 dBFS, zero clipped samples.")

if __name__ == "__main__":
    print("=================================================================")
    print("      TIDO VOICE PERFORMANCE ENGINE - REGRESSION SUITE (V2 SAFE)  ")
    print("=================================================================\n")
    unittest.main()
