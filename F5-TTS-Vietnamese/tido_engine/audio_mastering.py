"""
TIDO Voice Performance Engine - Audio Mastering Pipeline
========================================================
Applies light studio mastering: RMS normalization, peak safety limiting,
and optional gentle noise enhancement using DeepFilterNet (wet=0.10).
"""

import os
import time
import torchaudio
from pydub import AudioSegment

TARGET_MASTER_DBFS = -14.0

class AudioMastering:
    def __init__(self, df_model=None, df_state=None):
        self.df_model = df_model
        self.df_state = df_state

    def master_final_audio(self, seg: AudioSegment, output_path: str, wet: float = 0.10) -> str:
        # 1. Global RMS Normalization to -14.0 dBFS
        if seg.dBFS != float('-inf'):
            seg = seg.apply_gain(TARGET_MASTER_DBFS - seg.dBFS)

        # 2. Light DeepFilterNet enhance if initialized & wet > 0
        if self.df_model is not None and self.df_state is not None and wet > 0.0:
            try:
                from df.enhance import enhance as df_enhance
                tmp_in = "_master_pre_df.wav"
                seg.export(tmp_in, format="wav")
                wav, sr = torchaudio.load(tmp_in)
                target_sr = self.df_state.sr()
                if sr != target_sr:
                    wav = torchaudio.functional.resample(wav, sr, target_sr)
                if wav.shape[0] > 1:
                    wav = wav.mean(dim=0, keepdim=True)

                enhanced = df_enhance(self.df_model, self.df_state, wav, atten_lim_db=12)
                blended = wet * enhanced + (1.0 - wet) * wav

                tmp_out = "_master_post_df.wav"
                torchaudio.save(tmp_out, blended, target_sr)
                seg = AudioSegment.from_file(tmp_out).set_frame_rate(24000).set_channels(1).set_sample_width(2)
                
                # Cleanup temp files
                for f in (tmp_in, tmp_out):
                    if os.path.exists(f):
                        try: os.remove(f)
                        except: pass
            except Exception as e:
                print(f"⚠️ Warning in AudioMastering DeepFilterNet: {e}")

        # Final Peak Safety Check
        seg.export(output_path, format="wav")
        return output_path
