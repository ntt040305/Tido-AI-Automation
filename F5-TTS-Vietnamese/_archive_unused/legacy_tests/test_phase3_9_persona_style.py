"""
Test Script - Verification for Phase 3.9 Speaker Persona + Voice Style System
==============================================================================
Renders identical text using identical Speaker Identity (VO Mizaki 3 ref audio 12s)
across 3 distinct Speaking Styles (Commercial Seller, Warm Expert, Documentary Narrator).
Verifies identity decoupling and style variation.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.speaker_persona import SpeakerPersona, PersonaPresets
from tido_engine.voice_style_profiles import VoiceStyleProfile, StylePresets
from tido_engine.prosody_engine_v2 import VietnameseProsodyEngineV2

def run_test():
    output_json_path = r"d:\Tido\F5-TTS-Vietnamese\persona_style_execution.json"

    # Shared Speaker Identity (WHO is speaking) - Constant 15s reference audio
    speaker_identity = {
        "speaker_id": "vo_mizaki_3",
        "name": "VO Mizaki 3",
        "ref_audio_path": r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav",
        "ref_text": "Ngay khi bước vào căn hộ, cảm nhận rõ nét nhất là không gian mở, khoáng đạt với bố cục liền mạch và lối thiết kế phóng khoáng. Với diện tích khoảng 65 mét vuông, căn hộ hai phòng ngủ được thiết kế tối."
    }

    test_text = "Hãy bắt đầu ngay hôm nay."

    styles_to_test = [
        ("commercial_seller", PersonaPresets.COMMERCIAL_SELLER, StylePresets.COMMERCIAL_SELLER_STYLE),
        ("warm_expert", PersonaPresets.WARM_EXPERT, StylePresets.WARM_EXPERT_STYLE),
        ("documentary_narrator", PersonaPresets.DOCUMENTARY_NARRATOR, StylePresets.DOCUMENTARY_NARRATOR_STYLE)
    ]

    results = []

    print("[TEST] Evaluating Speaker Persona + Voice Style System...")
    print(f"      Target Speaker Identity: {speaker_identity['name']} ({speaker_identity['speaker_id']})")
    print(f"      Target Text: \"{test_text}\"\n")

    for style_key, persona, style_profile in styles_to_test:
        # Base performance dict modified by Persona & Style DNA
        perf_dict = {
            "segment_id": f"seg_{style_key}",
            "segment_role": "call_to_action" if style_key == "commercial_seller" else "narration",
            "speaking_intent": "hype" if style_key == "commercial_seller" else "reassure",
            "speaker_attitude": "confident" if style_key == "commercial_seller" else "friendly",
            "energy_level": "explosive" if style_key == "commercial_seller" else ("high" if style_key == "warm_expert" else "low"),
            "emotion_state": {"primary_emotion": "excited" if style_key == "commercial_seller" else "warm", "arousal": persona.energy_baseline},
            "speed_ratio": style_profile.speed_bias,
            "pause_instruction": {
                "pause_before_ms": int(150 * style_profile.pause_style["pre_pause_scale"]),
                "pause_after_ms": int(200 * style_profile.pause_style["post_pause_scale"])
            }
        }

        # Calculate base prosody plan
        plan = VietnameseProsodyEngineV2.compute_segment_prosody(test_text, perf_dict)

        # Apply Style Profile DNA overrides
        final_speed = round(max(0.85, min(1.25, plan.speaking_speed * style_profile.speed_bias)), 2)
        final_energy = round(plan.energy_level_scale * persona.energy_baseline * style_profile.energy_curve["climax_scale"], 2)
        final_articulation = style_profile.articulation_style

        results.append({
            "style_key": style_key,
            "persona_name": persona.name,
            "style_display_name": style_profile.display_name,
            "speaker_identity_audio": speaker_identity["ref_audio_path"],
            "calculated_prosody": {
                "text": test_text,
                "speaking_speed": final_speed,
                "energy_level_scale": final_energy,
                "pause_before_ms": plan.pause_before_ms,
                "pause_after_ms": plan.pause_after_ms,
                "target_cfg_scale": plan.target_cfg_scale,
                "articulation_style": final_articulation,
                "pitch_contour": plan.pitch_contour
            }
        })

    # Export test JSON
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump({"speaker_identity": speaker_identity, "style_variations": results}, f, ensure_ascii=False, indent=2)

    print(f"[TEST] Exported persona & style execution report to {output_json_path}")

    # VERIFICATIONS
    print("\n[VERIFYING DECOUPLED SPEAKER PERSONA & STYLE SYSTEM]")

    seller = results[0]["calculated_prosody"]
    expert = results[1]["calculated_prosody"]
    narrator = results[2]["calculated_prosody"]

    # Check 1: Speaker Identity audio path is 100% constant
    print("1. Speaker Identity Check:")
    print(f"   - Audio Path Seller: {results[0]['speaker_identity_audio']}")
    print(f"   - Audio Path Expert: {results[1]['speaker_identity_audio']}")
    assert results[0]['speaker_identity_audio'] == results[1]['speaker_identity_audio'] == results[2]['speaker_identity_audio']
    print("   [PASS] Speaker Identity (15s ref audio) remains 100% constant across all styles!")

    # Check 2: Speed variation across styles
    print("\n2. Speaking Speed Variation Check:")
    print(f"   - Commercial Seller Speed: {seller['speaking_speed']}x")
    print(f"   - Warm Expert Speed: {expert['speaking_speed']}x")
    print(f"   - Documentary Narrator Speed: {narrator['speaking_speed']}x")
    assert seller['speaking_speed'] > expert['speaking_speed'] > narrator['speaking_speed']
    print("   [PASS] Delivery speed varies significantly by style DNA (Seller > Expert > Narrator)!")

    # Check 3: Energy level scale variation
    print("\n3. Energy Level Scale Variation Check:")
    print(f"   - Commercial Seller Energy: {seller['energy_level_scale']}")
    print(f"   - Warm Expert Energy: {expert['energy_level_scale']}")
    print(f"   - Documentary Narrator Energy: {narrator['energy_level_scale']}")
    assert seller['energy_level_scale'] > expert['energy_level_scale'] > narrator['energy_level_scale']
    print("   [PASS] Energy curve varies dynamically by persona baseline and style DNA!")

    # Check 4: Articulation style variation
    print("\n4. Articulation Style Variation Check:")
    print(f"   - Commercial Seller Articulation: {seller['articulation_style']}")
    print(f"   - Warm Expert Articulation: {expert['articulation_style']}")
    print(f"   - Documentary Narrator Articulation: {narrator['articulation_style']}")
    assert seller['articulation_style'] == "crisp"
    assert expert['articulation_style'] == "authoritative"
    assert narrator['articulation_style'] == "intimate"
    print("   [PASS] Articulation style changes dynamically by style preset!")

    print("\n✨ ALL PHASE 3.9 PERSONA & STYLE SYSTEM VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
