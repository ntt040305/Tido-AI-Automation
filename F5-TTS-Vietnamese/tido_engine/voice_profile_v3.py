"""
TIDO Voice Performance Engine - Voice Profile V3 Schema
========================================================
Comprehensive Voice Profile schema containing speaker identity, normalized reference audio,
transcribed reference text, speaker embedding vector, default persona & style presets.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional

@dataclass
class VoiceProfileV3:
    voice_id: str
    name: str
    gender: str                            # "male", "female", "neutral"
    reference_audio: str                   # Path to 24kHz normalized WAV
    reference_text: str                    # ASR transcribed or validated ref text
    duration_s: float                      # Reference audio duration in seconds
    speaker_embedding: List[float] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    default_persona: str = "warm_expert"
    default_style: str = "warm_expert"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VoiceProfileV3":
        return cls(
            voice_id=str(data.get("voice_id", "")),
            name=str(data.get("name", "Untitled Voice")),
            gender=str(data.get("gender", "neutral")),
            reference_audio=str(data.get("reference_audio", "")),
            reference_text=str(data.get("reference_text", "")),
            duration_s=float(data.get("duration_s", 0.0)),
            speaker_embedding=list(data.get("speaker_embedding", [])),
            metadata=dict(data.get("metadata", {})),
            default_persona=str(data.get("default_persona", "warm_expert")),
            default_style=str(data.get("default_style", "warm_expert"))
        )
