"""
TIDO Voice Performance Engine - V2 Schemas & Data Models
=========================================================
Data classes and validation for PerformanceScriptV2, SegmentV2,
PerformanceInstruction, and PronunciationInstruction.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional

@dataclass
class PronunciationInstruction:
    word: str
    phonetic_override: str

    def to_dict(self) -> Dict[str, str]:
        return {"word": self.word, "phonetic_override": self.phonetic_override}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PronunciationInstruction":
        return cls(
            word=str(data.get("word", "")),
            phonetic_override=str(data.get("phonetic_override", ""))
        )

@dataclass
class EmotionStateV2:
    primary_emotion: str = "neutral"
    valence: float = 0.0      # -1.0 (negative) to 1.0 (positive)
    arousal: float = 0.5      # 0.0 (calm) to 1.0 (excited)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "primary_emotion": self.primary_emotion,
            "valence": self.valence,
            "arousal": self.arousal
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EmotionStateV2":
        return cls(
            primary_emotion=str(data.get("primary_emotion", "neutral")),
            valence=float(data.get("valence", 0.0)),
            arousal=float(data.get("arousal", 0.5))
        )

@dataclass
class PauseInstructionV2:
    pause_before_ms: int = 0
    pause_after_ms: int = 200
    breath_inset: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pause_before_ms": self.pause_before_ms,
            "pause_after_ms": self.pause_after_ms,
            "breath_inset": self.breath_inset
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PauseInstructionV2":
        return cls(
            pause_before_ms=int(data.get("pause_before_ms", 0)),
            pause_after_ms=int(data.get("pause_after_ms", 200)),
            breath_inset=bool(data.get("breath_inset", False))
        )

@dataclass
class PitchBehaviorV2:
    contour: str = "dynamic_range"   # rising_question, falling_final, flat, dynamic_range
    pitch_shift_semitones: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "contour": self.contour,
            "pitch_shift_semitones": self.pitch_shift_semitones
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PitchBehaviorV2":
        return cls(
            contour=str(data.get("contour", "dynamic_range")),
            pitch_shift_semitones=float(data.get("pitch_shift_semitones", 0.0))
        )

@dataclass
class PerformanceInstruction:
    segment_role: str = "explanation"       # hook, problem, solution, call_to_action, explanation
    speaking_intent: str = "inform"          # persuade, inform, entertain, reassure, hype
    emotion_state: EmotionStateV2 = field(default_factory=EmotionStateV2)
    speaker_attitude: str = "friendly"       # authoritative, friendly, urgent, intimate, confident
    energy_level: str = "medium"             # whisper, low, medium, high, explosive
    emphasis_words: List[Dict[str, str]] = field(default_factory=list)
    pause_instruction: PauseInstructionV2 = field(default_factory=PauseInstructionV2)
    pitch_behavior: PitchBehaviorV2 = field(default_factory=PitchBehaviorV2)
    speed_ratio: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_role": self.segment_role,
            "speaking_intent": self.speaking_intent,
            "emotion_state": self.emotion_state.to_dict(),
            "speaker_attitude": self.speaker_attitude,
            "energy_level": self.energy_level,
            "emphasis_words": self.emphasis_words,
            "pause_instruction": self.pause_instruction.to_dict(),
            "pitch_behavior": self.pitch_behavior.to_dict(),
            "speed_ratio": self.speed_ratio
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PerformanceInstruction":
        return cls(
            segment_role=str(data.get("segment_role", "explanation")),
            speaking_intent=str(data.get("speaking_intent", "inform")),
            emotion_state=EmotionStateV2.from_dict(data.get("emotion_state", {})),
            speaker_attitude=str(data.get("speaker_attitude", "friendly")),
            energy_level=str(data.get("energy_level", "medium")),
            emphasis_words=list(data.get("emphasis_words", [])),
            pause_instruction=PauseInstructionV2.from_dict(data.get("pause_instruction", {})),
            pitch_behavior=PitchBehaviorV2.from_dict(data.get("pitch_behavior", {})),
            speed_ratio=float(data.get("speed_ratio", 1.0))
        )

@dataclass
class SegmentV2:
    segment_id: str
    text: str
    performance: PerformanceInstruction = field(default_factory=PerformanceInstruction)
    pronunciation_overrides: List[PronunciationInstruction] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "text": self.text,
            "performance": self.performance.to_dict(),
            "pronunciation_overrides": [p.to_dict() for p in self.pronunciation_overrides]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SegmentV2":
        pron_list = [
            PronunciationInstruction.from_dict(p)
            for p in data.get("pronunciation_overrides", [])
        ]
        return cls(
            segment_id=str(data.get("segment_id", "")),
            text=str(data.get("text", "")),
            performance=PerformanceInstruction.from_dict(data.get("performance", {})),
            pronunciation_overrides=pron_list
        )

@dataclass
class PerformanceScriptV2:
    title: str
    voice_id: str
    global_genre: str = "tiktok_ads"
    target_audience: str = "general"
    segments: List[SegmentV2] = field(default_factory=list)

    def validate(self) -> bool:
        """Validates that all required fields are present and non-empty."""
        if not self.title or not isinstance(self.title, str):
            raise ValueError("PerformanceScriptV2 missing valid 'title'")
        if not self.voice_id or not isinstance(self.voice_id, str):
            raise ValueError("PerformanceScriptV2 missing valid 'voice_id'")
        if not isinstance(self.segments, list) or len(self.segments) == 0:
            raise ValueError("PerformanceScriptV2 must contain at least 1 segment")
        for seg in self.segments:
            if not seg.segment_id:
                raise ValueError("SegmentV2 missing 'segment_id'")
            if not seg.text:
                raise ValueError(f"SegmentV2 '{seg.segment_id}' missing 'text'")
        return True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": "2.0",
            "metadata": {
                "title": self.title,
                "voice_id": self.voice_id,
                "global_genre": self.global_genre,
                "target_audience": self.target_audience
            },
            "segments": [s.to_dict() for s in self.segments]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PerformanceScriptV2":
        meta = data.get("metadata", {})
        seg_list = [SegmentV2.from_dict(s) for s in data.get("segments", [])]
        instance = cls(
            title=str(meta.get("title", "Untitled Script")),
            voice_id=str(meta.get("voice_id", "vo_motaro_kb19")),
            global_genre=str(meta.get("global_genre", "tiktok_ads")),
            target_audience=str(meta.get("target_audience", "general")),
            segments=seg_list
        )
        instance.validate()
        return instance
