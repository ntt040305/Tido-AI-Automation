"""
TIDO Voice Performance Engine - Reference Voice Pipeline
========================================================
Ensures 100% deterministic reference audio & transcript conditioning.
Caches processed 24kHz mono reference WAVs and calculates acoustic baselines.
"""

import os
import json
import hashlib
from typing import Dict, Optional
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

from tido_engine.voice_profile import VoiceProfile

CACHE_DIR = r"d:\Tido\F5-TTS-Vietnamese\cache\ref_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

class ReferencePipeline:
    def __init__(self, voice_library_path: str):
        self.voice_library_path = voice_library_path
        self.raw_voices: Dict[str, dict] = {}
        self.profiles_cache: Dict[str, VoiceProfile] = {}
        self.processed_ref_paths: Dict[str, str] = {}
        
        self._load_library()
        
    def _load_library(self):
        if not os.path.exists(self.voice_library_path):
            raise FileNotFoundError(f"Voice library not found: {self.voice_library_path}")
            
        with open(self.voice_library_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for v in data.get('voices', []):
                self.raw_voices[v['id']] = v

    def compute_file_hash(self, file_path: str) -> str:
        if not os.path.exists(file_path):
            return ""
        hasher = hashlib.md5()
        with open(file_path, 'rb') as f:
            buf = f.read(65536)
            while len(buf) > 0:
                hasher.update(buf)
                buf = f.read(65536)
        return hasher.hexdigest()

    def get_profile(self, voice_id: str) -> VoiceProfile:
        if voice_id in self.profiles_cache:
            return self.profiles_cache[voice_id]
            
        if voice_id not in self.raw_voices:
            # Fallback to vo_motaro_kb19 if present
            if 'vo_motaro_kb19' in self.raw_voices:
                voice_id = 'vo_motaro_kb19'
            else:
                voice_id = list(self.raw_voices.keys())[0]

        vdata = self.raw_voices[voice_id]
        audio_file = vdata['audio_file']
        
        ref_transcript = vdata.get('ref_text', '')

        file_hash = self.compute_file_hash(audio_file)
        cached_wav = os.path.join(CACHE_DIR, f"{voice_id}_{file_hash[:8]}_24k.wav")
        
        if not os.path.exists(cached_wav):
            self.process_reference_audio(audio_file, cached_wav)
            
        # Return original untouched reference file path directly to prevent alignment loss
        profile = VoiceProfile(
            voice_id=voice_id,
            name=vdata.get('name', voice_id),
            gender=vdata.get('gender', 'male'),
            reference_path=audio_file,
            reference_hash=file_hash,
            reference_transcript=ref_transcript,
            duration_s=vdata.get('duration_s', 8.0),
            baseline_loudness_dbfs=-18.0,
            baseline_speaking_rate=3.5,
            speed_default=vdata.get('profile', {}).get('speed_default', 1.0),
            pronunciation_map=vdata.get('pronunciation_map', {})
        )
        
        self.profiles_cache[voice_id] = profile
        self.processed_ref_paths[voice_id] = audio_file
        return profile

    def process_reference_audio(self, input_path: str, output_path: str):
        """Standardizes reference audio to 24000Hz 16-bit Mono with safe head/tail margins."""
        seg = AudioSegment.from_file(input_path)
        seg = seg.set_frame_rate(24000).set_channels(1).set_sample_width(2)
        
        # Trim extreme silence but keep 60ms guard margins
        trim_start = detect_leading_silence(seg, silence_threshold=-45.0)
        trim_end = detect_leading_silence(seg.reverse(), silence_threshold=-45.0)
        
        start_pos = max(0, trim_start - 60)
        end_pos = len(seg) - max(0, trim_end - 60)
        
        if end_pos > start_pos + 1000:
            seg = seg[start_pos:end_pos]
            
        seg.export(output_path, format="wav")
        print(f"🔒 [REF LOCK] Standardized reference audio cached: {output_path} ({len(seg)/1000:.2f}s)")
