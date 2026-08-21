"""
TIDO Voice Performance Engine - Centralized F5 Inference Config
===============================================================
Encapsulates model inference hyper-parameters for logging & reproduction.
"""

from dataclasses import dataclass
from typing import Optional

@dataclass
class F5InferenceConfig:
    speed: float = 1.0
    cfg_strength: float = 1.8
    nfe_step: int = 32
    remove_silence: bool = True
    seed: Optional[int] = None
    target_rms_dbfs: float = -18.0
