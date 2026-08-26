"""
TIDO Voice Performance Engine - Legacy V1 to V2 Script Migrator
================================================================
Provides automated conversion from legacy V1 script schema {text, emotion, pacing}
to the comprehensive V2 PerformanceScriptV2 schema.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import (
    PerformanceScriptV2,
    SegmentV2,
    PerformanceInstruction,
    EmotionStateV2,
    PauseInstructionV2,
    PitchBehaviorV2,
    PronunciationInstruction
)

class LegacyScriptMigrator:
    @staticmethod
    def _map_emotion_to_v2(raw_emotion: str, intensity: float = 0.5) -> tuple:
        """
        Maps legacy emotion string to (segment_role, speaking_intent, emotion_state, speaker_attitude, energy_level).
        """
        el = (raw_emotion or "").lower()

        if any(k in el for k in ["gợi mở", "truyền động lực", "nhấn mạnh"]):
            return (
                "hook",
                "persuade",
                EmotionStateV2(primary_emotion="excited", valence=0.7, arousal=0.8),
                "confident",
                "high"
            )
        elif any(k in el for k in ["hào hứng", "mạnh mẽ", "bão sale", "energetic", "urgent"]):
            return (
                "call_to_action",
                "hype",
                EmotionStateV2(primary_emotion="excited", valence=0.8, arousal=0.9),
                "urgent",
                "explosive"
            )
        elif any(k in el for k in ["thì thầm", "warm", "ấm áp", "tận tâm"]):
            return (
                "testimonial",
                "reassure",
                EmotionStateV2(primary_emotion="warm", valence=0.6, arousal=0.3),
                "intimate",
                "whisper"
            )
        elif any(k in el for k in ["chuyên nghiệp", "giới thiệu", "chắc chắn"]):
            return (
                "explanation",
                "inform",
                EmotionStateV2(primary_emotion="neutral", valence=0.2, arousal=0.5),
                "authoritative",
                "medium"
            )
        else:
            return (
                "explanation",
                "inform",
                EmotionStateV2(primary_emotion="neutral", valence=0.0, arousal=0.5),
                "friendly",
                "medium"
            )

    @staticmethod
    def _map_pacing_to_speed_and_pause(raw_pacing: str, user_pause_after: float = None) -> tuple:
        """
        Maps legacy pacing string to speed_ratio and PauseInstructionV2.
        """
        pl = (raw_pacing or "").lower()
        if "nhanh" in pl:
            speed_ratio = 1.12
            default_pause_ms = 150
        elif "chậm" in pl:
            speed_ratio = 0.90
            default_pause_ms = 300
        else:
            speed_ratio = 1.0
            default_pause_ms = 220

        if user_pause_after is not None:
            pause_after_ms = int(float(user_pause_after) * 1000)
        else:
            pause_after_ms = default_pause_ms

        return speed_ratio, PauseInstructionV2(pause_before_ms=0, pause_after_ms=pause_after_ms)

    @classmethod
    def migrate(cls, v1_data: Dict[str, Any]) -> PerformanceScriptV2:
        """
        Migrates a full V1 script dictionary into a validated PerformanceScriptV2 instance.
        """
        meta = v1_data.get("metadata", {})
        title = meta.get("title", "Migrated Script V2")
        voice_id = meta.get("voice_id", "vo_motaro_kb19")
        
        segments_v1 = v1_data.get("segments", [])
        segments_v2 = []

        for idx, seg in enumerate(segments_v1):
            seg_id = f"seg_{idx + 1:03d}"
            text = seg.get("text", "")
            raw_emotion = seg.get("emotion", "neutral")
            raw_pacing = seg.get("pacing", "bình thường")
            intensity = float(seg.get("intensity", 0.5))
            pause_after = seg.get("pause_after")

            role, intent, emotion_state, attitude, energy = cls._map_emotion_to_v2(raw_emotion, intensity)
            speed_ratio, pause_inst = cls._map_pacing_to_speed_and_pause(raw_pacing, pause_after)

            # Check for inline tag emphasis
            emphasis_words = []
            if "[nhấn mạnh]" in text or "[emphasis]" in text:
                emphasis_words.append({"word": "khỏe hơn", "type": "pitch_boost"})

            pron_overrides = []
            if "pronunciation_overrides" in seg:
                po = seg["pronunciation_overrides"]
                if isinstance(po, dict):
                    for k, v in po.items():
                        pron_overrides.append(PronunciationInstruction(word=k, phonetic_override=v))
                elif isinstance(po, list):
                    for item in po:
                        if isinstance(item, dict):
                            pron_overrides.append(PronunciationInstruction(word=item.get("word", ""), phonetic_override=item.get("phonetic_override", "")))

            perf_inst = PerformanceInstruction(
                segment_role=role,
                speaking_intent=intent,
                emotion_state=emotion_state,
                speaker_attitude=attitude,
                energy_level=energy,
                emphasis_words=emphasis_words,
                pause_instruction=pause_inst,
                pitch_behavior=PitchBehaviorV2(contour="dynamic_range", pitch_shift_semitones=0.0),
                speed_ratio=speed_ratio
            )

            segments_v2.append(SegmentV2(
                segment_id=seg_id,
                text=text,
                performance=perf_inst,
                pronunciation_overrides=pron_overrides
            ))

        v2_script = PerformanceScriptV2(
            title=title,
            voice_id=voice_id,
            global_genre="tiktok_ads",
            target_audience="general",
            segments=segments_v2
        )
        v2_script.validate()
        return v2_script
