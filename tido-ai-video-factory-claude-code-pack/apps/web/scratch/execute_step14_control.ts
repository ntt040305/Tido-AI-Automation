import fs from "fs";
import path from "path";

async function main() {
  const imgPath = path.join(process.cwd(), "public/tido.png");
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Reference image not found at ${imgPath}`);
  }
  const imgBuffer = fs.readFileSync(imgPath);

  const requestId = `audit_control_step14_${Date.now()}`;

  const formData = new FormData();
  formData.append(
    "concept",
    "Luxury Centella Asiatica calming serum bottle resting on a raw travertine pedestal with delicate sage foliage, soft golden hour morning light casting crisp shadows, editorial skincare brand visual"
  );
  formData.append("contentMessage", "Barrier Calm Serum. Botanical recovery for sensitive skin.");
  formData.append("useCase", "banner");
  formData.append("aspectRatio", "16:9");
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
    objective: "Communicate calming botanical repair in high-impact wide digital banner",
  };
  formData.append("marketingContext", JSON.stringify(marketingContext));

  const blob = new Blob([imgBuffer], { type: "image/png" });
  formData.append("images", blob, "centella_serum_banner.png");

  console.log(">>> DISPATCHING STEP 14 CONTROL TEST (FORMAT: banner, ASPECT: 16:9) <<<");
  console.log(`Endpoint: http://localhost:3000/api/image/generate-simple`);
  console.log(`Request ID: ${requestId}`);

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
    console.error("Step 14 fetch failed:", err);
  }
}

main().catch(console.error);
