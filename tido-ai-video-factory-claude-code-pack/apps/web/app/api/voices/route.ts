import { NextResponse } from "next/server";

// Kho giọng TIDO Performance Engine (Chỉ 2 giọng chuẩn: vo_motaro_kb19 & vo_mizaki_3)
export async function GET() {
  const voices = [
    {
      id: "vo_motaro_kb19",
      voiceKey: "vo_motaro_kb19",
      name: "Nam MC Motaro (Năng nổ / Quảng cáo / TVC)",
      gender: "male",
      style: "Cấp bách, khuyến mãi, sôi nổi",
      suitable: ["Flash Sale", "Short Video", "TVC Game", "Livestream"],
      sampleUrl: "/voices/VO_Motaro_kb19_clean.wav",
      emotionRange: ["cấp bách", "hào hứng", "mạnh mẽ", "tự nhiên"],
      defaultEmotion: "hào hứng",
      paceRange: ["normal", "fast"],
    },
    {
      "id": "vo_mizaki_3",
      "voiceKey": "vo_mizaki_3",
      "name": "Nữ MC Mizaki 3 (Thanh lịch / Sang trọng)",
      "gender": "female",
      "style": "Thanh lịch, sang trọng, bất động sản",
      suitable: ["Bất động sản", "Nội thất", "Mỹ phẩm", "Lifestyle"],
      sampleUrl: "/voices/VO_Mizaki_3_12s.wav",
      "emotionRange": ["thanh lịch", "ấm áp", "tin tưởng", "trầm lắng"],
      "defaultEmotion": "thanh lịch",
      "paceRange": ["slow", "normal"],
    }
  ];

  return NextResponse.json({ voices });
}
