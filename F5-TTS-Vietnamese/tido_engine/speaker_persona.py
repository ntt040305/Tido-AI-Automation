"""
TIDO Voice Performance Engine - Speaker Persona System
======================================================
Defines SpeakerPersona data class and presets representing WHO the speaker is
and their inherent character traits (Authority, Warmth, Energy Baseline).
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any

@dataclass
class SpeakerPersona:
    persona_id: str
    name: str
    traits: List[str]
    authority_level: float           # 0.0 (relaxed) to 1.0 (authoritative)
    warmth: float                    # 0.0 (distant/neutral) to 1.0 (very warm)
    energy_baseline: float           # 0.0 (calm) to 1.0 (high energy)
    communication_style: str         # "commercial_seller", "warm_expert", "documentary_narrator", "podcast_host"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class PersonaPresets:
    """Pre-configured speaker persona definitions."""

    COMMERCIAL_SELLER = SpeakerPersona(
        persona_id="persona_seller_01",
        name="Commercial Seller / High Converter",
        traits=["persuasive", "energetic", "urgent", "confident"],
        authority_level=0.85,
        warmth=0.40,
        energy_baseline=0.90,
        communication_style="commercial_seller"
    )

    WARM_EXPERT = SpeakerPersona(
        persona_id="persona_expert_01",
        name="Warm Expert / Trusted Advisor",
        traits=["knowledgeable", "reassuring", "empathic", "calm"],
        authority_level=0.80,
        warmth=0.85,
        energy_baseline=0.55,
        communication_style="warm_expert"
    )

    DOCUMENTARY_NARRATOR = SpeakerPersona(
        persona_id="persona_narrator_01",
        name="Documentary Narrator / Storyteller",
        traits=["dramatic", "deep", "measured", "engaging"],
        authority_level=0.90,
        warmth=0.50,
        energy_baseline=0.45,
        communication_style="documentary_narrator"
    )

    PODCAST_HOST = SpeakerPersona(
        persona_id="persona_podcast_01",
        name="Podcast Host / Conversationalist",
        traits=["friendly", "casual", "expressive", "natural"],
        authority_level=0.50,
        warmth=0.75,
        energy_baseline=0.65,
        communication_style="podcast_host"
    )

    @classmethod
    def get_by_id(cls, persona_id: str) -> SpeakerPersona:
        id_map = {
            "commercial_seller": cls.COMMERCIAL_SELLER,
            "warm_expert": cls.WARM_EXPERT,
            "documentary_narrator": cls.DOCUMENTARY_NARRATOR,
            "podcast_host": cls.PODCAST_HOST
        }
        return id_map.get(persona_id, cls.WARM_EXPERT)
