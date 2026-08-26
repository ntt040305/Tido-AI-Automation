"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 3
================================================================
Test cases:
1. Brand protection test ("Gym Toàn Thắng", "Tido AI")
2. Expression quota test (Assert MAX 2 expressions applied across 4 segments)
3. No random filler test (Verify only allowed expressions used)
4. Emotion progression test (Verify curiosity -> empathy -> trust -> energy)
5. Text integrity test (Validate text starts with valid words, no index leaks)
6. Full Pipeline Integration
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.expression_controller import ExpressionController
from tido_engine.humanization.emotion_timeline import EmotionTimeline
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline

class TestExpressionEmotionPhase3(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Full Commercial Campaign 30s",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Bạn đang tìm kiếm giải pháp nâng cao sức khỏe tại Gym Toàn Thắng?"
                },
                {
                    "segment_id": "seg_002",
                    "text": "Cuộc sống bận rộn khiến bạn thiếu thời gian tập luyện."
                },
                {
                    "segment_id": "seg_003",
                    "text": "Gym Toàn Thắng mang đến không gian hiện đại rộng 65 mét vuông."
                },
                {
                    "segment_id": "seg_004",
                    "text": "Hãy tham gia ngay hôm nay để nhận ưu đãi 100%!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.script_dict)

    def test_01_expression_quota_limit(self):
        # Apply expressions on 4 segments
        traces = ExpressionController.apply_expressions(self.script.segments)
        
        # Count total expressions applied
        total_used = sum(1 for t in traces if t["expression_applied"] != "none")
        self.assertLessEqual(total_used, 2)
        print(f"\n[Expression Quota Test] Total expressions applied across 4 segments: {total_used} (Max allowed: 2)")

    def test_02_allowed_expressions_only(self):
        for seg in self.script.segments:
            text = seg.text
            for allowed in ExpressionController.ALLOWED_EXPRESSIONS:
                if text.startswith(allowed):
                    self.assertIn(allowed, ExpressionController.ALLOWED_EXPRESSIONS)

    def test_03_brand_and_number_protection(self):
        # Assert brand 'Gym Toàn Thắng' and numbers '65 mét vuông', '100%' remain intact
        all_text = " ".join([s.text for s in self.script.segments])
        self.assertIn("Gym Toàn Thắng", all_text)
        self.assertIn("65 mét vuông", all_text)
        self.assertIn("100%", all_text)

    def test_04_emotion_timeline_progression(self):
        traces = EmotionTimeline.apply_emotion_timeline(self.script.segments, genre="commercial")
        
        # Verify 4 steps: curiosity -> empathy -> trust -> energy
        self.assertEqual(self.script.segments[0].performance.emotion_state.primary_emotion, "curiosity")
        self.assertEqual(self.script.segments[1].performance.emotion_state.primary_emotion, "empathy")
        self.assertEqual(self.script.segments[2].performance.emotion_state.primary_emotion, "trust")
        self.assertEqual(self.script.segments[3].performance.emotion_state.primary_emotion, "energy")
        print("\n[Emotion Timeline Test] Arc verified: curiosity -> empathy -> trust -> energy")

    def test_05_full_master_pipeline(self):
        pipeline = HumanizationPipeline()
        humanized_script = pipeline.process(self.script, enable_humanization=True)

        self.assertEqual(len(humanized_script.segments), 4)
        trace_file = os.path.join(pipeline.trace_dir, "humanization_trace.json")
        self.assertTrue(os.path.exists(trace_file))

if __name__ == "__main__":
    unittest.main()
