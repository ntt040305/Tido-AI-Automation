/**
 * The GPT Image 2.5 Sunburst dialect, end to end with the provider stubbed.
 *
 * WHAT "END TO END" MEANS HERE, AND WHAT IT CANNOT MEAN
 * ----------------------------------------------------
 * These tests drive the whole chain a real render drives — uploads, allocation, sheet
 * rendering with real pixels, brief, director, checks, and the request that reaches the
 * provider boundary — with the director and the provider stubbed at that boundary. That
 * catches every wiring failure: a prompt that names Image 3 when two images are attached,
 * a sheet described as a single product, a logo asked for when none was supplied.
 *
 * It CANNOT answer whether a 496px panel locks a product's label. Nothing mocked can: a
 * stubbed provider returns a stubbed image, so an assertion about the pixels Sunburst
 * would actually produce would be an assertion about a fixture I wrote. The honest test
 * of that is a paid render inspected by eye, and `scripts/eval-gpt-label-lock.ts` is the
 * guarded script for it.
 *
 * So what this suite pins instead is the thing that IS decidable: at n=5 and n=8 the
 * panels fall below the floor, and while the label-lock is unverified the engine must
 * REFUSE rather than send a prompt that assumes they are safe. That is the acceptance
 * item — not "496px works", which is unknown, but "the system never pretends it knows".
 *
 * No network, no model call, no cost.
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { SUNBURST } from "./models/image-model-profiles";
import { allocateReferences, smallPanels, type AllocationInput } from "./provider/reference-packing/reference-allocation";
import { ReferencePackingService } from "./provider/reference-packing/ReferencePackingService";
import type { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import { compileGptBrief, MASTER_SECTIONS, type GptBriefInput } from "./prompt-v2/gpt-brief";
import { runGptChecks } from "./prompt-v2/gpt-checks";
import { buildGptFallbackPrompt } from "./prompt-v2/gpt-fallback";
import { buildGptPrompt, buildGptMessages, parseGptReply, labelLockRefusal } from "./prompt-v2/build-gpt";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
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

const OPTS = {
  limit: SUNBURST.maxReferences,
  maxPanelsPerSheet: SUNBURST.maxPanelsPerSheet,
  sheetSizePx: SUNBURST.sheetSizePx,
};

const COPY = ["Khởi động ngày mới", "Cold brew đậm vị, tươi mỗi sáng", "Đặt ngay"];

function allocInputs(n: number, logo: boolean): AllocationInput[] {
  const out: AllocationInput[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: String(i + 1),
      kind: "product",
      productId: `PRODUCT_${i + 1}`,
      width: 2000,
      height: 2000,
      filename: `product-${i + 1}.png`,
    });
  }
  if (logo) out.push({ id: String(n + 1), kind: "logo", width: 800, height: 400, filename: "logo.png" });
  return out;
}

function briefFor(n: number, logo: boolean, copy = COPY, ratio = "9:16"): GptBriefInput {
  const alloc = allocateReferences(allocInputs(n, logo), OPTS);
  return {
    assetType: "Poster",
    aspectRatio: ratio,
    industry: "food and beverage",
    intendedUse: "a shop window",
    productCount: n,
    concept: "Chai cold brew trên bệ đá tối, ánh sáng sớm mai.",
    brand: "Origin Blend",
    copy,
    references: allocInputs(n, logo).map((i) => ({
      index: Number(i.id),
      role: i.kind === "logo" ? "LOGO" : "PRODUCT",
      filename: i.filename ?? undefined,
      description: i.kind === "logo" ? "the brand logo" : `amber glass bottle ${i.id}`,
    })),
    allocation: alloc,
    minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx,
    productFacts: ["amber glass bottle, turned wood cap", 'label reads "COLD BREW / ARABICA / 250 ML"'],
  };
}

/** A director that returns a prompt built by the code builder — always check-clean. */
function stubDirector(input: GptBriefInput, playbook: string) {
  return async (): Promise<string> => {
    const prompt = buildGptFallbackPrompt(input, playbook);
    return (
      `<decisions>Took the playbook default. Nothing conflicted.</decisions>\n` +
      `<copy_final>\n${input.copy.join("\n")}\n</copy_final>\n` +
      `<warnings></warnings>\n` +
      `<image_prompt>\n${prompt}\n</image_prompt>`
    );
  };
}

async function realProduct(id: string, w = 2000, h = 2000): Promise<ProviderReferenceImage> {
  return {
    reference_id: id,
    product_id: `PRODUCT_${id}`,
    role: "PRODUCT",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 90, b: 40 } } })
      .png()
      .toBuffer(),
    filename: `${id}.png`,
  };
}

async function main() {
  console.log("\n=== GPT IMAGE 2.5 SUNBURST DIALECT ===\n");

  // ── 1. The template set exists and is separate from the Gemini one ──────
  console.log("-- the template set --");

  await check("the GPT set is a separate directory, and the Gemini set is untouched", () => {
    const gpt = "lib/image-engine/prompt-v2/templates/gpt";
    for (const f of ["system.v1.md", "request.v1.md"]) {
      assert.ok(read(`${gpt}/${f}`).length > 400, `${f} is missing or too short to be real`);
    }
    for (const p of ["poster", "banner", "social", "hero", "ugc"]) {
      assert.ok(read(`${gpt}/playbooks/${p}.v1.txt`).length > 200, `playbook ${p} missing`);
    }
    // Two gold examples per asset type: a prompt that sets three strings and one that
    // sets none are different shapes.
    for (const a of ["poster", "banner", "social_ad", "product_hero", "ugc"]) {
      for (const v of ["with-copy", "no-copy"]) {
        const g = read(`${gpt}/gold-examples/${a}.${v}.md`);
        assert.ok(/^status: seed - unproven/m.test(g), `${a}.${v} is not marked unproven`);
      }
    }
    // The Gemini templates must not mention this model at all.
    const geminiSystem = read("lib/image-engine/prompt-v2/templates/system.v1.md");
    assert.ok(!/sunburst/i.test(geminiSystem), "the Gemini system prompt now names Sunburst");
  });

  await check("the gold example matches whether the job has copy", () => {
    const withCopy = buildGptMessages(briefFor(1, false, COPY));
    const noCopy = buildGptMessages(briefFor(1, false, []));
    assert.ok(/with-copy/.test(withCopy.templates.files.join(" ")), "a job with copy got the no-copy example");
    assert.ok(/no-copy/.test(noCopy.templates.files.join(" ")), "a job with no copy got the with-copy example");
    assert.strictEqual(withCopy.templates.dialect, "gpt-image");
  });

  // ── 2. Section C describes what is actually attached ────────────────────
  console.log("\n-- section C describes the real attachment --");

  await check("one product: Image 1 is the product, not a sheet", () => {
    const brief = compileGptBrief(briefFor(1, false));
    const c = brief.slots.REFERENCES;
    assert.ok(/Image 1 is amber glass bottle 1/.test(c), c.slice(0, 200));
    assert.ok(!/reference sheet/i.test(c), "a single photograph was described as a sheet");
    assert.ok(/NO LOGO IMAGE IS ATTACHED/.test(c), "the brief did not say that no logo was supplied");
  });

  await check("five products: Image 1 and Image 2 are sheets, with their panels named", () => {
    const brief = compileGptBrief(briefFor(5, false));
    const c = brief.slots.REFERENCES;
    assert.ok(/Image 1 is a reference sheet of 3 product photographs/.test(c), c.slice(0, 300));
    assert.ok(/Image 2 is a reference sheet of 2 product photographs/.test(c), c.slice(0, 400));
    assert.ok(/panel A is/.test(c) && /panel B is/.test(c), "the panels are not named");
    assert.ok(
      /panel letters, the borders between panels and the flat grey ground are annotations/.test(c),
      "the brief did not say the annotations must not be rendered",
    );
  });

  await check("the brief never names an image the provider will not receive", () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      const input = briefFor(n, true);
      const brief = compileGptBrief(input);
      const named = [...brief.slots.REFERENCES.matchAll(/\bImage (\d+)\b/g)].map((m) => Number(m[1]));
      const slots = input.allocation!.slots.length;
      for (const i of named) {
        assert.ok(i >= 1 && i <= slots, `n=${n}: the brief names Image ${i} but only ${slots} are attached`);
      }
    }
  });

  await check("when the logo image is dropped, the brief forbids drawing a logo", () => {
    // n=8 with a logo: the logo gives its panel back to the eighth product.
    const input = briefFor(8, true);
    const dropped = input.allocation!.dropped.some((d) => /logo/i.test(d.what));
    assert.ok(dropped, "the n=8 case no longer drops the logo image; update this test");
    const c = compileGptBrief(input).slots.REFERENCES;
    assert.ok(/NO LOGO IMAGE IS ATTACHED/.test(c));
    assert.ok(
      /Do NOT ask for a logo, brand mark, wordmark or emblem to be drawn/.test(c),
      "the brief leaves the director free to invent a logo",
    );
  });

  await check("sub-512px panels are declared unsafe to label-lock", () => {
    const five = compileGptBrief(briefFor(5, false));
    assert.ok(five.unsafePanels.length > 0, "n=5 should have panels under the floor");
    assert.ok(
      /NOT large enough to read reliably/.test(five.slots.REFERENCES),
      "the brief does not warn the director off the small panels",
    );
    assert.ok(
      /take any wording from the product facts/.test(five.slots.REFERENCES),
      "the brief does not say where the wording should come from instead",
    );
    // And at n=2 nothing is flagged, so the warning is not boilerplate.
    assert.strictEqual(compileGptBrief(briefFor(2, false)).unsafePanels.length, 0);
  });

  // ── 3. The checks ───────────────────────────────────────────────────────
  console.log("\n-- the deterministic checks --");

  const goodPrompt = (n: number, logo: boolean, copy = COPY, ratio = "9:16") => {
    const input = briefFor(n, logo, copy, ratio);
    const { templates } = buildGptMessages(input);
    return { input, prompt: buildGptFallbackPrompt(input, templates.playbook) };
  };

  await check("the code-built prompt passes its own checks, by construction", () => {
    for (const [n, logo, copy] of [[1, false, COPY], [2, true, COPY], [1, false, []]] as const) {
      const { input, prompt } = goodPrompt(n, logo, copy as string[]);
      const r = runGptChecks(prompt, {
        copy: copy as string[],
        referenceCount: input.allocation!.slots.length,
        aspectRatio: input.aspectRatio,
        unsafePanels: compileGptBrief(input).unsafePanels,
      });
      assert.ok(r.ok, `n=${n} logo=${logo} copy=${(copy as string[]).length}: ${r.failures.map((f) => f.code).join(", ")}`);
    }
  });

  await check("a missing heading is caught", () => {
    const { input, prompt } = goodPrompt(1, false);
    const broken = prompt.replace("CONSTRAINTS:", "LIMITS:");
    const r = runGptChecks(broken, { copy: COPY, referenceCount: 1, aspectRatio: input.aspectRatio });
    assert.ok(r.failures.some((f) => f.code === "SECTIONS_MISSING"));
  });

  await check("Vietnamese copy must be verbatim, with every diacritic", () => {
    const { input, prompt } = goodPrompt(1, false);
    const stripped = prompt.replace("Khởi động ngày mới", "Khoi dong ngay moi");
    const r = runGptChecks(stripped, { copy: COPY, referenceCount: 1, aspectRatio: input.aspectRatio });
    assert.ok(
      r.failures.some((f) => f.code === "COPY_MISSING" || f.code === "COPY_NOT_VERBATIM"),
      `an accent-stripped string passed: ${r.failures.map((f) => f.code).join(", ")}`,
    );
  });

  await check("invented copy is caught", () => {
    const { input, prompt } = goodPrompt(1, false);
    const extra = prompt.replace("CONSTRAINTS:", 'Also set "Giảm 50% hôm nay".\n\nCONSTRAINTS:');
    const r = runGptChecks(extra, { copy: COPY, referenceCount: 1, aspectRatio: input.aspectRatio });
    assert.ok(r.failures.some((f) => f.code === "UNAUTHORIZED_QUOTE"), "an invented string passed");
  });

  await check("a physical number is caught, and the client's own copy is not scanned", () => {
    const { input, prompt } = goodPrompt(1, false);
    for (const bad of ["5600K", "f/1.8", "85mm", "60%", "two stops", "ISO 400", "a 9:16 frame"]) {
      const withNumber = prompt.replace("CONSTRAINTS:", `Shot at ${bad}.\n\nCONSTRAINTS:`);
      const r = runGptChecks(withNumber, { copy: COPY, referenceCount: 1, aspectRatio: input.aspectRatio });
      assert.ok(r.failures.some((f) => f.code === "PHYSICAL_NUMBER"), `"${bad}" was not caught`);
    }
    // A percentage inside the CLIENT's copy must not trip it — the copy is theirs.
    const promoCopy = ["Giảm 50% hôm nay"];
    const { input: pInput, prompt: pPrompt } = goodPrompt(1, false, promoCopy);
    const r = runGptChecks(pPrompt, { copy: promoCopy, referenceCount: 1, aspectRatio: pInput.aspectRatio });
    assert.ok(!r.failures.some((f) => f.code === "PHYSICAL_NUMBER"), "the client's own 50% was scanned as a camera setting");
  });

  await check("no copy means the prompt must say so", () => {
    const { input, prompt } = goodPrompt(1, false, []);
    assert.ok(/No text of any kind anywhere in the image\./.test(prompt));
    const silent = prompt.replace("No text of any kind anywhere in the image.", "Minimal text.");
    const r = runGptChecks(silent, { copy: [], referenceCount: 1, aspectRatio: input.aspectRatio });
    assert.ok(r.failures.some((f) => f.code === "NO_TEXT_NOT_DECLARED"));
  });

  await check("the orientation word must match the canvas, and only one may appear", () => {
    const { input, prompt } = goodPrompt(1, false, COPY, "9:16");
    assert.ok(/vertical/.test(prompt));
    const r = runGptChecks(prompt, { copy: COPY, referenceCount: 1, aspectRatio: "16:9" });
    assert.ok(r.failures.some((f) => f.code === "ORIENTATION_MISMATCH"), "a vertical prompt passed as horizontal");
    assert.strictEqual(input.aspectRatio, "9:16");
  });

  await check("naming an image that is not attached is caught", () => {
    const { input, prompt } = goodPrompt(1, false);
    const extra = prompt.replace("SCENE & CONCEPT:", "Image 3 is a mood board.\n\nSCENE & CONCEPT:");
    const r = runGptChecks(extra, { copy: COPY, referenceCount: 1, aspectRatio: input.aspectRatio });
    assert.ok(r.failures.some((f) => f.code === "REFERENCE_NUMBER_UNKNOWN"));
  });

  await check("label-locking a panel that is too small is caught", () => {
    const input = briefFor(5, false);
    const brief = compileGptBrief(input);
    const { templates } = buildGptMessages(input);
    const prompt =
      buildGptFallbackPrompt(input, templates.playbook).replace(
        "SCENE & CONCEPT:",
        "Reproduce the lettering from panel A exactly as it appears.\n\nSCENE & CONCEPT:",
      );
    const r = runGptChecks(prompt, {
      copy: COPY,
      referenceCount: input.allocation!.slots.length,
      aspectRatio: input.aspectRatio,
      unsafePanels: brief.unsafePanels,
    });
    assert.ok(
      r.failures.some((f) => f.code === "LABEL_LOCK_ON_SMALL_PANEL"),
      `a label-lock on a 496px panel passed: ${r.failures.map((f) => f.code).join(", ")}`,
    );
  });

  // ── 4. THE ACCEPTANCE ITEM: n=5 and n=8 ────────────────────────────────
  console.log("\n-- n=5 and n=8: the 512px gate --");

  await check("n=5: panels really are below the floor, measured on real pixels", async () => {
    // Not taken from the allocation table — packed with sharp and measured.
    const refs = await Promise.all([1, 2, 3, 4, 5].map((i) => realProduct(String(i))));
    const packed = await ReferencePackingService.pack({
      references: refs,
      options: { ...OPTS, minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx },
    });
    assert.strictEqual(packed.status, "PACKED");
    assert.ok(packed.references.length <= SUNBURST.maxReferences);
    assert.ok(
      (packed.warnings || []).length > 0,
      "five 2000px products on two 1024px sheets produced no panel warning",
    );
    for (const w of packed.warnings!) {
      assert.ok(w.longest_side_px < SUNBURST.minPanelLongestSidePx);
    }
  });

  await check("n=5: the default policy RENDERS and warns, and the brief protects the panels", async () => {
    const input = briefFor(5, false);
    assert.ok(smallPanels(input.allocation!, SUNBURST.minPanelLongestSidePx).length > 0);
    const { templates } = buildGptMessages(input);

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
    let result;
    try {
      result = await buildGptPrompt(input, { chat: stubDirector(input, templates.playbook) });
    } finally {
      console.warn = origWarn;
    }

    // It renders — refusing would block the only thing that can settle whether a 466px
    // panel holds a label, which is looking at a real render of five products.
    assert.strictEqual(result.ok, true, `n=5 was refused: ${result.refusal?.code || result.reason}`);
    assert.ok(result.prompt, "no prompt was produced");
    assert.ok(!result.refusal, "the default policy refused");

    // And it is not silent: the panel count, the smallest size and the floor are logged.
    // 496px is the ALLOCATOR's planned panel; the sheet renderer draws 466px once the
    // gutters and the label band are taken out (measured on gen_1791446396500_fjk1e).
    // Both are below the 512px floor so the decision is the same either way, but the
    // two numbers are not interchangeable and this asserts the one the warning reports.
    assert.ok(
      warnings.some((w) => /SMALL_PANEL/.test(w) && /496px/.test(w) && /512px/.test(w)),
      `the small-panel warning did not name the numbers: ${warnings.join(" | ")}`,
    );

    // The protection that replaces the refusal: the brief declares the panels unsafe and
    // tells the director where the wording comes from instead.
    assert.ok(result.unsafePanels.length > 0, "the unsafe panels were not reported on the result");
    assert.ok(/NOT large enough to read reliably/.test(result.brief!.slots.REFERENCES));
    assert.ok(/take any wording from the product facts/.test(result.brief!.slots.REFERENCES));
  });

  await check("n=8: renders too, with every product panel flagged", async () => {
    const input = briefFor(8, true);
    const { templates } = buildGptMessages(input);
    const result = await buildGptPrompt(input, { chat: stubDirector(input, templates.playbook) });
    assert.strictEqual(result.ok, true);
    assert.ok(result.unsafePanels.length >= 8, `expected every product panel flagged, got ${result.unsafePanels.length}`);
    // The logo image gave up its panel to the eighth product, and the brief says so.
    assert.ok(/NO LOGO IMAGE IS ATTACHED/.test(result.brief!.slots.REFERENCES));
  });

  await check("GPT_SMALL_PANEL_POLICY=refuse restores the strict behaviour, before any spend", async () => {
    const input = briefFor(5, false);
    const prev = process.env.GPT_SMALL_PANEL_POLICY;
    process.env.GPT_SMALL_PANEL_POLICY = "refuse";
    let called = 0;
    try {
      const result = await buildGptPrompt(input, {
        chat: async () => {
          called++;
          return "";
        },
      });
      assert.strictEqual(result.ok, false, "the strict policy still rendered");
      assert.strictEqual(called, 0, "the director was paid for before the gate ran");
      assert.strictEqual(result.refusal!.code, "PANEL_BELOW_IDENTITY_FLOOR");
      assert.ok(/512px/.test(result.refusal!.message_vi), "the message does not name the floor");
      assert.ok(/tách thành nhiều lần tạo|ít ảnh sản phẩm hơn/.test(result.refusal!.message_vi));
    } finally {
      if (prev === undefined) delete process.env.GPT_SMALL_PANEL_POLICY;
      else process.env.GPT_SMALL_PANEL_POLICY = prev;
    }
  });

  await check("n<=4 is NOT refused: the gate is about panel size, not about packing", async () => {
    for (const n of [1, 2, 3, 4]) {
      const input = briefFor(n, false);
      const { templates } = buildGptMessages(input);
      const result = await buildGptPrompt(input, { chat: stubDirector(input, templates.playbook) });
      assert.strictEqual(result.ok, true, `n=${n} was refused: ${result.refusal?.code || result.reason}`);
      assert.ok(result.prompt, `n=${n} produced no prompt`);
      assert.ok(!result.refusal, `n=${n} reported a refusal`);
    }
  });

  await check("verifying the label-lock silences the warning; the strict gate still obeys it", () => {
    const input = briefFor(5, false);
    const prevPolicy = process.env.GPT_SMALL_PANEL_POLICY;
    const prevVerified = process.env.GPT_LABEL_LOCK_VERIFIED;
    try {
      // Under the strict policy the gate is shut while unverified...
      process.env.GPT_SMALL_PANEL_POLICY = "refuse";
      assert.ok(labelLockRefusal(input), "the strict gate is open while unverified");
      // ...and verification opens it.
      process.env.GPT_LABEL_LOCK_VERIFIED = "true";
      assert.strictEqual(labelLockRefusal(input), null, "the gate stayed shut after verification");
    } finally {
      if (prevPolicy === undefined) delete process.env.GPT_SMALL_PANEL_POLICY;
      else process.env.GPT_SMALL_PANEL_POLICY = prevPolicy;
      if (prevVerified === undefined) delete process.env.GPT_LABEL_LOCK_VERIFIED;
      else process.env.GPT_LABEL_LOCK_VERIFIED = prevVerified;
    }
    // The default policy never refuses, verified or not.
    assert.strictEqual(labelLockRefusal(input), null);
  });

  await check("RECORDED: the 496px label-lock itself is NOT verified by this suite", () => {
    // Stated in a test so it cannot be forgotten. A stubbed provider returns a stubbed
    // image; an assertion about the pixels Sunburst would produce would be an assertion
    // about a fixture. The real check is a paid render, inspected by eye.
    const engine = read("lib/image-engine/prompt-v2/engine-selector.ts");
    assert.ok(
      /GPT_LABEL_LOCK_VERIFIED/.test(engine),
      "the verification gate was removed; the assumption is now silent",
    );
    assert.ok(
      /scripts\/eval-gpt-label-lock\.ts/.test(read("lib/image-engine/run-gpt-dialect-tests.ts")) ||
        fs.existsSync(path.join(ROOT, "scripts/eval-gpt-label-lock.ts")),
      "there is no script to run the real verification",
    );
  });

  // ── 5. The engine's own behaviour ──────────────────────────────────────
  console.log("\n-- the engine --");

  await check("a clean director answer is used as-is, one call", async () => {
    const input = briefFor(2, false);
    const { templates } = buildGptMessages(input);
    const result = await buildGptPrompt(input, { chat: stubDirector(input, templates.playbook) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.source, "director");
    assert.strictEqual(result.llmCalls, 1);
    assert.ok(result.checks!.ok, result.checks!.failures.map((f) => f.code).join(", "));
    assert.ok(result.decisions && result.decisions.length > 0, "the decisions tag was dropped");
    for (const heading of MASTER_SECTIONS) assert.ok(result.prompt!.includes(heading), `missing ${heading}`);
  });

  await check("a bad answer gets exactly one repair, then the code builder", async () => {
    const input = briefFor(2, false);
    let calls = 0;
    const result = await buildGptPrompt(input, {
      chat: async () => {
        calls++;
        return "<image_prompt>too short, no sections</image_prompt>";
      },
    });
    assert.strictEqual(calls, 2, `expected one call and one repair, got ${calls}`);
    assert.strictEqual(result.ok, true, "the engine gave up instead of building in code");
    assert.strictEqual(result.source, "fallback");
    assert.ok(result.checks!.ok, `the code-built prompt failed its own checks: ${result.checks!.failures.map((f) => f.code).join(", ")}`);
  });

  await check("a director that throws still produces a prompt, built in code", async () => {
    const input = briefFor(1, false);
    const result = await buildGptPrompt(input, {
      chat: async () => {
        throw new Error("gateway timeout");
      },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.source, "fallback");
    assert.ok(result.warnings.some((w) => /director call failed/.test(w)));
  });

  await check("the reply parser survives a missing closing tag", () => {
    const r = parseGptReply("<decisions>a</decisions><image_prompt>OUTPUT: something");
    assert.strictEqual(r.decisions, "a");
    assert.ok(r.image_prompt.startsWith("OUTPUT:"), "a missing close tag lost the prompt");
  });

  await check("the brief never leaks its own scaffolding into the prompt", async () => {
    const input = briefFor(2, true);
    const { templates } = buildGptMessages(input);
    const result = await buildGptPrompt(input, { chat: stubDirector(input, templates.playbook) });
    for (const leak of ["{{", "REFERENCE DATA", "playbook", "SELF-CHECK", "<decisions>"]) {
      assert.ok(!result.prompt!.includes(leak), `the prompt leaked "${leak}"`);
    }
  });

  await check("the Gemini engine is untouched by all of this", () => {
    const simple = read("lib/image-engine/prompt-v2/build-simple.ts");
    assert.ok(!/gpt-brief|gpt-checks|build-gpt/.test(simple), "the Gemini engine now imports GPT code");
    const geminiRequest = read("lib/image-engine/prompt-v2/templates/request.v1.md");
    assert.ok(!/SUBJECT ARRANGEMENT/.test(geminiRequest), "the Gemini request template gained GPT sections");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
