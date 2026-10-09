import { NextResponse } from "next/server";
import { activeProfile } from "@/lib/image-engine/models/image-model-profiles";
import { engineTelemetry } from "@/lib/image-engine/prompt-v2/engine-selector";

export const dynamic = "force-dynamic";

export async function GET() {
  const providerEnv = (process.env.TIDO_IMAGE_PROVIDER || "imgstudio").toLowerCase();

  /**
   * Which flags this process is actually running with.
   *
   * `engineTelemetry()` has existed since the prompt-engine work and had NO production
   * caller — only tests read it. So the only way to find out whether GPT_ART_DIRECTOR was
   * on was to pay for a render and read the logs, which is a bad way to answer "is the
   * flag on".
   *
   * Reported here rather than from a new endpoint because this route already exists for
   * exactly this question about the provider, the UI already calls it, and a GET is free.
   *
   * Names and booleans only. No key, no prompt, no client copy — every value is either a
   * flag's resolved state or a model id that is already in this response.
   */
  const flags = engineTelemetry();
  
  if (providerEnv === "imgstudio") {
    const providerId = activeProfile().providerId;
    return NextResponse.json({
      provider: "imgstudio",
      providerName: "ImgStudio",
      model: providerId,
      providerId,
      modelDisplayName: "Flow · Nano Banana 2",
      engine: "Flow · Nano Banana 2",
      flags,
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
      flags,
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
    flags,
  });
}
