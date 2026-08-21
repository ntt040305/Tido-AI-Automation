# TIDO AI Video Factory — Demo Setup Guide

## 🚀 Khởi động ứng dụng

```bash
cd d:\Tido\tido-ai-video-factory-claude-code-pack\apps\web
npm run dev
```
Mở trình duyệt: **http://localhost:3000**

---

## ⚙️ Cấu hình API Keys (file `.env.local`)

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxx
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxx
```

---

## 📋 Bước 1: AI Script Studio (Claude API)

### Lấy API Key Claude (MIỄN PHÍ $5 credit)
1. Vào https://console.anthropic.com → Sign up
2. **API Keys** → Create Key
3. Điền vào `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`

### Sử dụng
- Nhập **prompt** mô tả video (ví dụ: "Quảng cáo sữa cho bà mẹ trẻ")
- Chọn **profile**: TVC 16:9 hoặc Short 9:16
- Chọn **thời lượng**: 15s / 30s / 1 phút / 3 phút
- Nhấn **"Tạo kịch bản với Claude AI"**

---

## 🎙️ Bước 2: Voice Studio (ElevenLabs + 3 giọng TIDO)

### Vấn đề kỹ thuật quan trọng

> **3 file MP3 là audio samples** — chúng không thể "tự đọc" text mới.
> Để voice đọc theo kịch bản, cần **Voice Cloning** qua ElevenLabs:

### Quy trình Voice Cloning (1 lần)

1. **Đăng ký ElevenLabs**: https://elevenlabs.io (Free: 10,000 ký tự/tháng)
2. **Upload giọng mẫu**: Voices → Add Voice → **Instant Voice Cloning**
   - Upload `HaiAnh.mp3` → Đặt tên "Hai Anh TIDO" → Copy **Voice ID**
   - Upload `Phuctido1.mp3` → Đặt tên "Phuc TIDO" → Copy **Voice ID**
   - Upload `VuHuyen.mp3` → Đặt tên "Vu Huyen TIDO" → Copy **Voice ID**

3. **Điền Voice IDs** vào `/app/api/voices/route.ts`:
```ts
// Tìm và thay thế:
elevenLabsId: "ELEVENLABS_VOICE_ID_HAIANH",   // → voice_abc123...
elevenLabsId: "ELEVENLABS_VOICE_ID_PHUC",      // → voice_def456...
elevenLabsId: "ELEVENLABS_VOICE_ID_VUHUYEN",   // → voice_ghi789...
```

4. **Điền API Key** vào `.env.local`: `ELEVENLABS_API_KEY=sk_...`

### Tính năng Voice Studio

| Tính năng | Mô tả |
|-----------|-------|
| 🎙️ Preview giọng mẫu | Nghe 3 giọng gốc ngay trong app |
| 🎭 Performance Direction | Chọn cảm xúc: Ấm áp / Hứng khởi / Chuyên nghiệp / Đam mê / Nhẹ nhàng |
| 🐢🚶🏃 Tốc độ đọc | Chậm / Thường / Nhanh |
| 📄 Dùng kịch bản AI | Tự trích xuất lời thoại từ kịch bản Claude |
| ✏️ Văn bản tự do | Nhập bất kỳ text nào, có thể test 3 phút |
| ⬇️ Download MP3 | Tải file audio về máy |

---

## 🗂️ Cấu trúc file đã tạo

```
apps/web/
├── app/
│   ├── page.tsx                    # Trang chính, tab navigation
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Design system (dark theme)
│   └── api/
│       ├── generate-script/route.ts  # Claude API endpoint
│       ├── render-voice/route.ts     # ElevenLabs TTS endpoint
│       └── voices/route.ts           # Voice registry
├── components/
│   ├── ScriptStudio.tsx            # UI tạo kịch bản
│   └── VoiceStudio.tsx             # UI render voice
└── public/voices/
    ├── HaiAnh.mp3                  # Giọng mẫu gốc
    ├── Phuctido1.mp3               # Giọng mẫu gốc
    └── VuHuyen.mp3                 # Giọng mẫu gốc
```

---

## 💰 Chi phí ước tính

| Service | Plan | Chi phí |
|---------|------|---------|
| Claude API | claude-3-5-haiku | ~$0.001/kịch bản |
| ElevenLabs | Free tier | 10,000 ký tự/tháng miễn phí |
| ElevenLabs | Starter $5/tháng | 30,000 ký tự (~25 video 3 phút) |

---

## 🔮 Roadmap Phase tiếp theo

Sau khi demo này được duyệt:
- **Phase 3**: Tích hợp Nano Banana 2 để sinh ảnh AI theo scene
- **Phase 5**: Voice Engine đầy đủ (scoring, QC, preview top candidates)
- **Phase 7**: Remotion Composer — ghép video hoàn chỉnh
