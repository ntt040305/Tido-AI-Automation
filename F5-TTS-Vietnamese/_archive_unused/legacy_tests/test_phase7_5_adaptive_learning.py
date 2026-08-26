"""
Test Script - Verification for Phase 7.5 Adaptive Learning & Recommendation Optimization
========================================================================================
Simulates 100 feedback entries, trains RecommendationLearner, measures BEFORE vs AFTER
compatibility scores, and verifies A/B testing win rate calculations.
"""

import json
import os
import sys
import random

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.user_preference_model import UserPreferenceModel
from tido_engine.voice_performance_matrix import VoicePerformanceMatrix
from tido_engine.recommendation_learner import RecommendationLearner
from tido_engine.voice_ab_testing import VoiceABTesting

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase7_5"
    os.makedirs(output_dir, exist_ok=True)

    report_path = r"d:\Tido\F5-TTS-Vietnamese\adaptive_learning_test_report.json"

    matrix = VoicePerformanceMatrix()
    pref_model = UserPreferenceModel()
    learner = RecommendationLearner(matrix, pref_model)
    ab_testing = VoiceABTesting()

    target_voice_id = "voice_mizaki_fem_01"
    target_category = "cosmetics"
    target_style = "warm_expert"
    test_user_id = "usr_skincare_brand_01"

    # 1. Score BEFORE Learning
    score_before = learner.get_learned_compatibility_score(
        voice_id=target_voice_id,
        category=target_category,
        style=target_style,
        user_id=test_user_id
    )

    print(f"[TEST 1/4] Baseline Recommendation Compatibility Score BEFORE Learning:")
    print(f"      Voice: '{target_voice_id}' | Category: '{target_category}' -> Score: {score_before}")

    # 2. Simulate 100 Feedback Entries
    print("\n[TEST 2/4] Simulating 100 User Feedback Logs for 'cosmetics' category...")
    random.seed(42)
    simulated_logs = []

    for i in range(100):
        # 80% of users select Mizaki for cosmetics with 5.0 rating
        if random.random() < 0.80:
            v_id = target_voice_id
            rating = 5.0
        else:
            v_id = "voice_motaro_male_02"
            rating = 3.5

        simulated_logs.append({
            "user_id": test_user_id if i % 2 == 0 else f"usr_anon_{i}",
            "voice_id": v_id,
            "content_category": target_category,
            "style": target_style,
            "rating": rating
        })

    learner.learn_from_feedback_logs(simulated_logs)
    print(f"      [OK] Learned from {len(simulated_logs)} feedback entries successfully.")

    # 3. Score AFTER Learning
    score_after = learner.get_learned_compatibility_score(
        voice_id=target_voice_id,
        category=target_category,
        style=target_style,
        user_id=test_user_id
    )

    print(f"\n[TEST 3/4] Recommendation Compatibility Score AFTER Learning:")
    print(f"      Voice: '{target_voice_id}' | Category: '{target_category}' -> Score: {score_after}")
    print(f"      Delta Improvement: +{round(score_after - score_before, 1)} points!")

    # 4. A/B Testing Evaluation
    print("\n[TEST 4/4] Executing Candidate A/B Testing Evaluations...")
    for i in range(10):
        ab_testing.record_ab_test(
            test_id=f"ab_{i+1}",
            candidate_a_id=target_voice_id,
            candidate_b_id="voice_motaro_male_02",
            selected_candidate_id=target_voice_id if i < 9 else "voice_motaro_male_02",
            rating_a=4.9,
            rating_b=3.8
        )

    win_rate = ab_testing.get_win_rate(target_voice_id)
    print(f"      [OK] Candidate '{target_voice_id}' A/B Win Rate: {win_rate}%")

    # Export report JSON
    report_data = {
        "learning_comparison": {
            "target_voice_id": target_voice_id,
            "category": target_category,
            "score_before": score_before,
            "score_after": score_after,
            "delta_improvement": round(score_after - score_before, 1)
        },
        "user_preference_profile": pref_model.get_or_create_profile(test_user_id).to_dict(),
        "ab_test_win_rate": win_rate
    }

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)

    print(f"\n[TEST] Exported Adaptive Learning test report to {report_path}")

    # VERIFICATIONS
    print("\n[VERIFYING ADAPTIVE LEARNING & RECOMMENDATION OPTIMIZATION]")
    print(f"1. Score Improvement Check: Before={score_before} vs After={score_after}")
    assert score_after > score_before
    print("   [PASS] Compatibility score increased after learning from positive feedback logs!")

    print(f"2. Preference Model Profile Check: Voice Weight = {pref_model.get_or_create_profile(test_user_id).preferred_voices.get(target_voice_id)}")
    assert pref_model.get_or_create_profile(test_user_id).preferred_voices.get(target_voice_id, 0) > 1.0
    print("   [PASS] User preference profile boosted favorite voice dynamically!")

    print(f"3. A/B Testing Win Rate Check: Win Rate = {win_rate}%")
    assert win_rate == 90.0
    print("   [PASS] Candidate A/B testing framework correctly calculated candidate win rate!")

    print("\n✨ ALL PHASE 7.5 ADAPTIVE LEARNING VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
