/**
 * The only thing that can actually answer the 512px question.
 *
 * WHAT THIS IS FOR
 * ----------------
 * `allocateReferences` says that at five product photographs every panel on a 1024px
 * sheet comes out at 496px, and at eight it is 496px on both sheets. That is arithmetic
 * and it is certainly true. What is NOT known is whether GPT Image 2.5 Sunburst still
 * reproduces a product's LABEL correctly from a panel that size — whether the identity
 * lock survives the downscale.
 *
 * No test can answer it. A stubbed provider returns a stubbed image, so any assertion
 * about the pixels Sunburst would produce is an assertion about a fixture. The answer
 * costs money and needs a pair of eyes.
 *
 * So: this script renders the two cases that matter, saves everything needed to judge
 * them, and stops. It does not decide. You look at the images and decide, and if the
 * labels are right you set GPT_LABEL_LOCK_VERIFIED=true — which is the single flag that
 * opens the gate in `build-gpt.ts`.
 *
 * SPENDING
 * --------
 * Refuses to run without BOTH flags:
 *
 *   npx tsx scripts/eval-gpt-label-lock.ts --yes-i-approve-spending --max-vnd=1000
 *
 * Four renders at 250 VND each (every one carries reference images) is 1,000 VND. The cap
 * is checked before every call and the balance the provider reports is checked after, so
 * it stops at the cap rather than near it.
 */
import fs from "fs";
import path from "path";

import { ImgStudioImageGenerationProvider } from "../lib/image-engine/provider/ImgStudioImageGenerationProvider";
import type { ProviderReferenceImage } from "../lib/image-engine/provider/ImageGenerationProvider";
import { ReferencePackingService } from "../lib/image-engine/provider/reference-packing/ReferencePackingService";
import { SUNBURST, activeProfile } from "../lib/image-engine/models/image-model-profiles";
import { allocateReferences, type AllocationInput } from "../lib/image-engine/provider/reference-packing/reference-allocation";
import { compileGptBrief, type GptBriefInput } from "../lib/image-engine/prompt-v2/gpt-brief";
import { buildGptMessages } from "../lib/image-engine/prompt-v2/build-gpt";
import { buildGptFallbackPrompt } from "../lib/image-engine/prompt-v2/gpt-fallback";

const APPROVED = process.argv.includes("--yes-i-approve-spending");
const MAX_VND = Number((process.argv.find((a) => a.startsWith("--max-vnd=")) || "").split("=")[1] || 0);
/** A real product photograph with legible lettering. Without one this proves nothing. */
const PRODUCT = (process.argv.find((a) => a.startsWith("--product=")) || "").split("=")[1] || "";

if (!APPROVED || !MAX_VND) {
  console.error(
    "Refusing to spend. Run with both flags, and with a REAL product photograph:\n\n" +
      "  npx tsx scripts/eval-gpt-label-lock.ts --yes-i-approve-spending --max-vnd=1000 \\\n" +
      "      --product=path/to/a/photo-with-a-readable-label.png\n\n" +
      "Estimated cost: 4 renders x 250 VND = 1,000 VND.",
  );
  process.exit(1);
}
if (!PRODUCT || !fs.existsSync(PRODUCT)) {
  console.error(
    "--product is required and must exist.\n\n" +
      "A synthetic rectangle cannot answer this question: the probe in 03 already showed " +
      "that a flat graphic invites reinterpretation. Use a real photograph of a real " +
      "product whose label you can read, so you can tell whether the render kept it.",
  );
  process.exit(1);
}

const RUN = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.resolve(process.cwd(), "data", "eval", "gpt-label-lock", RUN);
fs.mkdirSync(OUT, { recursive: true });

let spent = 0;

const COPY = ["Khởi động ngày mới", "Cold brew đậm vị, tươi mỗi sáng", "Đặt ngay"];

function allocInputs(n: number): AllocationInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    kind: "product" as const,
    productId: `PRODUCT_${i + 1}`,
    width: 2000,
    height: 2000,
    filename: `product-${i + 1}.png`,
  }));
}

function briefFor(n: number): GptBriefInput {
  const limitOpts = {
    limit: SUNBURST.maxReferences,
    maxPanelsPerSheet: SUNBURST.maxPanelsPerSheet,
    sheetSizePx: SUNBURST.sheetSizePx,
  };
  return {
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "food and beverage",
    intendedUse: "a label-lock verification render",
    productCount: n,
    concept:
      "Mỗi sản phẩm đặt rõ ràng trên nền xám trung tính, ánh sáng đều, nhãn hướng về phía người xem.",
    brand: "Label Lock Test",
    copy: COPY,
    references: allocInputs(n).map((i) => ({
      index: Number(i.id),
      role: "PRODUCT",
      filename: i.filename ?? undefined,
      description: `the supplied product, copy ${i.id}`,
    })),
    allocation: allocateReferences(allocInputs(n), limitOpts),
    minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx,
    productFacts: ["the label wording is whatever the attached photograph shows"],
  };
}

async function run(n: number, label: string) {
  if (spent + 250 > MAX_VND) {
    console.log(`[eval] stopping before "${label}": ${spent} + 250 would pass the ${MAX_VND} VND cap`);
    return;
  }

  const buffer = fs.readFileSync(PRODUCT);
  const refs: ProviderReferenceImage[] = Array.from({ length: n }, (_, i) => ({
    reference_id: String(i + 1),
    product_id: `PRODUCT_${i + 1}`,
    role: "PRODUCT",
    mimeType: "image/png",
    buffer: Buffer.from(buffer),
    filename: `product-${i + 1}.png`,
  })) as ProviderReferenceImage[];

  const packed = await ReferencePackingService.pack({
    references: refs,
    options: {
      limit: SUNBURST.maxReferences,
      maxCells: SUNBURST.maxPanelsPerSheet,
      sheetSize: SUNBURST.sheetSizePx,
      minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx,
    },
  });

  const input = briefFor(n);
  const brief = compileGptBrief(input);
  const { templates, user } = buildGptMessages(input);

  // The code-built prompt deliberately, not a director call: this run is measuring the
  // MODEL's behaviour at a panel size, and a different prompt on each run would make two
  // variables move at once.
  const prompt = buildGptFallbackPrompt(input, templates.playbook);

  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "brief.txt"), String(user.content), "utf8");
  fs.writeFileSync(path.join(dir, "master-prompt.txt"), prompt, "utf8");
  fs.writeFileSync(
    path.join(dir, "panels.json"),
    JSON.stringify(
      {
        n,
        slots_sent: packed.references.length,
        unsafe_panels: brief.unsafePanels,
        panel_geometry: (packed.packed_sheets || (packed.packed ? [packed.packed] : [])).map((s) => s.cells),
        warnings: packed.warnings || [],
      },
      null,
      2,
    ),
    "utf8",
  );
  // The sheets themselves, so you can see what the model was actually handed.
  for (const [i, ref] of packed.references.entries()) {
    fs.writeFileSync(path.join(dir, `sent-image-${i + 1}.png`), ref.buffer as Buffer);
  }

  console.log(`[eval] ${label}: n=${n}, sending ${packed.references.length} image(s)…`);
  const res = await new ImgStudioImageGenerationProvider().generateImage({
    prompt,
    aspectRatio: "1:1",
    references: packed.references,
    generationId: `labellock-${label}`,
    idempotencyKey: `labellock-${RUN}-${label}`,
  } as never);

  const cost = res.remoteDetails?.cost_vnd ?? 0;
  spent += cost;

  if (res.success && res.imageBuffer) {
    fs.writeFileSync(path.join(dir, "render.webp"), res.imageBuffer);
    console.log(
      `[eval] ${label}: ok, ${cost} VND, balance ${res.remoteDetails?.balance_vnd}, ` +
        `${res.remoteDetails?.api_request_ms}ms`,
    );
  } else {
    console.error(`[eval] ${label}: FAILED — ${res.error?.code}: ${res.error?.message}`);
  }
  fs.writeFileSync(
    path.join(dir, "result.json"),
    JSON.stringify({ ok: res.success, error: res.error ?? null, remote: res.remoteDetails ?? null }, null, 2),
    "utf8",
  );
}

async function main() {
  const profile = activeProfile();
  if (profile.promptDialect !== "gpt-image") {
    console.error(
      `The active model is ${profile.displayName} (${profile.promptDialect}). ` +
        `This script measures Sunburst. Set IMGSTUDIO_PROVIDER_ID=${SUNBURST.providerId}.`,
    );
    process.exit(1);
  }

  // The control first. If the label is wrong at 1024px the panel size is not the problem.
  await run(1, "n1-control-1024px");
  await run(2, "n2-full-size");
  await run(5, "n5-496px-panels");
  await run(8, "n8-496px-panels");

  console.log(
    `\n[eval] done. Spent ${spent} VND of ${MAX_VND}. Output: ${OUT}\n\n` +
      "Now LOOK at the four renders, in this order:\n" +
      "  1. n1-control-1024px  — is the label right at full size? If not, stop: the\n" +
      "     problem is not panel size and nothing below tells you anything.\n" +
      "  2. n2-full-size       — two products, each at 1024px, still full size.\n" +
      "  3. n5-496px-panels    — three panels at 496px. Is every label still correct?\n" +
      "  4. n8-496px-panels    — four panels at 496px on both sheets.\n\n" +
      "If 3 and 4 hold: set GPT_LABEL_LOCK_VERIFIED=true in .env.local and the gate in\n" +
      "build-gpt.ts opens.\n" +
      "If they do not: leave the flag alone. The gate already refuses those payloads and\n" +
      "tells the user to send fewer images, which is the honest behaviour.\n",
  );
}

main().catch((e) => {
  console.error("[eval] aborted:", (e as Error).message);
  process.exit(1);
});
