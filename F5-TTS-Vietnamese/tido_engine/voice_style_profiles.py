"""
TIDO Voice Performance Engine - Voice Style Profiles (Behavior DNA)
====================================================================
Defines VoiceStyleProfile containing behavioral delivery traits without audio data.
Decouples Speaker Identity (WHO speaks) from Delivery Style (HOW they speak).
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any

@dataclass
class VoiceStyleProfile:
    style_id: str
    display_name: str
    speed_bias: float                       # 0.88 (slow narrator) to 1.12 (urgent sales)
    pause_style: Dict[str, float]           # {"pre_pause_scale": 1.0, "post_pause_scale": 1.0}
    energy_curve: Dict[str, float]          # {"opening_scale": 1.15, "climax_scale": 1.30}
    articulation_style: str                 # "crisp", "relaxed", "authoritative", "intimate"
    emphasis_behavior: Dict[str, float]     # {"stretch_bias": 1.10, "pitch_boost_bias": 1.20}

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class StylePresets:
    """Pre-configured Voice Style Behavior DNA Presets."""

    COMMERCIAL_SELLER_STYLE = VoiceStyleProfile(
        style_id="commercial_seller",
        display_name="Commercial Seller Style",
        speed_bias=1.10,
        pause_style={"pre_pause_scale": 1.20, "post_pause_scale": 0.85},
        energy_curve={"opening_scale": 1.20, "climax_scale": 1.35},
        articulation_style="crisp",
        emphasis_behavior={"stretch_bias": 1.05, "pitch_boost_bias": 1.30}
    )

    WARM_EXPERT_STYLE = VoiceStyleProfile(
        style_id="warm_expert",
        display_name="Warm Expert Style",
        speed_bias=0.98,
        pause_style={"pre_pause_scale": 0.90, "post_pause_scale": 1.10},
        energy_curve={"opening_scale": 1.00, "climax_scale": 1.10},
        articulation_style="authoritative",
        emphasis_behavior={"stretch_bias": 1.12, "pitch_boost_bias": 1.10}
    )

    DOCUMENTARY_NARRATOR_STYLE = VoiceStyleProfile(
        style_id="documentary_narrator",
        display_name="Documentary Narrator Style",
        speed_bias=0.88,
        pause_style={"pre_pause_scale": 1.40, "post_pause_scale": 1.40},
        energy_curve={"opening_scale": 0.90, "climax_scale": 1.15},
        articulation_style="intimate",
        emphasis_behavior={"stretch_bias": 1.25, "pitch_boost_bias": 1.05}
    )

    PODCAST_HOST_STYLE = VoiceStyleProfile(
        style_id="podcast_host",
        display_name="Podcast Host Style",
        speed_bias=1.02,
        pause_style={"pre_pause_scale": 1.00, "post_pause_scale": 1.00},
        energy_curve={"opening_scale": 1.05, "climax_scale": 1.15},
        articulation_style="relaxed",
        emphasis_behavior={"stretch_bias": 1.10, "pitch_boost_bias": 1.15}
    )

    @classmethod
    def get_by_style_id(cls, style_id: str) -> VoiceStyleProfile:
        style_map = {
            "commercial_seller": cls.COMMERCIAL_SELLER_STYLE,
            "warm_expert": cls.WARM_EXPERT_STYLE,
            "documentary_narrator": cls.DOCUMENTARY_NARRATOR_STYLE,
            "podcast_host": cls.PODCAST_HOST_STYLE
        }
        return style_map.get(style_id, cls.COMMERCIAL_SELLER_STYLE)
