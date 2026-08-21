"""
TIDO Voice Performance Engine - Adaptive Repair Manager
======================================================
Classifies QC errors and executes targeted repair strategies.
"""

from typing import Dict, Any, List
from tido_engine.auto_qc import QCResult

MAX_RETRIES = 2

class RepairManager:
    def __init__(self, max_retries: int = MAX_RETRIES):
        self.max_retries = max_retries

    def get_repair_strategy(self, attempt: int, qc_result: QCResult) -> Dict[str, Any]:
        """Determines the appropriate repair action based on QC errors."""
        if attempt >= self.max_retries or qc_result.passed:
            return {"action": "NONE", "should_retry": False}

        error_types = [e["type"] for e in qc_result.errors]

        if "FIRST_WORD_MISSING" in error_types:
            return {
                "action": "CONTEXT_OVERLAP",
                "should_retry": True,
                "reason": "First word swallowed by inference. Applying contextual prefix fallback."
            }
            
        if "LAST_WORD_MISSING" in error_types:
            return {
                "action": "INCREASE_TAIL_PAD",
                "should_retry": True,
                "reason": "Last word cut off. Increasing tail padding."
            }

        if "LOW_TEXT_FIDELITY" in error_types:
            return {
                "action": "ADJUST_CFG_SEED",
                "should_retry": True,
                "reason": "Low text fidelity. Tweaking CFG strength & seed."
            }

        return {"action": "DEFAULT_RETRY", "should_retry": True, "reason": "General QC failure."}
