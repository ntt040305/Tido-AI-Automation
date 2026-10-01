/**
 * Real Production-Path Render Trace Execution
 * Runs PipelineRouter.run directly with real credentials, real LLM calls,
 * real ImgStudio image generation, real Vision Review, and full instrumentation.
 */

import fs from "fs";
import path from "path";
import { PipelineRouter } from "../lib/image-engine/evolution/PipelineRouter";
import { SimpleInputRequestV1 } from "../lib/image-engine/types";
import { RenderTracer } from "../lib/image-engine/observability/RenderTracer";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    console.warn("Could not find .env.local in", process.cwd());
    return;
  }
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  // Enable the trace
  process.env.TIDO_RENDER_TRACE = "1";

  const imgPath = path.join(process.cwd(), "public/tido.png");
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Reference image not found at ${imgPath}`);
  }
  const imgBuffer = fs.readFileSync(imgPath);

  const requestId = `audit_trace_${Date.now()}`;

  const simpleRequest: SimpleInputRequestV1 = {
    requestId,
    concept: "Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform, warm morning Mediterranean daylight, soft green botanical accents, elegant editorial skincare aesthetic",
    contentMessage: "Barrier Calm Serum. Botanical recovery for sensitive skin.",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "AURA BOTANICA",
    industry: "skincare",
    marketingContext: {
      industry: "skincare",
      target_audience: "Discerning consumers seeking natural clinical dermatological care",
    },
    images: [
      {
        reference_id: "REF_01",
        buffer: imgBuffer,
        mimeType: "image/png",
        filename: "centella_serum.png",
        role: "PRODUCT",
      },
    ],
  };

  RenderTracer.startTrace(requestId, simpleRequest);

  console.log(">>> STARTING REAL END-TO-END PRODUCTION PATH RENDER TRACE <<<");
  const startedAt = Date.now();

  try {
    const result = await PipelineRouter.run(simpleRequest, undefined, {
      deadlineAt: Date.now() + 180000,
    });

    RenderTracer.summary({
      productionEntryPoint: "apps/web/app/api/image/generate-simple/route.ts -> PipelineRouter.run",
      correctionTriggered: Boolean(result.visionReview?.second_render_created),
      secondRenderCreated: Boolean(result.visionReview?.second_render_created),
      finalImage: result.imageUrl,
      editableAsset: (result as any).designDocument?.editable || null,
      compiledPromptChars: result.diagnostics?.promptChars,
    });

    console.log("\n>>> RENDER EXECUTION COMPLETED SUCCESSFULLY <<<");
    console.log({
      success: result.success,
      status: result.status,
      generationId: result.generationId,
      imageUrl: result.imageUrl,
      durationMs: Date.now() - startedAt,
      promptChars: result.diagnostics?.promptChars,
      hasVisionReview: Boolean(result.visionReview),
      hasVisionAnalysis: Boolean(result.visionAnalysis),
    });
  } catch (err) {
    console.error(">>> RENDER EXECUTION FAILED <<<", err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal in main:", e);
  process.exit(1);
});
