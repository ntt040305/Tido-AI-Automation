"""
TIDO Voice Performance Engine - Humanization Strategy Resolver
===============================================================
Resolves structured content context (genre, platform, audience, objective)
into a humanization profile definition loaded from external JSON config.
"""

import os
import json
from typing import Dict, Any, Optional, Tuple

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "humanization_profiles.json")

class HumanizationStrategyResolver:
    """
    Strategy resolver for selecting humanization profiles externally.
    """

    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.profiles = self._load_profiles()

    def _load_profiles(self) -> Dict[str, Any]:
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        # Fallback inline profiles
        return {
            "commercial_soft": {
                "expression_limit": 2,
                "pause_intensity": 0.5,
                "emotion_strength": 0.7,
                "spoken_style_strength": 0.6,
                "ending_style": "confident_close"
            },
            "documentary": {
                "expression_limit": 0,
                "pause_intensity": 0.9,
                "emotion_strength": 0.8,
                "spoken_style_strength": 0.4,
                "ending_style": "cinematic"
            },
            "podcast": {
                "expression_limit": 3,
                "pause_intensity": 0.8,
                "emotion_strength": 0.6,
                "spoken_style_strength": 0.8,
                "ending_style": "soft_landing"
            }
        }

    def resolve_strategy(self, context: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        genre = str(context.get("genre", "commercial")).lower()
        platform = str(context.get("platform", "tiktok")).lower()
        objective = str(context.get("objective", "sell")).lower()

        profile_name = "commercial_soft"
        if "doc" in genre or "history" in genre or "tài liệu" in genre:
            profile_name = "documentary"
        elif "podcast" in genre or "talk" in genre or "chia sẻ" in genre:
            profile_name = "podcast"
        elif "story" in genre or "kể chuyện" in genre:
            profile_name = "storytelling"
        elif "sell" in objective or "ad" in genre or "quảng cáo" in genre:
            profile_name = "commercial_energetic" if platform in ["tiktok", "reels"] else "commercial_soft"

        profile_config = self.profiles.get(profile_name, self.profiles.get("commercial_soft"))
        return profile_name, profile_config
