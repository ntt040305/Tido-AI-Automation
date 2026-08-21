"""
TIDO Voice Engine v4
====================
Fixes in this version:
  [FIX-1] Nuốt chữ đầu câu  → Pre-pad 80ms silence before each segment
                               before crossfade, reduced crossfade to 10ms
  [FIX-2] Đứt nhịp giữa câu → Pause expansion now excludes boundary zones
                               (first/last 8% of audio); uses softer fade
                               instead of hard silence insertion
  [FIX-3] Tên riêng/tiếng Anh → Text preprocessor converts brands/English
                               to phonetic Vietnamese before TTS
"""

import os
import sys

os.environ["TMP"] = "d:/Tido/temp"
os.environ["TEMP"] = "d:/Tido/temp"
os.environ["TORCH_HOME"] = "d:/Tido/temp"

import time
import json
import re
import torch
import numpy as np
import pydub
from pydub import AudioSegment, effects

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    ffmpeg_dir = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin"
    if os.path.exists(ffmpeg_dir):
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
        pydub.AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        pydub.AudioSegment.ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")

os.environ["HF_HOME"] = r"D:\hf_cache"


# ─────────────────────────────────────────────────────────────────────────────
# [FIX-3] Text preprocessor — tên riêng & từ tiếng Anh
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# [FIX-3] Text preprocessor — AI Normalization (vietnormalizer)
# ─────────────────────────────────────────────────────────────────────────────

def preprocess_text(text: str, custom_map: dict = None) -> str:
    """
    Giữ nguyên bản văn bản chuẩn của người dùng để F5-TTS giữ ngữ điệu gốc tự nhiên 100%.
    Chỉ tự động chuyển các ký tự đặc biệt thông dụng.
    """
    import unicodedata
    import re
    text = unicodedata.normalize('NFC', text)
    result = text
    
    # Chuẩn hóa các ký tự đặc biệt cơ bản & con số thông dụng (để tránh AI đọc dính hoặc sai số)
    result = result.replace("%", " phần trăm").replace("&", " và ")
    num_map = {
        "10": "mười", "1": "một", "2": "hai", "3": "ba", "4": "bốn",
        "5": "năm", "6": "sáu", "7": "bảy", "8": "tám", "9": "chín"
    }
    # Tự động thay thế chữ số đứng riêng lẻ
    for n_str, n_txt in num_map.items():
        result = re.sub(r'(?<!\w)' + n_str + r'(?!\w)', n_txt, result)

    # Áp dụng từ điển riêng từ Voice Library (nếu có)
    if custom_map:
        for src, dst in sorted(custom_map.items(), key=lambda x: -len(x[0])):
            result = re.sub(r'(?i)(?<!\w)' + re.escape(src) + r'(?!\w)', dst, result)

    # Chuyển toàn bộ về chữ thường (lowercase) để khớp 100% với tokenizer của ViVoice/F5-TTS, triệt hạ lỗi nuốt từ in hoa
    result = result.lower()

    return re.sub(r'\s+', ' ', result).strip()


def replace_pause_markers(text: str) -> str:
    """Translate [pause:X] to natural punctuation so DiT model handles breath natively."""
    def repl(m):
        val = float(m.group(1))
        if val <= 0.4: return ", "
        elif val <= 0.6: return "... "
        else: return ". "
    return re.sub(r'\[pause:([\d\.]+)\]', repl, text)


# ─────────────────────────────────────────────────────────────────────────────
# Audio mastering
# ─────────────────────────────────────────────────────────────────────────────

TARGET_LOUDNESS_DBFS = -18.0
CROSSFADE_MS = 10          
PRE_PAD_MS   = 50          # Reduced to 50ms to make it feel snappier
NOISE_FLOOR  = 1e-7        # [FIX-2] Drastically reduced noise floor to prevent perceived static/hiss


def rms_normalize(seg: AudioSegment, target_dbfs: float = TARGET_LOUDNESS_DBFS) -> AudioSegment:
    if seg.dBFS == float('-inf') or abs(seg.dBFS - target_dbfs) < 0.5:
        return seg
    return seg.apply_gain(target_dbfs - seg.dBFS)


def make_room_tone(ms: int, sr: int = 24000) -> AudioSegment:
    """Very quiet noise instead of dead silence between segments."""
    n = int(sr * ms / 1000)
    noise = (np.random.normal(0, NOISE_FLOOR, n) * 32767).astype(np.int16).tobytes()
    return AudioSegment(data=noise, sample_width=2, frame_rate=sr, channels=1)


# ─────────────────────────────────────────────────────────────────────────────
# Main Engine
# ─────────────────────────────────────────────────────────────────────────────

def determine_phase(index: int, total: int, emotion: str, references: dict) -> str:
    el = emotion.lower()
    outro_keywords = {"cao trào", "kêu gọi hành động", "chốt", "liên hệ", "mua ngay", "quyết tâm", "kêu gọi"}
    intro_keywords = {"mở", "kể chuyện", "gợi mở", "giới thiệu", "chào", "tươi sáng"}

    if any(k in el for k in outro_keywords):
        phase = "outro"
    elif any(k in el for k in intro_keywords):
        phase = "intro"
    elif index == 0:
        phase = "intro"
    elif index >= total - 2:   # 2 câu cuối mặc định coi là outro
        phase = "outro"
    else:
        phase = "body"

    if references and phase not in references:
        phase = "default" if "default" in references else list(references.keys())[0]
    return phase

from tido_engine.tido_voice_performance_engine import TidoVoicePerformanceEngine

class TidoVoiceEngine:
    def __init__(self, voice_lib_path: str, quality_mode: str = "STUDIO"):
        self.perf_engine = TidoVoicePerformanceEngine(voice_lib_path, quality_mode=quality_mode)

    def process_script(self, script_path: str, output_path: str, wet: float = 0.10):
        return self.perf_engine.process_script(script_path, output_path)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        script_path = sys.argv[1]
        if not os.path.isabs(script_path):
            script_path = os.path.join(r"d:\Tido\F5-TTS-Vietnamese", script_path)
    else:
        script_path = r"d:\Tido\F5-TTS-Vietnamese\test_script.json"

    if not os.path.exists(script_path):
        print(f"❌ Không tìm thấy file kịch bản: {script_path}")
        sys.exit(1)

    print(f"📄 Script đang chạy: {os.path.basename(script_path)}")
    print(f"💡 Mẹo: Để chọn kịch bản khác, bạn có thể gõ: python tido_voice_engine.py test_dialogue_script.json\n")

    if len(sys.argv) > 2:
        output_path = sys.argv[2]
    else:
        output_path = r"d:\Tido\F5-TTS-Vietnamese\output_expressive_demo.wav"

    engine = TidoVoiceEngine(r"d:\Tido\Assets\Voices\voice_library.json", quality_mode="STUDIO")
    engine.process_script(
        script_path,
        output_path
    )
