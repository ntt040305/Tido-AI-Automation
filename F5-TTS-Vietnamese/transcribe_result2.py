import sys
import whisper

sys.stdout.reconfigure(encoding='utf-8')
model = whisper.load_model("small")
res = model.transcribe(r"d:\Tido\F5-TTS-Vietnamese\results\TIDO_Voice_Result2.mp3", language="vi")
print("\n--- WHISPER TRANSCRIPTION OF TIDO_Voice_Result2.mp3 ---")
print(res["text"].strip())
