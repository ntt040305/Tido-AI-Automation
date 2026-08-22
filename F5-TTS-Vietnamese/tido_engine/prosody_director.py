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
        prosody_config: Optional[dict] = None,
        # [FIX 4] Thêm 2 tham số mới để đưa pause từ boundary dấu câu vào tính toán
        boundary_pause_ms: Optional[int] = None,
        vocal_tail: Optional[str] = None,
    ) -> DeliveryPlan:
        el = (requested_emotion or "neutral").lower()
        pl = (requested_pacing or "bình thường").lower()
        prosody = prosody_config or {}
        
        # 1. Base Emotion mapping & CFG calculation
        intense_keys = {"cao trào", "hào hứng", "mạnh mẽ", "ấn tượng", "năng lượng", "khuyến khích", "energetic", "dramatic"}
        gentle_keys = {"trầm lắng", "nhẹ nhàng", "ấm áp", "thư giãn", "sâu lắng", "warm", "soft", "serious"}
        
        if any(k in el for k in intense_keys):
            emotion = "energetic"
            base_intensity = 0.8
            cfg = 1.75
        elif any(k in el for k in gentle_keys):
            emotion = "warm"
            base_intensity = 0.5
            cfg = 1.40
        elif "confident" in el or "tự tin" in el:
            emotion = "confident"
            base_intensity = 0.65
            cfg = 1.60
        else:
            emotion = "neutral"
            base_intensity = 0.5
            cfg = 1.45

        # Override intensity if user provided explicit intensity float (e.g. 0.65)
        final_intensity = float(intensity) if intensity is not None else base_intensity

        # Adjust CFG by energy_target & intensity
        energy = prosody.get("energy_target", "=")
        if energy == "+":
            cfg += 0.1
        elif energy == "-":
            cfg -= 0.1

        if intensity is not None:
            cfg = cfg * (0.85 + 0.3 * final_intensity)

        # [FIX 5] Đọc emphasis_density từ JSON kịch bản và điều chỉnh CFG.
        # Trước đây field này được khai báo nhưng không bao giờ được đọc → vô tác dụng.
        emphasis_density = str(prosody.get("emphasis_density", "medium")).lower()
        if emphasis_density == "high":
            cfg += 0.08
        elif emphasis_density == "low":
            cfg -= 0.08

        # Soft intimate CFG clamp range: 1.35 - 1.85
        cfg = max(1.35, min(1.85, cfg))

        # [FIX 6 - part of prosody_director] Blend với cfg_strength_default của từng giọng nếu có.
        # Đảm bảo mỗi giọng giữ được "chất riêng" thay vì dùng chung 1 công thức.
        if getattr(voice_profile, 'cfg_strength_default', None) is not None:
            cfg = (cfg + voice_profile.cfg_strength_default) / 2.0
            cfg = max(1.35, min(1.85, cfg))

        # 2. Dynamic Pacing & Speed Ratio Calculation
        base_rate = voice_profile.baseline_speaking_rate
        pace_delta = prosody.get("pace_delta", "=")
        
        if "chậm" in pl or "slow" in pl:
            target_rate = base_rate * 0.85
        elif "nhanh" in pl or "fast" in pl:
            target_rate = base_rate * 1.18
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
        # Clamp speed_effective to safe voice boundaries [0.75, 1.35]
        speed_effective = max(0.75, min(1.35, speed_effective))

        # 3. Dynamic Pitch Shift Calculation
        pitch_variation = prosody.get("pitch_variation_target", "=")
        pitch_shift = float(prosody.get("pitch_shift", 0.0))
        if pitch_shift == 0.0:
            if pitch_variation == "+" or emotion == "energetic":
                pitch_shift = 0.8 * final_intensity
            elif pitch_variation == "-" or emotion == "warm":
                pitch_shift = -0.6 * final_intensity

        # 4. Pause planning — [FIX 4] Dùng boundary_pause_ms làm baseline thay vì
        # chỉ tính theo pacing. Câu hỏi/cảm thán giờ có pause khác câu thường.
        pause_delta = prosody.get("pause_delta", "=")
        if pause_after_user is not None:
            pause_after_ms = int(float(pause_after_user) * 1000)
        else:
            # [FIX 4] Lấy boundary_pause_ms (đã được tính đúng theo loại dấu câu trong _build_chunk)
            # làm baseline, mặc định 260 nếu không có.
            base_pause = boundary_pause_ms if boundary_pause_ms is not None else 260

            # Nhân hệ số pacing vào baseline
            if "chậm" in pl:
                pace_factor = 1.25
            elif "nhanh" in pl:
                pace_factor = 0.75
            else:
                pace_factor = 1.0
            pause_after_ms = int(base_pause * pace_factor)

        if pause_delta == "+":
            pause_after_ms = int(pause_after_ms * 1.3)
        elif pause_delta == "-":
            pause_after_ms = int(pause_after_ms * 0.65)

        # [FIX 4] vocal_tail từ JSON kịch bản: "long" cho câu CTA/outro, "soft" cho câu nhẹ
        if vocal_tail == "long":
            pause_after_ms = int(pause_after_ms * 1.35)
        elif vocal_tail == "soft":
            pause_after_ms = int(pause_after_ms * 0.85)

        # [FIX 4] Clamp pause cuối trong khoảng [60, 900] ms
        pause_after_ms = max(60, min(900, pause_after_ms))

        # Target NFE Steps: 52 for high energy TVC, 48 default
        nfe_step = 52 if emotion == "energetic" or "nhanh" in pl else 48

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

