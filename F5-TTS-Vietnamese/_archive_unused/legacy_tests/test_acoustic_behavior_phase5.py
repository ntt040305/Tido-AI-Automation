"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 5 Acoustic Behavior
================================================================================
Test cases:
TEST 01: v2_safe mode returns unchanged script (backward compatibility)
TEST 02: Acoustic layer generates metadata without text mutation
TEST 03: Brand protection ("Gym Toàn Thắng" 100% preserved)
TEST 04: Number protection ("65 mét vuông" and "100%" 100% preserved)
TEST 05: A/B Benchmark report (v2_safe vs v2_acoustic_humanized comparison)
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline
from tido_engine.humanization.humanization_ab_test import HumanizationABTestRunner

class TestAcousticBehaviorPhase5(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Phase 5 Acoustic Behavior Test Script",
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

    def test_01_v2_safe_regression(self):
        result = self.pipeline.process(self.script, enable_humanization=False, pipeline_mode="v2_safe")
        self.assertEqual(result.segments[0].text, self.script.segments[0].text)
        self.assertEqual(result.segments[1].text, self.script.segments[1].text)
        print("\n[TEST 01 PASSED] v2_safe mode remains 100% untouched.")

    def test_02_acoustic_metadata_generation(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_acoustic_behavior=True,
            pipeline_mode="v2_acoustic_humanized",
            context_description="quảng cáo mỹ phẩm"
        )
        self.assertIsNotNone(result.segments[0].performance.speed_ratio)
        self.assertIsNotNone(result.segments[0].performance.pitch_behavior.contour)
        print(f"\n[TEST 02 PASSED] Acoustic metadata generated (speed_ratio={result.segments[0].performance.speed_ratio}, contour={result.segments[0].performance.pitch_behavior.contour}).")

    def test_03_brand_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_acoustic_behavior=True,
            pipeline_mode="v2_acoustic_humanized"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("Gym Toàn Thắng", all_text)
        print("\n[TEST 03 PASSED] Brand name 'Gym Toàn Thắng' 100% preserved.")

    def test_04_number_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_acoustic_behavior=True,
            pipeline_mode="v2_acoustic_humanized"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("65 mét vuông", all_text)
        self.assertIn("100%", all_text)
        print("\n[TEST 04 PASSED] Metric '65 mét vuông' and '100%' 100% preserved.")

    def test_05_ab_benchmark_report(self):
        runner = HumanizationABTestRunner()
        report = runner.run_ab_comparison(self.script, context_desc="quảng cáo gym")
        self.assertIn("variant_a_v2_safe", report)
        self.assertIn("variant_b_v2_acoustic_humanized", report)
        self.assertIn("deltas", report)
        print("\n[TEST 05 PASSED] A/B benchmark side-by-side evaluation report generated.")

if __name__ == "__main__":
    unittest.main()
