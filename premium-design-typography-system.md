# Cẩm Nang Quy Chuẩn Thiết Kế Thương Mại Cao Cấp & Hệ Thống Typography (Giai Đoạn 1)

Tài liệu này tổng hợp chi tiết và hệ thống hóa các tiêu chuẩn thiết kế thương hiệu cao cấp từ **Apple, Nike, Samsung** kết hợp cùng học thuyết phân cấp chữ và khoảng cách chuẩn quốc tế (**Material Design 3**, **Design Systems Collective**). Đây là nền tảng cốt lõi để định hình bộ khung kiến thức sáng tạo chất lượng cao (Creative Knowledge Framework) chuẩn mực toàn cầu.

---

## PHẦN 1: PREMIUM COMMERCIAL DESIGN BENCHMARKS (QUY CHUẨN THƯƠNG HIỆU CAO CẤP)

### A. Apple: Thiết Kế Tối Giản Cao Cấp & Nhất Quán Hệ Sinh Thái (Minimalist Luxury)

Apple đại diện cho trường phái thiết kế tối giản siêu thực (hi-fidelity), hướng đến sự sang trọng và tập trung tuyệt đối vào sản phẩm bằng cách loại bỏ mọi chi tiết thừa.

#### 1. Quy chuẩn hình ảnh sản phẩm (Product Imagery Guidelines)
*   **Tính chân thực tuyệt đối (Hi-Fidelity):** Ảnh thiết bị Apple bắt buộc phải sử dụng thế hệ phần cứng mới nhất, hiển thị ở góc nhìn trực diện (straight-on view) hoàn hảo. Không cho phép bất kỳ vật cản hay yếu tố che khuất nào đè lên sản phẩm.
*   **Lớp bóng gương màn hình (Screen Shine Layer):** Để tăng tính chân thực và chiều sâu cho thiết kế mockup, ảnh sản phẩm luôn luôn phải tích hợp một lớp bóng gương (shine layer) thực tế đè lên nội dung màn hình. Trong bộ tài liệu Marketing Resources chính thức của Apple, lớp bóng gương này được tách thành một layer riêng biệt để nhà thiết kế kiểm soát độ đục/mờ (opacity).
*   **Những điều cấm kỵ tuyệt đối (Don'ts):**
    *   *Không* tự ý cắt xén (cropping) hoặc cắt cụt góc (cut-off) sản phẩm.
    *   *Không* xếp chồng các thiết bị đè lên nhau (overlap) hoặc xoay nghiêng thiết bị ở các góc méo mó (rotating/angling).
    *   *Không* tự tạo bóng đổ giả tạo (drop shadow) mà phải tôn trọng ánh sáng studio tự nhiên nguyên bản.

#### 2. Hệ thống Typography của Apple (SF Pro, SF Compact, SF Mono & New York)
*   **San Francisco (SF Pro) - Trọng tâm hệ thống:** Font chữ không chân (sans-serif) hiện đại, hỗ trợ Dynamic Type để tự động co giãn kích thước theo tùy chỉnh hỗ trợ tiếp cận (accessibility) của người dùng.
    *   *SF Pro Text (Dành cho kích thước ≤ 19pt):* Tối ưu cho việc hiển thị các đoạn văn bản dài (body text). Đòi hỏi bù tracking thủ công cực kỳ chặt chẽ (ví dụ: 17pt cần bù tracking -0.43px, line-height đạt 120–130% ~22pt leading) để chữ không bị thưa mắt ở kích thước nhỏ.
    *   *SF Pro Display (Dành cho kích thước ≥ 20pt):* Dành riêng cho tiêu đề (header, title). Spacing được thu hẹp lại để tạo tính cô đọng (ví dụ: 28pt cần bù tracking -0.8px, line-height 110–120% ~34pt leading).
    *   *SF Pro Rounded:* Biến thể bo tròn góc của SF Pro, sử dụng cho các giao diện mang tính thân thiện, trẻ trung hoặc các nút bấm tương tác mềm mại.
*   **SF Mono (Monospace):** Font chữ đơn sắc (độ rộng ký tự bằng nhau), chuyên dùng cho các thông số kỹ thuật, bảng dữ liệu phức tạp hoặc hiển thị code thô để đảm bảo thẳng hàng cột hoàn hảo.
*   **New York (NY) - Serif (Editorial style):** Font chữ có chân cổ điển, mang phong cách xã luận, báo chí tạp chí. NY sở hữu các kích thước quang học (optical sizes) riêng biệt gồm *NY Small* (cho body copy dưới 20pt) và *NY Large* (cho tiêu đề display lớn).

#### 3. Quy chuẩn phân cấp kích thước Dynamic Type của Apple (Bảng thông số Default - Large)

| Style | Font Weight | Size (points) | Leading (points) | Tracking (points) | Ứng dụng thực tiễn |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Large Title** | Bold | 34pt | ~41pt | -1.05px | Tiêu đề màn hình chính, Hero Text |
| **Title 1** | Bold | 28pt | ~34pt | -0.80px | Tiêu đề phân đoạn lớn nhất |
| **Title 2** | Bold | 22pt | ~28pt | -0.70px | Tiêu đề phân đoạn cấp 2, Modal headers |
| **Title 3** | Semibold | 20pt | ~25pt | -0.60px | Tiêu đề nhóm danh sách |
| **Headline** | Semibold | 17pt | ~22pt | -0.43px | Tiêu đề nhấn mạnh trong bài viết |
| **Body** | Regular | 17pt | ~22pt | -0.43px | Nội dung bài đọc chính (Main reading) |
| **Callout** | Regular | 16pt | ~20pt | -0.32px | Mô tả phụ, trích dẫn nổi bật |
| **Subhead** | Regular | 15pt | ~19pt | 0px | Nhãn biểu mẫu (Form labels) |
| **Footnote** | Regular | 13pt | ~16pt | +0.03px | Chú thích nhỏ, siêu dữ liệu (Metadata) |
| **Caption 1** | Regular | 12pt | ~15pt | +0.12px | Chú thích ảnh, gợi ý giao diện phụ |
| **Caption 2** | Regular | 11pt | ~14pt | +0.15px | Chữ cực nhỏ (Microcopy) |

---

### B. Nike: Năng Lượng Thể Thao Đột Phá & Sự Khẩn Trương Tích Cực (Optimistic Urgency)

Ngôn ngữ thiết kế của Nike tập trung vào việc khơi dậy cảm xúc mãnh liệt, năng lượng chuyển động không ngừng và thúc đẩy tinh thần bứt phá giới hạn.

#### 1. Triết lý bố cục & Thông điệp thị giác
*   **Khái niệm "Optimistic Urgency" (Sự khẩn trương tích cực):** Nike xây dựng các layout mang tính "hối thúc" nhưng đầy lạc quan. Hệ thống nhận diện sử dụng cấu trúc lưới mở dạng thô (exposed grid) để thể hiện tính minh bạch, chân thực. Các sọc cảnh báo (hazard striping) lấy cảm hứng từ các phương tiện khẩn cấp kết hợp cùng tông màu xanh/vàng neon cực kỳ rực rỡ (**Volt**) làm điểm nhấn thị giác nhằm kích thích hành động ngay lập tức.
*   **Nhiếp ảnh hành động cao cấp (Action & Motion Photography):** Ảnh quảng cáo của Nike không chụp tĩnh một cách nhàm chán. Họ tổ chức các buổi chụp ngoại cảnh quy mô lớn (hàng chục địa điểm, nhiều nhiếp ảnh gia và đạo diễn hình ảnh phối hợp cùng lúc) để ghi lại những khoảnh khắc bùng nổ, mồ hôi, cơ bắp căng cứng và chuyển động ở tốc độ cực đại của vận động viên.
*   **Độ tương phản thị giác tuyệt đối (Extreme Contrast):** Nike thường xử lý hình ảnh trên hai thái cực nền tương phản cực cao để tối ưu hóa sự tập trung: Nền tối tối đa (#111111) hoặc nền sáng trắng tinh khiết (#FEFEFE). Sản phẩm được đặt ở vị trí bắt mắt, hưởng ánh sáng cường độ cao để nổi bật từng chi tiết kỹ thuật.

#### 2. Hệ thống Typography mạnh mẽ của Nike
*   **Futura Condensed Extra Bold / Black:** Bản sắc chữ viết mang tính biểu tượng của thương hiệu. Phông chữ không chân dạng hình học được kéo nén theo chiều ngang và luôn viết HOA toàn bộ (all-caps) để thể hiện sự vững chãi, quyền lực tối thượng và tính khẩn thiết. Phông này thường được đặt ở kích thước khổng lồ (≥ 50pt) cho các tiêu đề chính và khẩu hiệu bất hủ "JUST DO IT".
*   **Trade Gothic Bold:** Font chữ mang hơi thở công nghiệp thô ráp (industrial/raw but athletic), thường được chọn làm tiêu đề phụ (subheading, ~34pt) để bổ trợ tính khỏe khoắn cho Futura.
*   **Helvetica / Helvetica Neue:** Phông chữ không chân trung tính hoàn hảo, được sử dụng cho toàn bộ khối văn bản thường (body text, ~18pt) để mang lại cảm giác dễ chịu khi đọc và giữ nguyên sự tập trung của người dùng vào sản phẩm hoặc thông điệp chính.

---

### C. Samsung: Công Nghệ Siêu Kết Nối & Đơn Giản Hài Hòa (Design Identity 5.0)

Triết lý thiết kế của Samsung được xây dựng trên triết lý **Design Identity 5.0 (Essential · Innovative · Harmonious)** - Thiết yếu, Sáng tạo và Hài hòa, nhấn mạnh vào sự kết nối thông minh toàn cầu.

#### 1. Quy chuẩn bố cục truyền thông (Communication Layout Guidelines)
*   **Định vị Wordmark (Logo):** Logo chữ Samsung 2D bắt buộc phải luôn luôn được đặt cố định tại góc trên cùng bên trái (top-left corner) của ấn phẩm thiết kế. Màu sắc của logo phải hòa hợp thống nhất với dải màu chung của ấn phẩm (hòa quyện với nền màu xanh hoặc đen trắng).
*   **Đường cong đặc trưng (Samsung Line):** Ứng dụng trực quan mô phỏng theo đường cong elip (oval) của logo truyền thống được đưa vào cấu trúc bố cục thiết kế quảng cáo và website, tạo nên một "dòng chảy thị giác" liền mạch và mềm mại.
*   **Quy tắc thông điệp cô đọng (Single-Minded Message):** Mỗi một ấn phẩm quảng cáo chỉ được phép truyền tải duy nhất một thông điệp cốt lõi để tránh sự lộn xộn thị giác. Khối văn bản nội dung (body copy) cấm vượt quá 5 dòng và các dòng phải được giãn khoảng cách bằng nhau tuyệt đối (equal spacing).
*   **Kích thước & Bố trí sản phẩm:** Sản phẩm công nghệ phải là tiêu điểm trung tâm lớn nhất trong khung hình. Kích thước phông chữ tối thiểu cho body copy trên các ấn phẩm in ấn thương mại là 14pt để đảm bảo tính dễ đọc cho mọi lứa tuổi.

#### 2. Hệ thống Brand Fonts độc quyền của Samsung
*   **Samsung Sharp Sans (Headline & Quảng cáo):** Font chữ hình học (geometric sans) độc quyền mang tính biểu tượng thương mại của Samsung. Trọng lượng **Bold** được sử dụng làm trọng tâm chính cho các tiêu đề quảng cáo nhằm thể hiện sự hiện đại, sắc nét và hướng tương lai. Trọng lượng Medium và Regular được phân cấp để sử dụng cho tiêu đề phụ và nhãn sản phẩm.
*   **SamsungOne (Giao diện số & Khối văn bản):** Font chữ dạng Humanist Sans-serif thân thiện, hiện đại, có tỷ lệ thiết kế cân đối hoàn hảo. Đây là phông chữ nền tảng được cài đặt mặc định trên toàn bộ hệ sinh thái thiết bị thông minh của Samsung: Giao diện One UI (Smartphones), nền tảng bảo mật Samsung Knox, TV thông minh, tủ lạnh Family Hub và các hướng dẫn văn bản dài. SamsungOne tối ưu cực tốt cho độ đọc (legibility) ở các màn hình có độ phân giải khác nhau dưới mọi góc nhìn và điều kiện ánh sáng môi trường.

---

## PHẦN 2: UNIVERSAL TYPOGRAPHY & SPACING SYSTEMS (QUY CHUẨN THIẾT KẾ QUỐC TẾ)

Để xây dựng một bộ óc AI thiết kế chuẩn mực như chuyên gia, hệ thống cần áp dụng nghiêm ngặt các nguyên lý phân cấp thị giác quốc tế từ **Material Design 3 (M3)** và **Design Systems Collective**:

### 1. Quy tắc giới hạn 2 phông tối đa (2-Font Maximum Rule)
Không bao giờ sử dụng vượt quá 2 họ phông chữ (font families) trong một hệ thống thiết kế tổng thể. Việc phối hợp quá nhiều loại phông chữ sẽ phá vỡ tính nhất quán và gây nhiễu loạn thị giác nghiêm trọng.
*   *Công thức phối hợp hoàn hảo:* 
    *   **Phông chính:** Sans-serif (cho UI, tiêu đề chính, nút bấm).
    *   **Phông phụ:** Serif (cho các bài viết dài mang phong cách tạp chí, xã luận) HOẶC Monospace (cho các khối số liệu kỹ thuật, mã code).

### 2. Sự tương phản bằng kích thước thay vì lạm dụng độ đậm (Size Contrast Over Weight)
Sai lầm phổ biến nhất của các nhà thiết kế nghiệp dư là biến tất cả các tiêu đề thành chữ Bold (đậm). Một hệ thống chuyên nghiệp tạo ra sự sang trọng bằng các bước nhảy kích thước lớn (size jumps) và khoảng trắng (whitespace) thoáng đãng xung quanh chữ.
*   *Ví dụ tối ưu:*
    *   `H1` (Tiêu đề chính): **49px Regular** (kết hợp khoảng trắng rộng rãi).
    *   `H2` (Tiêu đề phụ): **31px Medium**.
    *   `H3` (Tiêu đề cấp 3): **25px Regular**.
    *   `Body` (Nội dung thường): **16px Regular**.

### 3. Giới hạn số lượng trọng lượng chữ (Less Is More)
Chỉ nên định nghĩa tối đa 4 trọng lượng chữ (font weights) trong toàn bộ hệ sinh thái thiết kế để các lập trình viên và AI có thể áp dụng đồng đều:
1.  **Light (300):** Chỉ dùng cho các mục đích trang trí nghệ thuật hoặc số liệu cực lớn.
2.  **Regular (400):** Dành cho nội dung văn bản chính (body text) để dễ đọc nhất.
3.  **Medium / Semibold (500-600):** Dành cho tiêu đề phụ hoặc nhãn của nút bấm (CTA).
4.  **Bold (700):** Dành riêng cho tiêu đề chính (headline) nổi bật nhất.

### 4. Quy chuẩn tỷ lệ giãn dòng khoa học (Line Height / Leading)
Giãn dòng phải tỷ lệ thuận với kích thước phông chữ và mục đích sử dụng để mắt người đọc không bị mỏi:
*   **Tight (Tỷ lệ 1.1 - 1.2 x Type Size):** Áp dụng cho các tiêu đề cực lớn (Headline, Title, Display). Điều này giúp các dòng tiêu đề liên kết chặt chẽ thành một khối thống nhất, không bị rời rạc.
*   **Normal (Tỷ lệ 1.4 - 1.5 x Type Size):** Áp dụng cho khối văn bản chính (Body copy). Khoảng giãn này tạo đường dẫn thị giác hoàn hảo giúp mắt lướt qua các dòng tiếp theo một cách mượt mà.
*   **Loose (Tỷ lệ 1.6 - 1.8 x Type Size):** Áp dụng cho các chữ kích thước siêu nhỏ (Caption, Metadata) hoặc đoạn văn có mật độ nội dung cực dày đặc để tăng độ thoáng khí, dễ đọc.

### 5. Cách đặt tên có tính hệ thống (Semantic Naming)
Thay vì đặt tên phông chữ theo kích thước cơ học (ví dụ: Chữ 34px, Chữ nhỏ, Chữ siêu to), hãy sử dụng cách đặt tên theo token ngữ nghĩa (semantic tokens) tương thích hoàn hảo với hệ thống phát triển phần mềm:
*   `Display`: Chữ cực lớn mang tính trang trí, dùng cho poster nghệ thuật, banner quảng cáo.
*   `Headline`: Tiêu đề chính của các bài viết hoặc phân đoạn lớn.
*   `Subhead`: Tiêu đề phụ, phân loại danh mục cấp 2.
*   `Body`: Văn bản đọc chính thức.
*   `Label / Caption`: Các nhãn nút bấm, chú thích ảnh, siêu dữ liệu nhỏ.

---

## PHẦN 3: ĐỘ ĐỌC & QUY CHUẨN KỸ THUẬT TYPESETTING (ACCESSIBILITY & TYPESETTING)

### 1. Kỹ thuật Typesetting theo từng nền tảng
*   **Phương pháp Padding & Bounding Box (Web và iOS):** Chiều cao giãn dòng (line-height) tương đương với chiều cao của hộp giới hạn (bounding box). Văn bản được căn giữa theo chiều dọc của bounding box theo cơ chế *half-leading* của CSS. Để căn chỉnh khoảng cách, nhà thiết kế đo khoảng cách từ viền ngoài của bounding box đến các phần tử xung quanh thay vì đo từ chân chữ.
*   **Phương pháp Đường cơ sở - Baseline (Android):** Đường cơ sở là đường thẳng vô hình nơi chân các chữ cái nằm lên. Đối với Android, tất cả khoảng cách của chữ phải được đo đạc chính xác từ baseline của dòng này đến baseline của dòng kia, hoặc từ baseline đến mép của container để đảm bảo tính hoàn hảo tuyệt đối trên mọi độ phân giải thiết bị.

### 2. Quy chuẩn tiếp cận học (Accessibility Contrast)
Hệ thống thiết kế phải đảm bảo khả năng tiếp cận cao nhất đối với những người có thị lực kém bằng cách duy trì tỷ lệ tương phản màu sắc (contrast ratio) theo tiêu chuẩn WCAG:
*   **Đối với chữ lớn (Large Text ≥ 18pt hoặc 14pt Bold):** Tỷ lệ tương phản tối thiểu là **3:1** so với màu nền.
*   **Đối với chữ nhỏ (Small Text < 18pt):** Tỷ lệ tương phản bắt buộc tối thiểu là **4.5:1** so với màu nền.
*   **Liên kết (Hyperlinks):** Văn bản chứa liên kết phải luôn sử dụng màu sắc chủ đạo nổi bật (Primary Color) và bắt buộc phải có đường gạch chân (underlined) để người mù màu dễ dàng nhận diện mà không bị phụ thuộc hoàn toàn vào màu sắc.

*Tài liệu tổng hợp và lưu trữ bởi Gemini Notebook (Commercial Design Benchmark and Creative Knowledge Framework).*
