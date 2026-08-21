"""
TIDO Voice Performance Engine - Regression Test Suite
=====================================================
Automated benchmark runner containing 15 standardized Vietnamese sentence test cases.
"""

from dataclasses import dataclass
from typing import List, Dict

@dataclass
class RegressionTestCase:
    id: str
    category: str
    text: str
    emotion: str = "bình thường"
    pacing: str = "bình thường"
    expected_words: List[str] = None

BENCHMARK_CASES: List[RegressionTestCase] = [
    RegressionTestCase("TC-01", "Short Sentence", "Không."),
    RegressionTestCase("TC-02", "Question", "Bạn đang tìm kiếm trang phục thể thao thoải mái để tận hưởng trận đấu?"),
    RegressionTestCase("TC-03", "Exclamation", "Hãy nhanh tay sở hữu ưu đãi đặc biệt ngay hôm nay!"),
    RegressionTestCase("TC-04", "Time & Date", "Cuộc họp bắt đầu lúc 8h30 ngày 10/08/2026."),
    RegressionTestCase("TC-05", "Currency VND", "Giá bán niêm yết là 1.500.000đ cho mỗi sản phẩm."),
    RegressionTestCase("TC-06", "Currency USD", "Khuyến mãi lên tới $100 áp dụng cho đơn hàng đầu tiên."),
    RegressionTestCase("TC-07", "Percentage & Units", "Chiết khấu 20% cho không gian rộng 100m² với chiều dài 15km."),
    RegressionTestCase("TC-08", "English Brand Names", "Thương hiệu JOMOO mang đến thiết bị phòng tắm cao cấp và sang trọng."),
    RegressionTestCase("TC-09", "Abbreviation", "Dịch vụ sản xuất TVC quảng cáo và lĩnh vực F&B ứng dụng công nghệ AI."),
    RegressionTestCase("TC-10", "Initial Consonant Swallow Test", "Bạn đang bước vào một hành trình trải nghiệm sản phẩm hoàn toàn mới."),
    RegressionTestCase("TC-11", "Final Consonant Cutoff Test", "Mọi thông tin chi tiết được ghi rõ trong văn bản cam kết."),
    RegressionTestCase("TC-12", "Phone & Code", "Liên hệ hot line 0908123456 để nhận mã quà tặng KB19."),
    RegressionTestCase("TC-13", "Multi-clause Long Sentence", "Tự hào sở hữu không gian đẳng cấp rộng một nghìn mét vuông với quy mô bốn tầng mang lại sự thoải mái tối đa cho quý khách."),
    RegressionTestCase("TC-14", "TVC Intro", "Dừng lại ngay, nóng nhất tháng bảy không phải thời tiết, mà là bão sale cực hot!"),
    RegressionTestCase("TC-15", "TVC Outro", "Nhanh chóng liên hệ với chúng tôi để nhận ưu đãi có một không hai này!"),
]

def get_benchmark_suite() -> List[RegressionTestCase]:
    return BENCHMARK_CASES
