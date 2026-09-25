/**
 * Phase 5.6.6 — typeface selection, and the coverage claim behind it.
 *
 * The catalogue asserts that certain faces can draw Vietnamese. That claim is
 * the whole reason the module exists, so it is not taken on trust: every face
 * is re-probed here by rendering tone-marked glyphs and comparing them against
 * the same glyph drawn with a family that does not exist. Identical pixels mean
 * the renderer substituted a fallback, which is the bug this replaced.
 *
 * Platform-dependent by nature. A machine without these system fonts SHOULD
 * fail this suite rather than quietly ship mixed-face Vietnamese.
 */

import assert from "assert";
import crypto from "crypto";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const {
  FONT_CATALOGUE, EXCLUDED_FOR_VIETNAMESE, selectFont, selectPairing, fontStack,
  needsVietnamese, fontTelemetry,
} = require("./evolution/experiment/FontIntelligence");

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

/** Tone-marked glyphs that a Latin-only face will not carry. */
const PROBE = "ảặđươễỹốầụ";
const ABSENT_FAMILY = "NoSuchFontZZZ";

async function glyph(family: string, ch: string): Promise<string> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect width="140" height="140" fill="#fff"/>` +
    `<text x="10" y="100" font-family="${family}" font-size="90" fill="#000">${ch}</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return crypto.createHash("md5").update(buf).digest("hex");
}

/** The characters `family` cannot draw itself. */
async function missingGlyphs(family: string): Promise<string[]> {
  const out: string[] = [];
  for (const ch of PROBE) {
    const [a, b] = await Promise.all([glyph(family, ch), glyph(ABSENT_FAMILY, ch)]);
    if (a === b) out.push(ch);
  }
  return out;
}

const VI = ["Giảm giá 50% hôm nay!", "Đặt ngay"];
const EN = ["BOLD BY DEFAULT"];

async function main() {
  console.log("\nFont intelligence\n");

  // ── the claim behind the catalogue ───────────────────────────────────────
  await check("every face claiming Vietnamese actually draws it on this machine", async () => {
    const liars: string[] = [];
    for (const f of FONT_CATALOGUE.filter((x: { vietnamese: boolean }) => x.vietnamese)) {
      const missing = await missingGlyphs(f.family);
      if (missing.length) liars.push(`${f.family} is missing ${missing.join("")}`);
    }
    assert.deepStrictEqual(liars, [], `the catalogue claims coverage it does not have:\n    ${liars.join("\n    ")}`);
  });

  await check("the excluded faces really are missing the glyphs they are excluded for", async () => {
    const wrong: string[] = [];
    for (const e of EXCLUDED_FOR_VIETNAMESE) {
      const missing = (await missingGlyphs(e.family)).join("");
      // Exclusion must be justified: if a face turns out to be complete, the
      // exclusion is stale and the catalogue is needlessly poorer.
      if (!missing) wrong.push(`${e.family} is excluded but draws every probe glyph`);
    }
    assert.deepStrictEqual(wrong, [], wrong.join("; "));
  });

  await check("Georgia — the face this replaced — is still demonstrably broken for Vietnamese", async () => {
    // The regression that motivated the module. If this ever passes, the
    // platform changed and the whole catalogue should be re-probed.
    const missing = await missingGlyphs("Georgia");
    assert.ok(missing.length > 0, "Georgia now carries Vietnamese; re-probe the catalogue");
  });

  // ── selection ────────────────────────────────────────────────────────────
  await check("Vietnamese copy can never be assigned a face that cannot draw it", () => {
    const names = new Set(EXCLUDED_FOR_VIETNAMESE.map((e: { family: string }) => e.family));
    for (const personality of ["editorial", "technical", "crafted", "direct", "quiet", "assertive"]) {
      for (const category of ["food", "beverage", "beauty", "fmcg", "technology", "fashion", ""]) {
        const p = selectPairing({ personality, category, lines: VI });
        for (const c of [p.heading, p.body]) {
          assert.ok(!names.has(c.family), `${personality}/${category} chose ${c.family} for Vietnamese`);
          const face = FONT_CATALOGUE.find((f: { family: string }) => f.family === c.family);
          assert.ok(face?.vietnamese, `${c.family} is not verified for Vietnamese`);
        }
      }
    }
  });

  await check("a brand's own face wins — unless it cannot draw the copy", () => {
    const latin = selectFont({ brandFamily: "Cambria", lines: EN });
    assert.strictEqual(latin.family, "Cambria");
    assert.strictEqual(latin.brand_font, true, "the brand's face was overridden for no reason");

    // Named but outside the catalogue: the system chooses, and says so.
    const unknown = selectFont({ brandFamily: "Helvetica Neue LT Pro", lines: EN });
    assert.strictEqual(unknown.brand_font, false);
    assert.ok(unknown.family, "no face was chosen when the brand's was unavailable");

    // Named, real, but cannot draw Vietnamese: identity loses to legibility.
    const broken = selectFont({ brandFamily: "Georgia", lines: VI });
    assert.notStrictEqual(broken.family, "Georgia", "a face that breaks Vietnamese was kept because the brand asked");
    assert.strictEqual(broken.brand_font, false);
  });

  await check("personality and category both move the choice", () => {
    const luxury = selectFont({ personality: "editorial", category: "beauty", lines: EN });
    const tech = selectFont({ personality: "technical", category: "technology", lines: EN });
    const food = selectFont({ personality: "crafted", category: "food", lines: EN });
    assert.notStrictEqual(luxury.family, tech.family, "a luxury serif and a technical sans chose the same face");
    assert.notStrictEqual(food.family, tech.family, "food and technology chose the same face");
    assert.strictEqual(luxury.class, "serif", "an editorial beauty headline is not a serif");
    for (const c of [luxury, tech, food]) assert.ok(c.because.length > 10, "a choice was made without a reason");
  });

  await check("a heavy display voice still gets a face that survives tone marks", () => {
    // Impact and Arial Black are the obvious choices and both break Vietnamese.
    const c = selectFont({ personality: "assertive", category: "food", lines: VI });
    assert.strictEqual(c.family, "Segoe UI Black");
    assert.ok(c.weights.regular >= 700, "an assertive voice was given a light face");
  });

  await check("the pairing gives hierarchy two faces where it can", () => {
    const p = selectPairing({ personality: "editorial", category: "fashion", lines: EN });
    assert.notStrictEqual(p.heading.family, p.body.family, "heading and body collapsed to one face");
    assert.ok(fontTelemetry(p).paired);
  });

  await check("the fallback stack names only faces that carry Vietnamese", async () => {
    const broken = new Set(EXCLUDED_FOR_VIETNAMESE.map((e: { family: string }) => e.family));
    for (const lines of [VI, EN]) {
      const p = selectPairing({ personality: "editorial", lines });
      for (const c of [p.heading, p.body]) {
        const stack = fontStack(c);
        const named = [...stack.matchAll(/'([^']+)'|([A-Z][A-Za-z ]+)/g)]
          .map((m) => (m[1] || m[2] || "").trim())
          .filter((n) => n && !["serif", "sans-serif", "monospace"].includes(n));
        for (const n of named) {
          assert.ok(!broken.has(n), `the fallback stack names ${n}, which breaks Vietnamese`);
        }
      }
    }
  });

  await check("telemetry names faces and never the copy", () => {
    const p = selectPairing({ personality: "direct", lines: VI });
    const t = JSON.stringify(fontTelemetry(p));
    for (const line of VI) assert.ok(!t.includes(line), "the telemetry leaked the client's copy");
    assert.ok(/heading/.test(t) && /body/.test(t));
  });

  await check("the compositor no longer names a face of its own", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/EditableDesign.ts"), "utf-8");
    assert.ok(/selectPairing/.test(src), "the compositor does not use the selector");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/DEFAULT_FAMILY/.test(code), "the hardcoded family table is back");
    assert.ok(!/"Georgia"/.test(code), "Georgia is named in the compositor again");
  });

  await check("Vietnamese detection is not fooled by plain Latin", () => {
    assert.strictEqual(needsVietnamese(["BOLD BY DEFAULT", "Slow mornings"]), false);
    assert.strictEqual(needsVietnamese(["Giảm giá"]), true);
    assert.strictEqual(needsVietnamese(["Đặt ngay"]), true);
    assert.strictEqual(needsVietnamese([]), false);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
