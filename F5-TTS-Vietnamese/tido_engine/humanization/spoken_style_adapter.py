"""
TIDO Voice Performance Engine - Spoken Style Adapter (Phase 2A)
================================================================
Converts formal/written Vietnamese text syntax into natural spoken phrasing.
- Strict SafetyGuard Integration: Locks all brand names, numbers, specs, and claims before transformation.
- Deterministic Rule Engine: Replaces bookish syntax with spoken conversational connectors.
- Non-Mutating Guarantee: Zero changes to protected entities or core claims.
"""

import re
from typing import Dict, Any, List, Tuple, Optional
from tido_engine.humanization.safety_guard import SafetyGuard

class SpokenStyleAdapter:
    """
    Deterministic written-to-spoken Vietnamese syntax adapter.
    """

    # Deterministic written-to-spoken phrase replacement mapping
    SPOKEN_SYNTAX_MAP = [
        (r'\bnhằm mục đích\b', 'để'),
        (r'\bthông qua việc\b', 'bằng cách'),
        (r'\bdo đó\b', 'cho nên'),
        (r'\bvới mục tiêu\b', 'để'),
        (r'\btiến hành\b', 'bắt đầu'),
        (r'\bnâng cao chất lượng\b', 'cải thiện'),
        (r'\bgiúp cải thiện\b', 'hỗ trợ cải thiện'),
        (r'\bmang lại vẻ đẹp\b', 'cho cảm giác đẹp'),
        (r'\bsử dụng dịch vụ\b', 'dùng dịch vụ'),
        (r'\bthực hiện việc\b', 'làm'),
        (r'\bhoàn toàn tự nhiên\b', 'rất tự nhiên'),
        (r'\bđạt được kết quả\b', 'có kết quả'),
        (r'\bđáp ứng nhu cầu\b', 'phù hợp nhu cầu')
    ]

    @classmethod
    def adapt_segment_text(
        cls,
        text: str,
        genre: str = "commercial",
        custom_protected: Optional[List[str]] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Adapts a single segment text from written syntax to natural spoken Vietnamese.
        Returns: (adapted_text, trace_info)
        """
        if not text:
            return "", {"original_text": "", "adapted_text": "", "transformations": []}

        # Step 1: Lock all protected entities via SafetyGuard
        locked_text, locked_map = SafetyGuard.lock_entities(text, custom_protected)

        adapted_working_text = locked_text
        transformations_applied = []

        # Step 2: Apply deterministic written-to-spoken syntax conversions
        for pattern, replacement in cls.SPOKEN_SYNTAX_MAP:
            match = re.search(pattern, adapted_working_text, flags=re.IGNORECASE)
            if match:
                original_phrase = match.group(0)
                adapted_working_text = re.sub(pattern, replacement, adapted_working_text, flags=re.IGNORECASE)
                transformations_applied.append({
                    "original_phrase": original_phrase,
                    "replacement": replacement
                })

        # Step 3: Unlock protected entities back
        final_adapted_text = SafetyGuard.unlock_entities(adapted_working_text, locked_map)

        # Step 4: SafetyGuard Validation Gate
        try:
            SafetyGuard.validate_transformation(text, final_adapted_text, locked_map)
        except Exception as e:
            # Fallback to original text if safety check fails
            print(f"⚠️ [SPOKEN STYLE ADAPTER FALLBACK] Safety validation failed: {e}. Reverting segment.")
            return text, {
                "original_text": text,
                "adapted_text": text,
                "transformations": [],
                "status": "REVERTED_SAFETY_FALLBACK"
            }

        trace_info = {
            "original_text": text,
            "adapted_text": final_adapted_text,
            "locked_entities": [item["original_entity"] for item in locked_map],
            "transformations": transformations_applied,
            "status": "PASSED" if transformations_applied else "UNCHANGED"
        }

        return final_adapted_text, trace_info
