import re
from g2p_en import G2p

class AutoPhonemizer:
    def __init__(self):
        self.g2p = G2p()
        
        # ARPAbet to Vietnamese phonemes
        self.arpa_to_vi = {
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

    def is_english_word(self, word):
        """Heuristic to check if an ascii word is English/Foreign"""
        w = word.lower()
        # If it has non-ascii, it's Vietnamese
        if not all(ord(c) < 128 for c in w):
            return False
            
        # 1. Illegal Vietnamese endings
        # VN words only end with: c, m, n, p, t, ch, ng, nh, or vowels
        if re.search(r'[bdfgjklqrsvwxz]$', w):
            return True
            
        # 2. Contains English-specific letter combinations
        eng_clusters = ['tion', 'sion', 'ment', 'able', 'ight', 'ough', 'ce', 'ge', 'sh', 'ee', 'ea', 'oo', 'ck']
        for cluster in eng_clusters:
            if cluster in w:
                return True
                
        # 3. Three or more consecutive consonants (excluding 'ngh')
        cons = re.sub(r'ngh', '', w)
        if re.search(r'[bcdfgjklmnpqrstvwxz]{3,}', cons):
            return True
            
        # 4. Starts with illegal VN consonants
        if re.match(r'^[zjwf]', w):
            return True
            
        return False

    def convert_word(self, word):
        phonemes = self.g2p(word)
        vi_word = ""
        for p in phonemes:
            # g2p_en returns punctuation/spaces as well
            if p in self.arpa_to_vi:
                vi_word += self.arpa_to_vi[p] + "-"
            elif p.isalpha():
                vi_word += p.lower() + "-"
        
        # Cleanup
        vi_word = vi_word.replace('--', '-').strip('-')
        # Remove repeated hyphens and format nicely
        vi_word = vi_word.replace(' ', '')
        return vi_word

    def process_text(self, text):
        words = re.findall(r'[a-zA-Z0-9_À-ỹ]+|[.,!?;\[\]:]+', text)
        res = []
        for w in words:
            if w.isalpha() and self.is_english_word(w):
                res.append(self.convert_word(w))
            else:
                res.append(w)
                
        # Reconstruct text
        out = " ".join(res)
        # Fix punctuation spacing
        out = re.sub(r'\s+([.,!?;\]])', r'\1', out)
        out = re.sub(r'(\[)\s+', r'\1', out)
        return out

if __name__ == "__main__":
    phonemizer = AutoPhonemizer()
    test_sentences = [
        "Keyshop PNN Home mang đến giải pháp One Stop.",
        "Trải nghiệm Smartphone với công nghệ kháng khuẩn tia UV tiên tiến.",
        "Flash Sale bùng nổ, Voucher giảm giá Livestream.",
        "Bồn cầu rất to, bạn có muốn ăn cá kho tộ không?",  # "to", "ca", "kho" are VN
        "Setup một hệ thống Design Decor đỉnh cao."
    ]
    
    for s in test_sentences:
        print(f"Original: {s}")
        print(f"Auto-G2P: {phonemizer.process_text(s)}\n")
