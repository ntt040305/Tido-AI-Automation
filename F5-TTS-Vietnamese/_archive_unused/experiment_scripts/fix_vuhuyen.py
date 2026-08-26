"""
Fix VuHuyen: trim to 8s + re-transcribe with Whisper, then re-render.
Also tune speed and nfe_step for all voices.
"""
import os
import sys
import time
import torch

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    ffmpeg_dir = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin"
    if os.path.exists(ffmpeg_dir):
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
        import pydub
        pydub.AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        pydub.AudioSegment.ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")

os.environ["HF_HOME"] = r"D:\hf_cache"

from pydub import AudioSegment

# ── STEP 1: Trim VuHuyen.mp3 to first 8 seconds ─────────────────────────────
print("=" * 70)
print("  STEP 1: Trimming VuHuyen.mp3 to 8s clean reference clip")
print("=" * 70)

vu_original = r"d:\Tido\Assets\Voices\VuHuyen.mp3"
vu_trimmed  = r"d:\Tido\Assets\Voices\VuHuyen_8s.wav"

audio = AudioSegment.from_file(vu_original)
print(f"  Original duration: {len(audio)/1000:.2f}s")
trimmed = audio[:8000]   # first 8 seconds
trimmed.export(vu_trimmed, format="wav")
print(f"  Trimmed  duration: {len(trimmed)/1000:.2f}s  → saved to {vu_trimmed}")

# ── STEP 2: Whisper-transcribe the 8s clip ────────────────────────────────────
print("\n" + "=" * 70)
print("  STEP 2: Transcribing 8s VuHuyen clip with Whisper")
print("=" * 70)

from transformers import pipeline
device_id = 0 if torch.cuda.is_available() else -1
asr = pipeline("automatic-speech-recognition", model="openai/whisper-small",
               device=device_id)
result = asr(vu_trimmed)
vu_ref_text_8s = result["text"].strip()
print(f"  Transcribed ref_text: \"{vu_ref_text_8s}\"")

# ── STEP 3: Load ViVoice model ────────────────────────────────────────────────
print("\n" + "=" * 70)
print("  STEP 3: Loading ViVoice model")
print("=" * 70)

device = "cuda" if torch.cuda.is_available() else "cpu"
from f5_tts.api import F5TTS
f5tts = F5TTS(
    model="F5TTS_Base",
    ckpt_file=r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\model_last.pt",
    vocab_file=r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json",
    device=device,
    hf_cache_dir=r"D:\hf_cache"
)
print("  ✅ Model loaded!")

gen_text = "Lays là loại bánh khoai tây chiên giòn ngon nhất Việt Nam, bạn có muốn thử không?"

# ── STEP 4: Re-render VuHuyen with fixed config ───────────────────────────────
print("\n" + "=" * 70)
print("  STEP 4: Re-rendering VuHuyen with fixed 8s ref + slower speed")
print("=" * 70)
print(f"  ref_audio : {vu_trimmed}")
print(f"  ref_text  : \"{vu_ref_text_8s}\"")
print(f"  gen_text  : \"{gen_text}\"")

for speed_val in [0.85, 0.9, 1.0]:
    out_path = os.path.join(r"d:\Tido\F5-TTS-Vietnamese", f"output_vuhuyen_speed{str(speed_val).replace('.','')}.wav")
    print(f"\n  --- speed={speed_val} ---")
    t0 = time.time()
    try:
        wav, sr, _ = f5tts.infer(
            ref_file=vu_trimmed,
            ref_text=vu_ref_text_8s,
            gen_text=gen_text,
            file_wave=out_path,
            speed=speed_val,
            remove_silence=True,
            nfe_step=64,          # higher steps = clearer (default 32)
            cfg_strength=2.5      # slightly stronger guidance
        )
        print(f"  ✅ DONE in {time.time()-t0:.1f}s → {out_path}")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")

print("\n✅ All variants done. Open the 3 output files to compare!")
