"""
Unit Test Suite for TIDO Voice Humanization Layer V1 - Phase 2A
================================================================
Test cases:
1. Commercial script conversion
2. Skincare script conversion
3. Documentary script conversion
4. Brand name protection ("Gym Toàn Thắng", "Tido AI", "Mizaki")
5. Number & percentage protection ("65 mét vuông", "100%", "35 tuổi")
"""

import os
import sys
import unittest

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.humanization.spoken_style_adapter import SpokenStyleAdapter
from tido_engine.humanization.humanization_pipeline import HumanizationPipeline

class TestSpokenStyleAdapterPhase2A(unittest.TestCase):

    def test_01_commercial_script_adaptation(self):
        text = "Nhằm mục đích nâng cao chất lượng tập luyện, Gym Toàn Thắng tiến hành đổi mới thiết bị."
        adapted, trace = SpokenStyleAdapter.adapt_segment_text(text, genre="commercial_seller")
        self.assertIn("để", adapted)
        self.assertIn("cải thiện", adapted)
        self.assertIn("bắt đầu", adapted)
        self.assertIn("Gym Toàn Thắng", adapted)  # Brand name protected!
        print(f"\n[Commercial Script Test]\nBEFORE: {text}\nAFTER:  {adapted}")

    def test_02_skincare_script_adaptation(self):
        text = "Sản phẩm này giúp cải thiện làn da và mang lại vẻ đẹp hoàn toàn tự nhiên với 100% thảo dược."
        adapted, trace = SpokenStyleAdapter.adapt_segment_text(text, genre="skincare")
        self.assertIn("hỗ trợ cải thiện", adapted)
        self.assertIn("100%", adapted)  # Percentage protected!
        self.assertIn("rất tự nhiên", adapted)
        print(f"\n[Skincare Script Test]\nBEFORE: {text}\nAFTER:  {adapted}")

    def test_03_documentary_script_adaptation(self):
        text = "Do đó, các nhà nghiên cứu đã tiến hành phân tích thông qua việc sử dụng dữ liệu mới."
        adapted, trace = SpokenStyleAdapter.adapt_segment_text(text, genre="documentary_narrator")
        self.assertIn("cho nên", adapted)
        self.assertIn("bằng cách", adapted)
        print(f"\n[Documentary Script Test]\nBEFORE: {text}\nAFTER:  {adapted}")

    def test_04_brand_name_protection(self):
        text = "Tido AI phối hợp cùng Gym Toàn Thắng nhằm mục đích ra mắt dịch vụ mới."
        adapted, trace = SpokenStyleAdapter.adapt_segment_text(text)
        self.assertIn("Tido AI", adapted)
        self.assertIn("Gym Toàn Thắng", adapted)
        self.assertIn("để", adapted)

    def test_05_number_and_metric_protection(self):
        text = "Căn hộ rộng 65 mét vuông giảm 50% cho khách hàng 35 tuổi."
        adapted, trace = SpokenStyleAdapter.adapt_segment_text(text)
        self.assertIn("65 mét vuông", adapted)
        self.assertIn("50%", adapted)
        self.assertIn("35 tuổi", adapted)

    def test_06_pipeline_integration(self):
        script_dict = {
            "metadata": {
                "title": "Full Pipeline Test",
                "voice_id": "vo_mizaki_3",
                "global_genre": "commercial_seller"
            },
            "segments": [
                {
                    "segment_id": "seg_001",
                    "text": "Do đó, Gym Toàn Thắng tiến hành ưu đãi 100% cho hội viên."
                }
            ]
        }
        script = PerformanceScriptV2.from_dict(script_dict)
        pipeline = HumanizationPipeline()
        
        # Test disabled -> returns original
        orig_res = pipeline.process(script, enable_humanization=False)
        self.assertEqual(orig_res.segments[0].text, script.segments[0].text)

        # Test enabled -> returns adapted text preserving brands & numbers
        hum_res = pipeline.process(script, enable_humanization=True)
        self.assertIn("cho nên", hum_res.segments[0].text)
        self.assertIn("Gym Toàn Thắng", hum_res.segments[0].text)
        self.assertIn("100%", hum_res.segments[0].text)

if __name__ == "__main__":
    unittest.main()
