import json
import os

new_profiles = [
  {
    "id": "vo_1_lp_bank",
    "name": "VO 1 LP Bank",
    "gender": "male",
    "audio_file": "d:/Tido/Assets/Voices/VO_1_LP_Bank_12s.wav",
    "ref_text": "Phí quản lý tài khoản, phí duy trì dịch vụ, phí chuyển tiền, phí tin nhắn... Ôi đau đầu quá! Sao phải đóng nhiều loại phí thế nhỉ? Có cách nào miễn phí tất cả không?",
    "duration_s": 12.0,
    "trim_to_s": None,
    "profile": {
      "style": ["hoạt náo", "đời thường", "tự nhiên"],
      "tone": "energetic",
      "best_for": ["ngân hàng", "tài chính cá nhân", "quảng cáo hài hước"],
      "speed_default": 1.0,
      "cfg_strength_default": 2.0
    }
  },
  {
    "id": "vo_lion_fitness",
    "name": "VO Lion Fitness",
    "gender": "male",
    "audio_file": "d:/Tido/Assets/Voices/VO_Lion_Fitness_12s.wav",
    "ref_text": "Mùa hè là lúc khoe thân hình bốc lửa. Không chỉ giúp bạn có thân hình chuẩn, Lion Fitness còn mang đến môi trường tập luyện chuyên nghiệp, hiện đại hàng đầu.",
    "duration_s": 12.0,
    "trim_to_s": None,
    "profile": {
      "style": ["mạnh mẽ", "động lực", "thể thao"],
      "tone": "strong",
      "best_for": ["phòng gym", "thể thao", "năng lượng cao"],
      "speed_default": 1.0,
      "cfg_strength_default": 2.0
    }
  },
  {
    "id": "vo_mizaki_3",
    "name": "VO Mizaki 3",
    "gender": "female",
    "audio_file": "d:/Tido/Assets/Voices/VO_Mizaki_3_12s.wav",
    "ref_text": "Nghi khi bước vào căn hộ, cảm nhận rõ nít nhất là công gian mở, hoán đảnh với bốt cụp liền mặt và lối huyết kế phóng khoái. Với diễn tích khoảng 65 m, căn hộ 2 phòng ngũ được thiết kế tối.",
    "duration_s": 12.0,
    "trim_to_s": None,
    "profile": {
      "style": ["thanh lịch", "cao cấp", "bất động sản"],
      "tone": "elegant",
      "best_for": ["bất động sản", "nội thất", "phong cách sống"],
      "speed_default": 0.95,
      "cfg_strength_default": 2.0
    }
  },
  {
    "id": "vo_motaro_kb19",
    "name": "VO Motaro kb19",
    "gender": "male",
    "audio_file": "d:/Tido/Assets/Voices/VO_Motaro_kb19_12s.wav",
    "ref_text": "Dừng lại ngay, nóng nhất tháng 7 không phải thời tiết mà là bão seo royal shot. Duy nhất 3 ngày từ ngày mùm năm từ ngày mùm 7 tháng 7 lai xuyên suốt 7 giờ sáng tới 20h.",
    "duration_s": 12.0,
    "trim_to_s": None,
    "profile": {
      "style": ["cấp bách", "khuyến mãi", "gây chú ý"],
      "tone": "urgent",
      "best_for": ["sale", "flash sale", "sự kiện", "livestream"],
      "speed_default": 1.1,
      "cfg_strength_default": 2.0
    }
  }
]

lib_path = r"d:\Tido\Assets\Voices\voice_library.json"
with open(lib_path, "r", encoding="utf-8") as f:
    data = json.load(f)

# Filter out if they already exist
existing_ids = set(v["id"] for v in data["voices"])
for p in new_profiles:
    if p["id"] not in existing_ids:
        data["voices"].append(p)

with open(lib_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated voice_library.json successfully!")
