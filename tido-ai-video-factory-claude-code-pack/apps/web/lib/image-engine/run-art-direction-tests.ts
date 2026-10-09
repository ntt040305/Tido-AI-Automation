/**
 * The Art Direction Sheet and the art-director brief. Offline, no model call, no cost.
 *
 * WHAT THIS SUITE IS FOR
 * ----------------------
 * `run-gpt-golden-tests` pins what the brief SAYS, byte for byte. That catches drift but
 * proves nothing about correctness: a golden is just as happy pinning a bug. This suite
 * asserts the contract — the properties that must hold for every brief, whatever the
 * golden happens to contain.
 *
 * THE FOUR IT EXISTS FOR
 * ----------------------
 *   1. **No digits in a master prompt.** The one rule the whole translation layer exists
 *      to serve. Two exemptions, both narrow and both justified below.
 *   2. **No industry-keyed creative constant.** Read as a STATIC test over the source
 *      text, because the design rule is about the shape of the code and not about any one
 *      output: a focal length keyed on `coffee_tea` would pass every behavioural test and
 *      still be the thing we promised not to build.
 *   3. **Exactly one print rule.** The live contradiction — "keep the branding as
 *      photographed" beside "draw no brand mark" — expressed as a count.
 *   4. **The sheet is a function.** Same input, same sheet, byte for byte. Without this
 *      nothing downstream can be A/B'd or reviewed.
 *
 * No network, no model call, no provider call, no cost.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import {
  GPT_BRIEF_FIXTURES,
  artDirectorBriefInputFor,
  briefInputFor,
  fixtureById,
  sheetFor,
  type GptBriefFixture,
} from "./prompt-v2/gpt-brief-fixtures";
import { buildGptMessages } from "./prompt-v2/build-gpt";
import { buildGptFallbackPrompt } from "./prompt-v2/gpt-fallback";
import { gptFallbackMaxChars, MASTER_SECTIONS } from "./prompt-v2/gpt-brief";
import { runGptChecks } from "./prompt-v2/gpt-checks";
import { PRINT_RULE_MARKERS, printRuleBranchesIn, printRuleFor } from "./prompt-v2/art-direction/print-rule";
import { conceptWithoutSpecs, extractConceptSpecs } from "./prompt-v2/art-direction/concept-specs";
import { PRECEDENCE_TIERS, resolvePrecedence } from "./prompt-v2/art-direction/precedence";
import { exclusionsFor, industryLabel, knownIndustryIds } from "./prompt-v2/art-direction/industry-label";
import { buildArtDirectionSheet } from "./prompt-v2/art-direction/art-direction-sheet";
import {
  ACCENT_LUMINANCE_DELTA_MIN,
  TEXT_CONTRAST_MIN,
  accentSeparates,
  colourWords,
  contrastRatio,
  numberWord,
  percentWords,
  readableNeutralFor,
  relativeLuminance,
} from "./prompt-v2/art-direction/words";
import { roundNumbers } from "./prompt-v2/art-direction/art-direction-sheet";

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
    const first = (e as Error).message.split("\n").slice(0, 2).join("\n    ");
    failures.push(`${name}\n    ${first}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${first}`);
  }
}

/** The code-built prompt for a fixture, with the sheet driving it. */
function promptFor(fx: GptBriefFixture): string {
  const input = artDirectorBriefInputFor(fx);
  const built = buildGptMessages(input, "v2");
  return buildGptFallbackPrompt(input, built.templates.playbook);
}

/**
 * The prompt with everything legitimately numeric removed, ready for a digit scan.
 *
 * TWO EXEMPTIONS, and both are narrow on purpose:
 *
 *   1. **"Image 1", "Image 2".** The dialect's reference protocol IS numbered — the
 *      checks refuse a prompt that fails to name every attached image by number — so
 *      banning these would ban the contract.
 *   2. **The client's own quoted and described words.** Copy is quoted and untouchable.
 *      A product DESCRIPTION is the same kind of thing one layer down: the client typed
 *      "30ml frosted glass serum bottle", and a system that silently rewrote that to
 *      "small frosted glass serum bottle" would be editing the brief. So descriptions
 *      pass through, and the exemption is spelled as the exact strings the client wrote
 *      rather than as a pattern, so it cannot quietly widen.
 */
function scannableText(fx: GptBriefFixture, prompt: string): string {
  let out = prompt.replace(/"[^"\n]*"/g, " ").replace(/\bImage\s+\d+\b/g, "Image N");
  for (const p of fx.products) out = out.split(p.description).join(" ");
  for (const fact of fx.productFacts || []) out = out.split(fact).join(" ");
  if (fx.styleRef) out = out.split(fx.styleRef.description).join(" ");
  // The concept is the client's prose and is quoted into the brief verbatim.
  if (fx.concept) out = out.split(fx.concept).join(" ");
  return out;
}

async function main() {
  console.log("\nArt Direction Sheet tests\n");

  // ── 1. The sheet is a function ─────────────────────────────────────────
  console.log("determinism");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`same input, same sheet — ${fx.id}`, () => {
      const a = JSON.stringify(sheetFor(fx));
      const b = JSON.stringify(sheetFor(fx));
      assert.strictEqual(a, b, "two builds of one fixture produced different sheets");
    });
  }
  check("same input, same prompt", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      assert.strictEqual(promptFor(fx), promptFor(fx), `${fx.id} is not deterministic`);
    }
  });

  // ── 2. No digits in the master prompt ──────────────────────────────────
  console.log("\nno numbers reach the prompt");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`zero digits — ${fx.id}`, () => {
      const scan = scannableText(fx, promptFor(fx));
      const hit = /\d/.exec(scan);
      if (hit) {
        assert.fail(
          `a digit reached the prompt at …${scan.slice(Math.max(0, hit.index - 60), hit.index + 40)}…`,
        );
      }
    });
  }
  check("no mm, f-number, Kelvin or ratio anywhere", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const scan = scannableText(fx, promptFor(fx));
      for (const pattern of [/\bmm\b/i, /\bf\s*\/\s*\d/i, /\bkelvin\b/i, /\bISO\b/, /\bstops?\b/i]) {
        assert.ok(!pattern.test(scan), `${fx.id}: ${pattern} matched`);
      }
    }
  });

  // ── 3. The deterministic checks pass on every code-built prompt ────────
  //
  // This is the load-bearing one. The GPT dialect has NO v1 to fall through to, so a
  // code-built prompt that fails its own checks is a render that fails outright.
  console.log("\nthe code-built prompt passes its own checks");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`checks pass — ${fx.id}`, () => {
      const input = artDirectorBriefInputFor(fx);
      const prompt = promptFor(fx);
      const result = runGptChecks(prompt, {
        copy: fx.copy,
        referenceCount: input.allocation?.slots.length ?? 0,
        aspectRatio: fx.aspectRatio,
        maxChars: gptFallbackMaxChars(input),
        unsafePanels: input.sheet ? [] : [],
        sheet: input.sheet,
        density: "words_only",
        printRuleBranch: input.printRule?.branch,
      });
      assert.ok(
        result.ok,
        `${result.failures.length} failure(s): ${result.failures.map((f) => `${f.code}: ${f.message}`).join(" | ")}`,
      );
    });
  }

  // ── 4. The nine headings, in order ─────────────────────────────────────
  console.log("\nstructure");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`headings in order — ${fx.id}`, () => {
      const prompt = promptFor(fx);
      let last = -1;
      for (const heading of MASTER_SECTIONS) {
        const at = prompt.indexOf(heading);
        assert.ok(at >= 0, `${heading} missing`);
        assert.ok(at > last, `${heading} is out of order`);
        last = at;
      }
    });
  }

  // ── 5. Nothing unresolved, nothing raw ─────────────────────────────────
  console.log("\nevery decision is made");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`no unresolved placeholder — ${fx.id}`, () => {
      const scan = scannableText(fx, promptFor(fx));
      for (const word of ["auto", "AI decides", "suitable", "tasteful", "as needed"]) {
        assert.ok(
          !new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "i").test(scan),
          `"${word}" leaked into the prompt`,
        );
      }
      assert.ok(!/\{\{/.test(scan), "an unfilled {{SLOT}} leaked into the prompt");
    });
  }
  check("no raw snake_case identifier anywhere", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const scan = scannableText(fx, promptFor(fx));
      const hit = /\b[a-z]{2,}_[a-z]{2,}\b/.exec(scan);
      assert.ok(!hit, `${fx.id}: "${hit?.[0]}" is an internal identifier`);
    }
  });
  check("the coffee_tea leak is closed", () => {
    const prompt = promptFor(fixtureById("05_five_drinks_prices_florian"));
    assert.ok(!prompt.includes("coffee_tea"), "the raw enum is still in the prompt");
    assert.ok(prompt.includes("coffee and tea"), "the spelled label is missing");
  });

  // ── 6. Every quoted string is in the manifest, exactly once ────────────
  console.log("\nthe text manifest is the whole truth about text");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`manifest covers every quote — ${fx.id}`, () => {
      const prompt = promptFor(fx);
      const sheet = sheetFor(fx);
      const quotes = [...prompt.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
      const manifest = sheet.text_manifest.map((m) => m.exact_string);
      assert.deepStrictEqual(
        manifest,
        fx.copy.filter((c) => c.trim()),
        "the manifest is not exactly the client's strings, in order",
      );
      for (const q of quotes) {
        assert.ok(manifest.includes(q), `"${q}" is quoted but not in the manifest`);
      }
      for (const m of manifest) {
        assert.strictEqual(
          quotes.filter((q) => q === m).length,
          1,
          `"${m}" appears ${quotes.filter((q) => q === m).length} times; it must appear exactly once`,
        );
      }
    });
  }
  check("no copy means nothing is quoted and the prompt says so", () => {
    const fx = fixtureById("11_no_copy");
    const prompt = promptFor(fx);
    assert.strictEqual([...prompt.matchAll(/"([^"\n]*)"/g)].length, 0, "something was quoted");
    assert.ok(/no text of any kind anywhere in the image/i.test(prompt), "the no-text declaration is missing");
  });

  // ── 7. Exactly one print rule ──────────────────────────────────────────
  console.log("\nthe print rule");
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`exactly one branch — ${fx.id}`, () => {
      const branches = printRuleBranchesIn(promptFor(fx));
      assert.strictEqual(branches.length, 1, `${branches.length} branches: ${branches.join(", ")}`);
    });
  }
  check("a supplied logo selects the logo branch", () => {
    const fx = fixtureById("14_brand_kit_clashes_with_product");
    const rule = printRuleFor({ hasLogoImage: true });
    assert.strictEqual(rule.branch, "supplied_logo");
    assert.ok(promptFor(fx).includes(PRINT_RULE_MARKERS.supplied_logo), "the prompt does not carry the sentence");
  });
  check("no logo selects the photographed branch, and it does not forbid printed branding", () => {
    const rule = printRuleFor({ hasLogoImage: false });
    assert.strictEqual(rule.branch, "photographed_branding");
    assert.ok(/keep any branding already printed/i.test(rule.text), "it does not preserve printed branding");
    assert.ok(/draw no other logo/i.test(rule.text), "it does not forbid an invented mark");
    // The live contradiction, stated as a test: the old text said "do not draw or render
    // any logo" while five photographed cups carried the brand. Both cannot be obeyed.
    assert.ok(
      !/do not (draw|render) (any|a) (logo|brand)/i.test(rule.text),
      "the rule still contains the blanket ban that contradicted the photographs",
    );
  });
  check("the third branch is reachable but unreached", () => {
    const reserved = printRuleFor({
      hasLogoImage: false,
      detectedPrintedBranding: [{ product: "a cup", reads: "FLORIAN" }],
    });
    assert.strictEqual(reserved.branch, "detected_branding", "Phase 3's branch is not selectable");
    for (const fx of GPT_BRIEF_FIXTURES) {
      assert.notStrictEqual(
        sheetFor(fx).provenance.print_rule_branch,
        "detected_branding",
        `${fx.id} selected a branch nothing populates yet`,
      );
    }
  });

  // ── 8. Zones differ by canvas ──────────────────────────────────────────
  console.log("\nthe canvas changes the layout");
  check("1:1, 9:16 and 16:9 produce different zones and margins", () => {
    const square = sheetFor(fixtureById("03_three_products_square")).canvas_zones;
    const vertical = sheetFor(fixtureById("07_vertical_three_products")).canvas_zones;
    const wide = sheetFor(fixtureById("08_wide_one_product")).canvas_zones;

    assert.notStrictEqual(square.safe_margin_pct, vertical.safe_margin_pct, "9:16 has the same margin as 1:1");
    assert.strictEqual(square.platform_ui, null, "1:1 reserved platform interface space");
    assert.strictEqual(wide.platform_ui, null, "16:9 reserved platform interface space");
    assert.ok(vertical.platform_ui, "9:16 did not reserve the platform's own interface bands");
    assert.ok(vertical.platform_ui!.bottom_pct > vertical.platform_ui!.top_pct, "the bottom band is not the larger one");

    // The wide canvas splits side by side; the others stack. That is the whole reason the
    // geometry is per-ratio rather than one layout scaled.
    assert.ok(wide.text.width_pct < 60, "16:9 did not put the words in a side column");
    assert.ok(square.text.width_pct > 60, "1:1 did not run the words across the frame");
    assert.ok(
      vertical.subject.top_pct > square.subject.top_pct,
      "9:16 did not push the subject down past the platform's top band",
    );
  });
  check("a 9:16 safe area excludes the platform's own interface", () => {
    const z = sheetFor(fixtureById("07_vertical_three_products")).canvas_zones;
    assert.ok(z.text.top_pct >= z.safe_margin_pct + z.platform_ui!.top_pct, "text starts inside the chrome");
  });

  // ── 9. A spec the client typed survives, as words ──────────────────────
  console.log("\nspecs the client typed in the concept");
  check("85mm, f/2.8 and 3200K are read out of a concept", () => {
    const specs = extractConceptSpecs("the bottle on slate, shot at 85mm, f/2.8, warm 3200K light");
    assert.strictEqual(specs.lens_mm, 85);
    assert.strictEqual(specs.aperture, 2.8);
    assert.strictEqual(specs.kelvin, 3200);
  });
  check("a price is not a colour temperature", () => {
    // "Chỉ từ 30K" is copy. 30K as a colour temperature is physically absurd, and the
    // range bound is what keeps a price out of the lighting block.
    const specs = extractConceptSpecs("khuyến mãi chỉ từ 30K, nền gỗ ấm");
    assert.strictEqual(specs.kelvin, undefined, "a price was read as a colour temperature");
    assert.strictEqual(specs.matched.length, 0);
  });
  check("the last spec of a kind wins", () => {
    const specs = extractConceptSpecs("shot at 50mm, actually make it 85mm");
    assert.strictEqual(specs.lens_mm, 85, "the corrected value did not win");
  });
  check("the spec reaches the sheet as a number and the prompt as words", () => {
    const fx: GptBriefFixture = {
      ...fixtureById("01_one_product_square"),
      id: "spec_probe",
      concept: "The bottle alone on slate, shot at 85mm, f/2.8, in warm 3200K light.",
    };
    const sheet = sheetFor(fx);
    // The sheet keeps the concrete values, because a sheet that says "a longish lens"
    // cannot be reviewed or compared.
    assert.strictEqual(sheet.camera.lens_mm, 85, "the stated focal length was overruled by the derivation");
    assert.strictEqual(sheet.camera.aperture, 2.8, "the stated aperture was overruled");
    assert.strictEqual(sheet.lighting.kelvin, 3200, "the stated colour temperature was overruled");
    assert.deepStrictEqual(sheet.provenance.concept_specs, ["85mm", "f/2.8", "3200K"]);

    // The prompt carries the instruction and not the number.
    const scan = scannableText(fx, promptFor(fx));
    assert.ok(!/85|2\.8|3200/.test(scan), "a stated number reached the prompt");
    assert.ok(/compressing/i.test(scan), "the focal length was dropped rather than translated");
    assert.ok(/warm amber/i.test(scan), "the colour temperature was dropped rather than translated");
  });
  check("the concept is quoted into the brief without its specs", () => {
    const concept = "The bottle on slate, shot at 85mm, f/2.8, warm light.";
    const specs = extractConceptSpecs(concept);
    const cleaned = conceptWithoutSpecs(concept, specs);
    assert.ok(!/\d/.test(cleaned), `a digit survived: ${cleaned}`);
    assert.ok(!/,\s*,/.test(cleaned), `the punctuation was left ragged: ${cleaned}`);
    assert.ok(/bottle on slate/.test(cleaned), "the client's own words were damaged");
  });

  // ── 10. Precedence ─────────────────────────────────────────────────────
  //
  // One assertion per tier, in order, each one beating the tier below it.
  console.log("\nprecedence, one test per tier");
  for (let i = 0; i < PRECEDENCE_TIERS.length - 1; i++) {
    const higher = PRECEDENCE_TIERS[i];
    const lower = PRECEDENCE_TIERS[i + 1];
    check(`${higher} beats ${lower}`, () => {
      const r = resolvePrecedence<string>("probe", [
        { tier: lower, value: "loser", from: lower },
        { tier: higher, value: "winner", from: higher },
      ]);
      assert.strictEqual(r.value, "winner");
      assert.strictEqual(r.tier, higher);
      assert.strictEqual(r.conflicts.length, 1, "the losing candidate was not recorded");
    });
  }
  check("agreement is not a conflict", () => {
    const r = resolvePrecedence<string>("probe", [
      { tier: "default", value: "same" },
      { tier: "brand_kit", value: "same" },
    ]);
    assert.strictEqual(r.conflicts.length, 0, "two sources that agree were logged as a conflict");
  });
  check("nothing offered resolves to the default tier with no value", () => {
    const r = resolvePrecedence<string>("probe", [{ tier: "brand_kit", value: undefined }]);
    assert.strictEqual(r.value, undefined);
    assert.strictEqual(r.tier, "default");
  });
  check("the product's appearance beats the brand kit on the background", () => {
    // The measured failure: the kit's primary IS the product's colour, and painting the
    // field in it erases the product.
    const fx = fixtureById("14_brand_kit_clashes_with_product");
    const sheet = sheetFor(fx);
    assert.notStrictEqual(
      sheet.palette.sixty.toLowerCase(),
      String(sheet.palette.product_dominant).toLowerCase(),
      "the field is the product's own colour",
    );
    assert.ok(
      sheet.conflicts_resolved.some((c) => /palette/i.test(c)),
      `the clash was resolved silently: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
  });

  // ── 11. The static industry test ───────────────────────────────────────
  //
  // The one test that is about the SHAPE of the code rather than about an output. A focal
  // length keyed on `coffee_tea` would pass every behavioural assertion in this file and
  // still be exactly the thing the design forbids.
  console.log("\nno creative constant is keyed on an industry");
  const SHEET_SRC = path.join(__dirname, "prompt-v2", "art-direction", "art-direction-sheet.ts");
  const BRIEF_SRC = path.join(__dirname, "prompt-v2", "art-direction", "art-direction-brief.ts");

  check("an industry id appears in no file but industry-label.ts", () => {
    for (const file of [SHEET_SRC, BRIEF_SRC]) {
      const src = fs.readFileSync(file, "utf8");
      for (const id of knownIndustryIds()) {
        // `coffee_tea` in a comment is a description of the defect, not a lookup; the
        // check is for the id used as a KEY or a string value in code.
        const code = src
          .split("\n")
          .filter((l) => !/^\s*(\*|\/\/)/.test(l))
          .join("\n");
        // As a quoted LITERAL, which is what a lookup key or a keyed branch looks like.
        // Plain substring matching fails on "other" and "education", which are also
        // ordinary English words that appear in prose and in field names.
        for (const literal of [`"${id}"`, `'${id}'`, `[${id}]`, `${id}:`]) {
          assert.ok(
            !code.includes(literal),
            `${path.basename(file)} uses the industry id ${literal} in code, which is a keyed lookup`,
          );
        }
      }
    }
  });
  check("the industry map holds spellings only — no number, hex or craft word", () => {
    for (const id of knownIndustryIds()) {
      const label = industryLabel(id);
      assert.ok(!/\d/.test(label), `the label for ${id} contains a digit: ${label}`);
      assert.ok(!/#[0-9a-f]{3,6}/i.test(label), `the label for ${id} contains a hex: ${label}`);
      // Word-bounded: "prop" is inside "property", which is a perfectly good spelling of
      // an industry and not a prop list.
      for (const craft of ["mm", "kelvin", "lens", "lighting", "key light", "palette", "props", "surface"]) {
        assert.ok(
          !new RegExp(`\b${craft.replace("/", "\/")}\b`, "i").test(label),
          `the label for ${id} carries craft ("${craft}"): ${label}`,
        );
      }
      assert.ok(!label.includes("f/"), `the label for ${id} carries an f-number: ${label}`);
    }
  });
  check("industry exclusions are negatives only", () => {
    for (const id of knownIndustryIds()) {
      for (const line of exclusionsFor(id)) {
        assert.ok(
          /^(no|never|avoid)\b/i.test(line.trim()),
          `an industry exclusion for ${id} is not phrased as a negative: "${line}"`,
        );
        assert.ok(!/\d/.test(line), `an industry exclusion for ${id} carries a number: "${line}"`);
      }
    }
  });
  check("two industries on one brief derive the same craft", () => {
    // The behavioural half of the same rule: swapping the industry id may change the
    // spelling and the exclusions, and nothing else.
    const base = fixtureById("01_one_product_square");
    const a = sheetFor({ ...base, industry: "coffee_tea" });
    const b = sheetFor({ ...base, industry: "electronics_tech" });
    assert.deepStrictEqual(a.camera, b.camera, "the industry changed the camera");
    assert.deepStrictEqual(a.lighting, b.lighting, "the industry changed the lighting");
    assert.deepStrictEqual(a.palette, b.palette, "the industry changed the palette");
    assert.deepStrictEqual(a.canvas_zones, b.canvas_zones, "the industry changed the layout");
    assert.deepStrictEqual(a.typography, b.typography, "the industry changed the typography");
    assert.deepStrictEqual(a.realism_details, b.realism_details, "the industry changed the realism rules");
    assert.notDeepStrictEqual(a.set.exclusions, b.set.exclusions, "the exclusions did not change at all");
  });
  check("an unknown industry is spelled, not replaced", () => {
    assert.strictEqual(industryLabel("spa_massage"), "spa massage");
    assert.strictEqual(industryLabel(""), "general consumer goods");
    assert.deepStrictEqual(exclusionsFor("spa_massage"), [], "an unknown industry invented an exclusion");
  });

  // ── 12. The word translations ──────────────────────────────────────────
  console.log("\nthe translation layer");
  check("every integer nought to a hundred has a word, and none has a digit", () => {
    for (let n = 0; n <= 100; n++) {
      const word = numberWord(n);
      assert.ok(word, `${n} has no word`);
      assert.ok(!/\d/.test(word), `${n} translated to "${word}"`);
    }
  });
  check("percentages are spelled and rounded to the nearest five", () => {
    assert.strictEqual(percentWords(30), "about thirty percent");
    assert.strictEqual(percentWords(32), "about thirty percent");
    assert.strictEqual(percentWords(33), "about thirty-five percent");
    assert.ok(!/\d/.test(percentWords(42)), "a percentage kept its digits");
  });
  check("a hex becomes a colour a person could mix", () => {
    assert.ok(!/[0-9a-f]{6}/i.test(colourWords("#c0392b")), "the hex survived");
    assert.ok(/red/.test(colourWords("#c0392b")), `#c0392b was not read as a red: ${colourWords("#c0392b")}`);
    assert.ok(/green/.test(colourWords("#3f7a53")), `#3f7a53 was not read as a green`);
    // Deterministic across the duplicate spellings in the table.
    assert.strictEqual(colourWords("#8a8a8a"), colourWords("#8a8a8a"));
    assert.ok(!/gray/.test(colourWords("#8a8a8a")), "the duplicate spelling won");
  });
  check("a value that is not a hex is handed back untouched", () => {
    assert.strictEqual(colourWords("burnt sienna"), "burnt sienna");
  });

  // ── 13. Unverified facts stay unverified ───────────────────────────────
  console.log("\nnothing is invented");
  check("a material nobody stated is marked unverified, not guessed", () => {
    const sheet = sheetFor(fixtureById("04_four_dishes_fast_food"));
    const sizes = sheet.products.map((p) => p.size_class);
    assert.ok(sizes.every((s) => s === "unverified"), "a size class was invented");
    // The one product whose material the client DID state reads it back.
    const stated = sheet.products.find((p) => p.material !== "unverified");
    assert.ok(stated, "a stated material was not read out of the product facts");
    assert.ok(/ceramic/.test(String(stated!.material)), `expected the stated ceramic: ${stated!.material}`);
  });
  check("printed branding is unverified unless a human typed it", () => {
    const guessed = sheetFor(fixtureById("04_four_dishes_fast_food"));
    assert.ok(
      guessed.products.every((p) => p.printed_branding === "unverified"),
      "branding was invented from nothing",
    );
    const stated = sheetFor(fixtureById("01_one_product_square"));
    assert.strictEqual(
      stated.products[0].printed_branding,
      "ORIGIN BLEND / COLD BREW",
      "the label was not read exactly out of its own fact",
    );
    // The regression: the facts used to be joined with a space and the capture ran to the
    // next full stop, so a second fact was swallowed into the label. Measured on fixture 15,
    // where the label came back as "SUONG / VITAMIN C frosted glass, matte white cap" and
    // the brand-name comparison then reported a mismatch that did not exist.
    const vertical = sheetFor(fixtureById("15_single_product_vertical"));
    assert.strictEqual(vertical.products[0].printed_branding, "SUONG / VITAMIN C");
    assert.ok(
      !vertical.conflicts_resolved.some((c) => /does not match the brand name/i.test(c)),
      `a false brand mismatch survived: ${JSON.stringify(vertical.conflicts_resolved)}`,
    );
  });
  check("props are never invented", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      assert.deepStrictEqual(
        sheetFor(fx).set.props,
        [],
        `${fx.id} invented a prop; props may only come from the client's concept`,
      );
    }
  });
  check("a mood image contributes words only when it was read from the image", () => {
    const sheet = buildArtDirectionSheet({
      assetType: "Poster",
      aspectRatio: "1:1",
      concept: "the bottle on stone",
      brand: "X",
      copy: ["Hello"],
      products: [{ id: "1", description: "a bottle" }],
      styleManifest: { lighting: "one hard side light", derived_from_image: false },
    });
    // The manifest is present but was NOT read from the image, so nothing of it may be
    // treated as observed style. `types.ts:628` records why.
    assert.ok(!/one hard side light/.test(JSON.stringify(sheet)), "an inferred manifest was treated as observed");
  });

  // ── 14. Flag OFF carries none of this ──────────────────────────────────
  console.log("\nthe flag is a rollback");
  check("the flag-off brief has no art-director field", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const off = briefInputFor(fx);
      assert.strictEqual(off.artDirector, undefined, `${fx.id} carries artDirector with the flag off`);
      assert.strictEqual(off.sheet, undefined, `${fx.id} carries a sheet with the flag off`);
      assert.strictEqual(off.printRule, undefined, `${fx.id} carries a print rule with the flag off`);
    }
  });
  check("the flag-off brief still spells the industry the old way", () => {
    const off = buildGptMessages(briefInputFor(fixtureById("05_five_drinks_prices_florian")), "v1");
    assert.ok(off.user.content.includes("coffee_tea"), "the flag-off brief changed, which breaks the rollback");
  });
  check("the art-director checks are dormant without a sheet", () => {
    // A prompt full of things the second rule set refuses, checked WITHOUT a sheet: the
    // original nine must be the only ones that can speak.
    const prompt = [
      "OUTPUT: A square poster, auto, coffee_tea, tasteful.",
      "REFERENCE IMAGES: Image 1 is a bottle.",
      "SCENE & CONCEPT: a scene.",
      "SUBJECT ARRANGEMENT: about thirty percent of the frame.",
      "COMPOSITION & LAYOUT: a layout.",
      "LIGHT / CAMERA / MATERIALS: soft light.",
      "COLOR & BRAND STYLE: warm.",
      "TEXT: No text of any kind anywhere in the image.",
      "CONSTRAINTS: no people.",
    ].join("\n\n");
    const result = runGptChecks(prompt, { copy: [], referenceCount: 1, aspectRatio: "1:1", minChars: 1 });
    const codes = result.failures.map((f) => f.code);
    for (const code of ["UNRESOLVED_AUTO", "RAW_IDENTIFIER", "PERCENT_WORDS_OUTSIDE_LAYOUT", "PRINT_RULE_BRANCHES"]) {
      assert.ok(!codes.includes(code as never), `${code} fired without a sheet`);
    }
  });


  // ── 15. The contrast guard (Step 1a) ───────────────────────────────────
  //
  // The measured defect: the four-dish brief derived `#f7f5f1` as its accent from the
  // words "white ceramic", against an `#f2efe9` field. Two off-whites. The prompt then
  // read "a small part is the accent, a very pale white", which is not an instruction
  // anyone can follow.
  console.log("\nthe contrast guard");
  check("WCAG luminance and ratio are the real formulas", () => {
    assert.strictEqual(relativeLuminance("#000000"), 0);
    assert.strictEqual(relativeLuminance("#ffffff"), 1);
    assert.strictEqual(Math.round((contrastRatio("#000000", "#ffffff") ?? 0) * 10) / 10, 21);
    assert.strictEqual(contrastRatio("not a hex", "#ffffff"), null);
    // The naive average would call these two near-identical; perceived brightness does not.
    const yellow = relativeLuminance("#ffff00") ?? 0;
    const blue = relativeLuminance("#0000ff") ?? 0;
    assert.ok(yellow > blue * 10, "the cheap average snuck in");
  });
  check("an accent too close to the field is rejected", () => {
    // The exact measured pair.
    assert.ok(!accentSeparates("#f7f5f1", "#f2efe9"), "the off-white-on-off-white accent passed");
    assert.ok(accentSeparates("#c0392b", "#f2efe9"), "a red on off-white was rejected");
    assert.ok(accentSeparates("#1a1a1a", "#f2efe9"), "ink on paper was rejected");
    // Boundary: the threshold is a floor, so a pair exactly at it passes.
    const field = "#f2efe9";
    const fieldL = relativeLuminance(field) ?? 0;
    assert.ok(fieldL - ACCENT_LUMINANCE_DELTA_MIN > 0, "the fixture field is too dark for this check");
  });
  check("the four-dish accent is no longer an off-white", () => {
    const sheet = sheetFor(fixtureById("04_four_dishes_fast_food"));
    assert.ok(
      accentSeparates(sheet.palette.ten, sheet.palette.sixty),
      `the accent ${sheet.palette.ten} still does not separate from the field ${sheet.palette.sixty}`,
    );
    assert.ok(
      sheet.conflicts_resolved.some((c) => /too close in luminance/i.test(c)),
      `the rejection was not recorded: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
    // And the prompt no longer says the thing that could not be followed.
    assert.ok(!/accent, a very pale white/i.test(promptFor(fixtureById("04_four_dishes_fast_food"))));
  });
  check("type reaches WCAG AA against the field on every brief", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const sheet = sheetFor(fx);
      if (!sheet.text_manifest.length) continue;
      const ratio = contrastRatio(sheet.palette.text, sheet.palette.sixty) ?? 0;
      assert.ok(
        ratio >= TEXT_CONTRAST_MIN,
        `${fx.id}: type ${sheet.palette.text} on field ${sheet.palette.sixty} reaches only ${ratio.toFixed(1)} to 1`,
      );
      for (const entry of sheet.text_manifest) {
        assert.strictEqual(entry.colour, sheet.palette.text, `${fx.id}: a manifest entry uses a different colour`);
      }
    }
  });
  check("a brand kit that specifies unreadable type is overruled and the reason recorded", () => {
    const base = fixtureById("01_one_product_square");
    const sheet = sheetFor({
      ...base,
      brandKit: {
        // Near-white type. Against a near-white field this is a defect the kit specified.
        colors: [{ hex: "#fbfbfa", role: "text" }],
        hasLogoImage: false,
      },
    });
    assert.notStrictEqual(sheet.palette.text.toLowerCase(), "#fbfbfa", "unreadable type was obeyed");
    assert.ok((contrastRatio(sheet.palette.text, sheet.palette.sixty) ?? 0) >= TEXT_CONTRAST_MIN);
    assert.ok(
      sheet.conflicts_resolved.some((c) => /palette\.text/.test(c) && /below the/.test(c)),
      `the override was silent: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
  });
  check("the last-resort neutral is derived from the background and nothing else", () => {
    assert.strictEqual(readableNeutralFor("#ffffff"), "#1a1a1a");
    assert.strictEqual(readableNeutralFor("#000000"), "#f7f5f1");
    assert.strictEqual(readableNeutralFor("#f2efe9"), "#1a1a1a");
    // Not a hex: treated as light, which is the common case and where ink is safe.
    assert.strictEqual(readableNeutralFor("teal"), "#1a1a1a");
  });

  // ── 16. Numeric hygiene (Step 1b) ──────────────────────────────────────
  console.log("\nnumeric hygiene");
  check("no number in any sheet carries more than one decimal", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const walk = (value: unknown, path: string) => {
        if (typeof value === "number") {
          const decimals = String(value).split(".")[1] || "";
          assert.ok(decimals.length <= 1, `${fx.id} ${path} = ${value} carries ${decimals.length} decimals`);
          return;
        }
        if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`));
        if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
        }
      };
      walk(sheetFor(fx), "sheet");
    }
  });
  check("the measured float is gone", () => {
    // `min_cap_height_pct * 1.2` on a social profile was 3.5999999999999996.
    const sizes = sheetFor(fixtureById("05_five_drinks_prices_florian")).typography.sizes_pct;
    assert.strictEqual(sizes.supporting, 3.6, `expected 3.6, got ${sizes.supporting}`);
  });
  check("roundNumbers keeps the shape and only touches numbers", () => {
    const input = { a: 1.26, b: [2.04, { c: "3.999" }], d: null, e: true };
    assert.deepStrictEqual(roundNumbers(input), { a: 1.3, b: [2, { c: "3.999" }], d: null, e: true });
  });

  // ── 17. The mood image reaches the sheet (Step 1c) ─────────────────────
  console.log("\nthe mood image");
  check("a manifest read FROM the image reaches the sheet, in words", () => {
    const fx = fixtureById("16_mood_manifest_present");
    const sheet = sheetFor(fx);
    const brief = buildGptMessages(artDirectorBriefInputFor(fx), "v2").user.content;
    // Composition travels as WORDS, because nothing downstream decides it.
    assert.ok(/two thirds of the frame empty/i.test(brief), "the mood composition never reached the brief");
    // Light direction travels as a DECISION, not as prose. Emitting the raw sentence as
    // well put two different key lights in one prompt — measured in the Step 1i evidence,
    // where the lighting block said "front left" while the mood line said "from the right".
    // "a single hard light from the right, deep shadow filling the left": the shadow is on
    // the left, so the light is on the right, and "hard" makes it a raking side light.
    assert.strictEqual(sheet.lighting.key_direction, "side_right", "the mood image's light direction was ignored");
    assert.ok(
      !/single hard light from the right/i.test(brief),
      "the raw mood lighting sentence is still in the brief, contradicting the derived key light",
    );
    assert.ok(
      sheet.conflicts_resolved.some((c) => /key_direction/.test(c) && /mood/i.test(c)),
      `the override was silent: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
    // And it influenced a derived value rather than only being quoted: the accent.
    assert.ok(
      sheet.palette.reason.length > 0 && accentSeparates(sheet.palette.ten, sheet.palette.sixty),
      "the mood colour did not survive the contrast guard",
    );
  });
  check("a manifest NOT read from the image is ignored", () => {
    const fx = fixtureById("16_mood_manifest_present");
    const inferred = sheetFor({
      ...fx,
      styleManifest: { ...fx.styleManifest, derived_from_image: false },
    });
    assert.ok(
      !/single hard light from the right/i.test(JSON.stringify(inferred)),
      "an inferred manifest was treated as an observation",
    );
  });
  check("the orchestrator hands the manifest back to the request", () => {
    // A source assertion, because the alternative is a live render. The write-back is the
    // whole fix: the manifest is computed in a local and the sheet reads it off `request`
    // later, from inside the provider wrapper.
    const src = fs.readFileSync(
      path.join(__dirname, "service", "SimpleImageGenerationOrchestratorService.ts"),
      "utf8",
    );
    assert.ok(
      /request\.inspirationStyleManifest\s*=\s*inspirationStyleManifest/.test(src),
      "the orchestrator still drops the manifest it computed",
    );
  });
  check("a style reference's objects never reach the brief at all", () => {
    // Corrected from the first draft of this test, which asserted the opposite. A style
    // reference is allocated as `kind: "style"` and never travels as an image, so the
    // allocation has no slot for it and its description is never written into section C.
    // That is the strongest possible version of "its objects do not travel": the words
    // describing them are not in the brief either.
    const brief = buildGptMessages(
      artDirectorBriefInputFor(fixtureById("13_mood_image_of_another_product")),
      "v2",
    ).user.content;
    assert.ok(!/wristwatch/i.test(brief), "a different product's description reached the brief");
  });
  check("a mood manifest says take the look, not the objects", () => {
    const brief = buildGptMessages(
      artDirectorBriefInputFor(fixtureById("16_mood_manifest_present")),
      "v2",
    ).user.content;
    assert.ok(
      /none of the objects in the mood image appear in this picture/i.test(brief),
      "nothing told the director to take the look and not the objects",
    );
  });

  // ── 18. The order-dependency guard (Step 1d) ───────────────────────────
  console.log("\nthe order dependency");
  check("a missing upstream layer is recorded, not silently defaulted", () => {
    const base = fixtureById("01_one_product_square");
    const input = artDirectorBriefInputFor(base);
    const reported = buildArtDirectionSheet({
      assetType: base.assetType,
      aspectRatio: base.aspectRatio,
      concept: base.concept,
      brand: base.brand,
      copy: base.copy,
      products: [{ id: "1", description: base.products[0].description }],
      allocation: input.allocation,
      upstream: { blueprint: null, compositionPlan: null },
    });
    assert.ok(reported.sheet_fallback_reason, "a missing blueprint was not recorded");
    assert.ok(/blueprint/i.test(reported.sheet_fallback_reason!));
    assert.ok(/composition plan/i.test(reported.sheet_fallback_reason!));
    assert.ok(/wrapProvider/.test(reported.sheet_fallback_reason!), "the reason does not say where to look");
  });
  check("a sheet with every layer present records nothing", () => {
    const base = fixtureById("01_one_product_square");
    const sheet = buildArtDirectionSheet({
      assetType: base.assetType,
      aspectRatio: base.aspectRatio,
      concept: base.concept,
      brand: base.brand,
      copy: base.copy,
      products: [{ id: "1", description: base.products[0].description }],
      upstream: { blueprint: {}, compositionPlan: {} },
    });
    assert.strictEqual(sheet.sheet_fallback_reason, null);
  });
  check("a caller that does not report is not accused", () => {
    // `undefined` means "not reporting" — a test or a fixture — and must not be read as
    // "the layer was missing".
    assert.strictEqual(sheetFor(fixtureById("01_one_product_square")).sheet_fallback_reason, null);
  });
  check("blueprintFor still runs before v2For in wrapProvider", () => {
    // The guard above records a reversal; this fails ON one, so the ordering cannot drift
    // silently into the degraded path.
    const src = fs.readFileSync(path.join(__dirname, "evolution", "ExperimentPipeline.ts"), "utf8");
    const blueprintAt = src.indexOf("const blueprintText = blueprintFor ? blueprintFor(");
    const v2At = src.indexOf("const v2 = v2For ? await v2For() : null;");
    assert.ok(blueprintAt > 0, "the blueprintFor call site moved or was renamed");
    assert.ok(v2At > 0, "the v2For call site moved or was renamed");
    assert.ok(
      blueprintAt < v2At,
      "v2For now runs BEFORE blueprintFor, so every sheet is built without the blueprint and the composition plan",
    );
  });

  // ── 19. Culture signals are the director's job (Step 1e) ───────────────
  console.log("\ncultural specifics");
  check("the v2 brief instructs the director to name identifiers and the confusion to exclude", () => {
    const brief = buildGptMessages(
      artDirectorBriefInputFor(fixtureById("09_culturally_specific_concept")),
      "v2",
    ).user.content;
    assert.ok(/EXACT visual identifiers/i.test(brief), "the brief does not ask for exact identifiers");
    assert.ok(/EXCLUDED/i.test(brief), "the brief does not ask for the confusion to be excluded");
    // The measured failure, named concretely so the instruction cannot be read as abstract.
    assert.ok(/apricot blossom/i.test(brief), "the apricot-blossom failure is not named");
    assert.ok(/cherry blossom/i.test(brief), "the cherry-blossom substitution is not named");
    assert.ok(/never grow one|no lookup table/i.test(brief), "nothing forbids a lookup table");
  });
  check("the client's own exclusion survives into the prompt", () => {
    const fx = fixtureById("09_culturally_specific_concept");
    const sheet = sheetFor(fx);
    assert.ok(
      sheet.set.exclusions.some((e) => /not chinese|not japanese/i.test(e)),
      `the concept's own exclusion was dropped: ${JSON.stringify(sheet.set.exclusions)}`,
    );
  });
  check("no lookup table was added", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      assert.deepStrictEqual(
        sheetFor(fx).set.culture_signals,
        [],
        `${fx.id} populated culture_signals, which means a table was added somewhere`,
      );
    }
  });

  // ── 20. The quoted-digit exemption (Step 1g) ───────────────────────────
  console.log("\nthe quoted-digit exemption");
  check("prices and brand strings inside the manifest do not trip the digit rule", () => {
    const fx = fixtureById("05_five_drinks_prices_florian");
    const input = artDirectorBriefInputFor(fx);
    const result = runGptChecks(promptFor(fx), {
      copy: fx.copy,
      referenceCount: input.allocation?.slots.length ?? 0,
      aspectRatio: fx.aspectRatio,
      maxChars: gptFallbackMaxChars(input),
      sheet: input.sheet,
      density: "words_only",
      printRuleBranch: input.printRule?.branch,
    });
    // Six of the nine strings carry digits — "Chỉ từ 30K", "Caramel coffee - 35K" …
    assert.ok(fx.copy.filter((c) => /\d/.test(c)).length >= 6, "the fixture lost its price lines");
    assert.ok(result.ok, `the client's own prices were refused: ${result.failures.map((f) => f.code).join(", ")}`);
  });
  check("a stray digit OUTSIDE a quoted string still fails", () => {
    const fx = fixtureById("05_five_drinks_prices_florian");
    const input = artDirectorBriefInputFor(fx);
    // One numeral, in prose, in the lighting section — the exact leak the rule is for.
    const sabotaged = promptFor(fx).replace(
      "LIGHT / CAMERA / MATERIALS:",
      "LIGHT / CAMERA / MATERIALS: Shot at 85mm.",
    );
    const result = runGptChecks(sabotaged, {
      copy: fx.copy,
      referenceCount: input.allocation?.slots.length ?? 0,
      aspectRatio: fx.aspectRatio,
      maxChars: gptFallbackMaxChars(input),
      sheet: input.sheet,
      density: "words_only",
      printRuleBranch: input.printRule?.branch,
    });
    assert.ok(!result.ok, "a millimetre figure in prose was accepted");
    assert.ok(
      result.failures.some((f) => f.code === "PHYSICAL_NUMBER"),
      `expected PHYSICAL_NUMBER, got ${result.failures.map((f) => f.code).join(", ")}`,
    );
  });
  check("a digit-bearing string the client did NOT supply is still refused", () => {
    const fx = fixtureById("01_one_product_square");
    const input = artDirectorBriefInputFor(fx);
    const sabotaged = promptFor(fx).replace("TEXT:", 'TEXT: Also set "Giảm 50% hôm nay".');
    const result = runGptChecks(sabotaged, {
      copy: fx.copy,
      referenceCount: input.allocation?.slots.length ?? 0,
      aspectRatio: fx.aspectRatio,
      maxChars: gptFallbackMaxChars(input),
      sheet: input.sheet,
      density: "words_only",
      printRuleBranch: input.printRule?.branch,
    });
    assert.ok(!result.ok, "invented copy carrying a discount was accepted");
    assert.ok(
      result.failures.some((f) => f.code === "UNAUTHORIZED_QUOTE" || f.code === "QUOTE_OUTSIDE_MANIFEST"),
      `expected an unauthorised-quote failure, got ${result.failures.map((f) => f.code).join(", ")}`,
    );
  });

  // ── 21. Prompt length (Step 1f) ────────────────────────────────────────
  console.log("\nprompt length");
  check("the director is told the five-to-seven-hundred-word target", () => {
    const brief = buildGptMessages(artDirectorBriefInputFor(fixtureById("01_one_product_square")), "v2")
      .user.content;
    assert.ok(/five hundred to seven hundred words/i.test(brief), "the word target is not stated");
  });
  check("the code-built prompt stays inside its own ceiling on every brief", () => {
    for (const fx of GPT_BRIEF_FIXTURES) {
      const input = artDirectorBriefInputFor(fx);
      const chars = promptFor(fx).length;
      assert.ok(
        chars <= gptFallbackMaxChars(input),
        `${fx.id}: ${chars} characters against a ${gptFallbackMaxChars(input)} ceiling`,
      );
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
