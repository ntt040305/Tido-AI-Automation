/**
 * The live eval: real model calls, real renders, real money. NOT run by this work.
 *
 *   npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts            # prints the bill, does nothing
 *   npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts --yes-i-approve-spending
 *
 * WHY IT REFUSES BY DEFAULT
 * -------------------------
 * Every call here costs: one text call per brief for v2, four to five for v1, and
 * one paid render per image on each side. A script that spends money because
 * somebody pressed up-arrow is a bug, so this one prints the bill, waits for an
 * explicit flag, and exits 0 when it does not have it.
 *
 * WHAT IT PRODUCES
 * ----------------
 * `eval/live/<timestamp>/<case>.<engine>.<n>.png` plus the prompt that produced
 * each one, named so two images of the same brief sit side by side in a file
 * browser. Comparing them is a human job and this script does not score them.
 */
import fs from "fs";
import path from "path";

import { EVAL_CASES } from "./prompt-v2/eval/cases";

/** The six briefs worth paying for: the shapes that differ most, plus the audit case. */
const LIVE_IDS = [
  "centella_pair_poster_1x1_326chars",
  "coffee_poster_1x1",
  "earbuds_banner_16x9",
  "serum_social_9x16",
  "watch_hero_1x1_no_copy",
  "serum_ugc_9x16",
];

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const APPROVED = args.includes("--yes-i-approve-spending");
const IMAGES_PER_SIDE = Number(arg("images") || 2);
const ENGINES = (arg("engines") || "v1,v2").split(",").map((s) => s.trim());

/**
 * The bill, from what the repo already knows.
 *
 * The render price is the one recorded in this project's own notes: 100 VND per
 * image on this provider. The text price is deliberately NOT guessed -- it depends
 * on the account's own rate -- so the script prints the call and token counts and
 * leaves the arithmetic to whoever is paying.
 */
function printBill(cases: number): void {
  const renders = cases * ENGINES.length * IMAGES_PER_SIDE;
  const v2Text = ENGINES.includes("v2") ? cases : 0;
  // Zero, and that is a choice: this script renders v1 from its DETERMINISTIC
  // assembly, the same one the golden suite pins. The comparison is about the
  // prompt the renderer receives, and paying for the four upstream director calls
  // again would not change that prompt.
  const v1Text = 0;
  console.log("\nWHAT THIS WILL SPEND");
  console.log(`  briefs                       ${cases}`);
  console.log(`  engines                      ${ENGINES.join(", ")}`);
  console.log(`  images per brief per engine   ${IMAGES_PER_SIDE}`);
  console.log(`  PAID RENDERS                 ${renders}  (~${renders * 100} VND at the 100 VND/render this project has recorded)`);
  console.log(`  text calls, v2               ${v2Text}  (1 per brief, 2 if the linter rejects the first reply)`);
  console.log(`  text calls, v1               ${v1Text}  (v1 is rendered from its deterministic assembly; in production it costs ~5 per job)`);
  console.log(`  text tokens, rough           v2 ~1,500 in + ~800 out per call, plus the product images`);
  console.log(`                               v1 not estimated here; it is five calls of varying size`);
  console.log("\n  The render figure is from this project's own notes. The text figure depends on");
  console.log("  your account's rate and is NOT guessed.");
}

async function main(): Promise<void> {
  const cases = EVAL_CASES.filter((c) => LIVE_IDS.includes(c.id));
  printBill(cases.length);

  if (!APPROVED) {
    console.log("\nNothing was called. Re-run with --yes-i-approve-spending to proceed.");
    console.log("Optional: --images=1 to halve the render bill, --engines=v2 to skip v1.\n");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(__dirname, "prompt-v2", "eval", "live", stamp);
  fs.mkdirSync(out, { recursive: true });
  console.log(`\nApproved. Writing to ${out}\n`);

  const { LLMProviderService } = await import("./llm/llm-provider.service");
  const { ImgStudioImageGenerationProvider } = await import("./provider/ImgStudioImageGenerationProvider");
  const { buildV2Prompt } = await import("./prompt-v2/build");
  const { buildV1Prompt } = await import("./run-prompt-engine-golden-tests");
  const { includeLabelText } = await import("./prompt-v2/engine-selector");

  const llm = new LLMProviderService();
  const provider = new ImgStudioImageGenerationProvider();
  let renders = 0;
  let textCalls = 0;

  for (const c of cases) {
    const copy = c.contentMessage.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    /**
     * The product photos.
     *
     * Supplied by the operator, not invented: a file named `<case id>.<n>.png` in
     * `eval/live/photos/`. A brief whose photos are missing is skipped loudly
     * rather than rendered without them, because a render with no reference is not
     * the thing being compared.
     */
    const photoDir = path.join(__dirname, "prompt-v2", "eval", "live", "photos");
    const references = c.products.map((p, i) => {
      const file = path.join(photoDir, `${c.id}.${i + 1}.png`);
      return fs.existsSync(file)
        ? {
            reference_id: `REF_0${i + 1}`,
            product_id: `PRODUCT_0${i + 1}`,
            role: "PRODUCT" as const,
            mimeType: "image/png",
            buffer: fs.readFileSync(file),
            filename: path.basename(file),
          }
        : null;
    });
    if (c.products.length && references.some((r) => !r)) {
      console.log(`  ${c.id}: SKIPPED — expected ${c.products.length} photo(s) at ${photoDir}/${c.id}.N.png`);
      continue;
    }

    const prompts: Array<{ engine: string; prompt: string }> = [];

    if (ENGINES.includes("v2")) {
      const built = await buildV2Prompt(
        {
          assetType: c.assetType,
          aspectRatio: c.aspectRatio,
          concept: c.concept,
          brand: c.brand,
          productLine: c.productLine,
          copy,
          products: c.products.map((p, i) => {
            const ref = references[i];
            return {
              ref_index: i + 1,
              description: p.description,
              ...(ref ? { imageUrl: `data:${ref.mimeType};base64,${ref.buffer.toString("base64")}` } : {}),
            };
          }),
          includeLabelText: includeLabelText(),
          notes: c.notes,
        },
        { chat: (messages, purpose) => llm.generateChatCompletion(messages as never, purpose, { temperature: 0.7, max_tokens: 4000, timeoutMs: 90000 }) },
      );
      textCalls += built.llmCalls;
      if (built.ok && built.prompt) prompts.push({ engine: "v2", prompt: built.prompt });
      else console.log(`  ${c.id}: v2 fell back (${built.reason}) — rendering v1 only for this brief`);
      fs.writeFileSync(path.join(out, `${c.id}.v2.json`), JSON.stringify({ ...built, spec: built.spec }, null, 2), "utf8");
    }

    if (ENGINES.includes("v1")) {
      // The deterministic v1 assembly, the same one the golden suite pins. It does
      // NOT re-run the four upstream LLM calls: this comparison is about the prompt
      // the renderer receives, and paying for the director twice would not change it.
      prompts.push({
        engine: "v1",
        prompt: buildV1Prompt({
          id: c.id,
          assetType: c.assetType,
          aspectRatio: c.aspectRatio,
          concept: c.concept,
          contentMessage: c.contentMessage,
          brandName: c.brand,
          productLine: c.productLine,
          products: c.products.map((p, i) => ({ ref: i + 1, description: p.description, labelText: p.labelText })),
        }),
      });
    }

    for (const { engine, prompt } of prompts) {
      fs.writeFileSync(path.join(out, `${c.id}.${engine}.prompt.txt`), prompt, "utf8");
      for (let n = 1; n <= IMAGES_PER_SIDE; n++) {
        const res = await provider.generateImage({
          model: process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2",
          prompt,
          references: references.filter(Boolean) as NonNullable<(typeof references)[number]>[],
          aspectRatio: c.aspectRatio,
          imageSize: "1024",
          mimeType: "image/png",
          generationId: `eval-${stamp}-${c.id}-${engine}-${n}`,
          idempotencyKey: `eval-${stamp}-${c.id}-${engine}-${n}`,
        });
        renders++;
        if (res.success && res.imageBuffer) {
          const file = path.join(out, `${c.id}.${engine}.${n}.png`);
          fs.writeFileSync(file, res.imageBuffer);
          console.log(`  ${c.id} ${engine} #${n}: ${path.basename(file)}`);
        } else {
          console.log(`  ${c.id} ${engine} #${n}: FAILED — ${res.error?.code || "unknown"} ${res.error?.message || ""}`);
        }
      }
    }
  }

  console.log(`\nDone. ${renders} render(s), ${textCalls} text call(s). Output: ${out}`);
  console.log("The images are for you to compare by eye; this script does not score them.\n");
}

void main();
