"""
TIDO Voice Performance Engine - Voice Profile Data Class
=========================================================
Encapsulates reference voice metrics, acoustic baselines, and style metadata.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class VoiceProfile:
    voice_id: str
    name: str
    gender: str
    reference_path: str
    reference_hash: str
    reference_transcript: str
    duration_s: float
    
    # Acoustic Baselines derived from reference audio
    baseline_loudness_dbfs: float = -18.0
    baseline_speaking_rate: float = 3.5  # syllables per second
    baseline_pitch_median_hz: float = 130.0  # Hz
    baseline_pitch_range: float = 40.0
    baseline_pause_ratio: float = 0.15
    
    # Style & capabilities
    supported_styles: List[str] = field(default_factory=lambda: ["neutral", "warm", "confident", "energetic", "serious"])
    tone: str = "authoritative"
    best_for: List[str] = field(default_factory=lambda: ["tvc", "shorts", "dialogue", "narration"])
    
    # Reference dictionary overrides
    speed_default: float = 1.0
    pronunciation_map: Dict[str, str] = field(default_factory=dict)
    # [FIX 6] CFG riêng từng giọng từ voice_library.json (ví dụ: 1.6 cho Motaro, 1.5 cho Mizaki).
    # Trước đây field này trong JSON không được đọc → mọi giọng dùng chung 1 công thức CFG.
    cfg_strength_default: Optional[float] = None

