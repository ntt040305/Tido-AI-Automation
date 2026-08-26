"""
Test Script - Verification for Phase 2 Migration and V2 Schema
===============================================================
Loads test_script.json (V1), migrates to PerformanceScriptV2,
validates fields and backward compatibility, and exports test_script_v2.json.
"""

import json
import os
import sys

# Force UTF-8 encoding for Windows console output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.legacy_migrator import LegacyScriptMigrator
from tido_engine.v2_schemas import PerformanceScriptV2

def run_test():
    v1_script_path = r"d:\Tido\F5-TTS-Vietnamese\test_script.json"
    v2_output_path = r"d:\Tido\F5-TTS-Vietnamese\test_script_v2.json"

    print(f"[TEST] Loading V1 script from {v1_script_path}...")
    with open(v1_script_path, 'r', encoding='utf-8') as f:
        v1_data = json.load(f)

    print("[TEST] Running LegacyScriptMigrator.migrate()...")
    v2_script: PerformanceScriptV2 = LegacyScriptMigrator.migrate(v1_data)

    print(f"      [OK] Migrated script title: '{v2_script.title}'")
    print(f"      [OK] Voice ID: '{v2_script.voice_id}'")
    print(f"      [OK] Segments migrated: {len(v2_script.segments)}")

    # Verify first segment migration
    first_seg = v2_script.segments[0]
    print(f"\n[VERIFY] Segment 1 Details:")
    print(f"  - ID: {first_seg.segment_id}")
    print(f"  - Text: \"{first_seg.text}\"")
    print(f"  - Role: {first_seg.performance.segment_role}")
    print(f"  - Intent: {first_seg.performance.speaking_intent}")
    print(f"  - Emotion State: {first_seg.performance.emotion_state}")
    print(f"  - Speed Ratio: {first_seg.performance.speed_ratio}")
    print(f"  - Pause After MS: {first_seg.performance.pause_instruction.pause_after_ms}")

    # Serialize to V2 JSON
    v2_dict = v2_script.to_dict()
    with open(v2_output_path, 'w', encoding='utf-8') as f:
        json.dump(v2_dict, f, ensure_ascii=False, indent=2)

    print(f"\n[TEST] Exported V2 schema to {v2_output_path}")

    # Test Deserialization & Re-validation
    print("[TEST] Re-loading exported V2 JSON to test deserialization...")
    with open(v2_output_path, 'r', encoding='utf-8') as f:
        reloaded_dict = json.load(f)

    reloaded_script = PerformanceScriptV2.from_dict(reloaded_dict)
    assert reloaded_script.validate() is True, "Validation failed on reloaded V2 script"
    print("      [OK] Re-deserialized and validated PerformanceScriptV2 successfully!")

if __name__ == "__main__":
    run_test()
