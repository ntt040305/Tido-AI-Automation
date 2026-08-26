import os
import torch
import soundfile as sf
import json
from transformers import pipeline
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    ffmpeg_dir = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin"
    if os.path.exists(ffmpeg_dir):
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
        import pydub
        pydub.AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        pydub.AudioSegment.ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")

from pydub import AudioSegment

files = [
    "VO 1 LP Bank.MP3",
    "VO Lion Fitness.MP3",
    "VO Mizaki 3.MP3",
    "VO Motaro kb19.MP3"
]

base_dir = r"d:\Tido\Assets\Voices"
out_profiles = []

device_id = 0 if torch.cuda.is_available() else -1
asr = pipeline("automatic-speech-recognition", model="openai/whisper-small", device=device_id)

for f in files:
    full_path = os.path.join(base_dir, f)
    print(f"\nProcessing {f}...")
    
    # Trim to 10s
    audio = AudioSegment.from_file(full_path)
    dur_s = len(audio) / 1000.0
    print(f"Original duration: {dur_s}s")
    
    target_dur = min(len(audio), 12000) # trim to max 12 seconds
    trimmed = audio[:target_dur]
    
    # Save trimmed version
    trimmed_name = f.replace(".MP3", "_12s.wav").replace(".mp3", "_12s.wav").replace(" ", "_")
    trimmed_path = os.path.join(base_dir, trimmed_name)
    trimmed.export(trimmed_path, format="wav")
    
    # Transcribe
    res = asr(trimmed_path)
    ref_text = res["text"].strip()
    print(f"Transcript: {ref_text}")
    
    # Build profile block
    profile = {
      "id": trimmed_name.replace("_12s.wav", "").lower(),
      "name": f.replace(".MP3", ""),
      "gender": "unknown", # manual review
      "audio_file": trimmed_path.replace("\\", "/"),
      "ref_text": ref_text,
      "duration_s": target_dur / 1000.0,
      "trim_to_s": None,
      "profile": {
        "style": ["mới", "cần cập nhật"],
        "tone": "neutral",
        "best_for": ["quảng cáo"],
        "speed_default": 1.0,
        "cfg_strength_default": 2.0
      }
    }
    out_profiles.append(profile)

print("\n\n--- JSON TO APPEND ---")
print(json.dumps(out_profiles, ensure_ascii=False, indent=2))
