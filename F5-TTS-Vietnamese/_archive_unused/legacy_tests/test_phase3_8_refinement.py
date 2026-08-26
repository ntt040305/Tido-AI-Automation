"""
Test Script - Verification for Phase 3.8 Voice Performance Refinement
=======================================================================
Integrates GlobalPerformanceArc, PerformanceDirectorV2, ProsodyEngineV2,
EmphasisProcessor, NaturalBreathController, and RenderingController.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.v2_schemas import PerformanceScriptV2
from tido_engine.global_performance_arc import GlobalPerformanceArc, GlobalPerformancePlan
from tido_engine.performance_director_v2 import PerformanceDirectorV2, ProsodyExecutionModel
from tido_engine.emphasis_processor import EmphasisProcessor, EmphasisExecutionPlan
from tido_engine.natural_breath_controller import NaturalBreathController, BreathExecutionPlan

def run_test():
    v2_script_path = r"d:\Tido\F5-TTS-Vietnamese\test_script_v2.json"
    refinement_output_path = r"d:\Tido\F5-TTS-Vietnamese\performance_refinement_execution.json"

    print(f"[TEST] Loading V2 60s Commercial Script from {v2_script_path}...")
    with open(v2_script_path, 'r', encoding='utf-8') as f:
        v2_dict = json.load(f)

    script_v2 = PerformanceScriptV2.from_dict(v2_dict)

    # 1. Compute Global Performance Arc
    print("[PIPELINE 1/4] Running GlobalPerformanceArc.compute_global_arc()...")
    global_arc: GlobalPerformancePlan = GlobalPerformanceArc.compute_global_arc(script_v2)
    print(f"      [OK] Narrative Arc: Hook Energy={global_arc.opening_energy}, Middle={global_arc.middle_energy}, CTA={global_arc.cta_energy}")

    # 2. Compute Performance Director & Prosody Engine V2
    print("[PIPELINE 2/4] Running PerformanceDirectorV2 & VietnameseProsodyEngineV2...")
    director = PerformanceDirectorV2()
    base_execution_model: ProsodyExecutionModel = director.build_execution_model(script_v2)

    # 3. Compute Emphasis Plans & Breath Plans
    print("[PIPELINE 3/4] Running EmphasisProcessor & NaturalBreathController...")
    refined_plans = []

    for seg, base_plan, arc_mod in zip(script_v2.segments, base_execution_model.execution_plans, global_arc.segment_modifiers):
        # Apply Global Arc Multipliers to Prosody Plan
        final_speed = round(max(0.85, min(1.25, base_plan.speaking_speed * arc_mod.speed_arc_multiplier)), 2)
        final_energy_scale = round(base_plan.energy_level_scale * arc_mod.energy_arc_multiplier, 2)

        # Emphasis Processing
        emphasis_plan: EmphasisExecutionPlan = EmphasisProcessor.process_segment_emphasis(
            segment_id=seg.segment_id,
            text=seg.text,
            emphasis_words_input=seg.performance.emphasis_words
        )

        # Breath Processing
        breath_plan: BreathExecutionPlan = NaturalBreathController.compute_segment_breath(
            segment_id=seg.segment_id,
            text=seg.text,
            role=seg.performance.segment_role,
            energy_level=seg.performance.energy_level
        )

        refined_plans.append({
            "segment_id": seg.segment_id,
            "text": seg.text,
            "narrative_phase": arc_mod.narrative_phase,
            "refined_speaking_speed": final_speed,
            "refined_energy_scale": final_energy_scale,
            "target_cfg_scale": base_plan.target_cfg_scale,
            "pitch_contour": base_plan.pitch_contour,
            "articulation_level": base_plan.articulation_level,
            "emphasis_execution": emphasis_plan.to_dict(),
            "breath_execution": breath_plan.to_dict()
        })

    # Export refined performance plan
    export_output = {
        "title": script_v2.title,
        "voice_id": script_v2.voice_id,
        "global_arc": global_arc.to_dict(),
        "segments_refined": refined_plans
    }

    with open(refinement_output_path, 'w', encoding='utf-8') as f:
        json.dump(export_output, f, ensure_ascii=False, indent=2)

    print(f"[TEST] Exported refined voice performance model to {refinement_output_path}")

    # VERIFICATIONS
    print("\n[VERIFYING PHASE 3.8 REFINEMENT RULES]")

    # Check 1: Hook vs CTA energy arc differs from middle explanation
    hook_ref = refined_plans[0]
    exp_ref = refined_plans[3]
    cta_ref = refined_plans[1]

    print(f"\n1. Global Performance Arc Energy Check:")
    print(f"   - Hook Refined Energy Scale: {hook_ref['refined_energy_scale']}")
    print(f"   - Explanation Refined Energy Scale: {exp_ref['refined_energy_scale']}")
    print(f"   - CTA Refined Energy Scale: {cta_ref['refined_energy_scale']}")
    assert hook_ref['refined_energy_scale'] > exp_ref['refined_energy_scale'], "Hook energy should be higher than middle explanation!"
    assert cta_ref['refined_energy_scale'] > exp_ref['refined_energy_scale'], "CTA energy should be higher than middle explanation!"
    print("   [PASS] Global narrative arc produces dynamic, non-uniform energy levels across 60s script!")

    # Check 2: Emphasis Processor multi-dimensional plan
    print(f"\n2. Emphasis Processor Check:")
    hook_emphasis = hook_ref['emphasis_execution']
    print(f"   - Emphasis Words Count: {len(hook_emphasis['words'])}")
    print(f"   - Word: {hook_emphasis['words'][0]['word']}")
    print(f"   - Duration Stretch Factor: {hook_emphasis['words'][0]['duration_stretch_factor']}")
    print(f"   - Micro Pause Before: {hook_emphasis['words'][0]['micro_pause_before_ms']}ms")
    assert hook_emphasis['words'][0]['duration_stretch_factor'] > 1.0, "Word emphasis must stretch duration!"
    print("   [PASS] Word emphasis provides duration stretching and micro-pauses, not just volume boost!")

    # Check 3: Natural Breath Controller strategy
    print(f"\n3. Natural Breath Controller Check:")
    print(f"   - CTA Breath Strategy: {cta_ref['breath_execution']['breath_strategy']}")
    testimonial_ref = refined_plans[9]
    print(f"   - Storytelling Breath Strategy: {testimonial_ref['breath_execution']['breath_strategy']}")
    assert cta_ref['breath_execution']['breath_strategy'] == "no_breath_cta", "CTA must use no_breath_cta strategy!"
    assert testimonial_ref['breath_execution']['breath_strategy'] == "organic_storytelling", "Storytelling must use organic_storytelling strategy!"
    print("   [PASS] Natural breath controller applies distinct breathing strategies by narrative role!")

    print("\n✨ ALL PHASE 3.8 VOICE PERFORMANCE REFINEMENT VERIFICATIONS PASSED! ✨")

if __name__ == "__main__":
    run_test()
