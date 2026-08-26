"""
TIDO Voice Performance Engine - TTS Engine Adapter Interface
============================================================
Defines the abstract contract for all Text-to-Speech engines (F5-TTS, VieNeu, CosyVoice, etc.).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class TTSEngineAdapter(ABC):
    @abstractmethod
    def initialize(self) -> None:
        """Loads and initializes model weights and dependencies."""
        pass

    @abstractmethod
    def render(
        self,
        text: str,
        ref_audio_path: str,
        ref_text: str,
        config: Dict[str, Any],
        output_wave_path: str
    ) -> str:
        """
        Renders audio from text and reference using specified engine config.
        Returns path to generated output wave file.
        """
        pass
