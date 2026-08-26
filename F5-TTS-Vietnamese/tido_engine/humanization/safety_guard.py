"""
TIDO Voice Performance Engine - Humanization Safety Guard
===========================================================
Protects brand names, product titles, numbers, percentages, legal claims,
and key marketing terms from unauthorized mutation during text humanization.
"""

import re
from typing import List, Dict, Tuple, Any, Optional

class SafetyGuard:
    """
    Entity locking and transformation validation module.
    Ensures zero mutation of protected speech entities.
    """

    # Regex patterns for protected entities
    NUMBER_PATTERN = r'\b\d+([\,\.]\d+)?\s*(%|mét vuông|m²|tuổi|kg|cm|m|s|giây|phút|giờ|đồng|k|tr|triệu|tỷ)?\b'
    CAPITALIZED_BRAND_PATTERN = r'\b[A-Z][a-zA-Z0-9]*(\s+[A-Z][a-zA-Z0-9]*)+\b'

    DEFAULT_PROTECTED_ENTITIES = [
        "Gym Toàn Thắng", "Toàn Thắng", "Tido AI", "Tido Voice",
        "Mizaki", "F5-TTS", "ViVoice"
    ]

    @classmethod
    def extract_protected_entities(cls, text: str, custom_protected: Optional[List[str]] = None) -> List[str]:
        entities = set()

        # 1. Custom & Default protected brands
        all_brands = cls.DEFAULT_PROTECTED_ENTITIES + (custom_protected or [])
        for brand in all_brands:
            if brand.lower() in text.lower():
                # Find exact casing in text
                pattern = re.compile(re.escape(brand), re.IGNORECASE)
                matches = pattern.findall(text)
                for m in matches:
                    entities.add(m)

        # 2. Multi-word Capitalized Proper Nouns
        cap_matches = re.findall(cls.CAPITALIZED_BRAND_PATTERN, text)
        for match in re.finditer(cls.CAPITALIZED_BRAND_PATTERN, text):
            entities.add(match.group(0))

        # 3. Numbers, Quantities & Percentages
        num_matches = re.finditer(cls.NUMBER_PATTERN, text, flags=re.IGNORECASE)
        for match in num_matches:
            entities.add(match.group(0))

        # Sort entities by length descending to prevent substring collisions
        sorted_entities = sorted(list(entities), key=lambda x: -len(x))
        return sorted_entities

    @classmethod
    def lock_entities(cls, text: str, custom_protected: Optional[List[str]] = None) -> Tuple[str, List[Dict[str, str]]]:
        if not text:
            return "", []

        entities = cls.extract_protected_entities(text, custom_protected)
        locked_map = []
        locked_text = text

        for idx, entity in enumerate(entities):
            token = f"__LOCKED_ENTITY_{idx}__"
            # Replace exact occurrences
            pattern = re.compile(re.escape(entity))
            if pattern.search(locked_text):
                locked_text = pattern.sub(token, locked_text)
                locked_map.append({
                    "token": token,
                    "original_entity": entity,
                    "type": "brand" if any(c.isalpha() for c in entity) else "number"
                })

        return locked_text, locked_map

    @classmethod
    def unlock_entities(cls, text: str, locked_map: List[Dict[str, str]]) -> str:
        if not text or not locked_map:
            return text or ""

        unlocked_text = text
        for item in locked_map:
            token = item["token"]
            entity = item["original_entity"]
            unlocked_text = unlocked_text.replace(token, entity)

        return unlocked_text

    @classmethod
    def validate_transformation(cls, original_text: str, transformed_text: str, locked_map: List[Dict[str, str]]) -> bool:
        """
        Validates that transformed text preserves 100% of locked entities and
        does not introduce index numbers or bracketed tags.
        """
        if not transformed_text:
            return False

        # 1. Assert all locked entities are present in transformed_text (either unlocked or tokenized)
        for item in locked_map:
            entity = item["original_entity"]
            token = item["token"]
            if entity.lower() not in transformed_text.lower() and token not in transformed_text:
                raise ValueError(f"SafetyGuard Audit Failed: Locked entity '{entity}' was lost during transformation!")

        # 2. Assert no index numbers leak into leading position
        if re.match(r'^\d', transformed_text.strip()):
            raise ValueError(f"SafetyGuard Audit Failed: Transformed text starts with a digit: '{transformed_text}'")

        # 3. Assert no bracketed tags remain
        if re.search(r'\[.*?\]', transformed_text):
            raise ValueError(f"SafetyGuard Audit Failed: Inline bracketed tag found: '{transformed_text}'")

        return True
