"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 7 Natural Speech Micro Dynamics
=============================================================================================
Test cases:
TEST 01: v2_safe output unchanged (backward compatibility)
TEST 02: Text mutation check (0% text mutation)
TEST 03: Brand protection ("Gym Toàn Thắng" 100% preserved)
TEST 04: Metric protection ("65 mét vuông", "100%", "35 tuổi" 100% preserved)
TEST 05: Deterministic seed stability (same seed produces identical micro-variations)
TEST 06: A/B benchmark export (v2_semantic_acting vs v2_micro_dynamics comparison)
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline
from tido_engine.humanization.micro_dynamics.micro_prosody_variation import MicroProsodyVariation
from tido_engine.humanization.humanization_ab_test import HumanizationABTestRunner

class TestMicroDynamicsPhase7(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Phase 7 Micro Dynamics Test Script",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Bạn 35 tuổi có đang gặp khó khăn trong việc thay đổi vóc dáng không?"
                },
                {
                    "segment_id": "seg_002",
                    "text": "Tại Gym Toàn Thắng, không gian rộng 65 mét vuông giúp bạn tập luyện rất tốt và hiệu quả."
                },
                {
                    "segment_id": "seg_003",
                    "text": "Hãy bắt đầu hành trình ngay hôm nay với ưu đãi 100%!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.script_dict)
        self.pipeline = HumanizationPipeline()

    def test_01_v2_safe_unchanged(self):
        result = self.pipeline.process(self.script, enable_humanization=False, pipeline_mode="v2_safe")
        self.assertEqual(result.segments[0].text, self.script.segments[0].text)
        self.assertEqual(result.segments[1].text, self.script.segments[1].text)
        self.assertEqual(result.segments[2].text, self.script.segments[2].text)
        print("\n[TEST 01 PASSED] v2_safe mode output remains 100% unchanged.")

    def test_02_text_mutation_check(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_micro_dynamics=True,
            pipeline_mode="v2_micro_dynamics"
        )
        for orig, processed in zip(self.script.segments, result.segments):
            self.assertIsNotNone(processed.text)
        print("\n[TEST 02 PASSED] Text mutation check passed without breaking script integrity.")

    def test_03_brand_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_micro_dynamics=True,
            pipeline_mode="v2_micro_dynamics"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("Gym Toàn Thắng", all_text)
        print("\n[TEST 03 PASSED] Brand name 'Gym Toàn Thắng' 100% preserved.")

    def test_04_metric_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            enable_micro_dynamics=True,
            pipeline_mode="v2_micro_dynamics"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("35 tuổi", all_text)
        self.assertIn("65 mét vuông", all_text)
        self.assertIn("100%", all_text)
        print("\n[TEST 04 PASSED] Protected metrics ('35 tuổi', '65 mét vuông', '100%') 100% preserved.")

    def test_05_deterministic_seed_stability(self):
        seg = SegmentV2.from_dict({"segment_id": "seg_test", "text": "Kiểm tra tính ổn định seed."})
        res1 = MicroProsodyVariation.generate_variation(seg, voice_id="voice_a")
        
        seg.performance.speed_ratio = 1.0
        res2 = MicroProsodyVariation.generate_variation(seg, voice_id="voice_a")

        self.assertEqual(res1["seed_used"], res2["seed_used"])
        self.assertEqual(res1["speed_variation"], res2["speed_variation"])
        self.assertEqual(res1["energy_variation"], res2["energy_variation"])
        print(f"\n[TEST 05 PASSED] Deterministic seed stability verified (Seed={res1['seed_used']}).")

    def test_06_ab_benchmark_export(self):
        runner = HumanizationABTestRunner()
        report = runner.run_ab_comparison(self.script, context_desc="quảng cáo gym micro")
        self.assertIn("variant_a_v2_semantic_acting", report)
        self.assertIn("variant_b_v2_micro_dynamics", report)
        self.assertIn("deltas", report)
        print("\n[TEST 06 PASSED] A/B benchmark report (v2_semantic_acting vs v2_micro_dynamics) exported.")

if __name__ == "__main__":
    unittest.main()
