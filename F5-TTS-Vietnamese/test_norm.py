import sys
import os

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from vinorm import TTSnorm
    print("vinorm:")
    print(TTSnorm("tôi đi tập Gym và Cardio với PT lúc 15:30. Giá 10% giảm còn 500k.", unknown=False, lower=True))
except Exception as e:
    print("vinorm error:", e)
