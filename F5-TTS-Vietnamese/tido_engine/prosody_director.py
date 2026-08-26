"""
TIDO Voice Performance Engine - Prosody Director & Delivery Plan
================================================================
Translates emotion, pacing, and narrative context into a detailed DeliveryPlan
for each inference chunk while maintaining VoiceProfile identity & continuity.
"""

from dataclasses import dataclass, field
from typing import List, Optional
from tido_engine.voice_profile import VoiceProfile
from tido_engine.prosody_state import ProsodyState

SAFE_EMOTIONS = {"neutral", "warm", "confident", "energetic", "serious", "soft", "dramatic"}

@dataclass
class DeliveryPlan:
    chunk_index: int
    text: str
    emotion: str
    emotion_intensity: float
    target_speaking_rate: float  # syllables/sec
    target_cfg: float
    target_nfe_step: int
    pause_before_ms: int
    pause_after_ms: int
    speed_effective: float = 1.0
    pitch_shift: float = 0.0
    emphasis_keywords: List[str] = field(default_factory=list)

class ProsodyDirector:
    def __init__(self):
        pass

    def create_delivery_plan(
        self,
        chunk_index: int,
        text: str,
        requested_emotion: str,
        requested_pacing: str,
        voice_profile: VoiceProfile,
        state: ProsodyState,
        pause_after_user: Optional[float] = None,
        intensity: Optional[float] = None,
        prosody_config: Optional[dict] = None
    ) -> DeliveryPlan:
        el = (requested_emotion or "neutral").lower()
        pl = (requested_pacing or "bình thường").lower()
        prosody = prosody_config or {}
        
        # 1. Base Emotion mapping & Stable CFG calculation (1.40 - 1.65 for ViVoice stability)
        intense_keys = {"cao trào", "hào hứng", "mạnh mẽ", "ấn tượng", "năng lượng", "khuyến khích", "energetic", "dramatic", "bão sale", "urgent"}
        gentle_keys = {"trầm lắng", "nhẹ nhàng", "ấm áp", "thư giãn", "sâu lắng", "warm", "soft", "serious"}
        
        if any(k in el for k in intense_keys):
            emotion = "energetic"
            base_intensity = 0.75
            cfg = 1.65
        elif any(k in el for k in gentle_keys):
            emotion = "warm"
            base_intensity = 0.50
            cfg = 1.40
        elif "confident" in el or "tự tin" in el:
            emotion = "confident"
            base_intensity = 0.65
            cfg = 1.55
        else:
            emotion = "neutral"
            base_intensity = 0.50
            cfg = 1.50

        # Inline Tag Parsing (VoiceStudio style expression tags)
        tl = text.lower()
        if "[nhấn mạnh]" in tl or "[emphasis]" in tl:
            cfg += 0.10
            base_intensity = min(1.0, base_intensity + 0.15)
        if "[thì thầm]" in tl or "[whisper]" in tl:
            cfg = 1.35
            base_intensity = 0.40

        # Override intensity if user provided explicit intensity float (e.g. 0.65)
        final_intensity = float(intensity) if intensity is not None else base_intensity

        # Adjust CFG by energy_target & intensity
        energy = prosody.get("energy_target", "=")
        if energy == "+":
            cfg += 0.05
        elif energy == "-":
            cfg -= 0.05

        if intensity is not None:
            cfg = cfg * (0.90 + 0.2 * final_intensity)

        # Safe ViVoice CFG clamp range: 1.35 - 1.70 (CFG > 1.75 causes severe hallucinations and phonetic breakdown)
        cfg = max(1.35, min(1.70, cfg))

        # 2. Dynamic Pacing & Speed Ratio Calculation
        base_rate = voice_profile.baseline_speaking_rate
        pace_delta = prosody.get("pace_delta", "=")
        
        if "chậm" in pl or "slow" in pl or "[chậm lại]" in tl:
            target_rate = base_rate * 0.90
        elif "nhanh" in pl or "fast" in pl:
            target_rate = base_rate * 1.12
        else:
            target_rate = base_rate

        if pace_delta == "+":
            target_rate *= 1.10
        elif pace_delta == "-":
            target_rate *= 0.90

        # Custom speed_ratio from JSON if present
        user_speed_ratio = prosody.get("speed_ratio")
        if user_speed_ratio is not None:
            target_rate = base_rate * float(user_speed_ratio)

        speed_effective = voice_profile.speed_default * (target_rate / base_rate)
        # Clamp speed_effective to safe voice boundaries [0.80, 1.25]
        speed_effective = max(0.80, min(1.25, speed_effective))

        # 3. Dynamic Pitch Shift Calculation
        pitch_variation = prosody.get("pitch_variation_target", "=")
        pitch_shift = float(prosody.get("pitch_shift", 0.0))
        if pitch_shift == 0.0:
            if pitch_variation == "+" or emotion == "energetic":
                pitch_shift = 0.8 * final_intensity
            elif pitch_variation == "-" or emotion == "warm":
                pitch_shift = -0.6 * final_intensity

        # 4. Pause planning with pause_delta
        pause_delta = prosody.get("pause_delta", "=")
        if pause_after_user is not None:
            pause_after_ms = int(float(pause_after_user) * 1000)
        else:
            if "chậm" in pl:
                pause_after_ms = 300
            elif "nhanh" in pl:
                pause_after_ms = 150
            else:
                pause_after_ms = 220

        if pause_delta == "+":
            pause_after_ms = int(pause_after_ms * 1.3)
        elif pause_delta == "-":
            pause_after_ms = int(pause_after_ms * 0.65)

        # Target NFE Steps: 64 for studio energetic, 60 default for ultra-high audio fidelity
        nfe_step = 64 if emotion == "energetic" or "nhanh" in pl else 60

        # Update state for continuity
        state.previous_emotion = state.current_emotion
        state.current_emotion = emotion
        state.emotion_intensity = final_intensity
        state.target_pace_syllables_per_sec = target_rate
        state.target_cfg = cfg

        return DeliveryPlan(
            chunk_index=chunk_index,
            text=text,
            emotion=emotion,
            emotion_intensity=final_intensity,
            target_speaking_rate=target_rate,
            target_cfg=cfg,
            target_nfe_step=nfe_step,
            pause_before_ms=0,
            pause_after_ms=pause_after_ms,
            speed_effective=speed_effective,
            pitch_shift=pitch_shift
        )
