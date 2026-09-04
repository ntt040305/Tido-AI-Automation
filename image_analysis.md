# Tài Liệu Phân Tích Hình Ảnh & Cấu Trúc Visual Reference Dataset (image_analysis.md)

Tài liệu này được thiết kế như một phần của **Creative Knowledge Framework** nhằm định hình nhóm dữ liệu tham chiếu thị giác (**Visual Reference Dataset**). Nhóm dữ liệu này là cơ sở để huấn luyện AI sinh ảnh (Generative AI) hoặc hướng dẫn các nhà thiết kế hiểu rõ ranh giới kỹ thuật và thẩm mỹ giữa thiết kế thương mại cao cấp (**GOOD**) và thiết kế nghiệp dư (**BAD**).

---

## 1. BẢN ĐỒ THƯ MỤC HỆ THỐNG (DIRECTORY MAP)

Để AI hoặc hệ thống quản trị dữ liệu có thể truy xuất một cách có cấu trúc, toàn bộ ảnh tham chiếu được tổ chức theo sơ đồ thư mục chuẩn hóa sau:

```text
TIDO_CREATIVE_KNOWLEDGE/
└── Visual_Reference_Dataset/
    ├── premium_food_ads/
    │   ├── good_001.jpg      # High-speed beverage splash with perfect condensation
    │   ├── good_002.jpg      # Minimalist gourmet table setting with organic lighting
    │   └── bad_001.jpg       # Flat-light burger advertisement with cluttered typography
    ├── premium_beauty_ads/
    │   ├── good_001.jpg      # Sensory skincare cream smear under 90-degree side light
    │   ├── good_002.jpg      # Dropper serum bottle with natural water texture and foliage shadow
    │   └── bad_001.jpg       # Hard-flash flat lay of beauty bottles with zero dimensional depth
    ├── premium_tech_ads/
    │   ├── good_001.jpg      # High-fidelity exploded view of metallic earbuds with rim lighting
    │   ├── good_002.jpg      # Smartphone mockup with realistic screen shine layer & straight angle
    │   └── bad_001.jpg       # AI-hallucinated smartphone with distorted ports and generic drop shadow
    └── premium_social_ads/
        ├── good_001.jpg      # Instagram Stories fashion editorial using asymmetric Swiss grid
        ├── good_002.jpg      # Bento grid product feature compilation with clean semantic tokens
        └── bad_001.jpg       # Cluttered promotional banner with 4+ mismatched fonts and neon badges
```

---

## 2. PHÂN TÍCH CHI TIẾT ẢNH THAM CHIẾU (IMAGE ANALYSIS & COMPARISON)

### KÝ HIỆU TIÊU CHÍ ĐÁNH GIÁ (EVALUATION METRICS):
*   **[PF] Product Fidelity**: Độ chân thực vật liệu, tính nguyên bản hình học của sản phẩm.
*   **[TY] Typography**: Phân cấp chữ, tính tương thích của phông chữ với tâm lý sản phẩm.
*   **[CL] Composition & Layout**: Khung lưới gióng hàng, tỷ lệ khoảng trống, luồng quét mắt.
*   **[PL] Photography & Lighting**: Hướng sáng, bóng đổ, kỹ thuật studio đặc thù.

---

### A. THƯ MỤC: `premium_food_ads/` (QUẢNG CÁO ẨM THỰC CAO CẤP)

#### 1. ẢNH THAM CHIẾU: `good_001.jpg` (Chuyển động Splash nước ép cam cao tốc)
*   **Mô tả trực quan**: Một chai nước ép cam thủy tinh đặt lệch tâm trên lưới Axial Grid. Một cú va chạm mạnh tạo ra làn sóng bắn tung tóe (splash) ôm lấy thân chai, các giọt nước ngưng tụ li ti bao phủ đều đặn trên bề mặt chai thủy tinh. Nền tối giản chuyển sắc nhẹ từ cam sang xám trung tính.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PL - Ánh sáng]**: Sử dụng thiết lập ánh sáng **Backlit** (chiếu từ sau ra trước) kết hợp hai tấm phản quang lớn ở hai sườn sườn (V-Flats). Kỹ thuật này chiếu xuyên qua chất lỏng màu cam, làm nổi bật sắc độ trong suốt, rực rỡ của nước cam và tạo đường viền sáng mảnh sắc nét (Rim Light) quanh chai thủy tinh mà không gây cháy sáng.
    *   **[PF - Độ chân thực]**: Áp dụng kỹ thuật tạo ngưng tụ giả bằng **tỷ lệ hỗn hợp 50% Glycerin và 50% Nước**. Các hạt ngưng tụ bám chặt, tròn xoe, tụ lại đúng vùng tiếp xúc lạnh (fill line) của chai, không bị chảy dài hay nhòe nhoẹt. Đây là điểm mấu chốt kích hoạt "tâm lý vị giác" thèm khát sự mát lạnh.
    *   **[CL - Bố cục]**: Sử dụng trục gióng lệch tâm 1/3 (Rule of Thirds). Sự bùng nổ của chất lỏng tạo ra một đường dẫn hướng chéo (diagonal flow), đưa mắt người xem từ cú splash trực tiếp đến nhãn chai thương hiệu đặt tinh tế ở góc dưới.

#### 2. ẢNH THAM CHIẾU: `good_002.jpg` (Ẩm thực cao cấp - Bàn tiệc tối giản)
*   **Mô tả trực quan**: Một đĩa mì Ý hải sản đặt trên bàn đá cẩm thạch thô xám, ánh sáng mặt trời xiên góc chiếu qua khe cửa sổ tạo thành các vệt bóng đổ sọc ngang tinh tế. Bố cục tối giản tuyệt đối, chỉ có đĩa mì, một nhánh hương thảo khô và một ly rượu vang xa xăm bị làm mờ (shallow depth of field).
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PL - Ánh sáng]**: Ánh sáng tự nhiên góc thấp (low-angle side light) hướng 45 độ từ phía sau bên trái. Sử dụng **khe tạo bóng (Gobo)** mô phỏng bóng đổ khung cửa sổ gỗ cổ điển, tạo cảm giác yên bình của một buổi chiều Châu Âu ấm áp, kích thích trải nghiệm dùng bữa sang trọng (Premium Fine-Dining).
    *   **[CL - Bố cục]**: Sử dụng **Swiss Grid hệ 3 cột**. Đĩa mì nằm chính xác tại điểm giao cắt của lưới. Khoảng trống (Whitespace) chiếm tới 60% diện tích ảnh, tạo không gian "thở" cực kỳ đắt giá, nâng tầm giá trị đĩa ăn.

#### 3. ẢNH THAM CHIẾU KHÁC BIỆT: `bad_001.jpg` (Quảng cáo Burger nghiệp dư)
*   **Mô tả trực quan**: Một chiếc Burger bò phô mai nằm ở chính giữa khung hình, chụp trực diện góc thẳng (flat-on). Phía sau là nền đỏ rực chói mắt. Phía trên đè chồng một khối chữ vàng viền đen dày cộp ghi "SUPER SALE - 50%".
*   **Lỗi kỹ thuật nghiêm trọng**:
    *   **[PL - Ánh sáng]**: Sử dụng ánh sáng bẹt (**Flat Lighting** - đèn flash cắm thẳng từ đỉnh máy ảnh). Điều này làm triệt tiêu hoàn toàn bóng đổ tự nhiên của các lớp nguyên liệu bên trong Burger, khiến miếng thịt trông khô khốc, xơ xác và lát cà chua bị phản quang lóa trắng dẹt lì.
    *   **[TY - Typography]**: Lạm dụng phông chữ **Impact Bold** viết hoa toàn bộ, thêm đường viền stroke đen dày và đổ bóng drop shadow thô bạo. Chữ đè trực tiếp lên phần chóp bánh mì Burger, vừa phá hủy phân cấp thị giác vừa che khuất sản phẩm chính.
    *   **[PF - Độ chân thực]**: Rau xà lách bên trong Burger bị héo rũ, phô mai đông cứng loang lổ do không được can thiệp bởi stylist ẩm thực chuyên nghiệp (ví dụ như xịt ẩm hoặc dùng súng nhiệt làm chảy phô mai vừa độ).

---

### B. THƯ MỤC: `premium_beauty_ads/` (QUẢNG CÁO MỸ PHẨM CAO CẤP)

#### 1. ẢNH THAM CHIẾU: `good_001.jpg` (Kết cấu vệt kem dưỡng siêu nổi khối 3D)
*   **Mô tả trực quan**: Cận cảnh macro một vệt kem dưỡng da (smear) màu hồng pastel mịn màng, được quét nghệ thuật bằng dao bảng palette trên bề mặt đá nhám. Đường vệt kem có những gợn nếp uốn lượn sắc sảo, nổi rõ độ đặc và ẩm mượt.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PL - Ánh sáng]**: Sử dụng **ánh sáng xiên cực đoan (Extreme Side-Lighting) góc 90 độ** từ sườn phải. Nguồn sáng được làm dịu bằng một tấm khuếch tán lớn (Softbox). Hướng sáng song song với bề mặt giúp tạo bóng đổ tinh tế dưới từng nếp gợn sóng của vệt kem, mô tả hoàn hảo kết cấu đặc mịn (rich texture) đặc trưng của mỹ phẩm dưỡng da cao cấp mà người dùng có thể "cảm nhận bằng mắt".
    *   **[CL - Bố cục]**: Đường vệt kem quét chéo tạo thành một đường dẫn thị giác động (Dynamic Line) cắt ngang khung hình, phá vỡ sự tĩnh lặng của mặt đá nền.

#### 2. ẢNH THAM CHIẾU: `good_002.jpg` (Chai Serum trên nền nước & Bóng lá)
*   **Mô tả trực quan**: Một chai serum thủy tinh trong suốt nằm bán ngập trong một khay nước trong vắt. Trên mặt nước có những làn sóng gợn lăn tăn. Bóng đổ của những chiếc lá dừa hữu cơ che phủ nhẹ nhàng lên một góc khung hình.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PL - Ánh sáng]**: Sử dụng một đèn chiếu mạnh mô phỏng ánh sáng mặt trời gắt (Hard Light) xuyên qua khay nước thủy tinh, tạo ra các đường khúc xạ ánh sáng (Caustics) lấp lánh màu ngọc bích dưới đáy. Bóng đổ hữu cơ (Foliage Shadow) từ cành lá dừa thật được đặt xen giữa đèn và khay nước để tạo chiều sâu không gian lãng mạn.
    *   **[PF - Độ chân thực]**: Thủy tinh của chai serum có độ chiết suất chân thực, nhìn thấy rõ phần ống nhỏ giọt (dropper) cong nhẹ bên trong nước mà không bị biến dạng phi vật lý (một lỗi AI sinh ảnh thường gặp).

#### 3. ẢNH THAM CHIẾU KHÁC BIỆT: `bad_001.jpg` (Sắp xếp chai mỹ phẩm bẹt khối)
*   **Mô tả trực quan**: Ba chai nước hoa đặt đứng thẳng hàng trên một tấm bảng nhựa mica trắng bóng. Ảnh chụp từ trên xuống (Flat Lay) dưới ánh đèn huỳnh quang văn phòng.
*   **Lỗi kỹ thuật nghiêm trọng**:
    *   **[PL - Ánh sáng]**: Ánh sáng phân tán từ trần nhà triệt tiêu bóng đổ bọc khối của chai tròn. Thân chai perfume làm bằng thủy tinh nhưng trông giống như nhựa đục vì không có các dải sáng phản quang dọc thân chai (**Gradient Highlights**).
    *   **[CL - Bố cục]**: Sắp xếp thẳng hàng đơn điệu, không có phân cấp chính phụ (Visual Weight). Khoảng trống xung quanh bị phân bổ tẻ nhạt, thiếu vắng các yếu tố chất liệu tương phản (như đá thô, nước hay hoa cỏ) để nâng tầm chất lượng nguyên liệu thiên nhiên của sản phẩm.

---

### C. THƯ MỤC: `premium_tech_ads/` (QUẢNG CÁO CÔNG NGHỆ CAO CẤP)

#### 1. ẢNH THAM CHIẾU: `good_001.jpg` (Bản vẽ bóc tách linh kiện Earbuds titan)
*   **Mô tả trực quan**: Tai nghe không dây cao cấp được bóc tách dạng nổ khối (**Exploded View**), phơi bày các lớp linh kiện bên trong từ màng loa beryllium, chip xử lý, pin, đến lớp vỏ hợp kim titanium bên ngoài. Tất cả linh kiện lơ lửng dọc theo một trục xiên hoàn hảo.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PF - Độ chân thực]**: Độ chính xác cơ học cực cao. Các vân kim loại phay xước (brushed metal) trên lớp vỏ titanium phản xạ ánh sáng chân thực. Các mạch đồng li ti trên bo mạch xanh lục rõ nét, không bị nhòe hay nối sai sơ đồ vật lý.
    *   **[PL - Ánh sáng]**: Sử dụng kỹ thuật đánh **Rim Lighting** cực mạnh bằng hai đèn Stripbox hẹp đặt hai bên sườn sườn sản phẩm. Kỹ thuật này "khắc họa" sắc sảo viền kim loại của các linh kiện lơ lửng, tạo ra một ranh giới phát sáng mỏng tách biệt chúng hoàn toàn khỏi nền đen huyền bí `#0A0A0A`.

#### 2. ẢNH THAM CHIẾU: `good_002.jpg` (Smartphone hiển thị màn hình chuẩn Apple)
*   **Mô tả trực quan**: Chiếc điện thoại thông minh thế hệ mới nhất đặt trực diện (90 độ), hiển thị một giao diện đồ họa rực rỡ. Trên bề mặt kính màn hình có một dải bóng gương vát chéo mờ nhẹ lướt qua.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[PF - Độ chân thực]**: Tuân thủ nghiêm ngặt **Apple Brand Guidelines**. Thiết bị được hiển thị thẳng tắp, không bị méo góc do ống kính góc rộng. Nhất quán bắt buộc phải có lớp bóng gương gương thực tế (**Screen Shine Layer**) đè chồng lên màn hình đồ họa để chứng minh đây là thiết bị vật lý thật chứ không phải ảnh chụp màn hình (screenshot) cắt ghép thô sơ.
    *   **[CL - Bố cục]**: Căn lề cơ học tuyệt đối vào tâm của hệ lưới đối xứng, tạo cảm giác uy nghiêm, dẫn đầu công nghệ và đáng tin cậy.

#### 3. ẢNH THAM CHIẾU KHÁC BIỆT: `bad_001.jpg` (Điện thoại AI lỗi kết cấu)
*   **Mô tả trực quan**: Một chiếc điện thoại thông minh bóng bẩy lơ lửng giữa những dải ruy băng neon uốn lượn màu xanh tím rực rỡ.
*   **Lỗi kỹ thuật nghiêm trọng**:
    *   **[PF - Độ chân thực]**: AI tạo ra các chi tiết phi vật lý: cổng sạc Type-C ở đáy máy bị méo mó lệch trục, các nút bấm vật lý sườn máy dính tịt vào nhau không có khe hở cơ khí. Cụm camera sau lồi lên với các thấu kính méo mó lệch tâm.
    *   **[PL - Ánh sáng]**: Ánh sáng từ dải ruy băng neon chiếu lên thân máy không đồng bộ về mặt vật lý (lỗi khúc xạ ánh sáng trên kính sườn). Bóng đổ nhân tạo bên dưới máy là một hình tròn màu đen xám xịt nhạt nhòa, lơ lửng không khớp với trọng lực của thiết bị.

---

### D. THƯ MỤC: `premium_social_ads/` (QUẢNG CÁO MẠNG XÃ HỘI CAO CẤP)

#### 1. ẢNH THAM CHIẾU: `good_001.jpg` (Fashion Editorial Instagram Stories)
*   **Mô tả trực quan**: Thiết kế dạng dọc tỷ lệ 9:16. Một người mẫu mặc bộ trang phục thiết kế góc cạnh đứng tựa vào bức tường bê tông Brutalist xám thô ráp. Chữ tiêu đề chạy dọc sát mép lề trái.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[CL - Bố cục]**: Sử dụng **Lưới Trục (Axial Grid)** cực kỳ năng động. Một đường trục vô hình chạy dọc mép trái là nơi gióng hàng thẳng tắp cho toàn bộ chữ tiêu đề. Hình ảnh người mẫu dịch chuyển sang 2/3 khung hình bên phải để nhường khoảng không thở cực lớn cho chữ ở bên trái.
    *   **[TY - Typography]**: Áp dụng font chữ sans-serif hình học viết hoa toàn bộ (All-caps) **Futura Condensed Bold**. Khoảng cách chữ (letter-spacing) được siết chặt tỉ mỉ ở mức -0.05em, kết hợp giãn dòng cực hẹp (Line-height 1.1x) biến khối chữ thành một tác phẩm điêu khắc vững chắc, tương thích hoàn hảo với cá tính mạnh mẽ của thời trang Brutalist.

#### 2. ẢNH THAM CHIẾU: `good_002.jpg` (Bento Grid giới thiệu tính năng Gadget)
*   **Mô tả trực quan**: Bố cục tiếp thị mạng xã hội chia làm các ô vuông bo góc (Bento Grid style). Ô lớn nhất chứa ảnh macro cận cảnh chi tiết núm xoay kim loại của thiết bị công nghệ; các ô nhỏ hơn chứa chữ mô tả thông số kỹ thuật tối giản và biểu tượng SVG sắc nét.
*   **Phân tích kỹ thuật chuyên sâu**:
    *   **[CL - Bố cục]**: Tuân thủ **Hệ thống Lưới Thụy Sĩ (Swiss Grid)**. Khoảng cách giữa các ô (Gutter) đồng đều tuyệt đối 16px. Phân cấp thông tin rõ rệt bằng cách kiểm soát tỷ lệ diện tích ô (ô lớn chiếm 50% diện tích thị giác, là tiêu điểm chính).
    *   **[TY - Typography]**: Sử dụng font chữ hệ thống **SF Pro** sạch sẽ. Gióng lề trái toàn bộ trong từng ô riêng biệt. Áp dụng Semantic Tokens nhất quán: Tiêu đề ô dùng `Title 3 (Semibold)`, văn bản mô tả dùng `Footnote (Regular)` màu xám mô tả `#8E8E93` để giảm tải mật độ thông tin.

#### 3. ẢNH THAM CHIẾU KHÁC BIỆT: `bad_001.jpg` (Banner khuyến mãi lộn xộn)
*   **Mô tả trực quan**: Một banner quảng cáo vuông (1:1) quảng bá sản phẩm tai nghe. Tai nghe bị đặt lệch xẹo ở giữa, xung quanh bị bao vây bởi vô số huy hiệu khuyến mãi màu đỏ chói tai, bong bóng chữ "HOT DEAL", và các vệt vạch chớp sét màu vàng neon rực rỡ.
*   **Lỗi kỹ thuật nghiêm trọng**:
    *   **[CL - Bố cục]**: Hỗn loạn visual (Visual Clutter). Không có khoảng trắng thở (Whitespace = 0%), mắt người xem bị phân tán liên tục qua các yếu tố trang trí lòe loẹt, làm lu mờ hoàn toàn sản phẩm tai nghe chính. Các yếu tố đặt trôi nổi tự do, hoàn toàn không có bất kỳ trục gióng hàng hay hệ thống lưới nào hỗ trợ.
    *   **[TY - Typography]**: Sử dụng đồng thời 4 phông chữ khác nhau trên cùng một diện tích nhỏ (Comic Sans cho bóng thoại, Arial Bold cho thông tin phụ, Impact cho tiêu đề giảm giá, và một font viết tay nghệ thuật lỗi dấu tiếng Việt). Giãn dòng quá dính khiến chữ nọ chọc vào chữ kia, tạo ra một tổng thể cực kỳ rẻ tiền và thiếu chuyên nghiệp.

---

## 3. KHUNG HƯỚNG DẪN HUẤN LUYỆN VÀ GẮN NHÃN CHO AI (AI TRAINING & TAGGING STRATEGY)

Để huấn luyện các mô hình AI (như LoRA, ControlNet hoặc tinh chỉnh bộ lọc thẩm mỹ GPT-Vision) học được ranh giới giữa GOOD và BAD, hệ thống khuyên dùng cấu trúc gán nhãn dữ liệu chuẩn hóa như sau:

### Bộ thẻ nhãn chất lượng cao (Positive Prompts / Tags):
> `"premium commercial design, high-fidelity, swiss grid system, axial grid alignment, dynamic type scale, tight line-height, rim lighting, screen shine layer, 1:1 glycerin condensation, organic foliage shadow, brutalist concrete texture, 3d sensory texture smear, wicag contrast compliant, minimalist aesthetic, 8k, professional studio lighting"`

### Bộ thẻ nhãn lọc chất lượng kém (Negative Prompts / Tags):
> `"cluttered layout, flat lighting, amateur flat lay, hard flash shadows, unaligned typography, comic sans, impact font with stroke, distorted physical geometry, ai hallucinated ports, blurry texture, zero whitespace, floating drop shadow, low contrast, oversaturated background, ungrounded object"`
