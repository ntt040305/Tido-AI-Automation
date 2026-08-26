import sys
import os
import whisper

sys.stdout.reconfigure(encoding='utf-8')

model = whisper.load_model("small")
demo_mp3 = r"d:\Tido\Assets\Demo\Đoạn đầu.mp3"

res = model.transcribe(demo_mp3, language="vi")
print("=== DEMO AUDIBILITY TRANSCRIPTION ===")
print(res["text"])
print("\n--- SEGMENTS ---")
for seg in res["segments"]:
    print(f"[{seg['start']:5.1f}s -> {seg['end']:5.1f}s] {seg['text']}")
