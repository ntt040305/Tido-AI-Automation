import fs from "fs";
import path from "path";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import { ProviderImageGenerationInput } from "../provider/ImageGenerationProvider";

// Load .env.local if not already in process.env
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

interface ProviderMeasurement {
  id: string;
  mode: "edit" | "generate";
  aspectRatio: string;
  hasReference: boolean;
  referenceCount: number;
  prepTimeMs: number;
  apiRequestMs: number;
  downloadMs: number;
  downloadBytes: number;
  totalTimeMs: number;
  success: boolean;
  error?: string;
}

async function runBenchmark() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 10 PROVIDER-ONLY BENCHMARK");
  console.log("========================================================================");
  console.log(`Base URL:     ${process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site"}`);
  console.log(`Provider ID:  ${process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2"}`);
  console.log(`Resolution:   ${process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "1K"}`);
  console.log(`Quality:      ${process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard"}`);
  console.log("------------------------------------------------------------------------\n");

  const bottlePath = path.resolve(process.cwd(), "test-assets/real_product_bottle.png");
  const logoPath = path.resolve(process.cwd(), "test-assets/real_tido_logo.png");

  const bottleBuf = fs.existsSync(bottlePath) ? fs.readFileSync(bottlePath) : null;
  const logoBuf = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

  if (!bottleBuf) {
    throw new Error("Missing test asset: test-assets/real_product_bottle.png");
  }

  const provider = new ImgStudioImageGenerationProvider();
  const measurements: ProviderMeasurement[] = [];

  const testCases: Array<{
    id: string;
    mode: "edit" | "generate";
    aspectRatio: string;
    prompt: string;
    refs: Array<{ id: string; role: "PRODUCT" | "LOGO"; buf: Buffer; filename: string }>;
  }> = [
    {
      id: "sample_edit_1_bottle_9_16",
      mode: "edit",
      aspectRatio: "9:16",
      prompt: "Premium cold brew coffee advertisement. A glass bottle on stone, low directional warm sunlight, calm and sophisticated luxury feeling.",
      refs: [{ id: "REF_01_PROD", role: "PRODUCT", buf: bottleBuf, filename: "product_bottle.png" }],
    },
    {
      id: "sample_edit_2_bottle_logo_1_1",
      mode: "edit",
      aspectRatio: "1:1",
      prompt: "Minimalist cold brew coffee poster with brand logo top center. Stone plinth, soft shadows, clean commercial studio lighting.",
      refs: [
        { id: "REF_01_PROD", role: "PRODUCT", buf: bottleBuf, filename: "product_bottle.png" },
        ...(logoBuf ? [{ id: "REF_02_LOGO" as const, role: "LOGO" as const, buf: logoBuf, filename: "brand_logo.png" }] : []),
      ],
    },
    {
      id: "sample_edit_3_bottle_1_1",
      mode: "edit",
      aspectRatio: "1:1",
      prompt: "Commercial product hero shot of Origin Blend cold brew coffee bottle on weathered oak wood table at morning golden hour.",
      refs: [{ id: "REF_01_PROD", role: "PRODUCT", buf: bottleBuf, filename: "product_bottle.png" }],
    },
    {
      id: "sample_gen_4_text_only_1_1",
      mode: "generate",
      aspectRatio: "1:1",
      prompt: "A luxury ceramic perfume flacon on dark obsidian pedestal, subtle mist, moody cinematic chiaroscuro rim lighting.",
      refs: [],
    },
    {
      id: "sample_gen_5_text_only_9_16",
      mode: "generate",
      aspectRatio: "9:16",
      prompt: "Artisan sourdough bread loaf on linen cloth, floured crust, soft morning window light, warm bakery ambience.",
      refs: [],
    },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[SAMPLE ${i + 1}/${testCases.length}] Running ${tc.id} (${tc.mode}, ratio=${tc.aspectRatio}, refs=${tc.refs.length})...`);
    
    const prepStart = Date.now();
    const input: ProviderImageGenerationInput = {
      model: "flow-nano-banana-2",
      prompt: tc.prompt,
      aspectRatio: tc.aspectRatio,
      imageSize: "1K",
      mimeType: "image/png",
      generationId: `bench_${tc.id}_${Date.now()}`,
      references: tc.refs.map((r) => ({
        reference_id: r.id,
        role: r.role,
        buffer: r.buf,
        mimeType: "image/png",
        filename: r.filename,
      })),
    };
    const prepTimeMs = Date.now() - prepStart;

    const execStart = Date.now();
    const result = await provider.generateImage(input);
    const totalTimeMs = Date.now() - execStart;

    const m: ProviderMeasurement = {
      id: tc.id,
      mode: tc.mode,
      aspectRatio: tc.aspectRatio,
      hasReference: tc.refs.length > 0,
      referenceCount: tc.refs.length,
      prepTimeMs,
      apiRequestMs: result.remoteDetails?.api_request_ms ?? totalTimeMs,
      downloadMs: result.remoteDetails?.download_ms ?? 0,
      downloadBytes: result.imageBuffer?.length ?? 0,
      totalTimeMs,
      success: result.success,
      error: result.error?.message,
    };
    measurements.push(m);

    if (result.success) {
      console.log(`  ✓ SUCCESS: total=${(totalTimeMs / 1000).toFixed(2)}s (api_req=${((m.apiRequestMs) / 1000).toFixed(2)}s, dl=${((m.downloadMs) / 1000).toFixed(2)}s, bytes=${m.downloadBytes})`);
      console.log(`    URL: ${result.imageUrl}`);
    } else {
      console.error(`  ✗ FAILED: total=${(totalTimeMs / 1000).toFixed(2)}s - ${result.error?.code}: ${result.error?.message}`);
    }

    // Brief pause between requests to prevent socket congestion
    if (i < testCases.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n========================================================================");
  console.log("PROVIDER BENCHMARK RESULTS & PERCENTILES");
  console.log("========================================================================");

  const successfulRuns = measurements.filter((m) => m.success);
  console.log(`Total Samples:     ${measurements.length}`);
  console.log(`Successful:        ${successfulRuns.length}`);
  console.log(`Failed:            ${measurements.length - successfulRuns.length}`);

  function stats(values: number[]) {
    if (values.length === 0) return { min: 0, p50: 0, p90: 0, p95: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const getP = (p: number) => {
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
      return sorted[idx];
    };
    return {
      min: sorted[0],
      p50: getP(50),
      p90: getP(90),
      p95: getP(95),
      max: sorted[sorted.length - 1],
    };
  }

  const allTimes = successfulRuns.map((m) => m.totalTimeMs);
  const editTimes = successfulRuns.filter((m) => m.mode === "edit").map((m) => m.totalTimeMs);
  const genTimes = successfulRuns.filter((m) => m.mode === "generate").map((m) => m.totalTimeMs);

  const allStats = stats(allTimes);
  const editStats = stats(editTimes);
  const genStats = stats(genTimes);

  console.log("\n--- ALL MODES COMBINED (ms / s) ---");
  console.log(`Min:    ${allStats.min} ms (${(allStats.min / 1000).toFixed(2)} s)`);
  console.log(`P50:    ${allStats.p50} ms (${(allStats.p50 / 1000).toFixed(2)} s)`);
  console.log(`P90:    ${allStats.p90} ms (${(allStats.p90 / 1000).toFixed(2)} s)`);
  console.log(`P95:    ${allStats.p95} ms (${(allStats.p95 / 1000).toFixed(2)} s)`);
  console.log(`Max:    ${allStats.max} ms (${(allStats.max / 1000).toFixed(2)} s)`);

  console.log("\n--- EDIT MODE (With Product Reference Images) ---");
  console.log(`Samples: ${editTimes.length}`);
  console.log(`Min:    ${editStats.min} ms (${(editStats.min / 1000).toFixed(2)} s)`);
  console.log(`P50:    ${editStats.p50} ms (${(editStats.p50 / 1000).toFixed(2)} s)`);
  console.log(`P90:    ${editStats.p90} ms (${(editStats.p90 / 1000).toFixed(2)} s)`);
  console.log(`P95:    ${editStats.p95} ms (${(editStats.p95 / 1000).toFixed(2)} s)`);
  console.log(`Max:    ${editStats.max} ms (${(editStats.max / 1000).toFixed(2)} s)`);

  console.log("\n--- TEXT-ONLY GENERATE MODE (Concept Only, No References) ---");
  console.log(`Samples: ${genTimes.length}`);
  console.log(`Min:    ${genStats.min} ms (${(genStats.min / 1000).toFixed(2)} s)`);
  console.log(`P50:    ${genStats.p50} ms (${(genStats.p50 / 1000).toFixed(2)} s)`);
  console.log(`P90:    ${genStats.p90} ms (${(genStats.p90 / 1000).toFixed(2)} s)`);
  console.log(`P95:    ${genStats.p95} ms (${(genStats.p95 / 1000).toFixed(2)} s)`);
  console.log(`Max:    ${genStats.max} ms (${(genStats.max / 1000).toFixed(2)} s)`);

  // Write JSON report
  const reportPath = path.resolve(process.cwd(), "data/benchmarks/provider-floor-benchmark.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: {
          baseUrl: process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site",
          providerId: process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2",
          resolution: process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "1K",
          quality: process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard",
        },
        stats: { all: allStats, edit: editStats, generate: genStats },
        measurements,
      },
      null,
      2
    )
  );
  console.log(`\nDetailed report written to: ${reportPath}`);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with uncaught exception:", err);
  process.exit(1);
});
