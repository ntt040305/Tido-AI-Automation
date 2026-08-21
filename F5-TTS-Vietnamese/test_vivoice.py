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

print("=" * 75)
print("  TIDO F5-TTS VIVOICE — BEST COMBO: vivoice model + vivoice vocab")
print("=" * 75)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"GPU: {torch.cuda.get_device_name(0) if device=='cuda' else 'CPU'}")

# ViVoice model + ViVoice vocab (the ONLY fully-compatible combo)
vi_ckpt  = r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\model_last.pt"
vi_vocab = r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json"  # This IS a vocab file

print(f"\n[LOADING] ViVoice model + ViVoice vocab...")
try:
    from f5_tts.api import F5TTS
    f5tts = F5TTS(
        model="F5TTS_Base",
        ckpt_file=vi_ckpt,
        vocab_file=vi_vocab,
        device=device,
        hf_cache_dir=r"D:\hf_cache"
    )
    print("      ✅ Model loaded!")
except Exception as e:
    print(f"      ❌ ERROR: {e}")
    sys.exit(1)

voice_samples = [
    {
        "name": "HaiAnh",
        "audio": r"d:\Tido\Assets\Voices\HaiAnh.mp3",
        "ref_text": "Chào mừng ba đến với buổi trải nghiệm lớp học online vui học!",
        "gen_text": "Lays là loại bánh khoai tây chiên giòn ngon nhất Việt Nam, bạn có muốn thử không?",
        "output": os.path.join(os.path.dirname(__file__), "output_haianh_vivoice.wav")
    },
    {
        "name": "Phuctido1",
        "audio": r"d:\Tido\Assets\Voices\Phuctido1.mp3",
        "ref_text": "Không chỉ là thiết bị vệ sinh, đây là trải nghiệm nâng tầm cuộc sống mỗi ngày cho tổ ấm của bạn. Chào đón một biểu tượng tiện nghi mới chính thức ra mắt tại quận Long Biên, Hà Nội.",
        "gen_text": "Lays là loại bánh khoai tây chiên giòn ngon nhất Việt Nam, bạn có muốn thử không?",
        "output": os.path.join(os.path.dirname(__file__), "output_phuctido1_vivoice.wav")
    },
    {
        "name": "VuHuyen",
        "audio": r"d:\Tido\Assets\Voices\VuHuyen.mp3",
        "ref_text": "Với NBO, lựa chọn thực phẩm sạch, an toàn và minh bạch không chỉ là nhu cầu mà là quyền lợi chính đáng của mỗi gia đình trên hành trình chăm sóc sức khỏe. Từ niềm tin đó, NBO chọn con đường chủ động xây dựng vùng nguyên liệu hữu cơ ngay tại Việt Nam.",
        "gen_text": "Lays là loại bánh khoai tây chiên giòn ngon nhất Việt Nam, bạn có muốn thử không?",
        "output": os.path.join(os.path.dirname(__file__), "output_vuhuyen_vivoice.wav")
    }
]

print("\n[RENDERING] 3 voices with ViVoice model...\n")
results = []

for idx, sample in enumerate(voice_samples, 1):
    print(f"--- [{idx}/3] {sample['name']} ---")
    print(f"    Gen: \"{sample['gen_text']}\"")
    start_t = time.time()
    try:
        wav, sr, _ = f5tts.infer(
            ref_file=sample['audio'],
            ref_text=sample['ref_text'],
            gen_text=sample['gen_text'],
            file_wave=sample['output'],
            speed=1.0,
            remove_silence=True
        )
        elapsed = time.time() - start_t
        results.append({"name": sample['name'], "status": "✅ SUCCESS", "time": f"{elapsed:.1f}s", "path": sample['output']})
        print(f"    ✅ DONE in {elapsed:.1f}s\n")
    except Exception as e:
        results.append({"name": sample['name'], "status": "❌ FAILED", "error": str(e)})
        print(f"    ❌ FAILED: {e}\n")

print("=" * 75)
print("  VIVOICE RENDER SUMMARY")
print("=" * 75)
for r in results:
    if 'path' in r:
        print(f"  {r['status']} | {r['name']:<12} | {r['time']:<6} | {r['path']}")
    else:
        print(f"  {r['status']} | {r['name']:<12} | {r.get('error')}")
print("=" * 75)
