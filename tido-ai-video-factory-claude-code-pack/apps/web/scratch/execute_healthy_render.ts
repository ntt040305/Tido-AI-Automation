import fs from "fs";
import path from "path";

async function main() {
  const imgPath = path.join(process.cwd(), "public/tido.png");
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Reference image not found at ${imgPath}`);
  }
  const imgBuffer = fs.readFileSync(imgPath);

  const requestId = `audit_healthy_${Date.now()}`;

  const formData = new FormData();
  formData.append("concept", "Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform, warm morning Mediterranean daylight, soft green botanical accents, elegant editorial skincare aesthetic");
  formData.append("contentMessage", "Barrier Calm Serum. Botanical recovery for sensitive skin.");
  formData.append("useCase", "Poster");
  formData.append("aspectRatio", "1:1");
  formData.append("brandName", "AURA BOTANICA");
  formData.append("industry", "skincare");
  formData.append("requestId", requestId);

  const copyItems = [
    { text: "Barrier Calm Serum", role: "headline" },
    { text: "Botanical recovery for sensitive skin.", role: "cta" },
  ];
  formData.append("copyItems", JSON.stringify(copyItems));

  const marketingContext = {
    industry: "skincare",
    target_audience: "Discerning consumers seeking natural clinical dermatological care",
    objective: "Establish clinical credibility and organic luxury desire",
  };
  formData.append("marketingContext", JSON.stringify(marketingContext));

  const blob = new Blob([imgBuffer], { type: "image/png" });
  formData.append("images", blob, "centella_serum.png");

  console.log(">>> DISPATCHING HTTP POST /api/image/generate-simple TO LIVE NEXT.JS DEV SERVER <<<");
  console.log(`Endpoint: http://localhost:3000/api/image/generate-simple`);
  console.log(`Request ID: ${requestId}`);
  console.log(`Attachment: centella_serum.png (${imgBuffer.length} bytes)`);

  const t0 = Date.now();
  try {
    const res = await fetch("http://localhost:3000/api/image/generate-simple", {
      method: "POST",
      body: formData,
    });

    const elapsed = Date.now() - t0;
    console.log(`HTTP response status: ${res.status} ${res.statusText} (${elapsed}ms)`);

    const json = await res.json().catch(() => null);
    console.log("Response body:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Fetch failed:", err);
  }
}

main().catch(console.error);
