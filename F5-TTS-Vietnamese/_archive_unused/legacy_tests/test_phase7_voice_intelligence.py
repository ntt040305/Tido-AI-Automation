"""
Test Script - Verification for Phase 7 Voice Intelligence & Learning Layer
==========================================================================
Tests VoiceFeedbackSystem, VoiceRecommendationEngine, StyleRecommendationEngine,
and VoiceAnalytics analytics generation.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_metadata_analyzer import VoiceMetadataV2
from tido_engine.voice_profile_v4 import VoiceProfileV4
from tido_engine.voice_feedback_system import VoiceFeedbackSystem
from tido_engine.voice_recommendation_engine import VoiceRecommendationEngine, StyleRecommendationEngine, StyleRecommendation
from tido_engine.voice_usage_history import VoiceUsageTracker
from tido_engine.voice_analytics import VoiceAnalytics, VoiceAnalyticsReport

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase7"
    os.makedirs(output_dir, exist_ok=True)

    fb_db_path = os.path.join(output_dir, "voice_feedback_history.json")
    usage_db_path = os.path.join(output_dir, "voice_usage_history.json")
    report_path = r"d:\Tido\F5-TTS-Vietnamese\voice_intelligence_test_report.json"

    ref_audio_path = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"

    print("[TEST 1/4] Recording User Ratings & Feedback in VoiceFeedbackSystem...")
    fb_system = VoiceFeedbackSystem(feedback_db_path=fb_db_path)
    fb_system.record_feedback(
        user_id="usr_agency_01",
        voice_id="voice_mizaki_fem_01",
        candidate_id="cand_seed_42",
        selected_candidate="cand_seed_42",
        rating=5.0,
        quality_score=96.5,
        comment="Giọng phát âm rất tự nhiên, truyền cảm!"
    )
    avg_rating = fb_system.get_voice_average_rating("voice_mizaki_fem_01")
    print(f"      [OK] Logged Feedback. Voice Average Rating: {avg_rating}/5.0")

    print("\n[TEST 2/4] Testing VoiceRecommendationEngine for Script Context...")
    v_fem = VoiceProfileV4(
        voice_id="voice_mizaki_fem_01",
        name="Mizaki Female Cosmetic Expert",
        owner_id="admin",
        permission="public",
        version="4.0",
        quality_score=96.5,
        reference_audio=ref_audio_path,
        reference_text="Sample ref text",
        duration_s=12.0,
        metadata_v2=VoiceMetadataV2(
            gender="female",
            language="vi-VN",
            accent="Northern",
            estimated_age_range="young_adult",
            speaking_style="warm_expert",
            energy_level="medium",
            voice_quality_score=96.5
        )
    )

    v_male = VoiceProfileV4(
        voice_id="voice_motaro_male_02",
        name="Motaro Male Gym Seller",
        owner_id="admin",
        permission="public",
        version="4.0",
        quality_score=92.0,
        reference_audio=ref_audio_path,
        reference_text="Sample ref text",
        duration_s=10.0,
        metadata_v2=VoiceMetadataV2(
            gender="male",
            language="vi-VN",
            accent="Northern",
            estimated_age_range="young_adult",
            speaking_style="commercial_seller",
            energy_level="high",
            voice_quality_score=92.0
        )
    )

    script_ctx = "quảng cáo mỹ phẩm chăm sóc da nữ 35 tuổi"
    recs = VoiceRecommendationEngine.recommend_for_script(script_ctx, [v_fem, v_male])

    top_rec = recs[0]
    print(f"      Context: \"{script_ctx}\"")
    print(f"      [OK] Recommended Voice: '{top_rec.voice_id}' | Confidence: {top_rec.confidence_score*100}% | Reason: {top_rec.reasoning}")

    print("\n[TEST 3/4] Testing StyleRecommendationEngine for LLM Metadata...")
    style_rec: StyleRecommendation = StyleRecommendationEngine.recommend_style(
        genre="commercial",
        audience="youth",
        emotion="excited",
        platform="TikTok"
    )
    print(f"      Metadata -> Genre: commercial, Platform: TikTok")
    print(f"      [OK] Recommended Persona: '{style_rec.persona}' | Style: '{style_rec.style}' | Confidence: {style_rec.confidence_score*100}%")

    print("\n[TEST 4/4] Generating Voice Analytics Report...")
    usage_tracker = VoiceUsageTracker(log_db_path=usage_db_path)
    usage_tracker.log_usage("voice_mizaki_fem_01", "script_01", "warm_expert", 96.5)

    analytics_report: VoiceAnalyticsReport = VoiceAnalytics.generate_report(
        voice_id="voice_mizaki_fem_01",
        usage_tracker=usage_tracker,
        feedback_system=fb_system
    )
    print(f"      [OK] Voice Analytics Report for '{analytics_report.voice_id}':")
    print(f"            ├── Total Usage: {analytics_report.total_usage}")
    print(f"            ├── Avg Quality Score: {analytics_report.average_quality_score}")
    print(f"            └── Satisfaction Rate: {analytics_report.user_satisfaction_rate}%")

    # Export report JSON
    export_data = {
        "voice_recommendation": top_rec.to_dict(),
        "style_recommendation": style_rec.to_dict(),
        "analytics_report": analytics_report.to_dict()
    }

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print(f"\n[TEST] Exported Voice Intelligence test report to {report_path}")

    # VERIFICATIONS
    print("\n[VERIFYING VOICE INTELLIGENCE & LEARNING LAYER]")
    print(f"1. Voice Recommendation Check: {top_rec.voice_id}")
    assert top_rec.voice_id == "voice_mizaki_fem_01"
    assert top_rec.confidence_score >= 0.80
    print("   [PASS] VoiceRecommendationEngine recommended female voice for cosmetic context with high confidence!")

    print(f"2. Style Recommendation Check: Persona = {style_rec.persona}")
    assert style_rec.persona == "commercial_seller"
    print("   [PASS] StyleRecommendationEngine correctly selected commercial_seller for TikTok commercial metadata!")

    print(f"3. Voice Analytics Satisfaction Check: {analytics_report.user_satisfaction_rate}%")
    assert analytics_report.user_satisfaction_rate == 100.0
    print("   [PASS] VoiceAnalytics computed user satisfaction rate and usage metrics accurately!")

    print("\n✨ ALL PHASE 7 VOICE INTELLIGENCE & LEARNING LAYER VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
