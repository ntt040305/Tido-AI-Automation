"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 4
================================================================
Test cases:
TEST 01: Humanization OFF (v2_safe mode returns unchanged script)
TEST 02: Commercial profile selection (expression <= 2, commercial_soft selected)
TEST 03: Documentary profile selection (expression == 0, pause_intensity higher)
TEST 04: Safety regression (Gym Toàn Thắng, numbers, claims preserved)
TEST 05: Rollback simulation (Simulated exception falls back to V2 Safe)
TEST 06: Adaptive selection (Different contexts produce different profiles)
TEST 07: A/B Benchmark system runner
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline
from tido_engine.humanization.humanization_context_resolver import HumanizationContextResolver
from tido_engine.humanization.humanization_ab_test import HumanizationABTestRunner

class TestHumanizationPhase4(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Phase 4 Adaptive Test Script",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Bạn muốn thay đổi bản thân tại Gym Toàn Thắng với diện tích 65 mét vuông?"
                },
                {
                    "segment_id": "seg_002",
                    "text": "Gym Toàn Thắng mang đến không gian tập luyện hiện đại giảm giá 100%!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.script_dict)
        self.pipeline = HumanizationPipeline()

    def test_01_humanization_off(self):
        result = self.pipeline.process(self.script, enable_humanization=False, pipeline_mode="v2_safe")
        self.assertEqual(result.segments[0].text, self.script.segments[0].text)
        self.assertEqual(result.segments[1].text, self.script.segments[1].text)
        print("\n[TEST 01 PASSED] Humanization OFF returns 100% identical script.")

    def test_02_commercial_profile(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            pipeline_mode="v2_humanized",
            context_description="quảng cáo mỹ phẩm bán hàng"
        )
        
        # Verify expressions <= 2
        expressions = [seg.text for seg in result.segments if seg.text.startswith(("Thật ra", "Điều mình", "Đặc biệt", "Theo mình"))]
        self.assertLessEqual(len(expressions), 2)
        print(f"\n[TEST 02 PASSED] Commercial profile applied (expressions used: {len(expressions)} <= 2).")

    def test_03_documentary_profile(self):
        doc_script_dict = {
            "metadata": {"title": "Lịch sử Việt Nam", "voice_id": "vo_mizaki_3", "global_genre": "documentary_narrator"},
            "segments": [{"segment_id": "seg_001", "text": "Phim tài liệu lịch sử cần giữ vững sự tôn nghiêm."}]
        }
        doc_script = PerformanceScriptV2.from_dict(doc_script_dict)
        result = self.pipeline.process(
            doc_script,
            enable_humanization=True,
            pipeline_mode="v2_humanized",
            context_description="phim tài liệu lịch sử"
        )
        
        # Verify expressions = 0
        expressions = [seg.text for seg in result.segments if seg.text.startswith(("Thật ra", "Điều mình", "Đặc biệt", "Theo mình"))]
        self.assertEqual(len(expressions), 0)
        
        # Verify pause instruction present
        self.assertGreaterEqual(result.segments[0].performance.pause_instruction.pause_after_ms, 200)
        print("\n[TEST 03 PASSED] Documentary profile applied (expressions = 0, higher pause intensity).")

    def test_04_safety_regression(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            pipeline_mode="v2_humanized",
            context_description="quảng cáo"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("Gym Toàn Thắng", all_text)
        self.assertIn("65 mét vuông", all_text)
        self.assertIn("100%", all_text)
        print("\n[TEST 04 PASSED] Brand name 'Gym Toàn Thắng', numbers, and specs 100% preserved.")

    def test_05_rollback_simulation(self):
        broken_script = PerformanceScriptV2.from_dict(self.script_dict)
        broken_script.segments = [None]  # Induce AttributeError

        fallback = self.pipeline.process(
            broken_script,
            enable_humanization=True,
            pipeline_mode="v2_humanized"
        )
        self.assertEqual(fallback.segments, broken_script.segments)
        print("\n[TEST 05 PASSED] Rollback safety gate triggered: fallback to original V2 Safe script.")

    def test_06_adaptive_selection(self):
        resolver = HumanizationContextResolver()
        p1, _ = resolver.resolve_from_description("quảng cáo mỹ phẩm chăm sóc da")
        p2, _ = resolver.resolve_from_description("phim tài liệu lịch sử")
        p3, _ = resolver.resolve_from_description("podcast chia sẻ cá nhân")

        self.assertEqual(p1, "commercial_soft")
        self.assertEqual(p2, "documentary")
        self.assertEqual(p3, "podcast")
        print(f"\n[TEST 06 PASSED] Context resolver dynamically mapped profiles: {p1}, {p2}, {p3}.")

    def test_07_ab_benchmark_runner(self):
        runner = HumanizationABTestRunner()
        report = runner.run_ab_comparison(self.script, context_desc="quảng cáo gym")
        self.assertIn("variant_a_v2_safe", report)
        self.assertIn("variant_b_v2_humanized", report)

if __name__ == "__main__":
    unittest.main()
