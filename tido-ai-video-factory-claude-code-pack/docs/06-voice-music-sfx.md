# Voice, Music and SFX

## Voice

Claude không chọn voice ID. Claude tạo Voice Requirements.

### Requirements
- language/accent
- perceived gender/age
- tone
- energy/warmth/authority
- emotional range
- pace
- profile suitability
- hook strength
- CTA authority

### Voice profile
- voice ID/provider/providerVoiceId
- license
- language/accent
- style/industry/profile tags
- pace range
- emotional range
- quality score
- historical approval

### Flow
1. Claude tạo requirements.
2. Engine lọc language/license.
3. Engine chấm điểm.
4. Có thể preview Top candidates ở bước 7.
5. User duyệt/chọn.
6. Performance Director tạo emotion, pace, pause, emphasis, pronunciation, target duration.
7. Provider render.
8. Voice QC.
9. Retry cùng voice hoặc voice thứ hai.
10. Speech-to-speech chỉ khi provider/license hỗ trợ.

### Open decision
Xác minh kho giọng hiện là voice IDs/models có API hay chỉ audio samples. Audio sample đơn thuần không tự đọc lời thoại mới.

## Music

Không có default track cho mọi project.

### Music Brief
- genre/mood/BPM/key
- instrumentation
- energy curve
- intro impact
- product reveal
- CTA point
- voice compatibility
- loop compatibility
- avoid list

### Source priority
1. customer-provided
2. TIDO licensed
3. licensed commercial library
4. generated/custom
5. producer/composer premium

### Track metadata
Track ID, source, genre, mood, BPM, key, duration, energy, instruments, vocal flag, intro/drop/loop points, license, expiry, restrictions, history.

## SFX

SFX pipeline riêng: action cue, material, distance, intensity, timing, license, ducking.

## Cache keys

- voice = script version + voice ID + performance version
- music edit = track ID + timeline version + mix version
- SFX = source ID + cue version
