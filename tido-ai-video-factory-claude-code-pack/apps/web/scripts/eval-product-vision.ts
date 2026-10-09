/**
 * One real vision call on one fixture, so a person can check the answer by eye.
 *
 * WHY THIS CANNOT BE A TEST
 * -------------------------
 * `run-product-vision-tests.ts` proves everything around the call: the question names the
 * panels the renderer will see, a valid answer moves the lighting and the lens, an invalid
 * one changes nothing, the cache works, a timeout is survivable. All of it with mocked
 * replies — which means all of it is a statement about fixtures I wrote.
 *
 * The one thing it cannot prove is whether a real vision model, looking at a real packed
 * contact sheet, reports the material correctly. That matters more than any of the rest,
 * because the lighting plan now follows the answer: a glass cup misread as matte plastic
 * gets a raking light instead of a backlight, and the render comes back worse with nothing
 * in the logs to say why.
 *
 * So: this makes one call, prints the answer beside the derived lighting and lens, and
 * stops. It decides nothing.
 *
 * WHAT TO LOOK FOR
 * ----------------
 *   1. Are the materials right, and is the most dominant one FIRST? The whole physics layer
 *      keys on the first entry.
 *   2. Is `legible` honest? A label the model cannot actually read, reported as legible, is
 *      how invented lettering reaches a real product — it activates print-rule branch (c),
 *      which claims to know what the label says.
 *   3. Is `size_class` plausible? It moves the lens.
 *
 * SPENDING
 * --------
 * ONE vision call. Cheap next to a render, and not free. Refuses without both flags:
 *
 *   npx tsx scripts/eval-product-vision.ts --yes-i-approve-spending --max-vnd=200 \
 *       --products=path/to/a.png,path/to/b.png
 *
 * Real photographs are required. A synthetic rectangle has no material, so the answer
 * would tell you only that the plumbing works, which the mocked suite already did.
 */
import fs from "fs";
import path from "path";

import { ReferencePackingService } from "../lib/image-engine/provider/reference-packing/ReferencePackingService";
import { SUNBURST } from "../lib/image-engine/models/image-model-profiles";
import {
  allocateReferences,
  type AllocationInput,
} from "../lib/image-engine/provider/reference-packing/reference-allocation";
import {
  panelsToAsk,
  productVisionPrompt,
  readProductVision,
} from "../lib/image-engine/prompt-v2/art-direction/product-vision";
import { physicsFor } from "../lib/image-engine/prompt-v2/art-direction/material-physics";

const APPROVED = process.argv.includes("--yes-i-approve-spending");
const MAX_VND = Number((process.argv.find((a) => a.startsWith("--max-vnd=")) || "").split("=")[1] || 0);
const PRODUCTS = (process.argv.find((a) => a.startsWith("--products=")) || "").split("=")[1] || "";
/** A vision call is not a render. Named so the guard arithmetic is visible, not guessed. */
const VND_PER_VISION_CALL = 50;

if (!APPROVED || !MAX_VND) {
  console.error(
    "Refusing to spend. Run with both flags and with REAL product photographs:\n\n" +
      "  npx tsx scripts/eval-product-vision.ts --yes-i-approve-spending --max-vnd=200 \\\n" +
      "      --products=path/to/a.png,path/to/b.png\n\n" +
      `Estimated cost: 1 vision call, about ${VND_PER_VISION_CALL} VND. No image is rendered.`,
  );
  process.exit(1);
}

const files = PRODUCTS.split(",").map((f) => f.trim()).filter(Boolean);
if (!files.length || files.some((f) => !fs.existsSync(f))) {
  console.error(
    "--products is required and every path must exist.\n\n" +
      "Real photographs, please. A synthetic rectangle has no material, so the answer would\n" +
      "only confirm the plumbing — which run-product-vision-tests.ts already does for free.",
  );
  process.exit(1);
}
if (VND_PER_VISION_CALL > MAX_VND) {
  console.error(`Refusing: one call costs about ${VND_PER_VISION_CALL} VND, over the ${MAX_VND} VND cap.`);
  process.exit(1);
}

async function main() {
  // Pack exactly as a render would, so the model sees what the renderer will see.
  const inputs: AllocationInput[] = files.map((file, i) => ({
    id: String(i + 1),
    kind: "product",
    productId: null,
    filename: path.basename(file),
  }));
  const allocation = allocateReferences(inputs, {
    limit: SUNBURST.maxReferences,
    maxPanelsPerSheet: SUNBURST.maxPanelsPerSheet,
    sheetSizePx: SUNBURST.sheetSizePx,
  });

  const packed = await ReferencePackingService.pack({
    references: files.map((file, i) => ({
      reference_id: String(i + 1),
      role: "PRODUCT",
      buffer: fs.readFileSync(file),
      mimeType: "image/png",
      filename: path.basename(file),
    })) as never,
    options: {
      limit: SUNBURST.maxReferences,
      sheetSize: SUNBURST.sheetSizePx,
      maxCells: SUNBURST.maxPanelsPerSheet,
      minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx,
    },
  });

  // `references` is what the provider would be handed: the packed sheets, and any product
  // that travelled whole. Exactly the bytes the vision pass should be looking at.
  const sheets: Array<{ buffer: Buffer; mimeType?: string }> = [];
  for (const ref of packed.references || []) {
    const buffer = (ref as { buffer?: Buffer }).buffer;
    if (!buffer) continue;
    sheets.push({ buffer, mimeType: (ref as { mimeType?: string }).mimeType });
  }
  if (!sheets.length) {
    console.error("The packer produced no sheets. Nothing to look at, and nothing was spent.");
    process.exit(1);
  }

  const panels = panelsToAsk(allocation);
  console.log(`\nAsking about ${panels.length} panel(s) across ${sheets.length} sheet(s).`);
  console.log("\n--- THE QUESTION ---\n");
  console.log(productVisionPrompt(panels));

  // Imported here, after both guards, so a refused run never constructs a client.
  const { LLMProviderService } = await import("../lib/image-engine/llm/llm-provider.service");
  const llm = new LLMProviderService();
  const result = await readProductVision(allocation, sheets, {
    chat: (messages, purpose) =>
      llm.generateChatCompletion(messages as never, purpose, { max_tokens: 1800, temperature: 0.2, timeoutMs: 60000 }),
  });

  console.log("\n--- THE ANSWER ---\n");
  console.log(JSON.stringify(result.vision, null, 2));
  console.log(`\nsource: ${result.source}${result.reason ? ` — ${result.reason}` : ""}`);

  if (!result.vision) {
    console.log("\nNo usable answer. A render would have proceeded on the unverified defaults.");
    return;
  }

  console.log("\n--- WHAT THE SHEET WOULD DERIVE FROM IT ---\n");
  for (const item of result.vision.products) {
    const physics = physicsFor(item);
    console.log(`panel ${item.panel}:`);
    console.log(`  observed      ${item.materials.join(", ") || "(nothing)"}`);
    console.log(`  family        ${physics?.material.dominant ?? "(none — the sheet keeps its defaults)"}`);
    console.log(`  key light     ${physics?.lighting.key ?? "(geometry decides)"}`);
    console.log(`  lens delta    ${physics?.size?.lens_delta_mm ?? 0}mm`);
    console.log(`  branding      present=${item.printed_branding.present} legible=${item.printed_branding.legible}`);
    if (item.printed_branding.present && item.printed_branding.legible) {
      console.log(`  -> this activates print-rule branch (c), which CLAIMS to know the label reads:`);
      console.log(`     "${item.printed_branding.description}"`);
      console.log(`     If that is wrong, the render draws it wrong. Check it.`);
    }
    console.log("");
  }

  console.log("Nothing was decided. Read the above and judge it.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
