# TIDO AI Video Factory — Claude Code Starter Pack

Bộ tài liệu này là nguồn chuẩn để Claude Code phân tích, lập kế hoạch và xây dựng **TIDO AI Video Factory Version 1**.

## Hai Production Profile

### 1. Short Vertical 9:16
- TikTok, Facebook Reels, YouTube Shorts
- 1080 × 1920
- 15 hoặc 30 giây trong MVP

### 2. TVC Horizontal 16:9
- TVC ngắn, digital commercial, YouTube, website, digital screen
- 1920 × 1080
- 15 hoặc 30 giây trong MVP

> PDN/phim doanh nghiệp dài chưa thuộc Version 1. Kiến trúc phải cho phép thêm profile long-form riêng sau này.

## Quyết định đã khóa

- Stage 1 do người dùng nhập, kiểm tra và xác nhận; không dùng AI để suy luận dữ liệu kinh doanh.
- Stage 2 dùng Claude.
- Bước 7 là user approval bắt buộc trước production.
- Toàn bộ ảnh AI chỉ dùng Nano Banana 2.
- Nhạc được chọn động theo từng project; không dùng một track mặc định.
- Kho giọng công ty được dùng để render lời thoại mới theo kịch bản.
- Kiến thức quay, ánh sáng, directing, editing, audio của TIDO được cấu trúc thành Production Technique Cards.
- Mỗi scene là một job độc lập.
- Logo, giá, ưu đãi, CTA, subtitle và legal text luôn dựng bằng code/template.
- Không xây hai backend riêng cho 9:16 và 16:9; dùng Core System + Production Profile.
- PostgreSQL là source of truth.
- Mọi model, capability và giá phải nằm trong Model Registry, không hard-code.

## Bắt đầu

1. Đọc `CLAUDE.md`.
2. Đọc `docs/00-master-system-spec.md`.
3. Đọc `docs/99-open-decisions.md`.
4. Không code ngay; trước tiên tạo ADR, kế hoạch phase, risk register và acceptance criteria.
5. Chỉ triển khai Phase 0 sau khi các open decision quan trọng được xác nhận.
