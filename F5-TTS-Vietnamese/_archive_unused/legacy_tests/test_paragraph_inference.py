import sys
import os
import json
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
ref_text = "Không chỉ là thiết bị vệ sinh, đây là trải nghiệm nâng tầm cuộc sống mỗi ngày cho tổ ấm của bạn. Chào đón một biểu tượng tiện nghi mới chính thức ra mắt tại quận Long Biên, Hà Nội."

# Full Paragraph 1
p1 = "Bạn muốn thay đổi vóc dáng, khỏe hơn và tự tin hơn mỗi ngày? Đừng chỉ nghĩ về nó, hãy bắt đầu hành trình của bạn tại Gym Toàn Thắng! Một không gian tập luyện hiện đại, năng động và sẵn sàng tiếp thêm năng lượng cho bạn."

# Full Paragraph 2
p2 = "Bạn mới bắt đầu tập luyện? Đừng lo, Toàn Thắng luôn có đội ngũ hỗ trợ đồng hành. Các PT sẽ hướng dẫn kỹ thuật, giúp bạn tập đúng và hạn chế những chấn thương không đáng có. Mỗi người có một mục tiêu khác nhau, vì vậy cách tập cũng cần được lựa chọn phù hợp. Giảm cân, tăng cơ hay cải thiện thể lực, hãy bắt đầu từ chính mục tiêu của bạn."

out1 = "test_p1.wav"
out2 = "test_p2.wav"

print("\n🚀 Rendering Paragraph 1 (Full Paragraph)...")
f5tts.infer(ref_file=ref_file, ref_text=ref_text, gen_text=p1, file_wave=out1, remove_silence=False, cfg_strength=2.0)

print("🚀 Rendering Paragraph 2 (Full Paragraph)...")
f5tts.infer(ref_file=ref_file, ref_text=ref_text, gen_text=p2, file_wave=out2, remove_silence=False, cfg_strength=2.0)

model = whisper.load_model("small")

print("\n--- WHISPER TRANSCRIPTION FOR PARAGRAPH 1 ---")
r1 = model.transcribe(out1, language="vi")
print(r1["text"])

print("\n--- WHISPER TRANSCRIPTION FOR PARAGRAPH 2 ---")
r2 = model.transcribe(out2, language="vi")
print(r2["text"])
