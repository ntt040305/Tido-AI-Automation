"""
TIDO Voice Performance Engine - Voice Library Manager
======================================================
Manages CRUD operations for VoiceProfileV3 instances in the central voice library registry.
"""

import json
import os
from typing import List, Dict, Optional
from tido_engine.voice_profile_v3 import VoiceProfileV3

class VoiceLibraryManager:
    """
    Central Voice Library storage and management system.
    """

    def __init__(self, library_db_path: str = r"d:\Tido\Assets\Voices\voice_library_v3.json"):
        self.library_db_path = library_db_path
        self._profiles: Dict[str, VoiceProfileV3] = {}
        self.reload_library()

    def reload_library(self) -> None:
        self._profiles.clear()
        if os.path.exists(self.library_db_path):
            try:
                with open(self.library_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data.get("voices", []):
                        prof = VoiceProfileV3.from_dict(item)
                        self._profiles[prof.voice_id] = prof
            except Exception as e:
                print(f"[WARNING] Could not parse voice library JSON: {e}")

    def save_library(self) -> None:
        os.makedirs(os.path.dirname(self.library_db_path), exist_ok=True)
        data = {
            "version": "3.0",
            "total_voices": len(self._profiles),
            "voices": [prof.to_dict() for prof in self._profiles.values()]
        }
        with open(self.library_db_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def add_voice(self, profile: VoiceProfileV3) -> None:
        self._profiles[profile.voice_id] = profile
        self.save_library()

    def load_voice(self, voice_id: str) -> Optional[VoiceProfileV3]:
        return self._profiles.get(voice_id)

    def list_voices(self) -> List[VoiceProfileV3]:
        return list(self._profiles.values())

    def delete_voice(self, voice_id: str) -> bool:
        if voice_id in self._profiles:
            del self._profiles[voice_id]
            self.save_library()
            return True
        return False
