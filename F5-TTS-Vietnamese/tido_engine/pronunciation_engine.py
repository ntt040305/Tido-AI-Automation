"""
TIDO Voice Performance Engine - Centralized Pronunciation Engine
=================================================================
Handles phonetic overrides for brand names, English words, technical terms, 
and proper nouns with hierarchical priority:
REQUEST > PROJECT > VOICE > GLOBAL
"""

import os
import re
import json
from typing import Dict, Optional

# [FIX 7] Dùng paths.py thay vì hardcode path Windows
from tido_engine.paths import USER_DICTIONARY_PATH

GLOBAL_DICT_PATH = USER_DICTIONARY_PATH

class PronunciationEngine:
    def __init__(self, global_dict_path: str = GLOBAL_DICT_PATH):
        self.global_dict_path = global_dict_path
        self.global_map: Dict[str, str] = {
            "jomoo": "jo mo",
            "gym": "gim",
            "shot": "sốt",
            "sale": "seo",
            "royals": "roi ơ",
            "royal": "roi ơ",
            "miss": "mít",
            "fashion": "phe sần",
            "smart": "sờ mát",
            "phone": "phôn",
            "voucher": "vâu chờ",
            "combo": "com bô",
            "hotline": "hốt lai",
            "website": "web sai",
            "online": "on lai",
            "video": "vi đê ô",
            "app": "áp",
            "facebook": "phây búc",
            "tiktok": "tíc tót",
            "zalo": "za lô",
        }
        self._load_global_dict()

    def _load_global_dict(self):
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
    ) -> str:
        if not text:
            return ""

        # Build merged dictionary respecting priority: REQUEST > PROJECT > VOICE > GLOBAL
        merged_map: Dict[str, str] = {}
        merged_map.update(self.global_map)
        
        if voice_map:
            merged_map.update(voice_map)
        if project_map:
            merged_map.update(project_map)
        if request_map:
            merged_map.update(request_map)

        # Sort by key length descending to prevent substring collisions
        sorted_keys = sorted(merged_map.keys(), key=lambda k: -len(k))
        
        result = text
        for src in sorted_keys:
            dst = merged_map[src]
            # Case-insensitive word boundary replacement
            pattern = r'(?i)(?<!\w)' + re.escape(src) + r'(?!\w)'
            result = re.sub(pattern, dst, result)

        return re.sub(r'\s+', ' ', result).strip()
