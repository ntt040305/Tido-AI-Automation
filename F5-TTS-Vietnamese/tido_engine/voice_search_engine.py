"""
TIDO Voice Performance Engine - Voice Search Engine & Ranking Engine
=====================================================================
Natural language query parser, semantic metadata filter, and multi-attribute ranking score.
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from tido_engine.voice_profile_v4 import VoiceProfileV4

@dataclass
class SearchQueryIntent:
    raw_query: str
    target_gender: Optional[str] = None
    target_accent: Optional[str] = None
    target_style: Optional[str] = None
    target_keywords: List[str] = None

class VoiceSearchEngine:
    """
    Natural language search query engine for voice profiles.
    """

    @classmethod
    def parse_query(cls, query: str) -> SearchQueryIntent:
        q_lower = query.lower()

        # Parse Gender
        gender = None
        if "nữ" in q_lower or "gái" in q_lower or "female" in q_lower:
            gender = "female"
        elif "nam" in q_lower or "trai" in q_lower or "male" in q_lower:
            gender = "male"

        # Parse Accent
        accent = None
        if "miền bắc" in q_lower or "bắc" in q_lower or "northern" in q_lower:
            accent = "Northern"
        elif "miền nam" in q_lower or "nam" in q_lower or "southern" in q_lower:
            accent = "Southern"
        elif "miền trung" in q_lower or "trung" in q_lower:
            accent = "Central"

        # Parse Style
        style = None
        if "ấm áp" in q_lower or "chuyên gia" in q_lower or "expert" in q_lower:
            style = "warm_expert"
        elif "quảng cáo" in q_lower or "bán hàng" in q_lower or "seller" in q_lower:
            style = "commercial_seller"
        elif "thuyết minh" in q_lower or "kể chuyện" in q_lower or "narrator" in q_lower:
            style = "documentary_narrator"

        return SearchQueryIntent(
            raw_query=query,
            target_gender=gender,
            target_accent=accent,
            target_style=style,
            target_keywords=query.split()
        )

    @classmethod
    def search_voices(cls, query: str, library_v4: List[VoiceProfileV4]) -> List[VoiceProfileV4]:
        intent = cls.parse_query(query)
        matches: List[VoiceProfileV4] = []

        for prof in library_v4:
            meta = prof.metadata_v2
            if not meta:
                continue

            match_score = 0
            if intent.target_gender and meta.gender == intent.target_gender:
                match_score += 1
            if intent.target_accent and meta.accent == intent.target_accent:
                match_score += 1
            if intent.target_style and meta.speaking_style == intent.target_style:
                match_score += 1

            if match_score > 0 or not (intent.target_gender or intent.target_accent or intent.target_style):
                matches.append(prof)

        return matches

class VoiceRankingEngine:
    """
    Multi-attribute ranking score for sorting voice search results.
    """

    @classmethod
    def compute_ranking_score(cls, profile: VoiceProfileV4, query_intent: SearchQueryIntent) -> float:
        meta = profile.metadata_v2
        if not meta:
            return profile.quality_score * 0.5

        # 1. Similarity & Metadata Match Score (35%)
        match_count = 0
        total_targets = 0

        if query_intent.target_gender:
            total_targets += 1
            if meta.gender == query_intent.target_gender:
                match_count += 1

        if query_intent.target_accent:
            total_targets += 1
            if meta.accent == query_intent.target_accent:
                match_count += 1

        if query_intent.target_style:
            total_targets += 1
            if meta.speaking_style == query_intent.target_style:
                match_count += 1

        match_ratio = (match_count / float(total_targets)) if total_targets > 0 else 1.0
        similarity_score = match_ratio * 100.0

        # 2. Quality Score (30%)
        quality_score = profile.quality_score

        # 3. Style Compatibility Score (20%)
        style_score = 95.0 if (query_intent.target_style and meta.speaking_style == query_intent.target_style) else 80.0

        # 4. Usage Frequency Score (15%)
        usage_score = min(100.0, 70.0 + (profile.usage_count * 3.0))

        # Weighted Ranking Formula
        final_rank = (
            (0.35 * similarity_score) +
            (0.30 * quality_score) +
            (0.20 * style_score) +
            (0.15 * usage_score)
        )

        return round(final_rank, 1)

    @classmethod
    def rank_voices(cls, profiles: List[VoiceProfileV4], query_intent: SearchQueryIntent) -> List[VoiceProfileV4]:
        ranked = sorted(profiles, key=lambda p: cls.compute_ranking_score(p, query_intent), reverse=True)
        return ranked
