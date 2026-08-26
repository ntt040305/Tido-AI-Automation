import os
import sys
import librosa
import numpy as np
import warnings

sys.stdout.reconfigure(encoding='utf-8')
# Suppress librosa warnings about mp3
warnings.filterwarnings("ignore")

def analyze_audio(file_path):
    print(f"\n--- Phân tích: {os.path.basename(file_path)} ---")
    try:
        y, sr = librosa.load(file_path, sr=None, duration=30)
        
        # 1. Độ dài và Năng lượng
        duration = librosa.get_duration(y=y, sr=sr)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = np.mean(rms)
        std_rms = np.std(rms)
        
        print(f"⏱ Thời lượng: {duration:.2f} giây")
        print(f"🔊 Âm lượng trung bình (RMS): {mean_rms:.4f}")
        print(f"📊 Độ biến thiên âm lượng (Dynamic Range): {std_rms:.4f} (Càng cao càng biểu cảm)")
        
        # 2. Phân tích độ cao (Pitch / F0) để xem sự "nhấn nhá"
        # pyin extracts F0 (fundamental frequency)
        f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
        valid_f0 = f0[~np.isnan(f0)]
        
        if len(valid_f0) > 0:
            mean_pitch = np.mean(valid_f0)
            std_pitch = np.std(valid_f0)
            print(f"🎵 Độ cao trung bình (Pitch): {mean_pitch:.1f} Hz")
            print(f"🎢 Độ luyến láy/nhấn nhá (Pitch Std Dev): {std_pitch:.1f} Hz (Rất quan trọng: Giọng AI thường < 20Hz, giọng thật > 30Hz)")
        else:
            print("🎵 Không nhận diện được Pitch rõ ràng.")
            
        # 3. Khoảng lặng (Silence/Pauses)
        non_mute_intervals = librosa.effects.split(y, top_db=30)
        speaking_time = sum([(end - start)/sr for start, end in non_mute_intervals])
        silence_time = duration - speaking_time
        silence_ratio = silence_time / duration * 100
        print(f"⏸ Tỉ lệ khoảng lặng: {silence_ratio:.1f}% (Thời gian ngắt nghỉ lấy hơi)")
        
    except Exception as e:
        print(f"❌ Lỗi: {e}")

demo_dir = r"d:\Tido\Assets\Demo"
files = [
    "Đoạn đầu.mp3",
    "chú trọng khía cạnh tâm lý – xã hội.mp3"
]

for f in files:
    analyze_audio(os.path.join(demo_dir, f))

# Cùng lúc phân tích bản AI render để so sánh!
analyze_audio(r"d:\Tido\F5-TTS-Vietnamese\output_expressive_demo.wav")
