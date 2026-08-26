"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 2B
================================================================
Test cases:
1. Punctuation Pause planning (question, exclamation, hesitation, clause)
2. Brand Protection (Zero pause insertion/split inside "Gym Toàn Thắng", "Tido AI")
3. Number Protection (Zero pause insertion/split inside "35 tuổi", "100%", "65 mét vuông")
4. No Text Mutation Guarantee (Verifies text string is untouched by pause planner)
5. Full Pipeline Integration with Pause Metadata export
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA
from tido_engine.humanization.conversational_pause_planner import ConversationalPausePlanner
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline

class TestConversationalPausePhase2B(unittest.TestCase):

    def setUp(self):
        self.script_dict = {
            "metadata": {
                "title": "Pause Planner Test Script",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Bạn muốn tập luyện tại Gym Toàn Thắng?"
                },
                {
                    "segment_id": "seg_002",
                    "text": "Ưu đãi 100% cho khách hàng 35 tuổi!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.script_dict)

    def test_01_punctuation_pause_planning(self):
        seg = self.script.segments[0]
        original_text = seg.text
        meta = ConversationalPausePlanner.plan_segment_pause(seg)

        self.assertEqual(meta["phrase_boundary_type"], "question")
        self.assertGreaterEqual(meta["pause_after_ms"], 250)
        self.assertEqual(seg.text, original_text)  # Text UNMUTATED!

    def test_02_brand_protection_no_split(self):
        seg = self.script.segments[0]
        text_before = seg.text
        ConversationalPausePlanner.plan_segment_pause(seg)
        text_after = seg.text

        self.assertEqual(text_before, text_after)
        self.assertIn("Gym Toàn Thắng", text_after)
        self.assertNotIn("Gym | Toàn Thắng", text_after)
        self.assertNotIn("Gym [pause] Toàn Thắng", text_after)

    def test_03_number_protection_no_split(self):
        seg = self.script.segments[1]
        text_before = seg.text
        ConversationalPausePlanner.plan_segment_pause(seg)
        text_after = seg.text

        self.assertEqual(text_before, text_after)
        self.assertIn("100%", text_after)
        self.assertIn("35 tuổi", text_after)
        self.assertNotIn("100 | %", text_after)
        self.assertNotIn("35 | tuổi", text_after)

    def test_04_no_text_mutation_guarantee(self):
        dna = VoiceBehaviorDNA.get_preset("deep")
        for seg in self.script.segments:
            orig = seg.text
            meta = ConversationalPausePlanner.plan_segment_pause(seg, dna)
            self.assertEqual(seg.text, orig)
            self.assertFalse(meta["text_mutated"])

    def test_05_pipeline_integration_metadata(self):
        pipeline = HumanizationPipeline()
        humanized = pipeline.process(self.script, enable_humanization=True)

        seg1 = humanized.segments[0]
        self.assertEqual(seg1.performance.pause_instruction.pause_after_ms, 255) # punchy multiplier 0.85 * 300 = 255
        self.assertEqual(seg1.text, "Bạn muốn tập luyện tại Gym Toàn Thắng?")

if __name__ == "__main__":
    unittest.main()
