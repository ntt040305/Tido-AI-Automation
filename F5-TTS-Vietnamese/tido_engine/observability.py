"""
TIDO Voice Performance Engine - Observability & Audit Logger
============================================================
Logs structured JSON metadata for every synthesis request for post-mortem analysis.
"""

import os
import json
import time
from typing import Dict, Any

LOG_DIR = r"d:\Tido\F5-TTS-Vietnamese\logs"
os.makedirs(LOG_DIR, exist_ok=True)

class ObservabilityLogger:
    def __init__(self, log_dir: str = LOG_DIR):
        self.log_dir = log_dir

    def log_generation(self, data: Dict[str, Any]):
        req_id = data.get("request_id", f"req_{int(time.time()*1000)}")
        file_path = os.path.join(self.log_dir, f"generation_{req_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"📊 [OBSERVABILITY] Execution log saved: {file_path}")
        except Exception as e:
            print(f"⚠️ Warning saving observability log: {e}")
