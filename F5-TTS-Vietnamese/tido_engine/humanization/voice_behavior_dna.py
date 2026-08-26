"""
TIDO Voice Performance Engine - Voice Behavior DNA
===================================================
Data structure defining per-speaker delivery personality traits:
- pause_style
- sentence_length_preference
- breath_style
- energy_curve
- ending_style
- question_style
"""

from dataclasses import dataclass, asdict
from typing import Dict, Any

@dataclass
class VoiceBehaviorDNA:
    pause_style: str = "balanced"                 # punchy, balanced, deep
    sentence_length_preference: str = "medium"    # short, medium, long
    breath_style: str = "natural"                 # minimal, natural, expressive
    energy_curve: str = "dynamic"                 # flat, dynamic, climax_end
    ending_style: str = "warm"                    # warm, crisp, lingering
    question_style: str = "rising"                # flat, rising, melodic

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VoiceBehaviorDNA":
        if not data:
            return cls()
        return cls(
            pause_style=str(data.get("pause_style", "balanced")),
            sentence_length_preference=str(data.get("sentence_length_preference", "medium")),
            breath_style=str(data.get("breath_style", "natural")),
            energy_curve=str(data.get("energy_curve", "dynamic")),
            ending_style=str(data.get("ending_style", "warm")),
            question_style=str(data.get("question_style", "rising"))
        )

    @classmethod
    def get_preset(cls, preset_name: str) -> "VoiceBehaviorDNA":
        presets = {
            "commercial_seller": cls(
                pause_style="punchy",
                sentence_length_preference="short",
                breath_style="minimal",
                energy_curve="climax_end",
                ending_style="crisp",
                question_style="rising"
            ),
            "warm_expert": cls(
                pause_style="deep",
                sentence_length_preference="medium",
                breath_style="expressive",
                energy_curve="dynamic",
                ending_style="warm",
                question_style="melodic"
            ),
            "documentary_narrator": cls(
                pause_style="balanced",
                sentence_length_preference="long",
                breath_style="natural",
                energy_curve="dynamic",
                ending_style="lingering",
                question_style="flat"
            )
        }
        return presets.get(preset_name.lower(), cls())
