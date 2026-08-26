"""
TIDO Voice Engine - Master Unified CLI Entrypoint v5.0 (V2 Safe & Humanized Edition)
=====================================================================================
Unified CLI Entrypoint routing all execution through VoiceService pipeline.
Enforces pipeline_mode = "v2_safe" as default mode.

CLI Options:
  python tido_voice_engine.py <script.json> <output.wav> [--pipeline v2_safe|v2_humanized|v1|v2_full]
"""

import os
import sys
import json
import shutil
import argparse
import pydub

os.environ["TMP"] = "d:/Tido/temp"
os.environ["TEMP"] = "d:/Tido/temp"
os.environ["TORCH_HOME"] = "d:/Tido/temp"
os.environ["HF_HOME"] = r"D:\hf_cache"

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    ffmpeg_dir = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin"
    if os.path.exists(ffmpeg_dir):
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
        pydub.AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        pydub.AudioSegment.ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")

from tido_engine.voice_service import VoiceService

class TidoVoiceEngine:
    """
    Unified CLI wrapper around VoiceService enforcing V2 Safe Mode.
    """
    def __init__(self, voice_lib_path: str = None, quality_mode: str = "STUDIO"):
        self.service = VoiceService()

    def process_script(
        self,
        script_path: str,
        output_path: str,
        style: str = "commercial_seller",
        persona: str = "commercial_seller",
        pipeline_mode: str = "v2_micro_dynamics"
    ) -> str:
        with open(script_path, 'r', encoding='utf-8') as f:
            script_input = json.load(f)

        res = self.service.synthesize(
            script_input=script_input,
            voice_id="vo_mizaki_3",
            style=style,
            persona=persona,
            pipeline_mode=pipeline_mode
        )

        res_file = res["audio_file"]
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        if os.path.abspath(res_file) != os.path.abspath(output_path):
            shutil.copyfile(res_file, output_path)

        print(f"[CLI DONE] Output audio generated -> {output_path} (Mode: {pipeline_mode})")
        return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TIDO Voice Performance Engine CLI")
    parser.add_argument("script_path", nargs="?", default=r"d:\Tido\F5-TTS-Vietnamese\test_script_short.json")
    parser.add_argument("output_path", nargs="?", default=r"d:\Tido\F5-TTS-Vietnamese\output_cli.wav")
    parser.add_argument("--pipeline", choices=["v1", "v2_safe", "v2_full", "v2_humanized", "v2_acoustic_humanized", "v2_semantic_acting", "v2_micro_dynamics"], default="v2_micro_dynamics", help="Pipeline execution mode (default: v2_micro_dynamics)")
    parser.add_argument("--style", default="commercial_seller", help="Voice style profile")
    parser.add_argument("--persona", default="commercial_seller", help="Speaker persona profile")

    args = parser.parse_args()

    if not os.path.isabs(args.script_path):
        args.script_path = os.path.join(r"d:\Tido\F5-TTS-Vietnamese", args.script_path)

    if not os.path.exists(args.script_path):
        print(f"❌ Cannot find script file: {args.script_path}")
        sys.exit(1)

    engine = TidoVoiceEngine()
    engine.process_script(
        script_path=args.script_path,
        output_path=args.output_path,
        style=args.style,
        persona=args.persona,
        pipeline_mode=args.pipeline
    )
