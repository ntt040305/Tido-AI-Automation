"""
TIDO Voice Performance Engine - Voice Quality Analyzer V2 (AI Voice Critic)
=============================================================================
Combines SpeakerEmbeddingAnalyzer, PronunciationAccuracyAnalyzer,
ProsodyAlignmentAnalyzer, and EmotionalDeliveryAnalyzer into VoiceQualityReportV2.
"""

import os
from dataclasses import dataclass, asdict
from typing import Dict, Any

from tido_engine.speaker_embedding_analyzer import SpeakerEmbeddingAnalyzer
from tido_engine.pronunciation_accuracy_analyzer import PronunciationAccuracyAnalyzer
from tido_engine.prosody_alignment_analyzer import ProsodyAlignmentAnalyzer, EmotionalDeliveryAnalyzer, ProsodyAlignmentReport

@dataclass
class VoiceQualityReportV2:
    candidate_id: str
    wave_path: str
    naturalness_score: float             # 25% weight
    speaker_similarity_score: float      # 20% weight
    pronunciation_accuracy_score: float  # 20% weight
    prosody_alignment_score: float       # 15% weight
    emotion_delivery_score: float        # 10% weight
    speech_clarity_score: float          # 10% weight
    final_composite_score: float         # 0 to 100
    prosody_details: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VoiceQualityAnalyzerV2:
    """
    AI Voice Critic V2 evaluation pipeline.
    """

    @classmethod
    def analyze_v2(
        cls,
        candidate_id: str,
        wave_path: str,
        target_text: str,
        ref_wave_path: str = None,
        target_speed: float = 1.0,
        target_pause_before_ms: int = 0,
        target_pause_after_ms: int = 200,
        target_energy_scale: float = 1.0
    ) -> VoiceQualityReportV2:

        # 1. Speaker Similarity via SpeakerEmbeddingAnalyzer
        similarity_score = SpeakerEmbeddingAnalyzer.compute_similarity(ref_wave_path, wave_path)

        # 2. Pronunciation Accuracy via PronunciationAccuracyAnalyzer
        pronunciation_score = PronunciationAccuracyAnalyzer.evaluate_pronunciation(wave_path, target_text)

        # 3. Prosody Alignment via ProsodyAlignmentAnalyzer
        prosody_report: ProsodyAlignmentReport = ProsodyAlignmentAnalyzer.evaluate_alignment(
            wave_path=wave_path,
            target_speed=target_speed,
            target_pause_before_ms=target_pause_before_ms,
            target_pause_after_ms=target_pause_after_ms,
            target_energy_scale=target_energy_scale
        )

        # 4. Emotional Delivery via EmotionalDeliveryAnalyzer
        emotion_score = EmotionalDeliveryAnalyzer.evaluate_emotion_delivery(wave_path)

        # 5. Naturalness & Clarity
        naturalness_score = round((prosody_report.overall_prosody_alignment_score * 0.5) + (emotion_score * 0.5), 1)
        clarity_score = 92.0

        # 6. COMPOSITE SCORE CALCULATION (V2 SCHEMA)
        final_score = (
            (0.25 * naturalness_score) +
            (0.20 * similarity_score) +
            (0.20 * pronunciation_score) +
            (0.15 * prosody_report.overall_prosody_alignment_score) +
            (0.10 * emotion_score) +
            (0.10 * clarity_score)
        )

        return VoiceQualityReportV2(
            candidate_id=candidate_id,
            wave_path=wave_path,
            naturalness_score=naturalness_score,
            speaker_similarity_score=similarity_score,
            pronunciation_accuracy_score=pronunciation_score,
            prosody_alignment_score=prosody_report.overall_prosody_alignment_score,
            emotion_delivery_score=emotion_score,
            speech_clarity_score=clarity_score,
            final_composite_score=round(final_score, 1),
            prosody_details=prosody_report.to_dict()
        )
