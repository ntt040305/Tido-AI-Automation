"""
TIDO Voice Performance Engine - Voice & Style Recommendation Engines
======================================================================
Provides intelligent voice and style recommendation algorithms driven by script context,
LLM metadata (genre, audience, emotion, platform), and performance metrics.
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from tido_engine.voice_profile_v4 import VoiceProfileV4

@dataclass
class VoiceRecommendation:
    voice_id: str
    recommended_persona: str
    recommended_style: str
    confidence_score: float             # 0.0 to 1.0
    reasoning: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class StyleRecommendation:
    persona: str
    style: str
    confidence_score: float
    reasoning: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class StyleRecommendationEngine:
    """
    Recommends Persona & Style based on script LLM metadata.
    """

    @classmethod
    def recommend_style(
        cls,
        genre: str = "commercial",
        audience: str = "general",
        emotion: str = "excited",
        platform: str = "TikTok"
    ) -> StyleRecommendation:
        g = genre.lower()
        p = platform.lower()
        e = emotion.lower()

        if "tiktok" in p or "bán hàng" in g or "seller" in g or "commercial" in g:
            return StyleRecommendation(
                persona="commercial_seller",
                style="commercial_seller",
                confidence_score=0.95,
                reasoning="High energy sales persona ideal for short-form video conversion."
            )
        elif "podcast" in g or "storytelling" in g or "narrative" in g:
            return StyleRecommendation(
                persona="podcast_host",
                style="podcast_host",
                confidence_score=0.92,
                reasoning="Conversational, organic style optimized for narrative engagement."
            )
        elif "documentary" in g or "trầm" in e:
            return StyleRecommendation(
                persona="documentary_narrator",
                style="documentary_narrator",
                confidence_score=0.90,
                reasoning="Deep, authoritative narration style for educational/documentary content."
            )
        else:
            return StyleRecommendation(
                persona="warm_expert",
                style="warm_expert",
                confidence_score=0.88,
                reasoning="Warm, reassuring advisor style suitable for professional guidance."
            )

class VoiceRecommendationEngine:
    """
    Recommends target voice profiles driven by script context.
    """

    @classmethod
    def recommend_for_script(
        cls,
        script_context: str,
        available_voices: List[VoiceProfileV4]
    ) -> List[VoiceRecommendation]:
        ctx_lower = script_context.lower()

        # Parse target audience & style needs
        is_female_target = any(k in ctx_lower for k in ["nữ", "mỹ phẩm", "làm đẹp", "spa", "chăm sóc"])
        is_seller = any(k in ctx_lower for k in ["quảng cáo", "giảm giá", "khuyến mãi", "bán hàng", "mua ngay"])

        recommendations: List[VoiceRecommendation] = []

        for prof in available_voices:
            meta = prof.metadata_v2
            if not meta:
                continue

            conf = 0.50
            reasons = []

            if is_female_target and meta.gender == "female":
                conf += 0.25
                reasons.append("Matches female audience target.")

            if is_seller and meta.speaking_style == "commercial_seller":
                conf += 0.20
                reasons.append("High sales converter style match.")
            elif not is_seller and meta.speaking_style == "warm_expert":
                conf += 0.15
                reasons.append("Expert advisory style match.")

            if prof.quality_score > 90.0:
                conf += 0.05

            conf = min(0.99, conf)
            target_style = "commercial_seller" if is_seller else prof.default_style

            recommendations.append(VoiceRecommendation(
                voice_id=prof.voice_id,
                recommended_persona=prof.default_persona,
                recommended_style=target_style,
                confidence_score=round(conf, 2),
                reasoning="; ".join(reasons) if reasons else "General baseline match."
            ))

        recommendations.sort(key=lambda r: r.confidence_score, reverse=True)
        return recommendations
