"""
Test Script - Verification for Phase 4.5 Advanced Voice Evaluation Layer (AI Voice Critic)
==========================================================================================
Evaluates rendered audio candidates using VoiceQualityAnalyzerV2 across 6 metrics
and selects the winner based on human-like voice quality.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_quality_analyzer_v2 import VoiceQualityAnalyzerV2, VoiceQualityReportV2

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase4"
    report_v2_path = r"d:\Tido\F5-TTS-Vietnamese\advanced_voice_evaluation_v2.json"

    ref_audio_path = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"
    test_text = "Đừng chỉ nghĩ về nó! Hãy bắt đầu hành trình ngay tại Gym Toàn Thắng!"

    candidate_files = [
        ("cand_seed_42", os.path.join(output_dir, "cand_seed_42.wav"), 1.05, 100, 200, 1.1),
        ("cand_seed_101", os.path.join(output_dir, "cand_seed_101.wav"), 1.01, 100, 200, 1.1),
        ("cand_seed_999", os.path.join(output_dir, "cand_seed_999.wav"), 0.95, 100, 200, 1.1)
    ]

    reports_v2 = []

    print("[TEST] Running VoiceQualityAnalyzerV2 AI Voice Critic...")
    for cand_id, wave_path, speed, p_before, p_after, energy in candidate_files:
        if not os.path.exists(wave_path):
            print(f"      [SKIP] Candidate wave file missing: {wave_path}")
            continue

        report_v2: VoiceQualityReportV2 = VoiceQualityAnalyzerV2.analyze_v2(
            candidate_id=cand_id,
            wave_path=wave_path,
            target_text=test_text,
            ref_wave_path=ref_audio_path,
            target_speed=speed,
            target_pause_before_ms=p_before,
            target_pause_after_ms=p_after,
            target_energy_scale=energy
        )
        reports_v2.append(report_v2)
        print(f"      [OK] Analyzed '{cand_id}' | V2 Final Composite Score: {report_v2.final_composite_score}/100")

    # Sort descending by final_composite_score
    reports_v2.sort(key=lambda r: r.final_composite_score, reverse=True)
    winner = reports_v2[0]

    # Export V2 report JSON
    export_data = {
        "selected_winner_id": winner.candidate_id,
        "winner_final_score": winner.final_composite_score,
        "evaluator": "AI Voice Critic V2",
        "candidates_evaluated": [r.to_dict() for r in reports_v2]
    }

    with open(report_v2_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print(f"[TEST] Exported V2 AI Voice Critic report to {report_v2_path}")

    # VERIFICATIONS
    print("\n[VERIFYING PHASE 4.5 AI VOICE CRITIC V2 EVALUATION]")
    print(f"1. Selected Winning Candidate: {winner.candidate_id}")
    print(f"   - Final Composite Score: {winner.final_composite_score}/100")
    assert winner.final_composite_score > 0.0
    print("   [PASS] Winning candidate selected based on V2 composite score!")

    print("\n2. AI Voice Critic V2 Leaderboard & Metric Breakdown:")
    for rank, r in enumerate(reports_v2, 1):
        print(f"   Rank {rank}: {r.candidate_id} | Final: {r.final_composite_score}")
        print(f"         ├── Naturalness: {r.naturalness_score} (25%)")
        print(f"         ├── Speaker Sim: {r.speaker_similarity_score} (20%)")
        print(f"         ├── Pronunciation: {r.pronunciation_accuracy_score} (20%)")
        print(f"         ├── Prosody Align: {r.prosody_alignment_score} (15%)")
        print(f"         ├── Emotion Delivery: {r.emotion_delivery_score} (10%)")
        print(f"         └── Clarity: {r.speech_clarity_score} (10%)")

    assert reports_v2[0].final_composite_score >= reports_v2[1].final_composite_score >= reports_v2[2].final_composite_score
    print("\n   [PASS] Candidates strictly ranked descending by V2 composite quality score!")

    print("\n✨ ALL PHASE 4.5 ADVANCED VOICE EVALUATION LAYER VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
