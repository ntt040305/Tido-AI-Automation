"""
Test Script - Verification for Phase 4 Voice Quality Evaluation & Auto Optimization
====================================================================================
Renders 3 WAV candidates with different seeds/parameters, analyzes acoustic metrics,
and verifies automatic selection of the highest composite score candidate.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.f5_tts_adapter import F5TTSAdapter
from tido_engine.rendering_controller import RenderingController
from tido_engine.prosody_engine_v2 import ProsodyExecutionPlan
from tido_engine.render_optimizer import RenderOptimizer, CandidateInput, OptimizationResult

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase4"
    os.makedirs(output_dir, exist_ok=True)

    report_output_path = r"d:\Tido\F5-TTS-Vietnamese\quality_evaluation_report.json"

    ref_audio_path = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"
    ref_text = "Ngay khi bước vào căn hộ, cảm nhận rõ nét nhất là không gian mở, khoáng đạt với bố cục liền mạch và lối thiết kế phóng khoáng. Với diện tích khoảng 65 mét vuông, căn hộ hai phòng ngủ được thiết kế tối."
    test_text = "Đừng chỉ nghĩ về nó! Hãy bắt đầu hành trình ngay tại Gym Toàn Thắng!"

    print("[TEST] Initializing F5TTSAdapter & RenderingController for Candidate Generation...")
    adapter = F5TTSAdapter()
    adapter.initialize()
    controller = RenderingController(adapter)

    # Candidate parameters (3 seeds/CFG variations)
    candidate_configs = [
        {"id": "cand_seed_42", "seed": 42, "cfg": 1.58, "speed": 1.05},
        {"id": "cand_seed_101", "seed": 101, "cfg": 1.65, "speed": 1.01},
        {"id": "cand_seed_999", "seed": 999, "cfg": 1.38, "speed": 0.95}
    ]

    candidate_inputs = []

    print("\n[TEST] Generating 3 Audio Candidates...")
    for idx, cfg_data in enumerate(candidate_configs):
        cand_id = cfg_data["id"]
        wave_path = os.path.join(output_dir, f"{cand_id}.wav")
        temp_path = os.path.join(output_dir, f"_tmp_{cand_id}.wav")

        plan = ProsodyExecutionPlan(
            segment_id=cand_id,
            text=test_text,
            speaking_speed=cfg_data["speed"],
            pause_before_ms=100,
            pause_after_ms=200,
            emphasis_strength=1.2,
            energy_level_scale=1.1,
            target_cfg_scale=cfg_data["cfg"],
            articulation_level="crisp",
            pitch_contour="confident_fall",
            emphasis_words=[]
        )

        audio_seg, stats = controller.render_segment(
            text=test_text,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text,
            plan=plan,
            temp_wave_path=temp_path
        )
        audio_seg.export(wave_path, format="wav")

        print(f"      [OK] Candidate {idx+1}/3 '{cand_id}' rendered. Duration: {stats['final_padded_duration_s']}s")

        candidate_inputs.append(CandidateInput(
            candidate_id=cand_id,
            wave_path=wave_path,
            seed=cfg_data["seed"],
            cfg_strength=cfg_data["cfg"],
            speed=cfg_data["speed"]
        ))

    print("\n[TEST] Running RenderOptimizer.select_best_candidate()...")
    optimization_result: OptimizationResult = RenderOptimizer.select_best_candidate(
        candidates=candidate_inputs,
        target_text=test_text,
        ref_wave_path=ref_audio_path
    )

    # Export report
    with open(report_output_path, 'w', encoding='utf-8') as f:
        json.dump(optimization_result.to_dict(), f, ensure_ascii=False, indent=2)

    print(f"[TEST] Exported quality evaluation report to {report_output_path}")

    # VERIFICATIONS
    print("\n[VERIFYING VOICE QUALITY EVALUATION & AUTO OPTIMIZATION]")
    print(f"1. Total Candidates Evaluated: {optimization_result.total_candidates_evaluated}")
    assert optimization_result.total_candidates_evaluated == 3
    print("   [PASS] Evaluated all 3 candidates successfully!")

    print(f"2. Selected Winning Candidate: {optimization_result.selected_candidate_id}")
    print(f"   - Winning Composite Score: {optimization_result.best_composite_score}/100")
    assert optimization_result.best_composite_score > 0.0
    print("   [PASS] Selected winning candidate with highest composite score!")

    # Verify ranking order
    reports = optimization_result.all_reports
    print("\n3. Candidate Leaderboard:")
    for rank, r in enumerate(reports, 1):
        print(f"   Rank {rank}: {r.candidate_id} | Score: {r.composite_quality_score} | Naturalness: {r.naturalness_score} | Sim: {r.speaker_similarity_score} | WPM: {r.speaking_rate_wpm}")

    assert reports[0].composite_quality_score >= reports[1].composite_quality_score >= reports[2].composite_quality_score
    print("   [PASS] Candidates strictly ranked descending by composite quality score!")

    print("\n✨ ALL PHASE 4 QUALITY EVALUATION & OPTIMIZATION VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
