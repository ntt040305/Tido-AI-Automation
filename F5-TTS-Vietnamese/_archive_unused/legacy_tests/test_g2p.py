import nltk
try:
    nltk.data.find('corpora/cmudict.zip')
except LookupError:
    nltk.download('cmudict')

from g2p_en import G2p
import re

g2p = G2p()

arpabet_to_vi = {
    'AA': 'a', 'AA0': 'a', 'AA1': 'a', 'AA2': 'a',
    'AE': 'e', 'AE0': 'e', 'AE1': 'e', 'AE2': 'e',
    'AH': 'ơ', 'AH0': 'ơ', 'AH1': 'ơ', 'AH2': 'ơ',
    'AO': 'o', 'AO0': 'o', 'AO1': 'o', 'AO2': 'o',
    'AW': 'ao', 'AW0': 'ao', 'AW1': 'ao', 'AW2': 'ao',
    'AY': 'ai', 'AY0': 'ai', 'AY1': 'ai', 'AY2': 'ai',
    'EH': 'e', 'EH0': 'e', 'EH1': 'e', 'EH2': 'e',
    'ER': 'ơ', 'ER0': 'ơ', 'ER1': 'ơ', 'ER2': 'ơ',
    'EY': 'ây', 'EY0': 'ây', 'EY1': 'ây', 'EY2': 'ây',
    'IH': 'i', 'IH0': 'i', 'IH1': 'i', 'IH2': 'i',
    'IY': 'i', 'IY0': 'i', 'IY1': 'i', 'IY2': 'i',
    'OW': 'âu', 'OW0': 'âu', 'OW1': 'âu', 'OW2': 'âu',
    'OY': 'ôi', 'OY0': 'ôi', 'OY1': 'ôi', 'OY2': 'ôi',
    'UH': 'u', 'UH0': 'u', 'UH1': 'u', 'UH2': 'u',
    'UW': 'u', 'UW0': 'u', 'UW1': 'u', 'UW2': 'u',
    'B': 'b', 'CH': 'ch', 'D': 'đ', 'DH': 'd', 'F': 'ph',
    'G': 'g', 'HH': 'h', 'JH': 'gi', 'K': 'c', 'L': 'l',
    'M': 'm', 'N': 'n', 'NG': 'ng', 'P': 'p', 'R': 'r',
    'S': 'x', 'SH': 's', 'T': 't', 'TH': 'th', 'V': 'v',
    'W': 'o', 'Y': 'i', 'Z': 'd', 'ZH': 'gi'
}

def english_to_vi(text):
    # Split text into words, ignore non-alphabetic
    words = re.findall(r'[a-zA-Z]+', text)
    res = text
    for w in words:
        if len(w) <= 1:
            continue
        # Convert to phonemes
        phonemes = g2p(w)
        vi_word = ""
        for p in phonemes:
            if p in arpabet_to_vi:
                vi_word += arpabet_to_vi[p]
            else:
                vi_word += p
                
        # Simple cleanup (e.g., replace 'cx' with 'x', 'c' at the end is fine, but 'c' before 'e/i' should be 'k' ideally, though TTS can handle Vietnamese orthography loosely)
        vi_word = vi_word.replace(' ', '')
        # Only replace if the phonetic version is different and looks pronounceable
        if vi_word:
            res = res.replace(w, vi_word)
    return res

test_words = ["Smartphone", "Sale", "Voucher", "Online", "Combo", "Keyshop", "Home", "PNN"]
for w in test_words:
    print(f"{w} -> {english_to_vi(w)}")
