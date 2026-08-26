"""
TIDO Voice Performance Engine - Humanization Context Resolver
=============================================================
Analyzes natural language script description strings or metadata tags
to extract structured content context and map it to a humanization profile.
"""

from typing import Dict, Any, Tuple
from tido_engine.humanization.humanization_strategy import HumanizationStrategyResolver

class HumanizationContextResolver:
    """
    Context resolver analyzing raw text descriptions into strategy profiles.
    """

    def __init__(self):
        self.strategy_resolver = HumanizationStrategyResolver()

    def resolve_from_description(self, description_str: str) -> Tuple[str, Dict[str, Any]]:
        """
        Parses description string e.g. "quảng cáo mỹ phẩm chăm sóc da" -> commercial_soft
        """
        desc_lower = description_str.lower() if description_str else ""

        if any(w in desc_lower for w in ["tài liệu", "lịch sử", "phim tài liệu", "documentary"]):
            genre = "documentary"
            platform = "youtube"
            objective = "inform"
        elif any(w in desc_lower for w in ["podcast", "tâm sự", "chia sẻ", "trò chuyện"]):
            genre = "podcast"
            platform = "spotify"
            objective = "connect"
        elif any(w in desc_lower for w in ["truyện", "kể chuyện", "storytelling"]):
            genre = "storytelling"
            platform = "audiobook"
            objective = "entertain"
        else:
            # Default commercial
            genre = "commercial"
            platform = "tiktok" if "tiktok" in desc_lower else "facebook"
            objective = "sell"

        context = {
            "genre": genre,
            "platform": platform,
            "objective": objective,
            "raw_description": description_str
        }

        profile_name, profile_config = self.strategy_resolver.resolve_strategy(context)
        return profile_name, profile_config
