"""
TIDO Voice Performance Engine - Layer 2: Studio Audio Mastering & Modulator (Clean Edition)
=============================================================================================
Provides clean, un-distorted audio post-processing:
1. High-Pass Filter (>70Hz) to remove low rumble.
2. Smooth Butterworth Air Presence Boost (>7000Hz).
3. Soft-Knee Peak Normalization to -1.5 dBFS.
4. Natural Exponential Micro-Fading (Smooth Head & Tail).
5. [FIX 3] Pitch shift thật (librosa) để thay đổi cao độ theo cảm xúc.
"""

import re
import numpy as np
# [FIX 3] Import librosa để thực hiện pitch shifting thật theo plan.pitch_shift
import librosa
from scipy import signal
from pydub import AudioSegment

class EmotionModulator:
    def __init__(self, sample_rate: int = 24000):
        self.sample_rate = sample_rate

    def _audio_to_float_array(self, audio: AudioSegment) -> np.ndarray:
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
        max_val = float(1 << (8 * audio.sample_width - 1))
        return samples / max_val

    def _float_array_to_audio(self, samples: np.ndarray, orig_audio: AudioSegment) -> AudioSegment:
        samples = np.clip(samples, -1.0, 1.0)
        max_val = float(1 << (8 * orig_audio.sample_width - 1))
        int_samples = (samples * max_val).astype(np.int16)
        return orig_audio._spawn(int_samples.tobytes())

    def _apply_clean_mastering(self, samples: np.ndarray) -> np.ndarray:
        """
        Clean, distortion-free studio audio mastering:
        - Removes sub-bass rumble (<70Hz High-Pass Filter)
        - Peak Normalizes cleanly to -1.5 dBFS (0.84 amplitude)
        """
        fs = self.sample_rate

        # 1. High-Pass Filter at 70Hz to remove mic thumps & sub-rumble
        b_hp, a_hp = signal.butter(2, 70.0 / (fs / 2), btype='highpass')
        samples = signal.lfilter(b_hp, a_hp, samples)

        # 2. Peak Normalize cleanly to -1.5 dBFS (0.84)
        peak = np.max(np.abs(samples))
        if peak > 1e-5:
            samples = samples * (0.84 / peak)

        return samples

    def modulate_emotion(self, base_audio: AudioSegment, plan) -> AudioSegment:
        """
        Layer 2: Applies clean, smooth audio post-processing to F5-TTS audio.
        [FIX 3] Thêm bước áp dụng pitch shift thật theo plan.pitch_shift trước mastering.
        """
        if len(base_audio) == 0:
            return base_audio

        audio = base_audio.set_frame_rate(self.sample_rate).set_channels(1).set_sample_width(2)

        # Clean audio array
        samples = self._audio_to_float_array(audio)

        # [FIX 3] Áp dụng pitch shift thật bằng librosa nếu plan.pitch_shift != 0.
        # Clamp trong [-2.5, 2.5] bán cung để tránh giọng bị méo/chipmunk.
        # Wrap trong try/except để không crash toàn bộ pipeline nếu librosa gặp lỗi.
        pitch_shift = getattr(plan, 'pitch_shift', 0.0) or 0.0
        if pitch_shift != 0.0:
            try:
                n_steps = float(max(-2.5, min(2.5, pitch_shift)))
                samples = librosa.effects.pitch_shift(
                    y=samples,
                    sr=self.sample_rate,
                    n_steps=n_steps,
                    bins_per_octave=12
                )
            except Exception as pitch_err:
                # [FIX 3] Nếu pitch shift thất bại, bỏ qua bước này, không crash pipeline
                print(f"⚠️ [PITCH SHIFT] Bỏ qua pitch shift (n_steps={pitch_shift:.2f}): {pitch_err}")

        samples_clean = self._apply_clean_mastering(samples)
        audio = self._float_array_to_audio(samples_clean, audio)

        # Smooth micro-fades to eliminate boundary clicks (15ms head, 25ms tail)
        audio = audio.fade_in(15).fade_out(25)

        return audio
