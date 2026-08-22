"""
TIDO Voice Engine CLI Entrypoint
================================
[FIX 7] Cleaned dead top-level helper functions. Uses centralized cross-platform paths from paths.py.
"""

import os
import sys

# [FIX 7] Import centralized paths & environment settings
from tido_engine.paths import BASE_DIR, VOICE_LIBRARY_PATH, TEMP_DIR
from tido_engine.tido_voice_performance_engine import TidoVoicePerformanceEngine

os.environ["TMP"] = TEMP_DIR
os.environ["TEMP"] = TEMP_DIR
os.environ["TORCH_HOME"] = TEMP_DIR

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

class TidoVoiceEngine:
    def __init__(self, voice_lib_path: str = VOICE_LIBRARY_PATH, quality_mode: str = "STUDIO"):
        self.perf_engine = TidoVoicePerformanceEngine(voice_lib_path, quality_mode=quality_mode)

    def process_script(self, script_path: str, output_path: str, wet: float = 0.10):
        return self.perf_engine.process_script(script_path, output_path)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        script_path = sys.argv[1]
        if not os.path.isabs(script_path):
            script_path = os.path.join(BASE_DIR, script_path)
    else:
        script_path = os.path.join(BASE_DIR, "test_script.json")

    if not os.path.exists(script_path):
        print(f"❌ Không tìm thấy file kịch bản: {script_path}")
        sys.exit(1)

    print(f"📄 Script đang chạy: {os.path.basename(script_path)}")
    print(f"💡 Mẹo: Để chọn kịch bản khác, bạn có thể gõ: python tido_voice_engine.py test_dialogue_script.json\n")

    if len(sys.argv) > 2:
        output_path = sys.argv[2]
        if not os.path.isabs(output_path):
            output_path = os.path.join(BASE_DIR, output_path)
    else:
        output_path = os.path.join(BASE_DIR, "test_output.wav")

    engine = TidoVoiceEngine(VOICE_LIBRARY_PATH, quality_mode="STUDIO")
    engine.process_script(
        script_path,
        output_path
    )

