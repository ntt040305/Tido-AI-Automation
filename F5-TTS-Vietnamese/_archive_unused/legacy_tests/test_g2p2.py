import re

def is_likely_english(word):
    # Only ascii
    if not all(ord(c) < 128 for c in word):
        return False
    
    # Common VN words without diacritics
    vn_no_diacritics = {"anh", "ban", "cho", "con", "em", "nha", "co", "di", "la", "ma", "na", "ta", "va", "ba", "ca", "da", "ha", "ka", "pa", "qa", "ra", "sa", "xa", "za"}
    if word.lower() in vn_no_diacritics:
        return False
    
    # English specific combinations
    eng_patterns = ['tion', 'ing', 'ment', 'able', 'ive', 'ous', 'ful', 'less', 'ness', 'ly', 'er', 'est', 'ism', 'ist', 'ity', 'ty', 'ship', 'hood', 'dom', 'th', 'sh', 'ch', 'ph', 'oo', 'ee', 'ea', 'oa', 'ou', 'ie', 'ei', 'ce', 'ge', 'ck', 'sm', 'sn', 'sp', 'st', 'sk', 'sl', 'sw', 'tw', 'dw', 'gw', 'kw', 'qw', 'pw', 'bw', 'vw', 'mw', 'nw']
    
    # Check if word ends with non-VN consonants
    if re.search(r'[bdfghjklqrswxz]$', word.lower()):
        return True
    
    for p in eng_patterns:
        if p in word.lower():
            return True
            
    return False

test_words = ["Smartphone", "Sale", "Voucher", "Online", "Combo", "Keyshop", "Home", "PNN", "anh", "cho", "đến", "trưng", "bày"]
for w in test_words:
    print(f"{w} -> is_english: {is_likely_english(w)}")
