"""
TIDO Voice Performance Engine - Semantic Intent Analyzer (Phase 6)
====================================================================
Detects structural semantic intent and audience psychological state from Vietnamese text.
Intents: HOOK, PAIN_POINT, INTRODUCTION, EXPLANATION, BENEFIT, PROOF, TRUST, CTA, STORY, REFLECTION.
"""

from typing import Dict, Any
from tido_engine.v2_schemas import SegmentV2

class SemanticIntentAnalyzer:
    """
    Voice-agnostic semantic intent analyzer.
    """

    @classmethod
    def analyze_segment_intent(cls, segment: SegmentV2, segment_idx: int, total_segments: int) -> Dict[str, Any]:
        text = segment.text.strip() if segment.text else ""
        text_lower = text.lower()

        # Intent Detection Rules
        if segment_idx == 0 and ("?" in text or any(k in text_lower for k in ["bạn có", "bạn muốn", "khó khăn", "tại sao"])):
            intent = "HOOK"
            emotion = "curiosity"
            audience_state = "attentive"
            importance_score = 0.90
        elif any(k in text_lower for k in ["khó khăn", "mệt mỏi", "vấn đề", "áp lực", "lo lắng"]):
            intent = "PAIN_POINT"
            emotion = "empathy"
            audience_state = "relatable"
            importance_score = 0.85
        elif any(k in text_lower for k in ["hãy", "ngay hôm nay", "bắt đầu", "đăng ký", "liên hệ"]):
            intent = "CTA"
            emotion = "confidence"
            audience_state = "action_oriented"
            importance_score = 0.95
        elif any(k in text_lower for k in ["đồng hành", "sẵn sàng", "huấn luyện viên", "uy tín", "tin cậy"]):
            intent = "TRUST"
            emotion = "trust"
            audience_state = "reassured"
            importance_score = 0.88
        elif any(k in text_lower for k in ["hiện đại", "khoa học", "cải thiện", "giải pháp", "tuyệt vời"]):
            intent = "BENEFIT"
            emotion = "inspiration"
            audience_state = "interested"
            importance_score = 0.82
        elif any(k in text_lower for k in ["tại", "chúng tôi", "giới thiệu", "mang đến"]):
            intent = "INTRODUCTION"
            emotion = "welcoming"
            audience_state = "open"
            importance_score = 0.80
        else:
            intent = "EXPLANATION"
            emotion = "informative"
            audience_state = "neutral"
            importance_score = 0.75

        return {
            "intent": intent,
            "emotion": emotion,
            "audience_state": audience_state,
            "importance_score": importance_score
        }
