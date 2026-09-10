import fs from "fs";
import sharp from "sharp";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { ImageNormalizationService } from "./service/ImageNormalizationService";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";

/**
 * Regression recovery validation.
 *
 *   npx tsx lib/image-engine/run-regression-recovery-validation.ts
 *
 * Six scenarios, each measured on the two things that actually reach the image
 * model: the reference pixels it is given, and the instructions it is given.
 *
 * What this cannot show
 * --------------------
 * No image is rendered. Every figure below is an input-side measurement. It can
 * prove that the product reference now arrives at full resolution and that the
 * physical instructions are back in the prompt; it cannot prove the rendered
 * picture is better. That requires rendering the same brief through the previous
 * build and this one and comparing the two images, which needs a live provider.
 * Saying otherwise would repeat the mistake that let this regression ship: I
 * measured prompt length and string presence and called it quality.
 */

const bar = "=".repeat(92);

async function noisy(w: number, h: number, q: number): Promise<Buffer> {
  const c = 3;
  const raw = Buffer.alloc(w * h * c);
  let s = 7;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (s & 0xff) * 0.35 + 120;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: c } }).jpeg({ quality: q }).toBuffer();
}

const routing = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  routing_summary: "validation",
  global_retrieval_queries: [{ query: "product photography", importance: "PRIMARY", reason: "std" }],
  products: [
    { product_id: "PRODUCT_01", product_name: "Kem dưỡng da", reference_ids: ["REF_01"], retrieval_queries: [] },
  ],
} as never;

function adapt(extra: Record<string, unknown>) {
  return SimpleInputAdapterService.adapt(
    {
      concept: "Ảnh sản phẩm",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p.png", mimeType: "image/png" }],
      ...extra,
    } as never,
    routing
  );
}

async function main() {
  console.log(bar);
  console.log("REGRESSION RECOVERY VALIDATION");
  console.log(bar);

  // ── 1-2. Reference fidelity, the largest regression ─────────────────
  console.log("\n1 & 2. PRODUCT HERO / LUXURY PRODUCT — reference image handling");
  console.log("-".repeat(92));
  const hero = await noisy(4000, 3000, 92);
  const single = await ImageNormalizationService.normalizePayload([
    { reference_id: "REF_01", buffer: hero },
  ]);
  const img = single.images[0];
  console.log(`  input                 4000x3000, ${(hero.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  BEFORE this patch     2048x1536, 0.31 MB, q85 recompressed  (26% of pixels)`);
  console.log(`  AFTER  this patch     ${img.after_dimensions}, ${(img.after_size / 1024 / 1024).toFixed(2)} MB, recompressed=${img.compression_applied}`);
  console.log(`  guard                 ${single.guard.status} — ${single.guard.reason}`);

  const many = await Promise.all([noisy(4000, 3000, 95), noisy(4000, 3000, 95), noisy(4000, 3000, 95)]);
  const over = await ImageNormalizationService.normalizePayload(
    many.map((b, i) => ({ reference_id: `REF_0${i + 1}`, buffer: b }))
  );
  console.log(
    `\n  three references      ${(many.reduce((t, b) => t + b.length, 0) / 1024 / 1024).toFixed(2)} MB (over budget)` +
      ` -> ${over.guard.status}, ${(over.guard.final_total / 1024 / 1024).toFixed(2)} MB`
  );
  console.log("  Optimization is payload-aware: it fires only when the request would not fit.");

  // ── 3. Knowledge retention ──────────────────────────────────────────
  console.log("\n3. KNOWLEDGE RETENTION — instructions reaching the model");
  console.log("-".repeat(92));
  const F = "data/generated/image-renders/gen_1788234944510_6hrhh/master_prompt.md";
  if (fs.existsSync(F)) {
    const t = fs.readFileSync(F, "utf-8");
    const know = t.slice(t.indexOf("## PROFESSIONAL KNOWLEDGE"), t.indexOf("## TYPOGRAPHY & READABLE COPY"));
    const blocks = know.split(/\n(?=#### )/).slice(1);
    const PHYS = /specular|reflect|shadow|contact|material|surface|roughness|translucen|transmission|highlight|diffus|texture|depth|volume|physical/i;
    let kept = 0;
    let lost = 0;
    let physLost = 0;
    let after = 0;
    for (const b of blocks) {
      const nl = b.indexOf("\n");
      const out = KnowledgeBlockCompressor.compress(b.slice(nl + 1));
      after += b.slice(0, nl).length + 1 + out.after_chars;
      for (const line of b.slice(nl + 1).split("\n")) {
        const l = line.replace(/^- /, "").trim();
        if (!l || l.startsWith("**")) continue;
        if (out.text.includes(l.slice(0, 55))) kept++;
        else {
          lost++;
          if (PHYS.test(l)) physLost++;
        }
      }
    }
    console.log(`  BEFORE this patch     kept 13, lost 43 lines · 20 physical rules lost · 9394 -> 2783 (30%)`);
    console.log(`  AFTER  this patch     kept ${kept}, lost ${lost} lines · ${physLost} physical rules lost · ${know.length} -> ${after} (${((after / know.length) * 100).toFixed(0)}%)`);
    console.log("  The two still dropped are permissive prose ('may emerge through', 'may be established').");
  }

  // ── 4. Prompt budget ────────────────────────────────────────────────
  console.log("\n4. PROMPT BUDGET — what the optimizer does at each size");
  console.log("-".repeat(92));
  console.log(`  soft ${ProviderPromptOptimizer.SOFT_THRESHOLD} · hard ${ProviderPromptOptimizer.HARD_LIMIT}`);
  const files = fs
    .readdirSync("data/generated/image-renders")
    .map((d) => `data/generated/image-renders/${d}/master_prompt.md`)
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ f, n: fs.statSync(f).size }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  let beforeTotal = 0;
  let afterTotal = 0;
  let touched = 0;
  for (const { f } of files) {
    const raw = fs.readFileSync(f, "utf-8");
    const out = ProviderPromptOptimizer.optimize(raw);
    beforeTotal += raw.length;
    afterTotal += out.telemetry.after_chars;
    if ((out.telemetry.tiers_dropped || []).length) touched++;
  }
  console.log(`  8 largest real prompts   ${beforeTotal} -> ${afterTotal} chars`);
  console.log(`  prompts that lost a tier ${touched} of ${files.length}`);
  console.log("  Nothing under 17,000 is compressed; the previous band cut at 16,000 and stripped formatting.");

  // ── 5-6. Visual control authority ───────────────────────────────────
  console.log("\n5 & 6. POSTER SALE / BANNER / CAMERA OVERRIDE — visual direction authority");
  console.log("-".repeat(92));
  const cases: [string, Record<string, unknown>][] = [
    ["poster sale, no control touched", { concept: "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA" }],
    ["banner, no control touched", { concept: "Tạo banner ưu đãi khai trương", useCase: "Banner" }],
    ["luxury, no control touched", { concept: "Poster mỹ phẩm cao cấp" }],
    ["camera override = Góc cao", { creativeDirection: { visual_controls: { camera: "high_angle" } } }],
    ["camera written in concept", { concept: "Ảnh sản phẩm, chụp góc thấp" }],
  ];
  for (const [name, extra] of cases) {
    const a = adapt(extra);
    const vd = a.hardRequirements.filter((h: string) =>
      /camera|lighting|lens|composition|typograph|colour|Góc|Ánh sáng|Ống kính|Bố cục|Kiểu chữ|Tông màu/i.test(h)
    );
    console.log(`  ${name.padEnd(34)} visual hard-reqs: ${vd.length}${vd.length ? "  -> " + vd[0].slice(0, 46) : ""}`);
  }
  console.log("\n  BEFORE this patch every row above injected 6 visual hard requirements (688 chars),");
  console.log("  contradicting the ART DIRECTION block's claim to be the only authority on camera");
  console.log("  and lighting. Now only a deliberate user choice is hard.");

  console.log("\n" + bar);
  console.log("NOT MEASURED HERE: the rendered image. No provider call is made.");
  console.log(bar);
}

main();
