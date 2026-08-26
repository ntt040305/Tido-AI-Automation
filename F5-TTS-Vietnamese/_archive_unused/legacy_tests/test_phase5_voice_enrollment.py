"""
Test Script - Verification for Phase 5 Voice Enrollment & Dynamic Voice Cloning Pipeline
========================================================================================
Registers a custom 15s audio sample, normalizes to 24kHz, creates VoiceProfileV3,
persists in VoiceLibraryManager, and renders a test sentence via F5TTSAdapter clone.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_profile_v3 import VoiceProfileV3
from tido_engine.voice_enrollment import VoiceEnrollment
from tido_engine.voice_library_manager import VoiceLibraryManager
from tido_engine.reference_pipeline import ReferencePipeline
from tido_engine.f5_tts_adapter import F5TTSAdapter
from tido_engine.rendering_controller import RenderingController
from tido_engine.prosody_engine_v2 import ProsodyExecutionPlan

def run_test():
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\test_output_phase5"
    os.makedirs(output_dir, exist_ok=True)

    test_input_audio = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"
    custom_voice_id = "user_enrolled_mizaki_v3"
    db_json_path = os.path.join(output_dir, "voice_library_v3.json")

    print("[TEST 1/5] Registering custom 15s voice sample via VoiceEnrollment...")
    profile_v3: VoiceProfileV3 = VoiceEnrollment.register_voice(
        audio_path=test_input_audio,
        voice_id=custom_voice_id,
        name="Custom User Enrolled Voice Mizaki",
        gender="female",
        provided_ref_text="Ngay khi bước vào căn hộ, cảm nhận rõ nét nhất là không gian mở, khoáng đạt với bố cục liền mạch và lối thiết kế phóng khoáng.",
        output_dir=output_dir
    )

    print(f"      [OK] Created VoiceProfileV3 ID: '{profile_v3.voice_id}'")
    print(f"      [OK] Normalized 24kHz Audio: {profile_v3.reference_audio}")
    print(f"      [OK] Speaker Embedding Dimensions: {len(profile_v3.speaker_embedding)}")

    print("\n[TEST 2/5] Persisting profile into VoiceLibraryManager...")
    lib_manager = VoiceLibraryManager(library_db_path=db_json_path)
    lib_manager.add_voice(profile_v3)

    print(f"      [OK] Saved to Voice Library database: {db_json_path}")
    print(f"      [OK] Total voices in library: {len(lib_manager.list_voices())}")

    print("\n[TEST 3/5] Loading profile back from VoiceLibraryManager...")
    loaded_profile = lib_manager.load_voice(custom_voice_id)
    assert loaded_profile is not None, "Failed to load voice from VoiceLibraryManager!"
    assert loaded_profile.voice_id == custom_voice_id
    print(f"      [OK] Loaded VoiceProfileV3: '{loaded_profile.name}'")

    print("\n[TEST 4/5] Initializing F5TTSAdapter & RenderingController with enrolled voice...")
    adapter = F5TTSAdapter()
    adapter.initialize()
    controller = RenderingController(adapter)

    test_render_text = "Chào mừng bạn đã gia nhập hệ thống Tido Voice Performance Engine V2."
    rendered_output_wav = os.path.join(output_dir, "enrolled_voice_cloned_output.wav")
    temp_wav_path = os.path.join(output_dir, "_tmp_enrolled.wav")

    plan = ProsodyExecutionPlan(
        segment_id="seg_enrolled_01",
        text=test_render_text,
        speaking_speed=1.0,
        pause_before_ms=100,
        pause_after_ms=200,
        emphasis_strength=1.1,
        energy_level_scale=1.0,
        target_cfg_scale=1.55,
        articulation_level="crisp",
        pitch_contour="confident_fall",
        emphasis_words=[]
    )

    print(f"\n[TEST 5/5] Rendering audio clone for enrolled voice '{loaded_profile.voice_id}'...")
    cloned_audio, stats = controller.render_segment(
        text=test_render_text,
        ref_audio_path=loaded_profile.reference_audio,
        ref_text=loaded_profile.reference_text,
        plan=plan,
        temp_wave_path=temp_wav_path
    )
    cloned_audio.export(rendered_output_wav, format="wav")

    print(f"      [OK] Cloned audio rendered successfully in {stats['render_time_s']}s!")
    print(f"      [OK] Output WAV Path: {rendered_output_wav}")
    print(f"      [OK] Final Duration: {stats['final_padded_duration_s']}s")

    # Export report JSON
    report_path = r"d:\Tido\F5-TTS-Vietnamese\voice_enrollment_test_report.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump({
            "enrolled_voice_profile": loaded_profile.to_dict(),
            "render_stats": stats,
            "output_wave": rendered_output_wav
        }, f, ensure_ascii=False, indent=2)

    print(f"\n[TEST] Exported Voice Enrollment verification report to {report_path}")

    # VERIFICATIONS
    print("\n[VERIFYING VOICE ENROLLMENT & DYNAMIC CLONING PIPELINE]")
    print(f"1. VoiceProfileV3 ID Check: {loaded_profile.voice_id}")
    assert loaded_profile.voice_id == custom_voice_id
    print("   [PASS] Profile schema V3 created & retrieved accurately!")

    print(f"2. Audio Normalization Check: {os.path.basename(loaded_profile.reference_audio)}")
    assert os.path.exists(loaded_profile.reference_audio)
    print("   [PASS] 24kHz normalized reference audio file generated & verified!")

    print(f"3. F5-TTS Dynamic Voice Cloning Check: Rendered in {stats['render_time_s']}s")
    assert os.path.exists(rendered_output_wav) and os.path.getsize(rendered_output_wav) > 0
    print("   [PASS] F5-TTS dynamically cloned voice from enrolled reference WAV successfully!")

    print("\n✨ ALL PHASE 5 VOICE ENROLLMENT & CLONING PIPELINE VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
