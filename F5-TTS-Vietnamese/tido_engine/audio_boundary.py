"""
TIDO Voice Performance Engine - Audio Boundary & Stitching Engine
=================================================================
Classifies boundary types and performs boundary-aware waveform assembly 
with anti-swallow safety margins and micro-fade transitions.
"""

import numpy as np
from enum import Enum
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

class BoundaryType(Enum):
    INTRA_PHRASE = "intra_phrase"
    COMMA = "comma"
    SEMICOLON = "semicolon"
    SENTENCE_END = "sentence_end"
    QUESTION_END = "question_end"
    EXCLAMATION_END = "exclamation_end"
    PARAGRAPH_END = "paragraph_end"
    EXPLICIT_PAUSE = "explicit_pause"

TARGET_SR = 24000
NOISE_FLOOR = 1e-7

def make_room_tone(ms: int, sr: int = TARGET_SR) -> AudioSegment:
    """Natural room tone background breath noise instead of digital silence."""
    if ms <= 0:
        return AudioSegment.empty()
    n = int(sr * ms / 1000)
    noise = (np.random.normal(0, NOISE_FLOOR, n) * 32767).astype(np.int16).tobytes()
    return AudioSegment(data=noise, sample_width=2, frame_rate=sr, channels=1)

class AudioStitcher:
    def __init__(self, target_sr: int = TARGET_SR):
        self.target_sr = target_sr

    def process_segment_boundary(self, seg_audio: AudioSegment) -> AudioSegment:
        """Trims extreme silence while maintaining 60ms anti-swallow pre-roll & post-roll guard margins."""
        seg_audio = seg_audio.set_frame_rate(self.target_sr).set_channels(1).set_sample_width(2)

        # Detect silence thresholds cleanly (-52dB threshold preserves soft vocal tails)
        trim_start = detect_leading_silence(seg_audio, silence_threshold=-52.0)
        trim_end = detect_leading_silence(seg_audio.reverse(), silence_threshold=-52.0)

        if trim_start > 0 or trim_end > 0:
            end_pos = len(seg_audio) - max(0, trim_end - 120) if trim_end < len(seg_audio) else len(seg_audio)
            start_pos = max(0, trim_start - 40)  # Preserve 40ms onset
            seg_audio = seg_audio[start_pos:end_pos]

        # Pad 40ms clean guard margins + 35ms soft vocal fade out to preserve natural "đuôi vuốt" glissando
        lead_pad = AudioSegment.silent(duration=40, frame_rate=self.target_sr)
        tail_pad = AudioSegment.silent(duration=60, frame_rate=self.target_sr)
        
        return (lead_pad + seg_audio + tail_pad).fade_in(12).fade_out(35)

    def stitch_chunks(self, rendered_chunks: list) -> AudioSegment:
        """
        Stitches rendered chunks into a seamless continuous audio timeline with VoiceStudio-style crossfade overlap.
        rendered_chunks: list of (AudioSegment, DeliveryPlan)
        """
        if not rendered_chunks:
            return AudioSegment.empty()

        final = AudioSegment.empty()

        for j, (chunk_audio, delivery_plan) in enumerate(rendered_chunks):
            # Process boundary safety
            safe_audio = self.process_segment_boundary(chunk_audio)
            
            if len(final) == 0:
                final = safe_audio
            else:
                # If pause between chunks is small (e.g. <= 120ms), crossfade overlap 15ms for continuous breath flow
                pause_ms = delivery_plan.pause_after_ms
                if pause_ms <= 120 and len(safe_audio) > 50 and len(final) > 50:
                    final = final.append(safe_audio, crossfade=15)
                else:
                    final += make_room_tone(pause_ms, self.target_sr) + safe_audio

        return final
