"""
TIDO Voice Performance Engine - Rendering Controller
=====================================================
Bridges ProsodyExecutionPlan to TTSEngineAdapter.

SAFE PADDING & MASTERING CONSTRAINTS:
- Head padding: 80–120 ms (protects initial consonants from truncation)
- Tail padding: 120–180 ms (protects final consonants)
- Peak Audio Level <= -1.0 dBFS (clipping protection)
- Gain boost capped <= +1.5 dB
- Zero clipped samples
"""

import os
import time
import numpy as np
from typing import Dict, Any, Tuple
from pydub import AudioSegment

from tido_engine.tts_adapter_interface import TTSEngineAdapter
from tido_engine.prosody_engine_v2 import ProsodyExecutionPlan

def apply_brickwall_limiter(segment: AudioSegment, max_peak_dbfs: float = -1.0) -> AudioSegment:
    """
    Applies a soft brickwall peak limiter ensuring peak level <= max_peak_dbfs with zero clipping.
    """
    if len(segment) == 0:
        return segment

    peak = segment.max_dBFS
    if peak > max_peak_dbfs:
        reduction_db = max_peak_dbfs - peak
        segment = segment.apply_gain(reduction_db)

    return segment

class RenderingController:
    """
    Controls segment rendering execution by translating ProsodyExecutionPlan
    into exact F5-TTS adapter configs and post-rendering audio frame padding.
    """

    def __init__(self, tts_adapter: TTSEngineAdapter):
        self.tts_adapter = tts_adapter

    def prepare_f5_config(self, plan: ProsodyExecutionPlan) -> Dict[str, Any]:
        """
        Maps ProsodyExecutionPlan parameters to F5-TTS inference parameters.
        """
        return {
            "speed": plan.speaking_speed,
            "remove_silence": False,  # Disabled automatic remove_silence to prevent consonant truncation
            "nfe_step": 60,
            "cfg_strength": plan.target_cfg_scale
        }

    def render_segment(
        self,
        text: str,
        ref_audio_path: str,
        ref_text: str,
        plan: ProsodyExecutionPlan,
        temp_wave_path: str,
        pipeline_mode: str = "v2_safe"
    ) -> Tuple[AudioSegment, Dict[str, Any]]:
        """
        Renders a single segment audio chunk using TTSEngineAdapter with prosody controls,
        then applies head/tail padding, gain capping, and peak limiting.
        """
        f5_config = self.prepare_f5_config(plan)

        t0 = time.time()
        # 1. Render raw audio chunk via TTS Adapter
        self.tts_adapter.render(
            text=text,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text,
            config=f5_config,
            output_wave_path=temp_wave_path
        )

        raw_duration = 0
        if os.path.exists(temp_wave_path):
            chunk_seg = AudioSegment.from_file(temp_wave_path)
            raw_duration = len(chunk_seg) / 1000.0

            # Clean temporary file
            try:
                os.remove(temp_wave_path)
            except Exception:
                pass
        else:
            chunk_seg = AudioSegment.silent(duration=100, frame_rate=24000)

        # 2. Ensure Mono & 24kHz
        if chunk_seg.channels > 1:
            chunk_seg = chunk_seg.set_channels(1)
        if chunk_seg.frame_rate != 24000:
            chunk_seg = chunk_seg.set_frame_rate(24000)

        # 3. Apply Capped Energy Level Scaling (Max gain <= +1.5 dB)
        if plan.energy_level_scale != 1.0:
            if plan.energy_level_scale > 1.0:
                gain_db = min(1.5, (plan.energy_level_scale - 1.0) * 3.0)
                chunk_seg = chunk_seg.apply_gain(gain_db)
            elif plan.energy_level_scale < 1.0:
                atten_db = max(-3.0, (plan.energy_level_scale - 1.0) * 5.0)
                chunk_seg = chunk_seg.apply_gain(atten_db)

        # 4. Head and Tail Padding Protection
        # Head padding: 100 ms (protects initial consonant from truncation)
        # Tail padding: 140 ms (protects final consonant)
        head_pad_ms = max(80, min(120, plan.pause_before_ms)) if plan.pause_before_ms > 0 else 100
        tail_pad_ms = max(120, min(180, plan.pause_after_ms)) if plan.pause_after_ms > 0 else 140

        silence_before = AudioSegment.silent(duration=head_pad_ms, frame_rate=24000)
        silence_after = AudioSegment.silent(duration=tail_pad_ms, frame_rate=24000)
        chunk_seg = silence_before + chunk_seg + silence_after

        # 5. Peak Limiter (-1.0 dBFS) & Clipping Check
        chunk_seg = apply_brickwall_limiter(chunk_seg, max_peak_dbfs=-1.0)

        # Calculate clipping count
        samples = np.array(chunk_seg.get_array_of_samples())
        max_possible = 2 ** (chunk_seg.sample_width * 8 - 1) - 1
        clipped_samples = int(np.sum(np.abs(samples) >= max_possible))

        final_duration = len(chunk_seg) / 1000.0

        stats = {
            "segment_id": plan.segment_id,
            "render_time_s": round(time.time() - t0, 2),
            "raw_audio_duration_s": round(raw_duration, 2),
            "final_padded_duration_s": round(final_duration, 2),
            "head_padding_ms": head_pad_ms,
            "tail_padding_ms": tail_pad_ms,
            "peak_dbfs": round(chunk_seg.max_dBFS, 2),
            "clipped_samples": clipped_samples,
            "applied_speed": plan.speaking_speed,
            "applied_cfg": plan.target_cfg_scale
        }

        return chunk_seg, stats
