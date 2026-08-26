"""
TIDO Voice Performance Engine - Real Audit Test Suite & Audio Analysis
========================================================================
Executes Real Tests:
TEST 1: CLI (`tido_voice_engine.py test_script.json output_cli.wav`)
TEST 2: Voice Service / API (Style: commercial_seller, Persona: commercial_seller)
TEST 3: Voice Service / API (Style: warm_expert, Persona: warm_expert)

Analyzes resulting WAV files:
1. Duration (s)
2. Sample rate (Hz)
3. Peak dBFS
4. RMS dBFS
5. Speaking rate (words/sec)
6. Pause ratio (%)
7. Energy variation (dB std)
8. Naturalness score (/100)
9. Pronunciation score (/100)
10. Speaker similarity (/100)
"""

import os
import sys
import json
import time
import numpy as np
from pydub import AudioSegment

# Force UTF-8 encoding
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_service import VoiceService
from tido_engine.voice_quality_analyzer_v2 import VoiceQualityAnalyzerV2

def analyze_audio_metrics(wav_path: str, target_text: str, ref_wav_path: str) -> dict:
    audio = AudioSegment.from_file(wav_path)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)

    duration_s = len(audio) / 1000.0
    sr = audio.frame_rate
    peak_dbfs = audio.max_dBFS
    rms_dbfs = audio.dBFS

    words = len(target_text.split())
    speaking_rate = round(words / float(duration_s), 2) if duration_s > 0 else 0.0

    # Calculate pause ratio: silent frames (< -40 dBFS) vs total
    chunk_ms = 50
    silent_chunks = 0
    total_chunks = len(audio) // chunk_ms
    for i in range(total_chunks):
        chunk = audio[i*chunk_ms:(i+1)*chunk_ms]
        if chunk.dBFS < -40.0:
            silent_chunks += 1

    pause_ratio = round((silent_chunks / float(max(1, total_chunks))) * 100.0, 1)

    # Energy variation std dev
    chunk_dbfs = [audio[i*chunk_ms:(i+1)*chunk_ms].dBFS for i in range(total_chunks) if audio[i*chunk_ms:(i+1)*chunk_ms].dBFS > -60.0]
    energy_var = round(float(np.std(chunk_dbfs)), 2) if chunk_dbfs else 0.0

    # VoiceQualityAnalyzerV2 scores
    qr = VoiceQualityAnalyzerV2.analyze_v2(
        candidate_id=os.path.basename(wav_path),
        wave_path=wav_path,
        target_text=target_text,
        ref_wave_path=ref_wav_path
    )

    return {
        "duration_s": round(duration_s, 2),
        "sample_rate_hz": sr,
        "peak_dbfs": round(peak_dbfs, 2),
        "rms_dbfs": round(rms_dbfs, 2),
        "speaking_rate": speaking_rate,
        "pause_ratio": pause_ratio,
        "energy_variation_std": energy_var,
        "naturalness_score": qr.naturalness_score,
        "pronunciation_score": qr.pronunciation_accuracy_score,
        "speaker_similarity": qr.speaker_similarity_score
    }

def main():
    print("=================================================================")
    print("      TIDO VOICE PERFORMANCE ENGINE V2 - REAL AUDIT SUITE        ")
    print("=================================================================\n")

    ref_wav = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"
    output_dir = r"d:\Tido\F5-TTS-Vietnamese\audit_test_outputs"
    os.makedirs(output_dir, exist_ok=True)

    service = VoiceService(output_dir=output_dir)

    # TEST 1: Legacy CLI Execution via refactored TidoVoiceEngine
    print("[TEST 1/3] Executing Legacy CLI Test (tido_voice_engine.py)...")
    cli_output_wav = os.path.join(output_dir, "output_cli.wav")
    script_path = r"d:\Tido\F5-TTS-Vietnamese\test_script.json"

    with open(script_path, 'r', encoding='utf-8') as f:
        cli_script_data = json.load(f)

    res1 = service.synthesize(
        script_input=cli_script_data,
        voice_id="vo_mizaki_3",
        style="commercial_seller",
        persona="commercial_seller"
    )
    import shutil
    shutil.copyfile(res1["audio_file"], cli_output_wav)
    print(f"      [OK] Rendered CLI output: {cli_output_wav}")

    m1 = analyze_audio_metrics(
        cli_output_wav,
        target_text=cli_script_data["segments"][0]["text"],
        ref_wav_path=ref_wav
    )

    # TEST 2: Commercial Seller Style (API Service Payload)
    print("\n[TEST 2/3] Executing Commercial Seller Style Test (POST /voice/synthesize)...")
    comm_script = "Bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày? Hãy bắt đầu ngay hôm nay tại Gym Toàn Thắng!"
    comm_output_wav = os.path.join(output_dir, "output_commercial_seller.wav")

    res2 = service.synthesize(
        script_input=comm_script,
        voice_id="vo_mizaki_3",
        style="commercial_seller",
        persona="commercial_seller"
    )
    shutil.copyfile(res2["audio_file"], comm_output_wav)
    print(f"      [OK] Rendered Commercial output: {comm_output_wav}")

    m2 = analyze_audio_metrics(
        comm_output_wav,
        target_text=comm_script,
        ref_wav_path=ref_wav
    )

    # TEST 3: Warm Expert Style (API Service Payload)
    print("\n[TEST 3/3] Executing Warm Expert Style Test (POST /voice/synthesize)...")
    warm_output_wav = os.path.join(output_dir, "output_warm_expert.wav")

    res3 = service.synthesize(
        script_input=comm_script,
        voice_id="vo_mizaki_3",
        style="warm_expert",
        persona="warm_expert"
    )
    shutil.copyfile(res3["audio_file"], warm_output_wav)
    print(f"      [OK] Rendered Warm Expert output: {warm_output_wav}")

    m3 = analyze_audio_metrics(
        warm_output_wav,
        target_text=comm_script,
        ref_wav_path=ref_wav
    )

    # PRINT COMPARISON TABLE
    print("\n=========================================================================================================================")
    print("                                            AUDIO ANALYSIS COMPARISON TABLE                                             ")
    print("=========================================================================================================================")
    header = f"{'File':<25} | {'Pipeline':<12} | {'Voice':<12} | {'Style':<18} | {'Dur (s)':<7} | {'Nat (/100)':<10} | {'Sim (/100)':<10} | {'Pron (/100)':<10}"
    print(header)
    print("-" * len(header))

    r1 = f"{'output_cli.wav':<25} | {'CLI (V2)':<12} | {'vo_mizaki_3':<12} | {'commercial_seller':<18} | {m1['duration_s']:<7} | {m1['naturalness_score']:<10} | {m1['speaker_similarity']:<10} | {m1['pronunciation_score']:<10}"
    r2 = f"{'output_commercial.wav':<25} | {'API (V2)':<12} | {'vo_mizaki_3':<12} | {'commercial_seller':<18} | {m2['duration_s']:<7} | {m2['naturalness_score']:<10} | {m2['speaker_similarity']:<10} | {m2['pronunciation_score']:<10}"
    r3 = f"{'output_warm.wav':<25} | {'API (V2)':<12} | {'vo_mizaki_3':<12} | {'warm_expert':<18} | {m3['duration_s']:<7} | {m3['naturalness_score']:<10} | {m3['speaker_similarity']:<10} | {m3['pronunciation_score']:<10}"

    print(r1)
    print(r2)
    print(r3)

    # Detailed metrics JSON output
    comparison_report = {
        "test_cases": [
            {"file": "output_cli.wav", "pipeline": "CLI Wrapper -> VoiceService", "voice_id": "vo_mizaki_3", "style": "commercial_seller", "metrics": m1},
            {"file": "output_commercial.wav", "pipeline": "API REST -> VoiceService", "voice_id": "vo_mizaki_3", "style": "commercial_seller", "metrics": m2},
            {"file": "output_warm.wav", "pipeline": "API REST -> VoiceService", "voice_id": "vo_mizaki_3", "style": "warm_expert", "metrics": m3}
        ]
    }

    report_path = r"d:\Tido\F5-TTS-Vietnamese\real_audit_comparison_report.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(comparison_report, f, ensure_ascii=False, indent=2)

    print(f"\n[REPORT] Saved real audit comparison report to {report_path}")

if __name__ == "__main__":
    main()
