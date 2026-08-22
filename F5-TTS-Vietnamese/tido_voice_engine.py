"""
TIDO Voice Engine v5
====================
Entry point chính để chạy kịch bản JSON qua pipeline TIDO Voice Performance Engine.

[FIX 7] Toàn bộ path hardcode Windows (d:\\Tido\\..., D:\\hf_cache) đã được
thay bằng tido_engine/paths.py — hỗ trợ Docker/Linux qua biến môi trường.

[FIX 7 - Code chết] Các function preprocess_text, replace_pause_markers,
determine_phase, rms_normalize, make_room_tone từ file gốc đã bị loại bỏ.
Các function cùng tên đã tồn tại đúng chỗ trong tido_engine/audio_boundary.py
và tido_engine/vietnamese_text_normalizer.py — không cần bản trùng lặp ở đây.
"""

import os
import sys

# [FIX 7] Đặt TEMP/TORCH_HOME sớm để tránh bị dùng path C: mặc định
# Đọc từ biến môi trường nếu có, fallback tính tương đối
_BASE = os.environ.get("TIDO_BASE_DIR") or os.path.dirname(os.path.abspath(__file__))
_TEMP = os.environ.get("TIDO_TEMP_DIR") or os.path.join(_BASE, "temp")
os.makedirs(_TEMP, exist_ok=True)
os.environ.setdefault("TMP", _TEMP)
os.environ.setdefault("TEMP", _TEMP)
os.environ.setdefault("TORCH_HOME", _TEMP)

import pydub

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    # Thêm ffmpeg vào PATH nếu cài qua WinGet (chỉ cần trên Windows dev)
    ffmpeg_dir = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin"
    if os.path.exists(ffmpeg_dir):
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
        pydub.AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        pydub.AudioSegment.ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")

# [FIX 7] HF_HOME mặc định về BASE_DIR/.hf_cache thay vì hardcode D:\hf_cache
from tido_engine.paths import HF_CACHE_DIR, VOICE_LIBRARY_PATH, BASE_DIR
os.environ.setdefault("HF_HOME", HF_CACHE_DIR)

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
            # Nếu path tương đối, tìm trong BASE_DIR (F5-TTS-Vietnamese/)
            script_path = os.path.join(BASE_DIR, script_path)
    else:
        # [FIX 7] Dùng BASE_DIR thay vì hardcode d:\Tido\F5-TTS-Vietnamese\
        script_path = os.path.join(BASE_DIR, "test_script.json")

    if not os.path.exists(script_path):
        print(f"❌ Không tìm thấy file kịch bản: {script_path}")
        sys.exit(1)

    print(f"📄 Script đang chạy: {os.path.basename(script_path)}")
    print(f"💡 Mẹo: Để chọn kịch bản khác, bạn có thể gõ: python tido_voice_engine.py test_dialogue_script.json\n")

    if len(sys.argv) > 2:
        output_path = sys.argv[2]
    else:
        output_path = os.path.join(BASE_DIR, "output_expressive_demo.wav")

    # [FIX 7] Dùng VOICE_LIBRARY_PATH từ paths.py thay vì hardcode
    engine = TidoVoiceEngine(VOICE_LIBRARY_PATH, quality_mode="STUDIO")
    engine.process_script(script_path, output_path)
