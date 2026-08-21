import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const { prompt, profileType, duration } = await req.json();

    if (!prompt || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Prompt quá ngắn." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      return NextResponse.json(
        {
          error:
            "Chưa cấu hình GROQ_API_KEY.\n" +
            "👉 Lấy key miễn phí (không cần thẻ) tại: https://console.groq.com/keys",
        },
        { status: 500 }
      );
    }

    const profileLabel =
      profileType === "tvc"
        ? "TVC quảng cáo 16:9"
        : "Short Video 9:16 (TikTok/Reels)";
    const durationLabel = `${duration} giây`;

    // ── ĐỌC THƯ VIỆN GIỌNG ĐỌC ĐỂ LLM TỰ CHỌN ──
    let voiceProfilesInfo = "";
    try {
      const libData = fs.readFileSync("d:/Tido/Assets/Voices/voice_library.json", "utf8");
      const lib = JSON.parse(libData);
      const profiles = lib.voices.map((v: any) => 
        `- ID: "${v.id}" (Tên: ${v.name}, Giới tính: ${v.gender}, Phù hợp nhất cho: ${v.profile.best_for.join(", ")}, Phong cách: ${v.profile.style.join(", ")})`
      );
      voiceProfilesInfo = `DƯỚI ĐÂY LÀ DANH SÁCH CÁC GIỌNG ĐỌC CÓ SẴN TRONG HỆ THỐNG:\n${profiles.join("\n")}\n\nDựa vào chủ đề của kịch bản, hãy chọn ra 1 ID giọng đọc phù hợp nhất và điền vào trường "voice_id" trong metadata.`;
    } catch (e) {
      console.error("Lỗi đọc voice library:", e);
    }

    const client = new Groq({ apiKey });

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Bạn là Đạo diễn Kịch bản Voice-over Thượng thừa tại TIDO Production (Master AI Audio Director).
Nhiệm vụ của bạn là phân tích sâu sắc THỂ LOẠI (Genre) và TÔNG GIỌNG CHỦ ĐẠO (Tone/Vibe) của chủ đề người dùng yêu cầu, từ đó sáng tạo ra một kịch bản thoại có mạch cảm xúc hoàn hảo, tự nhiên nhất.

${voiceProfilesInfo}

QUAN TRỌNG: Trả về ĐÚNG 1 JSON object hợp lệ với cấu trúc ĐẦY ĐỦ THÔNG SỐ CẢM XÚC CƠ HỌC (Full Prosody & Emotion Format):
{
  "metadata": {
    "title": "Tên kịch bản ngắn gọn hấp dẫn",
    "voice_id": "vo_motaro_kb19",
    "genre_vibe": "Ví dụ: Kể chuyện tâm sự / Quảng cáo năng lượng / Sang trọng tinh tế / Review tri thức...",
    "tags": ["3-5 từ khóa chính"]
  },
  "segments": [
    {
      "text": "Lời thoại phân đoạn 1...",
      "emotion": "Mô tả chi tiết cảm xúc (Ví dụ: 'căng thẳng, cao trào', 'thủ thỉ, tâm sự', 'hào hứng, năng lượng', 'thanh lịch, sang trọng')",
      "pacing": "nhịp điệu: 'chậm', 'bình thường', hoặc 'nhanh'",
      "intensity": 0.78,
      "prosody": {
        "pace_delta": "+",
        "pause_delta": "-",
        "energy_target": "+",
        "pitch_variation_target": "+",
        "phrase_length": "short",
        "emphasis_density": "high",
        "vocal_tail": "soft"
      }
    }
  ]
}

CHI TIẾT THÔNG SỐ CẢM XÚC (PROSODY & INTENSITY):
- "intensity": Số thực từ 0.30 đến 0.95 (ví dụ 0.78 cho cao trào, 0.50 cho nhẹ nhàng).
- "prosody":
  * "pace_delta": "+" (tăng tốc), "-" (giảm tốc), "=" (bình thường)
  * "pause_delta": "+" (ngắt nghỉ rộng), "-" (dồn dập), "=" (bình thường)
  * "energy_target": "+" (năng lượng cao), "-" (trầm ấm nhẹ), "=" (vừa)
  * "pitch_variation_target": "+" (vòng cao độ rộng), "-" (tông đều trầm), "=" (vừa)
  * "phrase_length": "short", "medium", hoặc "long"
  * "emphasis_density": "low", "medium", hoặc "high"
  * "vocal_tail": "soft", "long", "crisp", hoặc "auto"

TƯ DUY ĐẠO DIỄN PHÂN CẢM XÚC THEO THỂ LOẠI (CONTEXTUAL GENRE REASONING):
1. THỂ LOẠI TÂM SỰ / HEALING / CHỮA LÀNH / KỂ CHUYỆN ĐỜI THƯỜNG:
   - Tông giọng: Sâu lắng, chân thành, nhẹ nhàng, ấm áp.
   - Segment: "emotion": "thủ thỉ, tâm sự", "pacing": "chậm", "intensity": 0.50, prosody: { pace_delta: "-", energy_target: "-", pitch_variation_target: "-", vocal_tail: "soft" }

2. THỂ LOẠI BẤT ĐỘNG SẢN / THỜI TRANG / SẢN PHẨM CAO CẤP:
   - Tông giọng: Thanh lịch, điềm tĩnh, sang trọng, tự tin.
   - Segment: "emotion": "thanh lịch, sang trọng", "pacing": "bình thường", "intensity": 0.65, prosody: { pace_delta: "=", energy_target: "=", pitch_variation_target: "=", vocal_tail: "long" }

3. THỂ LOẠI QUẢNG CÁO NĂNG LƯỢNG / BÃO SALE / TVC SÔI ĐỘNG / GAME:
   - Tông giọng: Tươi sáng, hấp dẫn, hào hứng, dứt khoát, cao trào.
   - Segment: "emotion": "căng thẳng, cao trào" hoặc "hào hứng, sôi nổi", "pacing": "nhanh", "intensity": 0.85, prosody: { pace_delta: "+", energy_target: "+", pitch_variation_target: "+", vocal_tail: "crisp" }

QUY TẮC CHUẨN HOÁ VĂN BẢN VOICE-OVER:
- NGẮT VẾ CÂU: Dùng dấu phẩy (',') ngắt nhịp giữa các vế câu (mỗi vế khoảng 8-12 từ) để AI cất giọng lấy hơi mượt mà. Mọi đoạn "text" BẮT BUỘC kết thúc bằng dấu chấm ('.'), dấu hỏi ('?'), hoặc chấm cảm ('!').
- VIẾT CHỮ HOÀN TOÀN CHO CHỮ SỐ: KHÔNG dùng chữ số ('1', '2', '100%'). PHẢI viết bằng chữ hoàn toàn: 'một', 'hai', 'ba mươi phần trăm'.
- PHIÊN ÂM TIẾNG ANH CHUẨN TIẾNG VIỆT: Viết âm tiết tiếng Việt có khoảng trắng, KHÔNG dùng dấu gạch nối: "Smartphone" -> "sờ mát phôn", "Sale" -> "seo", "Voucher" -> "vâu chờ".`,
        },
        {
          role: "user",
          content: `Viết kịch bản ${profileLabel} đầy đủ chi tiết (từ 4-6 đoạn, tổng 150-250 từ) với giọng đọc trầm ấm, nhịp thong thả chuẩn studio cho chủ đề:

"${prompt}"

Trả về ĐÚNG cấu trúc JSON đã yêu cầu với đầy đủ intensity và prosody, không thêm bất kỳ văn bản nào khác.`,
        },
      ],
    });

    const script = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage;

    // Lưu luôn vào file để python engine dùng, tránh mất state trên client
    try {
      const fs = require("fs");
      let parsedScript = null;
      try {
        parsedScript = JSON.parse(script);
      } catch (e) {
        const match = script.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match) {
          parsedScript = JSON.parse(match[1]);
        }
      }
      
      if (parsedScript) {
        if (!parsedScript.metadata) parsedScript.metadata = {};
        // Ép mặc định voice_id là vo_motaro_kb19 theo chỉ đạo
        parsedScript.metadata.voice_id = "vo_motaro_kb19";

        // Chuẩn hóa và làm giàu (enrich) các segment với intensity và prosody đầy đủ
        if (Array.isArray(parsedScript.segments)) {
          parsedScript.segments = parsedScript.segments.map((seg: any) => {
            const emotion = (seg.emotion || "warm").toLowerCase();
            const pacing = (seg.pacing || "bình thường").toLowerCase();
            
            const isHighEnergy = emotion.includes("hào hứng") || emotion.includes("cao trào") || emotion.includes("mạnh mẽ") || pacing === "nhanh";
            const isGentle = emotion.includes("thủ thỉ") || emotion.includes("nhẹ nhàng") || emotion.includes("tâm sự") || pacing === "chậm";

            const defaultIntensity = isHighEnergy ? 0.78 : (isGentle ? 0.50 : 0.65);

            const defaultProsody = {
              pace_delta: pacing === "nhanh" ? "+" : (pacing === "chậm" ? "-" : "="),
              pause_delta: isHighEnergy ? "-" : (isGentle ? "+" : "="),
              energy_target: isHighEnergy ? "+" : (isGentle ? "-" : "="),
              pitch_variation_target: isHighEnergy ? "+" : (isGentle ? "-" : "="),
              phrase_length: isHighEnergy ? "short" : (isGentle ? "long" : "medium"),
              emphasis_density: isHighEnergy ? "high" : (isGentle ? "low" : "medium"),
              vocal_tail: isGentle ? "soft" : (isHighEnergy ? "crisp" : "auto")
            };

            return {
              ...seg,
              intensity: typeof seg.intensity === "number" ? seg.intensity : defaultIntensity,
              prosody: {
                ...defaultProsody,
                ...(seg.prosody || {})
              }
            };
          });
        }

        fs.writeFileSync("d:/Tido/F5-TTS-Vietnamese/test_script.json", JSON.stringify(parsedScript, null, 2), "utf8");
      }
    } catch (e) {
      console.error("Không thể parse hoặc lưu script JSON", e);
    }

    return NextResponse.json({
      script,
      usage: {
        input_tokens: usage?.prompt_tokens ?? 0,
        output_tokens: usage?.completion_tokens ?? 0,
      },
      model: "llama-3.3-70b-versatile",
    });
  } catch (err: unknown) {
    console.error("Groq API error:", err);
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json(
      { error: `Groq API error: ${msg}` },
      { status: 500 }
    );
  }
}
