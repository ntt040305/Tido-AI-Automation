import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const providerEnv = (process.env.TIDO_IMAGE_PROVIDER || "imgstudio").toLowerCase();
  
  if (providerEnv === "imgstudio") {
    const providerId = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
    return NextResponse.json({
      provider: "imgstudio",
      providerName: "ImgStudio",
      model: providerId,
      providerId,
      modelDisplayName: "Flow · Nano Banana 2",
      engine: "Flow · Nano Banana 2",
    });
  }

  if (providerEnv === "cloudflare") {
    const model = process.env.TIDO_CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
    return NextResponse.json({
      provider: "cloudflare",
      providerName: "Cloudflare Workers AI",
      model,
      providerId: model,
      modelDisplayName: "FLUX.2 Klein 4B",
      engine: "FLUX.2 Klein 4B",
    });
  }

  const model = process.env.TIDO_GEMINI_IMAGE_MODEL || process.env.TIDO_IMAGE_MODEL || "gemini-3.1-flash-image";
  return NextResponse.json({
    provider: "gemini",
    providerName: "Google Gemini",
    model,
    providerId: model,
    modelDisplayName: "Nano Banana 2",
    engine: "Nano Banana 2",
  });
}
