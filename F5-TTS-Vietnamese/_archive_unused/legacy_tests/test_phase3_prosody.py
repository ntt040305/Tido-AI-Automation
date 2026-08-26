"""
Test Script - Verification for Phase 3 Performance Director & Prosody Engine V2
================================================================================
Loads test_script_v2.json, runs PerformanceDirectorV2, validates acoustic rules,
and exports prosody_execution.json.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2
from tido_engine.performance_director_v2 import PerformanceDirectorV2, ProsodyExecutionModel

def run_test():
    v2_script_path = r"d:\Tido\F5-TTS-Vietnamese\test_script_v2.json"
    prosody_output_path = r"d:\Tido\F5-TTS-Vietnamese\prosody_execution.json"

    print(f"[TEST] Loading V2 Script from {v2_script_path}...")
    with open(v2_script_path, 'r', encoding='utf-8') as f:
        v2_dict = json.load(f)

    script_v2 = PerformanceScriptV2.from_dict(v2_dict)

    print("[TEST] Running PerformanceDirectorV2.build_execution_model()...")
    director = PerformanceDirectorV2()
    execution_model: ProsodyExecutionModel = director.build_execution_model(script_v2)

    plans = execution_model.execution_plans
    print(f"      [OK] Built {len(plans)} prosody execution plans.")

    # Export prosody execution json
    export_dict = execution_model.to_dict()
    with open(prosody_output_path, 'w', encoding='utf-8') as f:
        json.dump(export_dict, f, ensure_ascii=False, indent=2)
    print(f"[TEST] Exported prosody execution model to {prosody_output_path}")

    # VERIFICATION OF PROSODY RULES
    print("\n[VERIFYING VIETNAMESE PROSODY RULES]")

    # Find specific segments
    hook_seg = next(p for p in plans if p.segment_id == "seg_001")
    cta_seg = next(p for p in plans if p.segment_id == "seg_002")
    explanation_seg = next(p for p in plans if p.segment_id == "seg_004")
    testimonial_seg = next(p for p in plans if p.segment_id == "seg_010")

    # Check 1: Hook has higher energy scale than explanation
    print(f"\n1. Energy Check:")
    print(f"   - Hook (seg_001) Energy Scale: {hook_seg.energy_level_scale}")
    print(f"   - Explanation (seg_004) Energy Scale: {explanation_seg.energy_level_scale}")
    assert hook_seg.energy_level_scale > explanation_seg.energy_level_scale, "Rule check failed: Hook energy should be higher than explanation!"
    print("   [PASS] Hook energy > Explanation energy")

    # Check 2: CTA has pause_before_ms > 0 and pitch contour confident_fall
    print(f"\n2. Call To Action (CTA) Check:")
    print(f"   - CTA (seg_002) Pause Before MS: {cta_seg.pause_before_ms}ms")
    print(f"   - CTA (seg_002) Pitch Contour: {cta_seg.pitch_contour}")
    assert cta_seg.pause_before_ms > 0, "Rule check failed: CTA should have pre-pause!"
    assert cta_seg.pitch_contour == "confident_fall", "Rule check failed: CTA pitch contour should be confident_fall!"
    print("   [PASS] CTA pre-pause > 0ms and pitch contour is confident_fall")

    # Check 3: Testimonial/Storytelling is slower
    print(f"\n3. Storytelling Speed Check:")
    print(f"   - Testimonial (seg_010) Speed: {testimonial_seg.speaking_speed}")
    print(f"   - CTA (seg_002) Speed: {cta_seg.speaking_speed}")
    assert testimonial_seg.speaking_speed < cta_seg.speaking_speed, "Rule check failed: Storytelling should be slower than CTA!"
    print("   [PASS] Testimonial speed < CTA speed")

    # Check 4: Brand name articulation
    print(f"\n4. Brand Name Articulation Check:")
    print(f"   - Segment 004 Articulation Level: {explanation_seg.articulation_level}")
    assert explanation_seg.articulation_level == "crisp", "Rule check failed: Brand name should trigger crisp articulation!"
    print("   [PASS] Brand name 'Toàn Thắng' triggered crisp articulation")

    # Check 5: Question pitch rise
    print(f"\n5. Question Pitch Rise Check:")
    print(f"   - Segment 001 Pitch Contour: {hook_seg.pitch_contour}")
    assert hook_seg.pitch_contour == "question_rise", "Rule check failed: Question mark should trigger question_rise pitch contour!"
    print("   [PASS] Question segment triggered question_rise pitch contour")

    print("\n✨ ALL PHASE 3 PROSODY ENGINE VERIFICATIONS PASSED SUCCESSFULLY! ✨")

if __name__ == "__main__":
    run_test()
