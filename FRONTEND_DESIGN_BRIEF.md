# TIDO — Frontend Design Brief (cho Claude Sonnet 4.6 / Antigravity)

> File tham chiếu bắt buộc đi kèm: `tido-prototype-v2.html` (mở trực tiếp bằng trình duyệt để xem thiết kế thật, có thể bấm nút chuyển trạng thái để xem đủ 4 giai đoạn của trang dự án).
> Đây là **đặc tả thiết kế đã chốt**, không phải gợi ý — implement đúng theo token, cấu trúc, và logic bên dưới. Không tự ý đổi sang theme sáng, không thêm gradient, không đổi bo góc.

---

## 0. Nguyên tắc bắt buộc (đọc trước khi code)

1. **Không dùng gradient ở bất kỳ đâu.** Toàn bộ màu là flat.
2. **Không dùng bố cục/preset AI-generic** (không card kiểu "glassmorphism", không hero section kiểu SaaS landing mẫu, không icon Font Awesome mặc định).
3. **Tối giản, không hiển thị thông tin dư thừa** — mỗi trang chỉ hiện đúng thứ người dùng cần ở đúng thời điểm đó. Số liệu vận hành (cost, provider health) mặc định ẩn, đưa vào trang Chi phí riêng qua Profile.
4. **1 dự án = 1 trang duy nhất** (`/projects/[id]`), nội dung tự đổi theo `project.stage`, không tách nhiều page cho wizard/overview/creative/production/output.
5. Toàn bộ text tiếng Việt, có dấu chuẩn — dùng font hỗ trợ tiếng Việt đầy đủ.

---

## 1. Tech stack (đã khoá — không đổi)

```
Framework: Next.js 14+ (App Router) + TypeScript
Styling:   Tailwind CSS (custom theme theo token bên dưới, KHÔNG dùng theme mặc định của Tailwind)
Icons:     tự vẽ SVG stroke đơn giản (như trong prototype) hoặc lucide-react — KHÔNG dùng icon set màu mè/3D
Fonts:     next/font/google — Be Vietnam Pro + IBM Plex Mono
```

## 2. Design tokens

Đưa nguyên bộ này vào `tailwind.config.ts` (phần `theme.extend`):

```js
colors: {
  bg:        '#0B0B0C',
  surface:   '#151517',
  surface2:  '#1C1C1F',
  surface3:  '#232326',
  border:    '#28282C',
  borderStrong: '#38383D',
  text:      '#F2F1ED',
  text2:     '#9C9B96',
  text3:     '#65645F',
  accent:    '#E6402F',   // tally light — CHỈ dùng cho trạng thái "đang diễn ra ngay"
  accentDim: '#5A2019',
  ok:        '#5FBF77',
  okDim:     '#1E3323',
  warn:      '#E8A33D',
  warnDim:   '#3A2C10',
},
borderRadius: {
  DEFAULT: '14px',   // card, box, input
  lg: '20px',        // thumbnail lớn, player
  pill: '999px',     // button, chip, badge
},
fontFamily: {
  sans: ['"Be Vietnam Pro"', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'monospace'],
},
boxShadow: {
  card: '0 1px 2px rgba(0,0,0,.35), 0 10px 28px rgba(0,0,0,.28)',
},
```

Toàn bộ nền dùng `bg-bg` (theme tối duy nhất — không làm light mode ở V1).

## 3. Design signature — "Đèn tally" (bắt buộc giữ nhất quán)

Một chấm tròn nhỏ 6px, dùng làm tín hiệu trạng thái xuyên suốt toàn hệ thống — đây là điểm nhận diện riêng của sản phẩm, không được thay bằng badge màu khác:

| Trạng thái | Class Tailwind gợi ý | Ý nghĩa |
|---|---|---|
| Đang diễn ra ngay (render, live) | `bg-accent animate-pulse` | Đỏ, có nhịp pulse nhẹ |
| Hoàn thành / đạt | `bg-ok` | Xanh lá |
| Đang chờ / nháp | `bg-text3` | Xám |
| Cảnh báo / retry | `bg-warn` | Amber |

Dùng ở: card trong Bộ sưu tập, scene block trong trang dự án, item nav sidebar đang active (thanh đỏ nhỏ bên trái icon).

## 4. Component cơ bản

- **Button primary**: nền `text` chữ `bg`, `rounded-pill`, `font-semibold`, padding `py-2.5 px-5`, hover `opacity-90`, active `scale-97`.
- **Button ghost**: nền `surface`, viền `borderStrong`, chữ `text2`, hover chữ `text` viền `text2`.
- **Card/frame**: nền `surface`, viền `border`, `rounded-lg`, `shadow-card`, hover `translate-y-[-3px]` (chỉ ở card có thể click).
- **Thumbnail tỉ lệ thật**: dùng `aspect-[9/16]` cho video dọc, `aspect-[16/9]` cho TVC — KHÔNG bao giờ crop vuông.
- **Input/textarea**: nền `surface`, viền `border`, `rounded` (14px), focus đổi viền sang `text2`, không dùng ring màu.
- **Chip/filter/badge**: luôn `rounded-pill`.

## 5. Cấu trúc trang

### 5.1 Sidebar (persistent, 64px, icon-only)
- Logo: chấm đỏ nhỏ + chữ "TIDO" mono, letter-spacing rộng.
- 1 nav icon duy nhất: **Bộ sưu tập** (route `/`).
- Dưới cùng: avatar tròn (initials) → click mở popover nhỏ chứa: **Chi phí** (`/cost`), **Cài đặt**.
- Không có nav item nào khác — mọi thứ khác nằm trong trang dự án hoặc popover profile.

### 5.2 `/` — Bộ sưu tập
- Header: tiêu đề + nút primary "Tạo dự án mới" → tạo project mới với `stage=DRAFT` rồi redirect `/projects/[id]`.
- Filter chip: Tất cả / Đang sản xuất / Hoàn thành / Nháp (client-side filter theo `project.stage`).
- Grid card: thumbnail đúng tỉ lệ + tên dự án + dòng trạng thái (tally + text). Click → `/projects/[id]`.

### 5.3 `/projects/[id]` — Trang dự án (component chính, quan trọng nhất)

Layout: `grid grid-cols-[1fr_300px] gap-11` — cột trái nội dung chính đổi theo stage, cột phải **Assets panel cố định luôn hiển thị** bất kể stage.

**Logic render cột trái — `switch(project.stage)`:**

```ts
type ProjectStage =
  | 'DRAFT'                        // form brief đầy đủ, editable
  | 'AWAITING_CREATIVE_APPROVAL'   // brief thu gọn 1 dòng + approve bar + scene list (chỉ chữ)
  | 'IN_PRODUCTION'                // brief thu gọn + progress bar + scene list (có thumbnail + tally mỗi scene)
  | 'COMPLETED';                   // output hero (player+QC+variants) lên đầu, brief/script gói trong <details>
```

- **DRAFT**: các field brief — Tên sản phẩm, Mô tả ngắn, Ưu đãi/CTA, Brief chi tiết. **KHÔNG có field "Mục tiêu chính của video"** (đã loại bỏ theo yêu cầu). Nút "Khoá brief & tạo kịch bản".
- **AWAITING_CREATIVE_APPROVAL**: brief hiện dạng box tóm tắt 1 dòng (icon khoá bên phải). Approve bar: chi phí ước tính + 2 nút (Yêu cầu viết lại / Duyệt kịch bản). Danh sách scene: mỗi scene = tag `CẢNH 0X — VAI TRÒ` (mono, màu accent) + mô tả hình ảnh/lời thoại.
- **IN_PRODUCTION**: cùng danh sách scene ở trên, nhưng mỗi scene-block giờ có thêm `scene-thumb-mini` (thumbnail nhỏ tỉ lệ 9:16) bên phải, tally light + QC score hoặc timecode đang render. Có progress bar tổng: `X/Y scenes` — `$đã dùng / $ngân sách`.
- **COMPLETED**: `output-hero` lên đầu (player lớn bên trái, QC checklist + danh sách file xuất + nút Duyệt&hoàn thành/Tải ZIP bên phải). Toàn bộ brief + scene list gói trong `<details><summary>Xem lại brief & kịch bản</summary>...</details>` — dùng `<details>` HTML thuần, không cần JS.

**Cột phải — Assets panel (không đổi theo stage):**
Logo (dropzone) → Màu thương hiệu (3 swatch tròn) → Hình ảnh sản phẩm (lưới 3 cột, ô cuối là nút thêm) → Video tham khảo (input URL) → Ghi chú phong cách (textarea). Đây chính là nơi lưu brand assets, dùng lại xuyên suốt vòng đời dự án.

Header trang: breadcrumb "← Bộ sưu tập", tên dự án, meta (platform · duration), và 1 hàng **stage-mini** (5 chấm nhỏ nối bằng line mảnh, chấm hiện tại màu đỏ, chấm đã qua màu xanh) — đây là toàn bộ những gì còn lại của "trang Tổng quan dự án" cũ, không tách trang riêng.

### 5.4 `/cost` — Chi phí (chỉ vào được qua popover profile)
4 KPI card đầu trang (Hôm nay / Tuần này / Cost per giây / Chênh lệch ước tính) + bảng job (Job ID mono, Dự án, Provider, Ước tính, Thực tế, badge trạng thái). Đây là trang duy nhất được phép mật độ thông tin cao — không áp style tối giản như các trang kia.

## 6. Việc KHÔNG cần làm ở bước này
Không cần dựng các trang admin còn lại (Technique Cards, Footage Library, Voice Profiles, Music Library, Providers, Analytics) — chưa nằm trong phạm vi bản thiết kế đã chốt lần này. Chỉ build đúng 3 route: `/`, `/projects/[id]`, `/cost`.

## 7. Việc cần làm
1. Setup Tailwind theme theo mục 2.
2. Component dùng chung: `Button`, `Chip`, `TallyDot`, `Card`, `StageMini`, `SceneBlock`, `AssetPanel`.
3. Build 3 route trên, ưu tiên `/projects/[id]` vì phức tạp nhất (4 nhánh render theo stage).
4. Dữ liệu dùng mock/placeholder trước — chưa cần nối API thật, chỉ cần đúng cấu trúc UI + state switch để tôi review lại trước khi nối backend.
