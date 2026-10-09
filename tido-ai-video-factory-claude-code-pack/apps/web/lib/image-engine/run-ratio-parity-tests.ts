/**
 * Ratio parity — the form may only offer what the renderer accepts.
 *
 * The live form offered 4:5 and defaulted to it, while the provider refuses anything
 * outside 1:1, 9:16 and 16:9 (`config.ts` SUPPORTED_ASPECT_RATIOS, enforced by the
 * ImgStudio adapter as UNSUPPORTED_ASPECT_RATIO). A user who never touched the ratio
 * control got a refused render. Nothing tested the two lists against each other, so
 * this suite does exactly that.
 *
 * Source-level where the value lives inside a React component, because importing a
 * client component into a node test pulls in the browser runtime for one constant.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import { IMAGE_ENGINE_CONFIG } from "./config";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    const msg = (e as Error).message.split("\n")[0];
    failures.push(`${name}\n    ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** The string literals inside `name ... = [ ... ]`. */
function arrayLiteral(source: string, name: string): string[] {
  const m = new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source);
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const SUPPORTED = [...IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS];
const sorted = (xs: string[]) => [...xs].sort();

const LIVE_FILES = [
  "features/picture-engine/components/brief/CreativeBriefPanel.tsx",
  "features/picture-engine/components/brief/CreativeDirectionSelector.tsx",
  "features/picture-engine/components/canvas/RenderCanvas.tsx",
  "features/picture-engine/types/picture-engine.types.ts",
  "features/picture-engine/schemas/creative-brief.schema.ts",
  "features/picture-engine/stores/picture-engine.store.ts",
  "lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts",
  "lib/image-engine/service/CommercialLayoutService.ts",
  "lib/image-engine/director/CreativeFormatPlanner.ts",
];

function main() {
  console.log("\nRatio parity — the form offers only what the renderer accepts\n");

  check("the renderer's list is exactly 1:1, 9:16, 16:9", () => {
    assert.deepStrictEqual(sorted(SUPPORTED), sorted(["1:1", "9:16", "16:9"]));
    assert.deepStrictEqual(
      sorted([...IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS]),
      sorted(SUPPORTED),
      "the provider gate and the config disagree",
    );
  });

  check("the brief panel offers exactly the renderer's list", () => {
    const opts = arrayLiteral(read(LIVE_FILES[0]), "ASPECT_RATIO_OPTIONS");
    assert.deepStrictEqual(sorted(opts), sorted(SUPPORTED));
  });

  check("the direction selector offers exactly the renderer's list", () => {
    const opts = arrayLiteral(read(LIVE_FILES[1]), "ASPECT_RATIOS");
    assert.deepStrictEqual(sorted(opts), sorted(SUPPORTED));
  });

  check("the type and the schema allow exactly the renderer's list", () => {
    const type = /AspectRatioType\s*=\s*([^;]+);/.exec(read(LIVE_FILES[3]));
    assert.ok(type, "AspectRatioType not found");
    assert.deepStrictEqual(sorted([...type![1].matchAll(/"([^"]+)"/g)].map((x) => x[1])), sorted(SUPPORTED));
    const zod = /aspect_ratio:\s*z\.enum\(\[([^\]]*)\]/.exec(read(LIVE_FILES[4]));
    assert.ok(zod, "the zod enum not found");
    assert.deepStrictEqual(sorted([...zod![1].matchAll(/"([^"]+)"/g)].map((x) => x[1])), sorted(SUPPORTED));
  });

  check("the default is 1:1 — in the store and in the panel's fallback", () => {
    assert.ok(/aspect_ratio:\s*"1:1"/.test(read(LIVE_FILES[5])), "the store default is not 1:1");
    assert.ok(/aspect_ratio\s*\?\?\s*"1:1"/.test(read(LIVE_FILES[0])), "the panel fallback is not 1:1");
  });

  check('no live file still names "4:5"', () => {
    for (const rel of LIVE_FILES) {
      assert.ok(!/["']4:5["']|aspect-\[4\/5\]/.test(read(rel)), `${rel} still names 4:5`);
    }
  });

  check("the output size defaults to the 1K tier", () => {
    // Read without the environment, so this pins the code default, not .env.local.
    const src = read("lib/image-engine/config.ts");
    assert.ok(/TIDO_IMAGE_OUTPUT_SIZE:\s*process\.env\.TIDO_IMAGE_OUTPUT_SIZE\s*\|\|\s*"1K"/.test(src), "config default is not 1K");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
