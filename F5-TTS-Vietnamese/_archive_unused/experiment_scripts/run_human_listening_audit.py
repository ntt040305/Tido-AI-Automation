"""
TIDO Voice Engine V2 Safe - Final Human Listening Audit & Persona Benchmark
=============================================================================
Renders the EXACT SAME script using voice_id="vo_mizaki_3" across 3 personas/styles:
1. commercial_seller -> commercial.wav
2. warm_expert       -> warm.wav
3. documentary_narrator -> documentary.wav

Analyzes acoustic waveforms:
- speed
- duration
- RMS (dBFS)
- Peak (dBFS)
- Pause ratio (%)
- Energy variation std (dB)
- Speaker similarity score (%)
- Prosody execution plan values
"""

import os
import sys
import json
import time
import shutil
import numpy as np
from pydub import AudioSegment
from pydub.silence import detect_nonsilent

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tido_engine.voice_service import VoiceService
from tido_engine.speaker_embedding_analyzer import SpeakerEmbeddingAnalyzer

AUDIT_SCRIPT = {
    "global_genre": "commercial",
    "title": "Human Listening Audit Benchmark Script",
    "voice_id": "vo_mizaki_3",
    "segments": [
        {
            "segment_id": "seg_001",
            "text": "Bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày?",
            "performance": {
                "segment_role": "hook",
                "speaking_intent": "engage",
                "energy_level": "medium"
            }
        },
        {
            "segment_id": "seg_002",
            "text": "Hãy bắt đầu hành trình ngay hôm nay tại Gym Toàn Thắng.",
            "performance": {
                "segment_role": "call_to_action",
                "speaking_intent": "command",
                "energy_level": "high"
            }
        },
        {
            "segment_id": "seg_003",
            "text": "Không gian tập luyện hiện đại, hệ thống máy tập được bố trí khoa học, phù hợp cho mục tiêu tăng cơ, giảm mỡ và cải thiện sức bền.",
            "performance": {
                "segment_role": "explanation",
                "speaking_intent": "inform",
                "energy_level": "medium"
            }
        },
        {
            "segment_id": "seg_004",
            "text": "Đội ngũ huấn luyện viên luôn sẵn sàng đồng hành, giúp bạn tập đúng và hạn chế chấn thương.",
            "performance": {
                "segment_role": "testimonial",
                "speaking_intent": "reassure",
                "energy_level": "medium"
            }
        }
    ]
}

def analyze_wave_delivery(wav_path: str) -> dict:
    audio = AudioSegment.from_file(wav_path)
    dur_s = len(audio) / 1000.0
    samples = np.array(audio.get_array_of_samples())

    # Detect speech vs silence chunks
    nonsilent = detect_nonsilent(audio, min_silence_len=100, silence_thresh=-40)
    speech_ms = sum([end - start for start, end in nonsilent])
    silence_ms = len(audio) - speech_ms
    pause_ratio = round((silence_ms / len(audio)) * 100.0, 1)

    # Frame energy variation (100ms frames)
    frame_ms = 100
    frame_count = int(len(audio) / frame_ms)
    frame_rms = []
    for i in range(frame_count):
        sub = audio[i*frame_ms : (i+1)*frame_ms]
        if sub.max_dBFS > -50:
            frame_rms.append(sub.dBFS)

    energy_std = round(float(np.std(frame_rms)), 2) if frame_rms else 0.0
    speaking_rate = round(78.0 / (speech_ms / 1000.0), 2) if speech_ms > 0 else 0.0 # ~78 words total

    return {
        "duration_s": round(dur_s, 2),
        "rms_dbfs": round(audio.dBFS, 2),
        "peak_dbfs": round(audio.max_dBFS, 2),
        "pause_ratio_pct": pause_ratio,
        "energy_std_db": energy_std,
        "speaking_rate_wps": speaking_rate
    }

def main():
    print("=================================================================")
    print("      TIDO VOICE ENGINE V2 SAFE - HUMAN LISTENING AUDIT          ")
    print("=================================================================\n")

    output_dir = r"d:\Tido\F5-TTS-Vietnamese\listening_audit_outputs"
    os.makedirs(output_dir, exist_ok=True)
    service = VoiceService(output_dir=output_dir)

    test_personas = [
        ("commercial_seller", "commercial_seller", "commercial.wav"),
        ("warm_expert", "warm_expert", "warm.wav"),
        ("documentary_narrator", "documentary_narrator", "documentary.wav")
    ]

    results = []
    ref_audio = r"d:\Tido\Assets\Voices\VO_Mizaki_3_12s.wav"

    for persona_id, style_id, out_name in test_personas:
        print(f"▶ [RENDERING] Persona: {persona_id} | Style: {style_id} -> {out_name}")
        t0 = time.time()
        res = service.synthesize(
            script_input=AUDIT_SCRIPT,
            voice_id="vo_mizaki_3",
            style=style_id,
            persona=persona_id,
            pipeline_mode="v2_safe"
        )
        elapsed = round(time.time() - t0, 2)
        dst_path = os.path.join(output_dir, out_name)
        shutil.copyfile(res["audio_file"], dst_path)

        wave_stats = analyze_wave_delivery(dst_path)
        sim_score = SpeakerEmbeddingAnalyzer.compute_similarity(ref_audio, dst_path)

        # Extract Prosody Execution Plan info
        trace_file = res["text_trace_file"]
        with open(trace_file, 'r', encoding='utf-8') as f:
            trace_data = json.load(f)

        results.append({
            "persona": persona_id,
            "style": style_id,
            "filename": out_name,
            "path": dst_path,
            "render_time_s": elapsed,
            "wave_stats": wave_stats,
            "speaker_similarity_pct": sim_score,
            "trace_log": trace_data
        })

        print(f"   [DONE] {out_name} | Dur: {wave_stats['duration_s']}s | RMS: {wave_stats['rms_dbfs']} dBFS | Pause: {wave_stats['pause_ratio_pct']}% | Energy Std: {wave_stats['energy_std_db']} dB | Sim: {sim_score}%\n")

    # Print Comparison Table
    print("=========================================================================================================")
    print("                                      HUMAN LISTENING AUDIT SUMMARY TABLE                                ")
    print("=========================================================================================================")
    print(f"{'Persona / Style':<22} | {'File':<16} | {'Dur (s)':<8} | {'RMS (dBFS)':<10} | {'Pause %':<8} | {'Energy Std':<10} | {'Speaker Sim':<11}")
    print("-" * 100)
    for r in results:
        w = r['wave_stats']
        print(f"{r['persona']:<22} | {r['filename']:<16} | {w['duration_s']:<8} | {w['rms_dbfs']:<10} | {w['pause_ratio_pct']:<8}% | {w['energy_std_db']:<10} dB | {r['speaker_similarity_pct']:<11}%")

    report_path = r"d:\Tido\F5-TTS-Vietnamese\human_listening_audit_report.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump({"listening_audit_results": results}, f, ensure_ascii=False, indent=2)

    print(f"\n📄 Saved audit benchmark report to {report_path}")

if __name__ == "__main__":
    main()
