"""
TIDO Voice Performance Engine - Context-Overlap Fallback Synthesizer
====================================================================
Provides prefix contextual generation when initial consonants are repeatedly swallowed.
Synthesizes target text prepended with prior context, then trims away the prefix.
"""

import os
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

class ContextOverlapFallback:
    def __init__(self):
        pass

    def prepare_context_text(self, target_text: str, prev_text: str = "") -> str:
        """Prepends context prefix to target text."""
        if not prev_text:
            context_prefix = "xin chào. "
        else:
            words = prev_text.split()
            context_prefix = " ".join(words[-4:]) + ". "
            
        return context_prefix + target_text

    def extract_target_audio(self, combined_audio_path: str, context_prefix_len_words: int) -> AudioSegment:
        """Trims off prefix audio context safely."""
        seg = AudioSegment.from_file(combined_audio_path)
        # Context prefix of 3-4 words is typically 1.2s to 1.8s
        # Slice after estimated prefix length
        estimated_prefix_ms = max(800, int(context_prefix_len_words * 320))
        
        if len(seg) > estimated_prefix_ms + 500:
            target_seg = seg[estimated_prefix_ms:]
            # Trim silence at start of target
            trim_start = detect_leading_silence(target_seg, silence_threshold=-42.0)
            start_pos = max(0, trim_start - 30)
            target_seg = target_seg[start_pos:]
            return target_seg
        return seg
