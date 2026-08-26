"""
Test Script - Verification for Phase 6 Voice Data Platform Layer
================================================================
Tests VoiceProfileV4 schema, natural language query search engine, multi-attribute ranking engine,
and usage history telemetry logger across multiple voice profiles.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_metadata_analyzer import VoiceMetadataV2, VoiceMetadataAnalyzer
from tido_engine.voice_profile_v4 import VoiceProfileV4
from tido_engine.voice_search_engine import VoiceSearchEngine, VoiceRankingEngine
from tido_engine.voice_usage_history import VoiceUsageTracker

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase6"
    os.makedirs(output_dir, exist_ok=True)

    report_path = r"d:\Tido\F5-TTS-Vietnamese\voice_platform_v4_test_report.json"
    usage_db_path = os.path.join(output_dir, "voice_usage_history.json")

    ref_audio_path = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"

    print("[TEST 1/4] Constructing VoiceProfileV4 instances for test platform library...")

    v1 = VoiceProfileV4(
        voice_id="voice_vn_female_north_01",
        name="Mizaki - Giọng Nữ Miền Bắc Ấm Áp",
        owner_id="usr_admin_101",
        permission="public",
        version="4.0",
        quality_score=96.5,
        reference_audio=ref_audio_path,
        reference_text="Ngay khi bước vào căn hộ, cảm nhận rõ nét nhất là không gian mở.",
        duration_s=12.0,
        speaker_embedding=[0.1, 0.2, 0.3],
        metadata_v2=VoiceMetadataV2(
            gender="female",
            language="vi-VN",
            accent="Northern",
            estimated_age_range="young_adult",
            speaking_style="warm_expert",
            energy_level="medium",
            voice_quality_score=96.5
        ),
        usage_count=15,
        default_persona="warm_expert",
        default_style="warm_expert"
    )

    v2 = VoiceProfileV4(
        voice_id="voice_vn_male_south_02",
        name="Minh Triết - Giọng Nam Miền Nam Bán Hàng",
        owner_id="usr_admin_101",
        permission="public",
        version="4.0",
        quality_score=92.0,
        reference_audio=ref_audio_path,
        reference_text="Hãy bắt đầu ngay hôm nay để nhận ưu đãi cực lớn!",
        duration_s=10.0,
        speaker_embedding=[0.4, 0.5, 0.6],
        metadata_v2=VoiceMetadataV2(
            gender="male",
            language="vi-VN",
            accent="Southern",
            estimated_age_range="middle_aged",
            speaking_style="commercial_seller",
            energy_level="high",
            voice_quality_score=92.0
        ),
        usage_count=8,
        default_persona="commercial_seller",
        default_style="commercial_seller"
    )

    v3 = VoiceProfileV4(
        voice_id="voice_vn_female_central_03",
        name="Thu Hà - Giọng Nữ Miền Trung Thuyết Minh",
        owner_id="usr_admin_102",
        permission="shared",
        version="4.0",
        quality_score=88.5,
        reference_audio=ref_audio_path,
        reference_text="Vùng đất cố đô với ngàn năm văn hóa truyền thống.",
        duration_s=15.0,
        speaker_embedding=[0.7, 0.8, 0.9],
        metadata_v2=VoiceMetadataV2(
            gender="female",
            language="vi-VN",
            accent="Central",
            estimated_age_range="middle_aged",
            speaking_style="documentary_narrator",
            energy_level="calm",
            voice_quality_score=88.5
        ),
        usage_count=3,
        default_persona="documentary_narrator",
        default_style="documentary_narrator"
    )

    library_v4 = [v1, v2, v3]
    print(f"      [OK] Loaded {len(library_v4)} V4 Voice Profiles into test registry.")

    # 2. Test Natural Language Query Search
    search_query = "giọng nữ miền Bắc ấm áp chuyên gia"
    print(f"\n[TEST 2/4] Executing Natural Language Query Search for: \"{search_query}\"...")

    intent = VoiceSearchEngine.parse_query(search_query)
    print(f"      Parsed Intent -> Gender: {intent.target_gender}, Accent: {intent.target_accent}, Style: {intent.target_style}")

    search_results = VoiceSearchEngine.search_voices(search_query, library_v4)
    print(f"      [OK] Found {len(search_results)} matching candidate profiles.")

    # 3. Test Voice Ranking Engine
    print("\n[TEST 3/4] Ranking Search Results via VoiceRankingEngine...")
    ranked_results = VoiceRankingEngine.rank_voices(search_results, intent)

    for rank, p in enumerate(ranked_results, 1):
        score = VoiceRankingEngine.compute_ranking_score(p, intent)
        print(f"      Rank {rank}: {p.name} ({p.voice_id}) | Score: {score}")

    top_winner = ranked_results[0]
    print(f"      [OK] Top Ranked Voice: '{top_winner.name}'")

    # 4. Test Usage Telemetry Logger
    print("\n[TEST 4/4] Recording Telemetry Usage in VoiceUsageTracker...")
    tracker = VoiceUsageTracker(log_db_path=usage_db_path)
    tracker.log_usage(voice_id=top_winner.voice_id, script_id="scr_gym_60s", style_used="warm_expert", quality_score=96.5)
    tracker.log_usage(voice_id=top_winner.voice_id, script_id="scr_promo_30s", style_used="warm_expert", quality_score=97.0)

    stats = tracker.get_voice_stats(top_winner.voice_id)
    print(f"      [OK] Telemetry Logged for '{top_winner.voice_id}': Count={stats['usage_count']}, Avg Quality={stats['average_quality_score']}")

    # Export report
    report_data = {
        "search_query": search_query,
        "parsed_intent": {
            "gender": intent.target_gender,
            "accent": intent.target_accent,
            "style": intent.target_style
        },
        "ranked_leaderboard": [
            {
                "rank": idx + 1,
                "voice_id": p.voice_id,
                "name": p.name,
                "rank_score": VoiceRankingEngine.compute_ranking_score(p, intent),
                "profile_v4": p.to_dict()
            } for idx, p in enumerate(ranked_results)
        ],
        "telemetry_stats": stats
    }

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)

    print(f"\n[TEST] Exported Voice Data Platform test report to {report_path}")

    # VERIFICATIONS
    print("\n[VERIFYING VOICE DATA PLATFORM LAYER]")
    print(f"1. Top Winner Search Accuracy Check: {top_winner.voice_id}")
    assert top_winner.voice_id == "voice_vn_female_north_01"
    print("   [PASS] Natural language search query accurately selected Northern Female Warm Expert voice!")

    print(f"2. Ranking Score Leaderboard Check: Rank 1 Score = {VoiceRankingEngine.compute_ranking_score(top_winner, intent)}")
    assert VoiceRankingEngine.compute_ranking_score(top_winner, intent) > VoiceRankingEngine.compute_ranking_score(v2, intent)
    print("   [PASS] VoiceRankingEngine strictly ranked top match above non-matching profiles!")

    print(f"3. Telemetry Tracker Check: Logged count = {stats['usage_count']}")
    assert stats['usage_count'] >= 2
    print("   [PASS] Telemetry history tracker recorded usage logs and computed statistics successfully!")

    print("\n✨ ALL PHASE 6 VOICE DATA PLATFORM LAYER VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
