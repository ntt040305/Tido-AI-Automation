"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 1
===============================================================
Verifies:
1. VoiceBehaviorDNA dataclass & presets
2. SafetyGuard entity locking, unlocking, and validation
3. HumanizationPipeline feature flag switch
4. HumanizationPipeline rollback safety on exception
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.voice_behavior_dna import VoiceBehaviorDNA
from tido_engine.humanization.safety_guard import SafetyGuard
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline

class TestHumanizationPhase1(unittest.TestCase):

    def setUp(self):
        self.sample_script_dict = {
            "metadata": {
                "title": "Gym Commercial Ad Test",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller",
                "target_audience": "general"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng với diện tích khoảng 65 mét vuông và giảm giá 100%!"
                }
            ]
        }
        self.script = PerformanceScriptV2.from_dict(self.sample_script_dict)
        self.pipeline = HumanizationPipeline(trace_dir=r"d:\Tido\F5-TTS-Vietnamese\service_output")

    def test_01_voice_behavior_dna(self):
        dna = VoiceBehaviorDNA.get_preset("commercial_seller")
        self.assertEqual(dna.pause_style, "punchy")
        self.assertEqual(dna.sentence_length_preference, "short")
        self.assertEqual(dna.breath_style, "minimal")
        dna_dict = dna.to_dict()
        self.assertIn("energy_curve", dna_dict)

    def test_02_safety_guard_locking(self):
        text = "Tập tại Gym Toàn Thắng rộng 65 mét vuông giảm 100% giá vé."
        locked_text, locked_map = SafetyGuard.lock_entities(text)
        self.assertIn("__LOCKED_ENTITY_", locked_text)
        self.assertNotIn("Gym Toàn Thắng", locked_text)

        unlocked_text = SafetyGuard.unlock_entities(locked_text, locked_map)
        self.assertEqual(text, unlocked_text)

        valid = SafetyGuard.validate_transformation(text, unlocked_text, locked_map)
        self.assertTrue(valid)

    def test_03_feature_flag_disabled(self):
        # When enable_humanization=False, pipeline MUST return original script
        result_script = self.pipeline.process(self.script, enable_humanization=False)
        self.assertEqual(result_script.segments[0].text, self.script.segments[0].text)

    def test_04_feature_flag_enabled(self):
        # When enable_humanization=True, pipeline processes script and exports trace
        result_script = self.pipeline.process(self.script, enable_humanization=True)
        self.assertEqual(result_script.segments[0].text, self.script.segments[0].text)
        trace_file = os.path.join(self.pipeline.trace_dir, "humanization_trace.json")
        self.assertTrue(os.path.exists(trace_file))

    def test_05_rollback_on_exception(self):
        # Induce an exception by breaking segments list to an invalid structure
        broken_script = PerformanceScriptV2.from_dict(self.sample_script_dict)
        broken_script.segments = [None]  # AttributeError when iterating / accessing seg.text

        result_script = self.pipeline.process(broken_script, enable_humanization=True)
        # Verify rollback catches exception and returns identical fallback script without crashing
        self.assertEqual(result_script.title, broken_script.title)
        self.assertEqual(result_script.segments, broken_script.segments)

if __name__ == "__main__":
    unittest.main()
