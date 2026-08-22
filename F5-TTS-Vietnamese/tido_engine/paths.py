"""
TIDO Voice Engine - Centralized Path Configuration
===================================================
[FIX 7] Tập trung toàn bộ đường dẫn vào 1 file duy nhất.
Trước đây 5 file khác nhau hardcode path Windows (d:\\Tido\\..., D:\\hf_cache)
khiến hệ thống không chạy được trong Docker/Linux.

Cách sử dụng biến môi trường để override:
  TIDO_BASE_DIR       — ghi đè BASE_DIR
  TIDO_ASSETS_VOICES_DIR — ghi đè thư mục chứa voices
  HF_HOME             — ghi đè thư mục cache HuggingFace
"""

import os

# BASE_DIR = thư mục F5-TTS-Vietnamese/ (parent của tido_engine/)
# Tính tương đối theo vị trí file này để hoạt động trên mọi OS
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))   # tido_engine/
BASE_DIR = os.environ.get("TIDO_BASE_DIR") or os.path.dirname(_THIS_DIR)  # F5-TTS-Vietnamese/

# REPO_ROOT = thư mục chứa toàn bộ dự án Tido (parent của BASE_DIR)
REPO_ROOT = os.environ.get("TIDO_REPO_ROOT") or os.path.dirname(BASE_DIR)

# ---------------------------------------------------------------------------
# Assets & Voice Library
# ---------------------------------------------------------------------------
ASSETS_VOICES_DIR = os.environ.get("TIDO_ASSETS_VOICES_DIR") or os.path.join(REPO_ROOT, "Assets", "Voices")
VOICE_LIBRARY_PATH = os.environ.get("TIDO_VOICE_LIBRARY") or os.path.join(ASSETS_VOICES_DIR, "voice_library.json")
USER_DICTIONARY_PATH = os.environ.get("TIDO_USER_DICT") or os.path.join(ASSETS_VOICES_DIR, "user_dictionary.json")

# ---------------------------------------------------------------------------
# Checkpoint
# ---------------------------------------------------------------------------
CKPT_DIR = os.environ.get("TIDO_CKPT_DIR") or os.path.join(BASE_DIR, "ckpt_vivoice")
CKPT_MODEL_FILE = os.environ.get("TIDO_CKPT_MODEL") or os.path.join(CKPT_DIR, "model_last.pt")
CKPT_VOCAB_FILE = os.environ.get("TIDO_CKPT_VOCAB") or os.path.join(CKPT_DIR, "config.json")

# ---------------------------------------------------------------------------
# Runtime Directories (tự tạo nếu chưa tồn tại)
# ---------------------------------------------------------------------------
CACHE_DIR = os.environ.get("TIDO_CACHE_DIR") or os.path.join(BASE_DIR, "cache")
LOG_DIR = os.environ.get("TIDO_LOG_DIR") or os.path.join(BASE_DIR, "logs")
TEMP_DIR = os.environ.get("TIDO_TEMP_DIR") or os.path.join(BASE_DIR, "temp")

for _d in (CACHE_DIR, LOG_DIR, TEMP_DIR):
    os.makedirs(_d, exist_ok=True)

# ---------------------------------------------------------------------------
# HuggingFace Cache — đọc từ env HF_HOME, fallback về BASE_DIR/.hf_cache
# ---------------------------------------------------------------------------
HF_CACHE_DIR = os.environ.get("HF_HOME") or os.path.join(BASE_DIR, ".hf_cache")
os.makedirs(HF_CACHE_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Reference audio cache sub-directory
# ---------------------------------------------------------------------------
REF_CACHE_DIR = os.path.join(CACHE_DIR, "ref_cache")
os.makedirs(REF_CACHE_DIR, exist_ok=True)


def resolve_audio_path(audio_file: str) -> str:
    """
    [FIX 7] Nếu path tuyệt đối trong JSON không tồn tại trên máy hiện tại
    (ví dụ: path Windows trên container Linux), tự fallback tìm theo
    tên file trong ASSETS_VOICES_DIR.
    """
    if os.path.isabs(audio_file) and os.path.exists(audio_file):
        return audio_file

    # Fallback: tìm theo tên file trong ASSETS_VOICES_DIR
    filename = os.path.basename(audio_file)
    candidate = os.path.join(ASSETS_VOICES_DIR, filename)
    if os.path.exists(candidate):
        return candidate

    # Trả về path gốc để báo lỗi rõ ràng ở upstream
    return audio_file
