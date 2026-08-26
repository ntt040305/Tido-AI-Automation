import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from f5_tts.model.utils import convert_char_to_pinyin

# All Vietnamese diacritic chars + test common Vietnamese syllables
vietnamese_chars = "àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ"
vi_text = "chào mừng bạn đến với hệ thống sản xuất video"

tokens = convert_char_to_pinyin([vi_text])[0]
print("Tokens from Vietnamese text:")
print(tokens)

# Load vivoice vocab (the best one at 100%)
def load_vocab(path):
    vocab = {}
    with open(path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            vocab[line.rstrip('\n')] = i
    return vocab

vocab_vivoice = load_vocab(r"d:\Tido\F5-TTS-Vietnamese\ckpt_vivoice\config.json")

print(f"\nViVoice vocab size: {len(vocab_vivoice)}")
print(f"Space is at index: {vocab_vivoice.get(' ', 'NOT FOUND')}")

# Check what Vietnamese diacritics are covered
covered = [c for c in vietnamese_chars if c in vocab_vivoice]
missing = [c for c in vietnamese_chars if c not in vocab_vivoice]
print(f"\nVietnamese diacritics coverage: {len(covered)}/{len(vietnamese_chars)}")
if missing:
    print(f"Missing: {missing}")
else:
    print("ALL Vietnamese diacritics are in vocab!")
