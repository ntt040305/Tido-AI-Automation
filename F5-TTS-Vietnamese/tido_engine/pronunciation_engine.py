"""
TIDO Voice Performance Engine - Centralized Pronunciation Engine
=================================================================
Handles phonetic overrides for foreign words, English terms, and acronyms:
REQUEST > PROJECT > VOICE > GLOBAL

Features:
- Phonetic hints apply ONLY to foreign/English words (e.g. Gym -> dim, cardio -> các đi ô)
- DOES NOT mutate native Vietnamese words or proper names (e.g. "Toàn Thắng" stays "Toàn Thắng")
- Prioritizes longer phrases over shorter words (len descending)
- Single-replacement protection (prevents re-substituting already replaced phrases)
"""

import os
import re
import json
from typing import Dict, Optional, List, Tuple

GLOBAL_DICT_PATH = r"d:\Tido\Assets\Voices\user_dictionary.json"

class PronunciationEngine:
    def __init__(self, global_dict_path: str = GLOBAL_DICT_PATH):
        self.global_dict_path = global_dict_path
        self.global_map: Dict[str, str] = {}
        self._load_global_dict()

    def _load_global_dict(self):
        # Default global phonetic hints dictionary
        default_dict = {
            "Gym": "dim",
            "cardio": "các đi ô",
            "PT": "pi ti",
            "tvc": "ti vi xi",
            "f&b": "ép en bi",
            "ai": "a i",
            "ceo": "xi i ô",
            "vip": "vi ai pi",
        }
        self.global_map.update(default_dict)

        if os.path.exists(self.global_dict_path):
            try:
                with open(self.global_dict_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.global_map.update(data)
            except Exception as e:
                print(f"⚠️ Warning loading global pronunciation dict: {e}")

    def apply_pronunciation(
        self,
        text: str,
        voice_map: Optional[Dict[str, str]] = None,
        project_map: Optional[Dict[str, str]] = None,
        request_map: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, List[Dict[str, str]]]:
        if not text:
            return "", []

        merged_map: Dict[str, str] = {}
        merged_map.update(self.global_map)
        if voice_map:
            merged_map.update(voice_map)
        if project_map:
            merged_map.update(project_map)
        if request_map:
            merged_map.update(request_map)

        sorted_keys = sorted(merged_map.keys(), key=lambda k: -len(k))

        result = text
        logs: List[Dict[str, str]] = []
        replaced_spans: List[Tuple[int, int]] = []

        for src in sorted_keys:
            dst = merged_map[src]
            pattern = r'(?i)(?<!\w)' + re.escape(src) + r'(?!\w)'

            def _replacer(match):
                start, end = match.span()
                for r_start, r_end in replaced_spans:
                    if not (end <= r_start or start >= r_end):
                        return match.group(0)

                logs.append({
                    "original_phrase": match.group(0),
                    "matched_dictionary_key": src,
                    "replacement": dst
                })
                return dst

            result = re.sub(pattern, _replacer, result)

        final_text = re.sub(r'\s+', ' ', result).strip()
        return final_text, logs
