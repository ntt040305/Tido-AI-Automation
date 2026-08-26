"""
TIDO Voice Performance Engine - F5-TTS Concrete Adapter
========================================================
Concrete implementation of TTSEngineAdapter for F5-TTS ViVoice engine.
Wraps model initialization and inference without altering parameters or model behavior.
"""

import os
import torch
from typing import Dict, Any
from tido_engine.tts_adapter_interface import TTSEngineAdapter

class F5TTSAdapter(TTSEngineAdapter):
    def __init__(
        self,
        ckpt_file: str = r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\model_last.pt",
        vocab_file: str = r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json",
        device: str = None,
        hf_cache_dir: str = r"D:\hf_cache"
    ):
        self.ckpt_file = ckpt_file
        self.vocab_file = vocab_file
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.hf_cache_dir = hf_cache_dir
        self.f5tts = None

    def initialize(self) -> None:
        """Loads F5-TTS model lazily."""
        if self.f5tts is None:
            print(f"[INIT] Loading TIDO ViVoice F5-TTS Model via Adapter on {self.device}...")
            from f5_tts.api import F5TTS
            self.f5tts = F5TTS(
                model="F5TTS_Base",
                ckpt_file=self.ckpt_file,
                vocab_file=self.vocab_file,
                device=self.device,
                hf_cache_dir=self.hf_cache_dir
            )
            print("      [OK] F5-TTS Adapter initialized successfully!")

    def render(
        self,
        text: str,
        ref_audio_path: str,
        ref_text: str,
        config: Dict[str, Any],
        output_wave_path: str
    ) -> str:
        """
        Renders an audio chunk using F5-TTS inference.
        Config dictionary accepts: 'speed', 'remove_silence', 'nfe_step', 'cfg_strength'.
        """
        if self.f5tts is None:
            self.initialize()

        speed = float(config.get("speed", 1.0))
        remove_silence = bool(config.get("remove_silence", True))
        nfe_step = int(config.get("nfe_step", 60))
        cfg_strength = float(config.get("cfg_strength", 1.55))

        self.f5tts.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=text,
            file_wave=output_wave_path,
            speed=speed,
            remove_silence=remove_silence,
            nfe_step=nfe_step,
            cfg_strength=cfg_strength
        )
        return output_wave_path
