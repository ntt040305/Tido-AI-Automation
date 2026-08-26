"""
TIDO Voice Performance Engine - Voice Profile V4 Schema
========================================================
Enterprise-grade Voice Profile schema supporting multi-tenant ownership, permissions,
V2 metadata, quality score, and metadata embedding vectors for scalable vector search.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from tido_engine.voice_metadata_analyzer import VoiceMetadataV2

@dataclass
class VoiceProfileV4:
    voice_id: str
    name: str
    owner_id: str                          # Multi-tenant owner ID (e.g. "usr_1002")
    permission: str                        # "public", "private", "shared"
    version: str                           # "4.0"
    quality_score: float                   # Overall quality rating (0-100)
    reference_audio: str                   # Path to 24kHz normalized WAV
    reference_text: str                    # Transcript
    duration_s: float                      # Audio duration
    speaker_embedding: List[float] = field(default_factory=list)
    metadata_v2: Optional[VoiceMetadataV2] = None
    metadata_embedding: List[float] = field(default_factory=list)
    usage_count: int = 0
    default_persona: str = "warm_expert"
    default_style: str = "warm_expert"

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        if self.metadata_v2:
            d["metadata_v2"] = self.metadata_v2.to_dict()
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VoiceProfileV4":
        meta_dict = data.get("metadata_v2")
        meta_obj = VoiceMetadataV2.from_dict(meta_dict) if meta_dict else None

        return cls(
            voice_id=str(data.get("voice_id", "")),
            name=str(data.get("name", "Untitled Voice V4")),
            owner_id=str(data.get("owner_id", "system_admin")),
            permission=str(data.get("permission", "public")),
            version=str(data.get("version", "4.0")),
            quality_score=float(data.get("quality_score", 90.0)),
            reference_audio=str(data.get("reference_audio", "")),
            reference_text=str(data.get("reference_text", "")),
            duration_s=float(data.get("duration_s", 0.0)),
            speaker_embedding=list(data.get("speaker_embedding", [])),
            metadata_v2=meta_obj,
            metadata_embedding=list(data.get("metadata_embedding", [])),
            usage_count=int(data.get("usage_count", 0)),
            default_persona=str(data.get("default_persona", "warm_expert")),
            default_style=str(data.get("default_style", "warm_expert"))
        )
