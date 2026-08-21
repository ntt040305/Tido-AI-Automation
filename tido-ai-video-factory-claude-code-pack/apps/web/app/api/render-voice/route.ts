import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const scriptPath = "d:/Tido/F5-TTS-Vietnamese/test_script.json";
    let scriptData = await req.json().catch(() => ({}));

    if (!scriptData || !scriptData.segments) {
      if (fs.existsSync(scriptPath)) {
        console.log("Using existing test_script.json as fallback.");
      } else {
        return NextResponse.json({ error: "Dữ liệu kịch bản không hợp lệ." }, { status: 400 });
      }
    } else {
      // Đảm bảo voice_id chỉ dùng vo_motaro_kb19 hoặc vo_mizaki_3
      const allowedVoices = ["vo_motaro_kb19", "vo_mizaki_3"];
      if (!scriptData.metadata) scriptData.metadata = {};
      if (!allowedVoices.includes(scriptData.metadata.voice_id)) {
        scriptData.metadata.voice_id = "vo_motaro_kb19";
      }

      // 1. Ghi file test_script.json cho python đọc
      fs.writeFileSync(scriptPath, JSON.stringify(scriptData, null, 2), "utf8");
    }

    // 2. Xoá file wav cũ nếu có
    const outPath = "d:/Tido/F5-TTS-Vietnamese/output_expressive_demo.wav";
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    // 3. Chạy python engine
    console.log("Starting TIDO Voice Engine...");
    const pythonExe = "d:/Tido/F5-TTS-Vietnamese/.venv/Scripts/python.exe";
    const enginePath = "d:/Tido/F5-TTS-Vietnamese/tido_voice_engine.py";
    const { stdout, stderr } = await execPromise(`"${pythonExe}" "${enginePath}"`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: "d:/Tido/F5-TTS-Vietnamese"
    });
    console.log("Python stdout:", stdout);
    if (stderr) console.error("Python stderr:", stderr);

    // 4. Kiểm tra xem file wav đã được tạo chưa
    if (!fs.existsSync(outPath)) {
      throw new Error("Không tạo được file WAV. Vui lòng check log Python.");
    }

    // 5. Đọc file wav và trả về
    const audioBuffer = fs.readFileSync(outPath);

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (err: any) {
    console.error("Local TTS error:", err);
    return NextResponse.json({ error: `TTS error: ${err.message}` }, { status: 500 });
  }
}
