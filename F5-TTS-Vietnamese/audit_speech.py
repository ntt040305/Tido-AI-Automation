import sys
import os
import json
import whisper

sys.stdout.reconfigure(encoding='utf-8')

print("⏳ Loading Whisper model...")
model = whisper.load_model("small")

ai_wav = r"d:\Tido\F5-TTS-Vietnamese\output_expressive_demo.wav"
script_json = r"d:\Tido\F5-TTS-Vietnamese\test_script.json"

print(f"🎙️ Transcribing AI Output: {ai_wav}")
res_ai = model.transcribe(ai_wav, language="vi")

print("\n--- PHÂN TÍCH BÓC BĂNG WHISPER (AI OUTPUT) ---")
print(res_ai["text"])

print("\n--- SO SÁNH PHÂN ĐOẠN SEGMENT ---")
for seg in res_ai["segments"]:
    start = seg["start"]
    end = seg["end"]
    text = seg["text"]
    print(f"[{start:5.1f}s -> {end:5.1f}s] {text}")

