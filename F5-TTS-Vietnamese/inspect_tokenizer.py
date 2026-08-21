import sys
import os
import json

sys.stdout.reconfigure(encoding='utf-8')

vocab_file = r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json"
with open(vocab_file, "r", encoding="utf-8") as f:
    vocab_data = json.load(f)

print("Vocab keys:", vocab_data.keys() if isinstance(vocab_data, dict) else len(vocab_data))
if isinstance(vocab_data, dict) and "vocab" in vocab_data:
    vocab = vocab_data["vocab"]
    print("Total vocab size:", len(vocab))
    # Check if 'Đ', 'đ', 'i', 'g', 'PT', 'pt' are in vocab
    for char in ["Đ", "đ", "Gi", "gi", "PT", "pt", "chấn", "thương"]:
        print(f"Contains '{char}':", char in vocab or (isinstance(vocab, dict) and char in vocab))
else:
    print("Vocab sample:", list(vocab_data.items())[:20] if isinstance(vocab_data, dict) else vocab_data[:20])
