"""
TIDO Voice Performance Engine - Vietnamese Spoken Text Normalizer
==================================================================
Converts raw text with numbers, dates, times, currencies, units, symbols, 
and abbreviations into natural spoken Vietnamese text.
"""

import re
import unicodedata

UNITS_MAP = {
    "m²": " mét vuông",
    "m2": " mét vuông",
    "cm²": " xen ti mét vuông",
    "km²": " cây số vuông",
    "km": " cây số",
    "m": " mét",
    "cm": " xen ti mét",
    "mm": " mi li mét",
    "kg": " ki lô gam",
    "g": " gam",
    "l": " lít",
    "ml": " mi li lít",
    "%": " phần trăm",
    "°c": " độ xê",
    "c": " độ xê",
}

ABBREVIATIONS = {
    "tvc": " ti vi xi",
    "f&b": " ép en bi",
    "ai": " a i",
    "ceo": " xi i ô",
    "vip": " vi ai pi",
    "cta": " xi ti a",
    "kpi": " ca pi i",
    "sp": " sản phẩm",
    "vnd": " việt nam đồng",
    "usd": " đô la mỹ",
    "tido": " ti đô",
    "jomo": " jo mo",
    "jomoo": " jo mo",
}

NUM_WORDS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]

def number_to_words_vi(n: int) -> str:
    """Converts integers into spoken Vietnamese words accurately."""
    if n < 0:
        return "âm " + number_to_words_vi(-n)
    if n < 10:
        return NUM_WORDS[n]
    if n < 20:
        if n == 10:
            return "mười"
        if n == 15:
            return "mười lăm"
        return "mười " + NUM_WORDS[n % 10]
    if n < 100:
        ten = n // 10
        unit = n % 10
        ten_str = NUM_WORDS[ten] + " mươi"
        if ten == 1:
            ten_str = "mười"
        if unit == 0:
            return ten_str
        if unit == 1 and ten > 1:
            return ten_str + " mốt"
        if unit == 5:
            return ten_str + " lăm"
        return ten_str + " " + NUM_WORDS[unit]
    if n < 1000:
        hundred = n // 100
        rem = n % 100
        res = NUM_WORDS[hundred] + " trăm"
        if rem == 0:
            return res
        if rem < 10:
            return res + " lẻ " + NUM_WORDS[rem]
        return res + " " + number_to_words_vi(rem)
    if n < 1000000:
        thousand = n // 1000
        rem = n % 1000
        res = number_to_words_vi(thousand) + " nghìn"
        if rem == 0:
            return res
        if rem < 100:
            res += " không trăm"
            if rem < 10:
                return res + " lẻ " + NUM_WORDS[rem]
            return res + " " + number_to_words_vi(rem)
        return res + " " + number_to_words_vi(rem)
    if n < 1000000000:
        million = n // 1000000
        rem = n % 1000000
        res = number_to_words_vi(million) + " triệu"
        if rem == 0:
            return res
        return res + " " + number_to_words_vi(rem)
    
    billion = n // 1000000000
    rem = n % 1000000000
    res = number_to_words_vi(billion) + " tỷ"
    if rem == 0:
        return res
    return res + " " + number_to_words_vi(rem)


class VietnameseTextNormalizer:
    def __init__(self):
        pass

    def normalize(self, text: str) -> str:
        if not text:
            return ""
            
        text = unicodedata.normalize('NFC', text)
        
        # 1. Ampersand, symbols
        text = text.replace("&", " và ").replace("@", " a còng ").replace("#", " ")
        
        # 2. Currencies & Prices Normalization:
        # e.g., "150.000 đồng", "150.000đ", "150.000 VNĐ", "150.000", "1.500.000đ"
        text = re.sub(r'\b(\d{1,3}(?:\.\d{3})+)\s*(?:đ|VND|VNĐ|đồng)?\b', self._norm_thousands_price, text, flags=re.IGNORECASE)
        
        # Match "150k", "150 K", "150k đồng"
        text = re.sub(r'\b(\d+)\s*k\s*(?:đ|VND|VNĐ|đồng)?\b', lambda m: number_to_words_vi(int(m.group(1))) + " nghìn đồng", text, flags=re.IGNORECASE)
        
        # Match plain currency with đồng/đ/vnđ: "150000 đồng", "50000đ"
        text = re.sub(r'\b(\d+)\s*(?:đ|VND|VNĐ|đồng)\b', lambda m: self._norm_currency_vnd(m.group(1)), text, flags=re.IGNORECASE)
        text = re.sub(r'\$\s*(\d+[\d\.]*)', lambda m: self._norm_currency_usd(m.group(1)), text)
        text = re.sub(r'(\d+[\d\.]*)\s*\$', lambda m: self._norm_currency_usd(m.group(1)), text)

        # 3. Time: 8h30, 8h, 14:30
        text = re.sub(r'(\d{1,2})\s*h\s*(\d{1,2})?', self._norm_time_h, text, flags=re.IGNORECASE)
        text = re.sub(r'(\d{1,2}):(\d{2})', self._norm_time_colon, text)

        # 4. Dates: 10/08/2026 or 10-08-2026
        text = re.sub(r'(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})', self._norm_date_full, text)
        text = re.sub(r'(\d{1,2})[\/\-](\d{1,2})', self._norm_date_short, text)

        # 5. Units & Percentages: 20%, 50m2, 10km
        text = re.sub(r'(\d+(?:\,\d+)?)\s*(m²|m2|cm²|km²|km|m|cm|mm|kg|g|l|ml|%|°C)', self._norm_unit, text, flags=re.IGNORECASE)

        # 6. Real decimals with comma: 3,5
        text = re.sub(r'(\d+),(\d+)', self._norm_decimal_comma, text)

        # 7. Slashes/Dashes between numbers: 16/9, 2024-2025
        text = re.sub(r'(\d+)\/(\d+)', r'\1 trên \2', text)
        text = re.sub(r'(\d+)\-(\d+)', r'\1 đến \2', text)

        # 8. Plain Integers
        text = re.sub(r'\b\d+\b', lambda m: number_to_words_vi(int(m.group(0))), text)

        # 9. Abbreviations
        for abbr, spoken in ABBREVIATIONS.items():
            text = re.sub(r'(?i)(?<!\w)' + re.escape(abbr) + r'(?!\w)', spoken, text)

        # 10. Lowercase & clean whitespace
        text = text.lower()
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def _norm_thousands_price(self, match) -> str:
        raw_num = match.group(1).replace('.', '')
        val = int(raw_num)
        return number_to_words_vi(val) + " đồng"

    def _norm_currency_vnd(self, num_str: str) -> str:
        clean_num = int(num_str.replace('.', '').replace(',', ''))
        return number_to_words_vi(clean_num) + " đồng"

    def _norm_currency_usd(self, num_str: str) -> str:
        clean_num = int(num_str.replace('.', '').replace(',', ''))
        return number_to_words_vi(clean_num) + " đô la"

    def _norm_time_h(self, match) -> str:
        hour = int(match.group(1))
        minute = int(match.group(2)) if match.group(2) else 0
        h_str = number_to_words_vi(hour) + " giờ"
        if minute > 0:
            return h_str + " " + number_to_words_vi(minute) + " phút"
        return h_str

    def _norm_time_colon(self, match) -> str:
        hour = int(match.group(1))
        minute = int(match.group(2))
        return number_to_words_vi(hour) + " giờ " + number_to_words_vi(minute) + " phút"

    def _norm_date_full(self, match) -> str:
        day = int(match.group(1))
        month = int(match.group(2))
        year = int(match.group(3))
        return f"ngày {number_to_words_vi(day)} tháng {number_to_words_vi(month)} năm {number_to_words_vi(year)}"

    def _norm_date_short(self, match) -> str:
        day = int(match.group(1))
        month = int(match.group(2))
        return f"ngày {number_to_words_vi(day)} tháng {number_to_words_vi(month)}"

    def _norm_unit(self, match) -> str:
        val_str = match.group(1)
        unit_str = match.group(2).lower()
        
        if ',' in val_str:
            parts = val_str.split(',')
            val_spoken = number_to_words_vi(int(parts[0])) + " phẩy " + number_to_words_vi(int(parts[1]))
        else:
            val_spoken = number_to_words_vi(int(val_str))
            
        unit_spoken = UNITS_MAP.get(unit_str, " " + unit_str)
        return val_spoken + unit_spoken

    def _norm_decimal_comma(self, match) -> str:
        whole = int(match.group(1))
        frac = int(match.group(2))
        return f"{number_to_words_vi(whole)} phẩy {number_to_words_vi(frac)}"
