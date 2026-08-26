"""
TIDO Voice Performance Engine - Expression Controller (Phase 3)
================================================================
Controls conversational lead-in expressions with strict quota enforcement.
- STRICT LIMIT: Maximum 2 expressions per script (e.g. 30s script). Zero random fillers.
- Allowed expressions: "Thật ra...", "Điều mình thích nhất là...", "Đặc biệt là...", "Theo mình..."
- SafetyGuard Integration: Validates text integrity and ensures zero mutation of brand names or numbers.
"""

from typing import List, Dict, Any, Optional
from tido_engine.v2_schemas import SegmentV2
from tido_engine.humanization.safety_guard import SafetyGuard

class ExpressionController:
    """
    Injects context-aware conversational expressions governed by strict rules and quotas.
    """

    ALLOWED_EXPRESSIONS = [
        "Thật ra...",
        "Điều mình thích nhất là...",
        "Đặc biệt là...",
        "Theo mình..."
    ]

    MAX_EXPRESSIONS_PER_SCRIPT = 2

    @classmethod
    def apply_expressions(
        cls,
        segments: List[SegmentV2],
        genre: str = "commercial",
        custom_protected: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Evaluates and applies lead-in expressions across script segments.
        Enforces a hard limit of max 2 expressions per script.
        Returns trace list.
        """
        expressions_used = 0
        trace_list = []

        for idx, seg in enumerate(segments):
            seg_role = seg.performance.segment_role.lower()
            text = seg.text.strip() if seg.text else ""
            injected = False
            expression_applied = ""

            # Check if quota reached
            if expressions_used < cls.MAX_EXPRESSIONS_PER_SCRIPT and text:
                # Rule 1: Hook / Lead segment -> Candidate for 'Thật ra...' or 'Điều mình thích nhất là...'
                if (idx == 0 or seg_role == "hook") and not text.startswith("Thật ra") and not text.startswith("Điều mình"):
                    candidate_expr = "Thật ra..." if "bạn" in text.lower() else "Điều mình thích nhất là..."
                    injected_text = f"{candidate_expr} {text}"
                    
                    # Validate SafetyGuard
                    locked_text, locked_map = SafetyGuard.lock_entities(text, custom_protected)
                    try:
                        SafetyGuard.validate_transformation(text, injected_text, locked_map)
                        seg.text = injected_text
                        injected = True
                        expression_applied = candidate_expr
                        expressions_used += 1
                    except Exception:
                        seg.text = text  # Revert if safety check fails

                # Rule 2: Solution / Explanation segment -> Candidate for 'Đặc biệt là...' or 'Theo mình...'
                elif (seg_role in ["solution", "explanation"]) and not injected and not text.startswith("Đặc biệt") and not text.startswith("Theo mình"):
                    candidate_expr = "Đặc biệt là..." if idx > 0 else "Theo mình..."
                    injected_text = f"{candidate_expr} {text}"

                    # Validate SafetyGuard
                    locked_text, locked_map = SafetyGuard.lock_entities(text, custom_protected)
                    try:
                        SafetyGuard.validate_transformation(text, injected_text, locked_map)
                        seg.text = injected_text
                        injected = True
                        expression_applied = candidate_expr
                        expressions_used += 1
                    except Exception:
                        seg.text = text  # Revert if safety check fails

            trace_list.append({
                "segment_id": seg.segment_id,
                "expression_applied": expression_applied if injected else "none",
                "total_expressions_used": expressions_used,
                "quota_limit": cls.MAX_EXPRESSIONS_PER_SCRIPT
            })

        return trace_list
