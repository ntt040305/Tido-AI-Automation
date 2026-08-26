"""
TIDO Voice Performance Engine - A/B Comparison & Speech Integrity Suite
========================================================================
Renders 3 A/B test audio files using identical clean test script and voice reference:
1. output_v1_baseline.wav (Pipeline: v1)
2. output_v2_safe.wav     (Pipeline: v2_safe)
3. output_v2_full.wav     (Pipeline: v2_full)

Clean Test Script (~25-35s):
"Bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày?
Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng.
Không gian tập luyện hiện đại, hệ thống máy tập được bố trí khoa học,
phù hợp cho mục tiêu tăng cơ, giảm mỡ và cải thiện sức bền.
Đội ngũ huấn luyện viên luôn sẵn sàng đồng hành,
giúp bạn tập đúng và hạn chế chấn thương."
"""

import os
import sys
import json
import time
import shutil
import numpy as np
from pydub import AudioSegment

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_service import VoiceService

TEST_SCRIPT_CLEAN = {
    "global_genre": "commercial",
    "title": "Gym Toàn Thắng Clean Test Script",
    "voice_id": "vo_mizaki_3",
    "segments": [
        {
            "segment_id": "seg_001",
            "text": "Bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày?",
            "performance": {
                "segment_role": "hook",
                "speaking_intent": "engage",
                "energy_level": "medium",
                "speed_ratio": 1.0
            }
        },
        {
            "segment_id": "seg_002",
            "text": "Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng.",
            "performance": {
                "segment_role": "call_to_action",
                "speaking_intent": "command",
                "energy_level": "high",
                "speed_ratio": 1.0
            }
        },
        {
            "segment_id": "seg_003",
            "text": "Không gian tập luyện hiện đại, hệ thống máy tập được bố trí khoa học, phù hợp cho mục tiêu tăng cơ, giảm mỡ và cải thiện sức bền.",
            "performance": {
                "segment_role": "explanation",
                "speaking_intent": "inform",
                "energy_level": "medium",
                "speed_ratio": 1.0
            }
        },
        {
            "segment_id": "seg_004",
            "text": "Đội ngũ huấn luyện viên luôn sẵn sàng đồng hành, giúp bạn tập đúng và hạn chế chấn thương.",
            "performance": {
                "segment_role": "testimonial",
                "speaking_intent": "reassure",
                "energy_level": "medium",
                "speed_ratio": 1.0
            }
        }
    ]
}

def analyze_audio_integrity(wav_path: str) -> dict:
    audio = AudioSegment.from_file(wav_path)
    samples = np.array(audio.get_array_of_samples())
    max_possible = 2 ** (audio.sample_width * 8 - 1) - 1

    clipped_samples = int(np.sum(np.abs(samples) >= max_possible))
    peak_dbfs = round(audio.max_dBFS, 2)
    rms_dbfs = round(audio.dBFS, 2)
    duration_s = round(len(audio) / 1000.0, 2)

    return {
        "duration_s": duration_s,
        "sample_rate_hz": audio.frame_rate,
        "channels": audio.channels,
        "peak_dbfs": peak_dbfs,
        "rms_dbfs": rms_dbfs,
        "clipped_samples": clipped_samples,
        "is_clipping_free": clipped_samples == 0 and peak_dbfs <= -0.99
    }

def main():
    print("=================================================================")
    print("      TIDO VOICE ENGINE - A/B COMPARISON & INTEGRITY TEST        ")
    print("=================================================================\n")

    output_dir = r"d:\Tido\F5-TTS-Vietnamese\ab_test_outputs"
    os.makedirs(output_dir, exist_ok=True)
    service = VoiceService(output_dir=output_dir)

    modes = [
        ("v1", "output_v1_baseline.wav"),
        ("v2_safe", "output_v2_safe.wav"),
        ("v2_full", "output_v2_full.wav")
    ]

    ab_results = []

    for mode, filename in modes:
        print(f"▶ [RENDERING] Pipeline Mode: {mode.upper()} -> {filename}")
        t0 = time.time()
        res = service.synthesize(
            script_input=TEST_SCRIPT_CLEAN,
            voice_id="vo_mizaki_3",
            style="commercial_seller",
            persona="commercial_seller",
            pipeline_mode=mode
        )
        elapsed = round(time.time() - t0, 2)
        dst_wav = os.path.join(output_dir, filename)
        shutil.copyfile(res["audio_file"], dst_wav)

        metrics = analyze_audio_integrity(dst_wav)

        ab_results.append({
            "mode": mode,
            "filename": filename,
            "render_time_s": elapsed,
            "metrics": metrics,
            "text_trace_file": res.get("text_trace_file")
        })
        print(f"   [DONE] {filename} in {elapsed}s | Peak: {metrics['peak_dbfs']} dBFS | Clipped: {metrics['clipped_samples']}\n")

    # Print comparison summary table
    print("=========================================================================================================")
    print("                                      A/B BENCHMARK COMPARISON SUMMARY                                   ")
    print("=========================================================================================================")
    print(f"{'Mode':<12} | {'File':<24} | {'Dur (s)':<8} | {'Peak (dBFS)':<12} | {'Clipped':<10} | {'Status':<15}")
    print("-" * 90)
    for r in ab_results:
        m = r['metrics']
        status = "PASSED (Safe)" if m['is_clipping_free'] else "FAIL (Clipping)"
        print(f"{r['mode']:<12} | {r['filename']:<24} | {m['duration_s']:<8} | {m['peak_dbfs']:<12} | {m['clipped_samples']:<10} | {status:<15}")

    report_path = r"d:\Tido\F5-TTS-Vietnamese\ab_test_comparison_report.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump({"ab_test_results": ab_results}, f, ensure_ascii=False, indent=2)

    print(f"\n[REPORT] Saved A/B comparison report to {report_path}")

if __name__ == "__main__":
    main()
