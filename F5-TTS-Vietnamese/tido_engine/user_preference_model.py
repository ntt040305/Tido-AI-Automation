"""
TIDO Voice Performance Engine - User Preference Model
=====================================================
Maintains per-user preference profiles (preferred voices, styles, energy levels, pacing)
and updates dynamically based on user interaction and rendering feedback.
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List

@dataclass
class UserPreferenceProfile:
    user_id: str
    preferred_voices: Dict[str, float] = field(default_factory=dict)   # voice_id -> weight boost
    preferred_styles: Dict[str, float] = field(default_factory=dict)   # style_name -> weight boost
    preferred_energy: str = "medium"                                    # "high", "medium", "calm"
    preferred_pacing: str = "normal"                                    # "fast", "normal", "slow"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class UserPreferenceModel:
    """
    User preference profile manager.
    """

    def __init__(self):
        self._profiles: Dict[str, UserPreferenceProfile] = {}

    def get_or_create_profile(self, user_id: str) -> UserPreferenceProfile:
        if user_id not in self._profiles:
            self._profiles[user_id] = UserPreferenceProfile(user_id=user_id)
        return self._profiles[user_id]

    def update_preference(
        self,
        user_id: str,
        selected_voice_id: str,
        selected_style: str,
        rating: float
    ) -> UserPreferenceProfile:
        prof = self.get_or_create_profile(user_id)

        # Rating scale 1.0 to 5.0 -> delta boost
        delta = (rating - 3.0) * 0.10

        prof.preferred_voices[selected_voice_id] = round(prof.preferred_voices.get(selected_voice_id, 1.0) + delta, 2)
        prof.preferred_styles[selected_style] = round(prof.preferred_styles.get(selected_style, 1.0) + delta, 2)

        return prof
