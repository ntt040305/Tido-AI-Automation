import sys
import os
import whisper
from f5_tts.api import F5TTS

sys.stdout.reconfigure(encoding='utf-8')

f5tts = F5TTS(
    model="F5TTS_Base",
    ckpt_file=r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\model_last.pt",
    vocab_file=r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json",
    device="cuda",
    hf_cache_dir=r"D:\hf_cache"
)

ref_file = r"d:\Tido\Assets\Voices\Phuctido1.mp3"
ref_text = "Không chỉ là thiết bị vệ sinh, đây là trải nghiệm nâng tầm cuộc sống mỗi ngày cho tổ ấm của bạn."

test_texts = [
    ("raw_khong", "Không cần phải trở nên hoàn hảo ngay ngày đầu tiên."),
    ("dot_khong", ". Không cần phải trở nên hoàn hảo ngay ngày đầu tiên."),
    ("comma_khong", ", Không cần phải trở nên hoàn hảo ngay ngày đầu tiên."),
    ("raw_dung", "Đừng lo, Toàn Thắng luôn có đội ngũ hỗ trợ đồng hành."),
    ("dot_dung", ". Đừng lo, Toàn Thắng luôn có đội ngũ hỗ trợ đồng hành."),
    ("comma_dung", ", Đừng lo, Toàn Thắng luôn có đội ngũ hỗ trợ đồng hành."),
]

results = {}
model = whisper.load_model("small")

for tag, text in test_texts:
    out_wav = f"test_{tag}.wav"
    f5tts.infer(
        ref_file=ref_file,
        ref_text=ref_text,
        gen_text=text,
        file_wave=out_wav,
        remove_silence=False,
        cfg_strength=2.0
    )
    res = model.transcribe(out_wav, language="vi")
    results[tag] = res["text"].strip()

print("\n--- RESULTS COMPARISON ---")
for tag, text in test_texts:
    print(f"[{tag:12s}] Input: '{text}'")
    print(f"             Whisper heard: '{results[tag]}'\n")
