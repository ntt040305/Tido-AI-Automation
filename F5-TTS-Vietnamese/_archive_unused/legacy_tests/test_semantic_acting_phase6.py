"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 6 Semantic Acting
================================================================================
Test cases:
TEST 01: v2_safe mode returns unchanged script (backward compatibility)
TEST 02: Semantic intent detection (HOOK, TRUST, CTA correctly identified)
TEST 03: Brand protection ("Gym Toàn Thắng" 100% preserved)
TEST 04: Number protection ("65 mét vuông" and "100%" 100% preserved)
TEST 05: A/B Benchmark report (v2_acoustic_humanized vs v2_semantic_acting comparison)
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline
from tido_engine.humanization.semantic.semantic_intent_analyzer import SemanticIntentAnalyzer
from tido_engine.humanization.humanization_ab_test import HumanizationABTestRunner

class TestSemanticActingPhase6(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Phase 6 Semantic Acting Test Script",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Bạn có đang gặp khó khăn trong việc thay đổi vóc dáng và cải thiện sức khỏe mỗi ngày không?"
                },
                {
                    "segment_id": "seg_002",
                    "text": "Tại Gym Toàn Thắng, bạn sẽ được tập luyện trong không gian hiện đại rộng 65 mét vuông với hệ thống máy tập khoa học và đội ngũ huấn luyện viên luôn đồng hành."
                },
                {
                    "segment_id": "seg_003",
                    "text": "Hãy bắt đầu hành trình thay đổi bản thân ngay hôm nay với ưu đãi giảm 100%!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.script_dict)
        self.pipeline = HumanizationPipeline()

    def test_01_v2_safe_regression(self):
        result = self.pipeline.process(self.script, enable_humanization=False, pipeline_mode="v2_safe")
        self.assertEqual(result.segments[0].text, self.script.segments[0].text)
        self.assertEqual(result.segments[1].text, self.script.segments[1].text)
        self.assertEqual(result.segments[2].text, self.script.segments[2].text)
        print("\n[TEST 01 PASSED] v2_safe mode remains 100% untouched.")

    def test_02_semantic_intent_detection(self):
        meta_0 = SemanticIntentAnalyzer.analyze_segment_intent(self.script.segments[0], 0, 3)
        meta_1 = SemanticIntentAnalyzer.analyze_segment_intent(self.script.segments[1], 1, 3)
        meta_2 = SemanticIntentAnalyzer.analyze_segment_intent(self.script.segments[2], 2, 3)

        self.assertEqual(meta_0["intent"], "HOOK")
        self.assertEqual(meta_1["intent"], "TRUST")
        self.assertEqual(meta_2["intent"], "CTA")
        print(f"\n[TEST 02 PASSED] Semantic intents correctly identified: {meta_0['intent']}, {meta_1['intent']}, {meta_2['intent']}.")

    def test_03_brand_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            pipeline_mode="v2_semantic_acting"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("Gym Toàn Thắng", all_text)
        print("\n[TEST 03 PASSED] Brand name 'Gym Toàn Thắng' 100% preserved.")

    def test_04_number_protection(self):
        result = self.pipeline.process(
            self.script,
            enable_humanization=True,
            pipeline_mode="v2_semantic_acting"
        )
        all_text = " ".join([seg.text for seg in result.segments])
        self.assertIn("65 mét vuông", all_text)
        self.assertIn("100%", all_text)
        print("\n[TEST 04 PASSED] Specs '65 mét vuông' and '100%' 100% preserved.")

    def test_05_ab_benchmark_report(self):
        runner = HumanizationABTestRunner()
        report = runner.run_ab_comparison(self.script, context_desc="quảng cáo gym")
        self.assertIn("variant_a_v2_acoustic_humanized", report)
        self.assertIn("variant_b_v2_semantic_acting", report)
        self.assertIn("deltas", report)
        print("\n[TEST 05 PASSED] A/B benchmark side-by-side evaluation report generated.")

if __name__ == "__main__":
    unittest.main()
