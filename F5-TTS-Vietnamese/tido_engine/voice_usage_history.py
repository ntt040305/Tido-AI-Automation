"""
TIDO Voice Performance Engine - Voice Usage History Telemetry
==============================================================
Logs rendering telemetry events: voice_id, script_id, style_used, quality_score, timestamp
and calculates usage statistics across the Voice Data Platform.
"""

import json
import os
import time
from dataclasses import dataclass, asdict
from typing import List, Dict, Any

@dataclass
class UsageLogEntry:
    log_id: str
    voice_id: str
    script_id: str
    style_used: str
    quality_score: float
    timestamp: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class VoiceUsageTracker:
    """
    Telemetry tracking system for voice rendering usage logs.
    """

    def __init__(self, log_db_path: str = r"d:\Tido\Assets\Voices\voice_usage_history.json"):
        self.log_db_path = log_db_path
        self._logs: List[UsageLogEntry] = []
        self._load_logs()

    def _load_logs(self) -> None:
        self._logs.clear()
        if os.path.exists(self.log_db_path):
            try:
                with open(self.log_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data.get("usage_logs", []):
                        self._logs.append(UsageLogEntry(
                            log_id=item["log_id"],
                            voice_id=item["voice_id"],
                            script_id=item["script_id"],
                            style_used=item["style_used"],
                            quality_score=float(item["quality_score"]),
                            timestamp=float(item["timestamp"])
                        ))
            except Exception as e:
                print(f"[WARNING] Could not read usage history JSON: {e}")

    def log_usage(self, voice_id: str, script_id: str, style_used: str, quality_score: float) -> UsageLogEntry:
        log_entry = UsageLogEntry(
            log_id=f"log_{int(time.time() * 1000)}",
            voice_id=voice_id,
            script_id=script_id,
            style_used=style_used,
            quality_score=quality_score,
            timestamp=time.time()
        )
        self._logs.append(log_entry)
        self._save_logs()
        return log_entry

    def _save_logs(self) -> None:
        os.makedirs(os.path.dirname(self.log_db_path), exist_ok=True)
        data = {
            "total_logs": len(self._logs),
            "usage_logs": [l.to_dict() for l in self._logs]
        }
        with open(self.log_db_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_voice_stats(self, voice_id: str) -> Dict[str, Any]:
        voice_logs = [l for l in self._logs if l.voice_id == voice_id]
        if not voice_logs:
            return {"usage_count": 0, "average_quality_score": 0.0}

        avg_score = sum(l.quality_score for l in voice_logs) / float(len(voice_logs))
        return {
            "usage_count": len(voice_logs),
            "average_quality_score": round(avg_score, 1),
            "last_used_timestamp": voice_logs[-1].timestamp
        }
