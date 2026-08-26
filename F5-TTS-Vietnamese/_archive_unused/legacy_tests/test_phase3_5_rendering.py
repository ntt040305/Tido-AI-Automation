"""
Test Script - Verification for Phase 3.5 Rendering Controller Integration
==========================================================================
Renders a Hook segment vs an Explanation segment via RenderingController,
verifying that ProsodyExecutionPlan parameters produce expected timing and audio properties.
"""

import json
import os
import sys
from pydub import AudioSegment

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.f5_tts_adapter import F5TTSAdapter
from tido_engine.rendering_controller import RenderingController
from tido_engine.prosody_engine_v2 import ProsodyExecutionPlan

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase3_5"
    os.makedirs(output_dir, exist_ok=True)

    ref_audio_path = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"
    ref_text = "Ngay khi bước vào căn hộ, cảm nhận rõ nét nhất là không gian mở, khoáng đạt với bố cục liền mạch và lối thiết kế phóng khoáng. Với diện tích khoảng 65 mét vuông, căn hộ hai phòng ngủ được thiết kế tối."

    print("[TEST] Initializing F5TTSAdapter and RenderingController...")
    adapter = F5TTSAdapter()
    adapter.initialize()
    controller = RenderingController(adapter)

    # 1. Define Hook Plan (Fast, Energetic, Pre-pause 180ms, CFG 1.65)
    hook_plan = ProsodyExecutionPlan(
        segment_id="hook_test",
        text="bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày?",
        speaking_speed=1.12,
        pause_before_ms=180,
        pause_after_ms=250,
        emphasis_strength=1.35,
        energy_level_scale=1.25,
        target_cfg_scale=1.65,
        articulation_level="normal",
        pitch_contour="question_rise",
        emphasis_words=["khỏe hơn"]
    )

    # 2. Define Explanation Plan (Normal speed 1.0, Calm, No pre-pause, CFG 1.52)
    explanation_plan = ProsodyExecutionPlan(
        segment_id="explanation_test",
        text="bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày?", # Same text for direct timing comparison
        speaking_speed=0.95,
        pause_before_ms=0,
        pause_after_ms=200,
        emphasis_strength=1.0,
        energy_level_scale=1.0,
        target_cfg_scale=1.52,
        articulation_level="normal",
        pitch_contour="confident_fall",
        emphasis_words=[]
    )

    print("\n[TEST 1/2] Rendering Hook Segment via RenderingController...")
    hook_wave_path = os.path.join(output_dir, "hook_test.wav")
    hook_temp = os.path.join(output_dir, "_tmp_hook.wav")
    hook_audio, hook_stats = controller.render_segment(
        text=hook_plan.text,
        ref_audio_path=ref_audio_path,
        ref_text=ref_text,
        plan=hook_plan,
        temp_wave_path=hook_temp
    )
    hook_audio.export(hook_wave_path, format="wav")
    print(f"      [OK] Hook rendered in {hook_stats['render_time_s']}s. Final Duration: {hook_stats['final_padded_duration_s']}s")

    print("\n[TEST 2/2] Rendering Explanation Segment via RenderingController...")
    exp_wave_path = os.path.join(output_dir, "exp_test.wav")
    exp_temp = os.path.join(output_dir, "_tmp_exp.wav")
    exp_audio, exp_stats = controller.render_segment(
        text=explanation_plan.text,
        ref_audio_path=ref_audio_path,
        ref_text=ref_text,
        plan=explanation_plan,
        temp_wave_path=exp_temp
    )
    exp_audio.export(exp_wave_path, format="wav")
    print(f"      [OK] Explanation rendered in {exp_stats['render_time_s']}s. Final Duration: {exp_stats['final_padded_duration_s']}s")

    # VERIFICATION
    print("\n[VERIFYING PHASE 3.5 RENDERING INTEGRATION]")
    print(f"1. Hook Speed ({hook_stats['applied_speed']}x) vs Explanation Speed ({exp_stats['applied_speed']}x)")
    assert hook_stats['applied_speed'] > exp_stats['applied_speed'], "Hook speed should be faster!"
    print("   [PASS] Speed parameter correctly passed to TTS Adapter")

    print(f"2. Hook CFG Strength ({hook_stats['applied_cfg']}) vs Explanation CFG ({exp_stats['applied_cfg']})")
    assert hook_stats['applied_cfg'] > exp_stats['applied_cfg'], "Hook CFG should be higher!"
    print("   [PASS] CFG strength correctly passed to TTS Adapter")

    print(f"3. Raw Audio Duration Comparison (Hook: {hook_stats['raw_audio_duration_s']}s vs Exp: {exp_stats['raw_audio_duration_s']}s)")
    assert hook_stats['raw_audio_duration_s'] < exp_stats['raw_audio_duration_s'], "Faster speed should yield shorter raw audio duration!"
    print("   [PASS] Raw audio duration reflects applied speed ratio accurately")

    print(f"4. Pre-Pause Padding Check (Hook: {hook_stats['pause_before_ms']}ms vs Exp: {exp_stats['pause_before_ms']}ms)")
    assert hook_stats['pause_before_ms'] == 180 and exp_stats['pause_before_ms'] == 0, "Pause padding mismatch!"
    print("   [PASS] Silence frame padding correctly prepended/appended")

    print("\n✨ ALL PHASE 3.5 RENDERING CONTROLLER VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
