"""
TIDO Voice Engine - Centralized Cross-Platform Paths & Environment Resolution
=============================================================================
[FIX 7] Eliminates hardcoded Windows paths (d:\\Tido\\...) for Docker/Linux compatibility.
Reads paths dynamically from environment variables with safe fallbacks relative to file location.
"""

import os

# 1. Base Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # F5-TTS-Vietnamese/
REPO_ROOT = os.path.dirname(BASE_DIR)  # d:\Tido or /app

# 2. Asset & Library Paths
ASSETS_VOICES_DIR = os.getenv("TIDO_ASSETS_VOICES_DIR", os.path.join(REPO_ROOT, "Assets", "Voices"))
VOICE_LIBRARY_PATH = os.path.join(ASSETS_VOICES_DIR, "voice_library.json")
USER_DICTIONARY_PATH = os.path.join(ASSETS_VOICES_DIR, "user_dictionary.json")

# 3. Dynamic Runtime Cache & Log Directories
CACHE_DIR = os.path.join(BASE_DIR, "cache", "ref_cache")
LOG_DIR = os.path.join(BASE_DIR, "logs")
TEMP_DIR = os.getenv("TMP", os.getenv("TEMP", os.path.join(BASE_DIR, "temp")))

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# 4. Model Checkpoint Paths
CKPT_DIR = os.getenv("TIDO_CKPT_DIR", os.path.join(BASE_DIR, "ckpt_vivoice"))
CKPT_MODEL_FILE = os.path.join(CKPT_DIR, "model_last.pt")
CKPT_VOCAB_FILE = os.path.join(CKPT_DIR, "config.json")

# 5. Hugging Face Cache Path
HF_CACHE_DIR = os.getenv("HF_HOME", os.path.join(BASE_DIR, ".hf_cache"))
os.makedirs(HF_CACHE_DIR, exist_ok=True)

def resolve_audio_path(audio_file: str) -> str:
    """
    [FIX 7] Resolves audio reference paths across operating systems.
    If absolute path does not exist on host (e.g. Windows drive letter on Linux container),
    fall back to searching by filename inside ASSETS_VOICES_DIR.
    """
    if os.path.exists(audio_file):
        return audio_file
    
    filename = os.path.basename(audio_file)
    fallback_path = os.path.join(ASSETS_VOICES_DIR, filename)
    if os.path.exists(fallback_path):
        return fallback_path
        
    return audio_file
