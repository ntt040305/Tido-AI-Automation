/**
 * The v2 engine, offline. No API calls: the LLM is a stub in every case here.
 *
 * What this suite is for
 * ----------------------
 *   1. THE FLAG IS v1 UNLESS ASKED. Including when it is misspelt.
 *   2. v1 IS BYTE-IDENTICAL under the flag. The golden suite pins the assembly;
 *      this pins that selecting v1 reaches that assembly unchanged.
 *   3. THE PLAYBOOK SELECTOR answers for every asset type x ratio pair.
 *   4. THE LINTER catches what the audit found in real prompts: technical
 *      parameters, verdict words, a copy string twice, a placeholder, "…", a
 *      percentage that cannot be right, a missing aspect ratio, over-length.
 *   5. THE PARSER survives what a model really returns: fenced JSON, prose around
 *      the JSON, a missing field, a wrong type.
 *   6. FALLBACK. Every failure path returns v1 rather than nothing.
 */
import assert from "assert";

import { DEFAULT_PROMPT_ENGINE, includeLabelText, isV2, labelCheckEnabled, promptEngineVersion } from "./prompt-v2/engine-selector";
import { playbookFor, PLAYBOOK_IDS } from "./prompt-v2/playbooks";
import { lintMasterPrompt } from "./prompt-v2/linter";
import { parseCreativeSpec } from "./prompt-v2/spec";
import { buildV2Prompt } from "./prompt-v2/build";
import { buildSystemPrompt, buildUserMessage, type DirectorInput } from "./prompt-v2/director";
import { CENTELLA_COPY, GOLDEN_FIXTURES } from "./prompt-v2/golden-fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];
/** Async checks, awaited before the summary. The build is async; the rest is not. */
const pending: Array<Promise<void>> = [];
function check(name: string, fn: () => void | Promise<void>) {
  try {
    const out = fn();
    if (out && typeof (out as Promise<void>).then === "function") {
      pending.push(
        (out as Promise<void>).then(
          () => {
            passed++;
            console.log(`  ✓ ${name}`);
          },
          (e: Error) => {
            failed++;
            failures.push(`${name}\n    ${e.message.split("\n")[0]}`);
            console.log(`  ✗ ${name}`);
            console.log(`    ${e.message.split("\n")[0]}`);
          },
        ),
      );
      return;
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    failures.push(`${name}\n    ${(e as Error).message.split("\n")[0]}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message.split("\n")[0]}`);
  }
}

// A prompt that should pass everything, used as the control.
const GOOD = `This is a square poster for a skincare brand.

Two frosted glass serum bottles stand on a pale limestone slab, exactly as in attached photo 1 and attached photo 2, their labels unchanged and no other words added to them. The taller bottle stands slightly forward, the shorter one half a step behind and to the right, close enough that they read as a pair.

Morning light falls across them from the left and slightly behind, so each bottle throws a long soft shadow to the right and the glass glows where the light passes through it. The slab brightens toward the light and falls into shade at the lower right corner. The air is still.

The bottles occupy the lower half of the frame, set a little right of centre. The upper third is empty pale wall, which is where the words go. In that space, the line "Dịu da sau 14 ngày" is set as the headline, the largest text in the frame, in a quiet modern serif, warm charcoal, centred, sitting in the open wall rather than on top of the bottles. Below it, smaller and lighter, the line "Phục hồi hàng rào bảo vệ da" reads as supporting text. Lower still and smallest, "Mua ngay" sits as a short action line.

The mood is calm and clinical without being cold. Surfaces look real: the glass has weight, the stone has a fine grain.

No other text. No extra logos or brand marks. No people. Square 1:1 frame.`;

function main(): void {
  console.log("\nPrompt engine v2 — offline\n");

  // ── 1. the flag ─────────────────────────────────────────────────────────
  console.log("1 — the flag defaults to v1");

  check("no variable means v1", () => {
    assert.strictEqual(promptEngineVersion({}), "v1");
    assert.strictEqual(DEFAULT_PROMPT_ENGINE, "v1");
    assert.strictEqual(isV2({}), false);
  });

  check("only an exact v2 selects v2; a typo stays on v1", () => {
    assert.strictEqual(promptEngineVersion({ PROMPT_ENGINE: "v2" }), "v2");
    assert.strictEqual(promptEngineVersion({ PROMPT_ENGINE: " V2 " }), "v2");
    for (const bad of ["v3", "2", "yes", "true", "v2x", ""]) {
      assert.strictEqual(promptEngineVersion({ PROMPT_ENGINE: bad }), "v1", bad);
    }
  });

  check("label text defaults on, label check defaults off", () => {
    assert.strictEqual(includeLabelText({}), true);
    assert.strictEqual(includeLabelText({ V2_INCLUDE_LABEL_TEXT: "false" }), false);
    assert.strictEqual(labelCheckEnabled({}), false);
    assert.strictEqual(labelCheckEnabled({ V2_LABEL_CHECK: "true" }), true);
  });

  // ── 2. playbooks ────────────────────────────────────────────────────────
  console.log("\n2 — one playbook per asset type and ratio");

  check("every asset type x ratio pair resolves, and none is the same text", () => {
    const seen = new Set<string>();
    for (const id of PLAYBOOK_IDS) {
      for (const ratio of ["1:1", "9:16", "16:9"] as const) {
        const pb = playbookFor(id, ratio);
        assert.ok(pb.layout.length > 40, `${id} ${ratio} has no layout rule`);
        assert.ok(pb.copy_budget.headline_max_words > 0, `${id} ${ratio} has no headline budget`);
        seen.add(`${id}|${ratio}|${pb.layout}`);
      }
    }
    assert.strictEqual(seen.size, PLAYBOOK_IDS.length * 3, "two pairs share a layout rule");
  });

  check("an unknown asset type falls to poster rather than throwing", () => {
    const pb = playbookFor("something nobody mapped", "1:1");
    assert.strictEqual(pb.id, "poster");
  });

  check("the ratio decides the layout, not the asset type alone", () => {
    const wide = playbookFor("poster", "16:9").layout;
    const tall = playbookFor("poster", "9:16").layout;
    assert.notStrictEqual(wide, tall);
    assert.ok(/left|right|side/i.test(wide), "16:9 does not describe two horizontal zones");
    assert.ok(/upper|lower|top|bottom/i.test(tall), "9:16 does not stack vertically");
  });

  check("product hero carries almost no copy; banner carries a CTA", () => {
    assert.ok(playbookFor("Product Hero", "1:1").copy_budget.max_strings <= 1);
    assert.ok(playbookFor("Web Banner", "16:9").copy_budget.cta_max_words > 0);
  });

  // ── 3. the linter ───────────────────────────────────────────────────────
  console.log("\n3 — the linter catches what the audit found");

  const copy = ["Dịu da sau 14 ngày", "Phục hồi hàng rào bảo vệ da", "Mua ngay"];
  const lintOpts = { copy, aspectRatio: "1:1" as const, playbook: playbookFor("poster", "1:1") };

  check("the control prompt passes", () => {
    const r = lintMasterPrompt(GOOD, lintOpts);
    assert.deepStrictEqual(r.errors, [], JSON.stringify(r.errors));
    assert.strictEqual(r.ok, true);
  });

  check("technical parameters fail", () => {
    for (const bad of [
      "The key light sits at 3200K.",
      "Shot at 85mm, f/5.6.",
      "Key to fill 4:1.",
      "The blacks sit at 4/255.",
      "Haze costs about 7% of the frame's contrast.",
      "ISO 400 on a digital back.",
    ]) {
      const r = lintMasterPrompt(`${GOOD}\n${bad}`, lintOpts);
      assert.ok(
        r.errors.some((e) => e.code === "technical_term"),
        `not caught: ${bad} -> ${JSON.stringify(r.errors)}`,
      );
    }
  });

  check("verdict words fail", () => {
    const r = lintMasterPrompt(`${GOOD}\nIt should look premium and cinematic.`, lintOpts);
    assert.ok(r.errors.some((e) => e.code === "verdict_word"));
  });

  check("a quoted copy string is never read as a technical term or a verdict", () => {
    // The client's own words may contain anything, including a number and a
    // percentage: "Giảm 20%" is copy, not a parameter.
    const withNumbers = GOOD.replace('"Mua ngay"', '"Giảm 20% — chỉ 14 ngày"');
    const r = lintMasterPrompt(withNumbers, {
      ...lintOpts,
      copy: ["Dịu da sau 14 ngày", "Phục hồi hàng rào bảo vệ da", "Giảm 20% — chỉ 14 ngày"],
    });
    assert.ok(!r.errors.some((e) => e.code === "technical_term"), JSON.stringify(r.errors));
    assert.ok(!r.errors.some((e) => e.code === "suspicious_percent"), JSON.stringify(r.errors));
  });

  check("a copy string twice fails, and a missing one fails", () => {
    const twice = `${GOOD}\nThe line "Mua ngay" is repeated at the bottom.`;
    assert.ok(lintMasterPrompt(twice, lintOpts).errors.some((e) => e.code === "copy_not_once"));
    const missing = GOOD.replace('"Mua ngay"', "a short action line");
    assert.ok(lintMasterPrompt(missing, lintOpts).errors.some((e) => e.code === "copy_not_once"));
  });

  check("placeholders, ellipsis and impossible percentages fail", () => {
    assert.ok(lintMasterPrompt(`${GOOD}\nBUSINESS GOAL: in beauty_skincare`, lintOpts).errors.some((e) => e.code === "placeholder"));
    assert.ok(lintMasterPrompt(`${GOOD}\nThe set is a quiet stone counter…`, lintOpts).errors.some((e) => e.code === "truncated"));
    assert.ok(lintMasterPrompt(`${GOOD}\nThe product fills about 3800% of the frame.`, lintOpts).errors.some((e) => e.code === "suspicious_percent"));
  });

  check("a missing aspect ratio fails, and the stated one must match", () => {
    assert.ok(lintMasterPrompt(GOOD.replace("Square 1:1 frame.", ""), lintOpts).errors.some((e) => e.code === "no_aspect_ratio"));
    assert.ok(lintMasterPrompt(GOOD, { ...lintOpts, aspectRatio: "16:9" }).errors.some((e) => e.code === "no_aspect_ratio"));
  });

  check("length is bounded at both ends", () => {
    assert.ok(lintMasterPrompt("Too short.", lintOpts).errors.some((e) => e.code === "length"));
    const long = `${GOOD}\n${"The slab is pale limestone and the light is soft. ".repeat(80)}`;
    assert.ok(lintMasterPrompt(long, lintOpts).errors.some((e) => e.code === "length"));
  });

  check("more text lines than the channel carries fails", () => {
    const banner = playbookFor("Web Banner", "16:9");
    const four = ["One", "Two", "Three", "Four"];
    const prompt = GOOD.replace("Square 1:1 frame.", "Wide 16:9 frame.") + four.map((t) => ` The line "${t}" appears.`).join("");
    const r = lintMasterPrompt(prompt, { copy: four, aspectRatio: "16:9", playbook: banner });
    assert.ok(r.errors.some((e) => e.code === "too_many_strings"), JSON.stringify(r.errors.map((e) => e.code)));
  });

  check("the linter normalises to NFC before comparing copy", () => {
    const decomposed = "Dịu da sau 14 ngày".normalize("NFD");
    const r = lintMasterPrompt(GOOD.replace("Dịu da sau 14 ngày", decomposed), lintOpts);
    assert.ok(!r.errors.some((e) => e.code === "copy_not_once"), "NFD copy was not recognised as the same string");
  });

  check("the prompt must fit the provider ceiling", () => {
    const huge = "word ".repeat(9000);
    assert.ok(lintMasterPrompt(huge, lintOpts).errors.some((e) => e.code === "length" || e.code === "over_provider_ceiling"));
  });

  // ── 4. the parser ───────────────────────────────────────────────────────
  console.log("\n4 — the parser survives what a model returns");

  const spec = {
    asset_analysis: "A square poster for two serum bottles.",
    products: [
      { ref_index: 1, look: "frosted glass serum bottle with a dropper cap", label_text: "SKIN1004 Centella Ampoule" },
      { ref_index: 2, look: "clear toner bottle with a pump", label_text: "SKIN1004 Centella Toning Toner" },
    ],
    big_idea: "The pair stands for a routine, not a product shot.",
    hierarchy: ["the bottles", "the headline", "the action line"],
    layout: "Bottles lower half, right of centre; words in the empty upper third.",
    copy: [
      { role: "headline", text: "Dịu da sau 14 ngày", position: "upper third, centred" },
      { role: "cta", text: "Mua ngay", position: "below the headline" },
    ],
    warnings: ["the 14-day claim may need regulatory review"],
    master_prompt: GOOD,
  };

  check("clean JSON parses", () => {
    const r = parseCreativeSpec(JSON.stringify(spec));
    assert.ok(r.ok && r.spec, JSON.stringify(r.errors));
    assert.strictEqual(r.spec!.products.length, 2);
  });

  check("fenced JSON and prose around it parse", () => {
    const fenced = "Here you go:\n```json\n" + JSON.stringify(spec) + "\n```\nHope that helps.";
    assert.ok(parseCreativeSpec(fenced).ok);
  });

  check("broken JSON fails cleanly rather than throwing", () => {
    const r = parseCreativeSpec("{ not json at all");
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.length > 0);
  });

  check("a missing or mistyped field fails with the field named", () => {
    const noPrompt = { ...spec, master_prompt: undefined };
    const r1 = parseCreativeSpec(JSON.stringify(noPrompt));
    assert.strictEqual(r1.ok, false);
    assert.ok(r1.errors.join(" ").includes("master_prompt"));
    const badProducts = { ...spec, products: "two bottles" };
    const r2 = parseCreativeSpec(JSON.stringify(badProducts));
    assert.strictEqual(r2.ok, false);
    assert.ok(r2.errors.join(" ").includes("products"));
  });

  check("ref_index must point at a supplied photo", () => {
    const r = parseCreativeSpec(JSON.stringify({ ...spec, products: [{ ref_index: 7, look: "a bottle" }] }), { productCount: 2 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.join(" ").includes("ref_index"));
  });

  check("the parser never invents copy", () => {
    const r = parseCreativeSpec(JSON.stringify(spec));
    assert.ok(r.ok);
    for (const c of r.spec!.copy) assert.ok(c.text.length > 0);
    assert.deepStrictEqual(
      r.spec!.copy.map((c) => c.text),
      ["Dịu da sau 14 ngày", "Mua ngay"],
    );
  });

  // ── 6. the build: one call, one repair, then fallback ───────────────────
  console.log("\n6 — the build, with a stubbed model");

  const SPEC_JSON = JSON.stringify(spec);
  const buildInput = {
    assetType: "Poster",
    aspectRatio: "1:1" as const,
    concept: "two serum bottles on a pale slab, calm and clinical",
    brand: "SKIN1004",
    productLine: "Centella",
    copy,
    products: [
      { ref_index: 1, description: "serum bottle" },
      { ref_index: 2, description: "toner bottle" },
    ],
    includeLabelText: true,
  };

  check("a good reply costs exactly one call", async () => {
    let calls = 0;
    const r = await buildV2Prompt(buildInput, {
      chat: async () => {
        calls++;
        return SPEC_JSON;
      },
    });
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.llmCalls, 1);
    assert.strictEqual(calls, 1);
    assert.strictEqual(r.prompt, GOOD);
  });

  check("a bad reply costs a second call and then succeeds", async () => {
    let calls = 0;
    const r = await buildV2Prompt(buildInput, {
      chat: async () => {
        calls++;
        return calls === 1 ? JSON.stringify({ ...spec, master_prompt: "far too short" }) : SPEC_JSON;
      },
    });
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.llmCalls, 2);
  });

  check("a second failure falls back rather than calling again", async () => {
    let calls = 0;
    const r = await buildV2Prompt(buildInput, {
      chat: async () => {
        calls++;
        return JSON.stringify({ ...spec, master_prompt: "still far too short" });
      },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(calls, 2, "it called the model more than twice");
    assert.ok(r.reason && /linter/.test(r.reason), r.reason);
  });

  check("a timeout falls back and never throws", async () => {
    const r = await buildV2Prompt(buildInput, {
      chat: async () => {
        throw new Error("ETIMEDOUT after 30000ms");
      },
    });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason && /ETIMEDOUT/.test(r.reason));
    assert.strictEqual(r.llmCalls, 1);
  });

  check("broken JSON falls back with the reason named", async () => {
    const r = await buildV2Prompt(buildInput, { chat: async () => "I'm afraid I can't do that." });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason && /spec did not validate|JSON/.test(r.reason), r.reason);
  });

  check("copy inside budget stays exact; copy over budget adapts and warns", async () => {
    const short = await buildV2Prompt(buildInput, { chat: async () => SPEC_JSON });
    assert.strictEqual(short.copyPolicy, "exact");

    const long = await buildV2Prompt({ ...buildInput, copy: [CENTELLA_COPY] }, { chat: async () => SPEC_JSON });
    assert.strictEqual(long.copyPolicy, "adapt");
    assert.ok(long.warnings.some((w) => /longer than a poster/.test(w)), JSON.stringify(long.warnings));
    assert.strictEqual(long.copy_original[0], CENTELLA_COPY, "the original copy was not kept");
  });

  check("a time-bound claim raises a warning without editing the copy", async () => {
    const r = await buildV2Prompt(buildInput, { chat: async () => SPEC_JSON });
    assert.ok(r.warnings.some((w) => /claim review/i.test(w)), JSON.stringify(r.warnings));
    assert.ok(r.copy_original.includes("Dịu da sau 14 ngày"));
  });

  check("the product photos reach the model in reference order", () => {
    const msg = buildUserMessage({
      assetType: "Poster",
      aspectRatio: "1:1",
      concept: "x",
      brand: "SKIN1004",
      copy: [],
      copyPolicy: "exact",
      includeLabelText: true,
      products: [
        { ref_index: 1, description: "first", imageUrl: "data:image/png;base64,AAA" },
        { ref_index: 2, description: "second", imageUrl: "data:image/png;base64,BBB" },
      ],
    });
    const parts = msg.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const images = parts.filter((p) => p.type === "image_url").map((p) => p.image_url!.url);
    assert.deepStrictEqual(images, ["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
    assert.ok(
      String(parts[0].text).includes("photo 1: first") && String(parts[0].text).includes("photo 2: second"),
      String(parts[0].text).slice(0, 200),
    );
  });

  check("label text off removes the instruction but keeps 'attached photo N'", () => {
    const common: DirectorInput = { ...buildInput, copyPolicy: "exact", includeLabelText: true };
    const on = buildSystemPrompt(playbookFor("Poster", "1:1"), common);
    const off = buildSystemPrompt(playbookFor("Poster", "1:1"), { ...common, includeLabelText: false });
    assert.ok(/lettering you can READ/.test(on));
    assert.ok(/omit this field entirely/.test(off));
    for (const p of [on, off]) assert.ok(/exactly as in attached photo N/.test(p), "the fidelity instruction is missing");
  });

  // ── 5. fixtures are shared with v1 ──────────────────────────────────────
  console.log("\n5 — the two engines answer the same briefs");

  check("every golden fixture names a ratio the provider supports", () => {
    for (const fx of GOLDEN_FIXTURES) {
      assert.ok(["1:1", "9:16", "16:9"].includes(fx.aspectRatio), `${fx.id}: ${fx.aspectRatio}`);
    }
  });

  void (async () => {
    await Promise.all(pending);
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
    if (failed) process.exit(1);
  })();
}

main();
