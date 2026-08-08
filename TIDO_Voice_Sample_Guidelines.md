# TIDO Voice Engine - Tiêu Chuẩn Vàng Cho Voice Sample

Để hệ thống F5-TTS (Flow-Matching DiT) hoạt động mượt mà, không bị vấp đĩa, nuốt chữ hay đọc sai nhịp, file âm thanh mẫu (Reference Audio) đóng vai trò quyết định 90% chất lượng đầu ra. 

Dưới đây là bộ tiêu chuẩn và kỹ thuật để bạn tự tay chuẩn bị hàng loạt voice sample chất lượng cao.

## 1. Thời lượng "Điểm ngọt" (Sweet Spot)
- **Chuẩn nhất:** `10 - 15 giây` (Tương đương 2 đến 3 câu văn ngắn).
- **Lý do:** 
  - Nếu quá ngắn (< 5s): AI chưa kịp phân tích xong âm sắc (timbre) và nhịp thở của người nói.
  - Nếu quá dài (> 15s): Quá tải bộ nhớ GPU khi render và dễ dẫn đến lỗi trượt nhịp (hallucination) khiến AI đọc lấp bấp.

## 2. Độ "Sạch" Của Âm Thanh (Vô Trùng Tuyệt Đối)
- **Yêu cầu:** Không nhạc nền (No BGM), không tiếng vang (No Reverb), không tạp âm (quạt máy, tiếng ồn ngoài đường).
- **Lý do:** F5-TTS sao chép **toàn bộ môi trường âm thanh** chứ không chỉ giọng nói. Nếu file có tiếng nhạc mờ mờ, AI sẽ cố gắng tạo ra tiếng xèo xèo/rè rè tương tự trên toàn bộ audio đầu ra. 
- **Mẹo:** Thu âm trong phòng kín, hoặc dùng các công cụ AI khử nhiễu (như Adobe Podcast Enhance) trước khi dùng làm sample.

## 3. Cách Cắt Biên (Boundary Cutting) - Tránh lỗi nuốt chữ
Đây là nguyên nhân chính gây ra lỗi lặp chữ cuối hoặc bị nuốt chữ đầu:
- **Đầu file (Start):** Chừa khoảng `100ms - 200ms` (0.1s - 0.2s) im lặng trước chữ đầu tiên. Đừng cắt quá gắt ngay sát sóng âm.
- **Cuối file (End):** Bắt buộc phải chừa khoảng `400ms - 600ms` (0.4s - 0.6s) im lặng sau từ cuối cùng. 
  - *Nếu cắt ngay lập tức khi MC vừa dứt miệng:* AI sẽ không nhận diện được điểm dừng của câu, dẫn đến việc lấy chữ cuối cùng của sample (như chữ "khỏe") gắn vào đầu mọi câu sinh ra.

## 4. Khớp Text 100% (Alignment) và Dấu Câu
- **Transcript (`ref_text`):** Phải gõ lại chính xác 100% những gì MC đọc. Tuyệt đối không được sai 1 từ. Nếu MC đọc vấp hoặc thêm từ "à, ừm", bạn phải viết vào text hoặc cắt bỏ đoạn đó trong audio.
- **Dấu phẩy & Dấu chấm:** F5-TTS dùng dấu câu để neo nhịp điệu (alignment).
  - Chỗ nào MC nghỉ lấy hơi -> Phải có dấu `,` hoặc `.`.
  - Chỗ nào MC đọc tuôn một lèo không nghỉ -> Không được đặt dấu câu, dù về mặt ngữ pháp là có.

## 5. Biểu Cảm Định Hình (Baseline Expressiveness)
- AI sẽ dùng năng lượng của file mẫu làm mức nền cho toàn bộ video.
- **Khuyến nghị:** Chọn các đoạn MC đọc với giọng sáng, dứt khoát, năng lượng cao (như quảng cáo, thuyết trình). Nếu dùng sample MC đọc giọng buồn bã rề rà, bạn sẽ rất khó dùng parameter ép AI đọc vui nhộn lên được.

---

## 🛠️ Quy Trình 3 Bước Thêm Voice Mới
1. Dùng Audacity hoặc Premiere cắt 1 đoạn MP3 dài ~12s thỏa mãn các tiêu chí trên. Export ra `.mp3` hoặc `.wav` (chuẩn 24kHz Mono là tốt nhất).
2. Chép file vào thư mục `d:\Tido\Assets\Voices`.
3. Mở file `voice_library.json`, copy một block cấu hình có sẵn và sửa lại thông tin:
   - `"id"`: Tên viết liền không dấu (VD: `"mc_nam_01"`).
   - `"audio_file"`: Đường dẫn trỏ tới file mới.
   - `"ref_text"`: Gõ lại transcript cực kỳ cẩn thận.
   - Khởi động lại hệ thống và bắt đầu tạo Video!
