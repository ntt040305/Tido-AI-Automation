/**
 * Creative approach — restrained / balanced / bold.
 *
 * The defect this covers
 * ---------------------
 * `docs/migration/06-creative-direction-analysis.md` measured three things:
 *
 *   1. There was no way for a user to say "I want this quiet and expensive".
 *      Grep for `creative_approach` and `boldness` returned nothing.
 *   2. The route the director picks is drawn from a list shuffled with
 *      `Math.random()` (`evolution/experiment/AssetContext.ts:127`), and the
 *      evaluator spends 0.20 of its weight on audience and 0.20 on objective
 *      (`DirectionEvaluator.ts:137-144`) while a missing verdict scores a
 *      neutral 0.5 (`:151`) — so two fifths of the decision was being fed
 *      nothing at all.
 *   3. `MarketingContextForm` already had the objective and audience controls,
 *      including `branding` = "Định vị Cao cấp (Luxury Branding)"
 *      (`MarketingContextForm.tsx:26-30`), and `CreativeBriefPanel` never
 *      imported it. The strategy panel printed "Chưa nhập đối tượng cụ thể"
 *      (`AIStrategyPanel.tsx:73`) because the field could not be filled.
 *
 * So this suite pins both halves: the pure inference that turns the signals the
 * system already has into a level, and the mount that stops defect 3 returning.
 *
 * The component assertions are source-level, following
 * `run-ratio-parity-tests.ts`: importing a client component into a node test
 * pulls the browser runtime in for one constant.
 *
 * Pure. No model call, no I/O beyond reading source, no clock.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import {
  inferCreativeApproach,
  toneSignal,
  copyIsDense,
  APPROACH_LEVELS,
  LEVEL_LABEL_VI,
  type ApproachInput,
} from "./director/CreativeApproach";
import { ConceptStructuringLayer } from "./director/ConceptStructuringLayer";
import { copyFitsChannel, countCopyWords, profileFor } from "./evolution/experiment/AssetProfile";

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

function main() {
  console.log("\n=== CREATIVE APPROACH ===\n");

  // ── 1. The tone table, as it actually is ──────────────────────────────
  //
  // Fixtures are taken from the real keyword table at
  // `director/ConceptStructuringLayer.ts:117-122`, not invented, so a change to
  // that table breaks these rather than silently changing the inference.

  console.log("-- tone detector, real keywords --");

  check("every tone group is reachable from its own keywords", () => {
    const cases: [string, string][] = [
      ["sang trọng", "premium"],
      ["cao cấp", "premium"],
      ["luxury", "premium"],
      ["premium", "premium"],
      ["elegant", "premium"],
      ["tối giản", "minimal"],
      ["minimal", "minimal"],
      ["đơn giản", "minimal"],
      ["năng động", "energetic"],
      ["playful", "energetic"],
      ["nổi bật", "energetic"],
      ["ấn tượng", "bold"],
      ["bold", "bold"],
      ["striking", "bold"],
      ["ấm áp", "warm"],
      ["friendly", "warm"],
    ];
    for (const [text, tone] of cases) {
      const tones = ConceptStructuringLayer.tonesIn(text).map((t) => t.tone);
      assert.ok(tones.includes(tone), `"${text}" did not yield ${tone}, got [${tones.join(", ")}]`);
    }
  });

  check("tonesIn reports every group present, not only the first", () => {
    // `parse()` breaks on the first match, so it reports "premium" alone here and
    // the conflict is invisible. The inference needs to see both.
    const tones = ConceptStructuringLayer.tonesIn("poster sang trọng nhưng năng động").map((t) => t.tone);
    assert.ok(tones.includes("premium"), "premium missing");
    assert.ok(tones.includes("energetic"), "energetic missing");
    assert.strictEqual(ConceptStructuringLayer.parse("poster sang trọng nhưng năng động").tone, "premium");
  });

  check("tonesIn does not alter what parse() reports", () => {
    // The additive export must not have changed the single-tone contract any
    // other layer already depends on.
    assert.strictEqual(ConceptStructuringLayer.parse("chai serum cao cấp").tone, "premium");
    assert.strictEqual(ConceptStructuringLayer.parse("poster năng động").tone, "energetic");
    assert.strictEqual(ConceptStructuringLayer.parse("bàn gỗ").tone, null);
  });

  check("RECORDED BEHAVIOUR: the TABLE still ignores unaccented Vietnamese", () => {
    // Unchanged, and deliberately so. The table spells its Vietnamese terms with
    // diacritics ("sang\\s?trọng"), so "sang trong" matches nothing here. Editing
    // it would change what every other layer reading `intent.tone` sees.
    //
    // The inference no longer depends on this: accent folding was added to
    // `tone-strength.ts` instead, for multi-syllable strong terms only, and the
    // test below pins that. So an unaccented brief now reaches a level while
    // `intent.tone` still reports nothing — the two are different questions.
    assert.deepStrictEqual(ConceptStructuringLayer.tonesIn("sang trong").map((t) => t.tone), []);
    assert.deepStrictEqual(ConceptStructuringLayer.tonesIn("toi gian").map((t) => t.tone), []);
    assert.deepStrictEqual(ConceptStructuringLayer.tonesIn("nang dong").map((t) => t.tone), []);
    // The English half of the same table is unaffected either way.
    assert.deepStrictEqual(ConceptStructuringLayer.tonesIn("luxury").map((t) => t.tone), ["premium"]);
  });

  check("unaccented Vietnamese now reaches the INFERENCE, for safe terms only", () => {
    // Multi-syllable strong terms fold.
    assert.strictEqual(toneSignal("phong cach sang trong")?.level, "restrained");
    assert.strictEqual(toneSignal("bo cuc toi gian")?.level, "restrained");
    assert.strictEqual(toneSignal("y tuong tao bao")?.level, "bold");
    assert.strictEqual(toneSignal("hinh anh nang dong")?.level, "bold");
    // Single syllables never fold, so age and freshness cannot be mistaken for a
    // request: "tuoi" must reach neither "tươi" nor "tuổi".
    assert.strictEqual(toneSignal("do tuoi 25-34"), null);
    assert.strictEqual(toneSignal("nuoc rau ma tuoi mat"), null);
    assert.strictEqual(toneSignal("cong thuc manh"), null);
    // And the collision that folding creates is guarded: "sang" + "trong suốt"
    // is a transparent background, not a luxury register.
    assert.strictEqual(toneSignal("nen chuyen tu trang sang trong suot"), null);
    // The accented forms behave exactly as before.
    assert.strictEqual(toneSignal("phong cách sang trọng")?.level, "restrained");
    assert.strictEqual(toneSignal("độ tuổi 25-34"), null);
  });

  check("toneSignal groups premium|minimal restrained and bold|energetic bold", () => {
    assert.strictEqual(toneSignal("chai serum sang trọng")?.level, "restrained");
    assert.strictEqual(toneSignal("poster tối giản")?.level, "restrained");
    assert.strictEqual(toneSignal("poster táo bạo")?.level, "bold");
    assert.strictEqual(toneSignal("poster năng động")?.level, "bold");
  });

  check("toneSignal: two tones inside one group still signal that group", () => {
    assert.strictEqual(toneSignal("sang trọng và tối giản")?.level, "restrained");
    assert.strictEqual(toneSignal("bold và năng động")?.level, "bold");
  });

  check("toneSignal: mixed groups are no signal", () => {
    // NOTE: the brief's example phrase "bùng nổ" is not in the real keyword
    // table and matches nothing, so "năng động" is used as the energetic term.
    assert.strictEqual(toneSignal("sang trọng nhưng năng động"), null);
    assert.strictEqual(toneSignal("tối giản nhưng táo bạo"), null);
  });

  check("toneSignal: warm alone, and no tone at all, are no signal", () => {
    assert.strictEqual(toneSignal("ấm áp thân thiện"), null);
    assert.strictEqual(toneSignal("friendly"), null);
    assert.strictEqual(toneSignal("chai nước trên bàn gỗ"), null);
    assert.strictEqual(toneSignal(""), null);
    assert.strictEqual(toneSignal(null), null);
  });

  // ── 2. The inference table ────────────────────────────────────────────

  console.log("\n-- inference precedence --");

  const decide = (input: ApproachInput) => inferCreativeApproach(input);

  check("step 1: an explicit level wins over every other signal", () => {
    const d = decide({
      choice: "bold",
      concept: "poster sang trọng tối giản",
      brandStylePreferred: ["luxury", "minimal"],
      objective: "branding",
      assetType: "poster",
    });
    assert.strictEqual(d.level, "bold");
    assert.strictEqual(d.source, "user_selected");
    assert.deepStrictEqual(d.adjustments, []);
  });

  check("step 1: every level is selectable explicitly", () => {
    for (const level of APPROACH_LEVELS) {
      const d = decide({ choice: level, assetType: "poster" });
      assert.strictEqual(d.level, level);
      assert.strictEqual(d.source, "user_selected");
    }
  });

  check('step 1: "auto" and an absent choice both fall through', () => {
    assert.strictEqual(decide({ choice: "auto", assetType: "poster" }).source, "default");
    assert.strictEqual(decide({ assetType: "poster" }).source, "default");
    assert.strictEqual(decide({ choice: null, assetType: "poster" }).source, "default");
  });

  check("step 2: concept tone beats brand style and objective", () => {
    const d = decide({
      concept: "poster táo bạo",
      brandStylePreferred: ["luxury"],
      objective: "branding",
      assetType: "poster",
    });
    assert.strictEqual(d.level, "bold");
    assert.strictEqual(d.source, "concept_tone");
    assert.ok(d.reason_vi.includes("táo bạo"), `reason did not quote the match: ${d.reason_vi}`);
  });

  check("step 3: brand style is read when the concept is silent", () => {
    const d = decide({
      concept: "chai nước trên bàn gỗ",
      brandStylePreferred: ["minimal", "scandinavian"],
      objective: "promotion",
      assetType: "poster",
    });
    assert.strictEqual(d.level, "restrained");
    assert.strictEqual(d.source, "brand_style");
  });

  check("step 3: brand style follows the same mixed-group rule", () => {
    const d = decide({
      concept: "chai nước trên bàn gỗ",
      brandStylePreferred: ["luxury", "bold"],
      assetType: "poster",
    });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "default");
  });

  check("step 3: style.forbidden is ignored by the inference, by design", () => {
    // Documented in 07-creative-direction-result.md: a forbidden style is a
    // negative constraint and `DirectionEvaluator.ts:265-276` already penalises
    // routes for it. Reading it here would invert its meaning — "forbidden:
    // minimal" would argue FOR restrained.
    const d = decide({
      concept: "chai nước trên bàn gỗ",
      brandStylePreferred: [],
      brandStyleForbidden: ["minimal", "luxury"],
      assetType: "poster",
    });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "default");
  });

  check("step 4: branding is the only objective that moves the level", () => {
    const d = decide({ objective: "branding", assetType: "poster" });
    assert.strictEqual(d.level, "restrained");
    assert.strictEqual(d.source, "objective");
  });

  check("step 4: promotion, conversion and awareness stay balanced", () => {
    // Promotion needs a clear, high-contrast offer. That is clarity, not
    // creative boldness, so it must not be read as a licence to be inventive.
    for (const objective of ["promotion", "conversion", "awareness"] as const) {
      const d = decide({ objective, assetType: "poster" });
      assert.strictEqual(d.level, "balanced", `${objective} moved the level`);
      assert.strictEqual(d.source, "default", `${objective} claimed a source`);
    }
  });

  check("step 4: the objective list matches the real CampaignObjective union", () => {
    // Guards against a 5th objective being added to the type and silently
    // falling through this function unconsidered.
    const types = read("features/picture-engine/types/picture-engine.types.ts");
    const m = /export type CampaignObjective =([^;]*);/.exec(types);
    assert.ok(m, "CampaignObjective not found");
    const real = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    assert.deepStrictEqual(real, ["awareness", "branding", "conversion", "promotion"]);
  });

  check("step 5: nothing at all is balanced, by default", () => {
    const d = decide({});
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "default");
    assert.deepStrictEqual(d.adjustments, []);
  });

  // ── 3. Ceiling and veto ───────────────────────────────────────────────

  console.log("\n-- ceiling and veto --");

  const CEILING_VI = "Product Hero cần sản phẩm rõ ràng nên mức táo bạo bị giới hạn.";
  const VETO_VI = "Nội dung chữ dài nên bố cục không thể tối giản hoàn toàn.";

  check("ceiling: product_hero cannot be bold, even when chosen", () => {
    const d = decide({ choice: "bold", assetType: "product_hero" });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "user_selected");
    assert.strictEqual(d.adjustments.length, 1);
    assert.deepStrictEqual(d.adjustments[0], { from: "bold", to: "balanced", reason_vi: CEILING_VI });
  });

  check("ceiling: product_hero may still be restrained or balanced", () => {
    assert.strictEqual(decide({ choice: "restrained", assetType: "product_hero" }).level, "restrained");
    assert.deepStrictEqual(decide({ choice: "restrained", assetType: "product_hero" }).adjustments, []);
    assert.strictEqual(decide({ choice: "balanced", assetType: "product_hero" }).level, "balanced");
  });

  check("ceiling: it caps an inferred bold too", () => {
    const d = decide({ concept: "poster táo bạo", assetType: "product_hero" });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "concept_tone");
    assert.strictEqual(d.adjustments[0].reason_vi, CEILING_VI);
  });

  check("ceiling: every other asset type may be bold", () => {
    for (const assetType of ["poster", "social_ad", "banner", "billboard", "ugc_thumbnail"]) {
      const d = decide({ choice: "bold", assetType });
      assert.strictEqual(d.level, "bold", `${assetType} was capped`);
      assert.deepStrictEqual(d.adjustments, [], `${assetType} reported an adjustment`);
    }
  });

  check("veto: dense copy demotes restrained, even when chosen", () => {
    // A poster carries 3 strings (AssetProfile.ts:63). The 4th is what breaks it.
    const d = decide({
      choice: "restrained",
      assetType: "poster",
      copyStrings: ["Khởi động ngày mới", "Cold brew đậm vị", "Giảm 20%", "Mua ngay"],
    });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.source, "user_selected");
    assert.strictEqual(d.adjustments.length, 1);
    assert.deepStrictEqual(d.adjustments[0], { from: "restrained", to: "balanced", reason_vi: VETO_VI });
  });

  check("veto: copy inside the channel budget does not fire it", () => {
    const d = decide({
      choice: "restrained",
      assetType: "poster",
      copyStrings: ["Khởi động ngày mới", "Cold brew đậm vị", "Giảm 20%"],
    });
    assert.strictEqual(d.level, "restrained");
    assert.deepStrictEqual(d.adjustments, []);
  });

  check("veto: the threshold is the channel's own max_strings, not a constant", () => {
    // Derived from AssetProfile, so the per-channel budgets are what decide:
    // poster 3, banner 2, product_hero (hero family) 1.
    const strings = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);
    assert.strictEqual(decide({ choice: "restrained", assetType: "banner", copyStrings: strings(2) }).level, "restrained");
    assert.strictEqual(decide({ choice: "restrained", assetType: "banner", copyStrings: strings(3) }).level, "balanced");
    assert.strictEqual(decide({ choice: "restrained", assetType: "product_hero", copyStrings: strings(1) }).level, "restrained");
    assert.strictEqual(decide({ choice: "restrained", assetType: "product_hero", copyStrings: strings(2) }).level, "balanced");
  });

  check("ANCHOR DENSE: three strings but 69 words on a poster is dense", () => {
    // The case the string rule could not see. Three strings is INSIDE a poster's
    // allowance of three, so only the word budget catches it.
    const copy = [
      "VƯỢT KHỎI MỌI GIỚI HẠN - CHẠM ĐẾN SỰ TINH KHIẾT TỐI THƯỢNG.",
      "Trải nghiệm cảm giác nhẹ tựa lông hồng với bộ đôi quyền năng từ Madagascar. Kết cấu mỏng nhẹ lướt trên da, cuốn trôi mọi bụi bẩn mà không để lại cảm giác nhờn rít. Giải phóng làn da của bạn khỏi áp lực khói bụi thành thị ngay hôm nay.",
      "Freeship mọi đơn hàng từ 500k!",
    ];
    assert.strictEqual(copy.length, 3, "the fixture is no longer three strings");
    assert.ok(copyFitsChannel(profileFor("poster"), copy.length).fits, "the string rule already caught it, so this proves nothing");
    assert.strictEqual(countCopyWords(copy), 69);
    assert.ok(copyIsDense("poster", copy), "69 words on a poster was not dense");

    const d = decide({ choice: "restrained", assetType: "poster", copyStrings: copy });
    assert.strictEqual(d.level, "balanced");
    assert.strictEqual(d.adjustments.length, 1);
    assert.strictEqual(d.adjustments[0].reason_vi, VETO_VI);
  });

  check("ANCHOR OK: a headline and a CTA, 8-12 words, is not dense", () => {
    const samples: string[][] = [
      ["Slow mornings", "Cold brew, done properly", "Đặt ngay"], // 8 words, 3 strings
      ["Khởi động ngày mới", "Mua ngay"], // 6
      ["Thời gian của bạn", "Meridian 1904"], // 6
      ["Nghỉ một chút", "Đặt lịch"], // 5
      // 12 words, the top of the range the brief named.
      ["Trải nghiệm cold brew nguyên bản đậm vị mỗi sáng", "Mua ngay"],
    ];
    for (const copy of samples) {
      const words = countCopyWords(copy);
      assert.ok(words >= 5 && words <= 12, `${copy.join(" / ")} is ${words} words, outside the anchor`);
      assert.ok(!copyIsDense("poster", copy), `${words} words tripped the veto: ${copy.join(" / ")}`);
      const d = decide({ choice: "restrained", assetType: "poster", copyStrings: copy });
      assert.strictEqual(d.level, "restrained", `${copy.join(" / ")} was demoted`);
      assert.deepStrictEqual(d.adjustments, []);
    }
  });

  check("the string rule still works on its own, unchanged", () => {
    // Four short strings: 10 words, far inside the word budget, so the only thing
    // that can fire is the original string rule.
    const copy = ["Khởi động ngày mới", "Cold brew đậm vị", "Giảm 20%", "Mua ngay"];
    assert.ok(countCopyWords(copy) <= profileFor("poster").max_words, "this fixture no longer isolates the string rule");
    assert.ok(!copyFitsChannel(profileFor("poster"), copy.length).fits, "4 strings should break a poster");
    assert.ok(copyIsDense("poster", copy));
  });

  check("the word budget is the sum of the playbook budgets it was derived from", () => {
    // The number in AssetProfile is not an independent judgement: it is
    // headline + subline + cta from `prompt-v2/playbooks.ts`. If either file
    // moves, this fails instead of the two drifting apart.
    const profileSrc = read("lib/image-engine/evolution/experiment/AssetProfile.ts");
    const playbookSrc = read("lib/image-engine/prompt-v2/playbooks.ts");

    const declared = (family: string) => {
      const m = new RegExp(`${family}:\\s*\\{[^}]*?max_words:\\s*(\\d+)`, "s").exec(profileSrc);
      assert.ok(m, `${family} max_words not found`);
      return Number(m![1]);
    };
    const summed = (id: string) => {
      const m = new RegExp(
        `${id}:\\s*\\{[\\s\\S]*?copy_budget:\\s*\\{\\s*headline_max_words:\\s*(\\d+),\\s*subline_max_words:\\s*(\\d+),\\s*cta_max_words:\\s*(\\d+)`,
      ).exec(playbookSrc);
      assert.ok(m, `${id} copy_budget not found in playbooks.ts`);
      return Number(m![1]) + Number(m![2]) + Number(m![3]);
    };

    for (const family of ["poster", "banner", "social", "hero"]) {
      assert.strictEqual(
        declared(family),
        summed(family),
        `${family}: AssetProfile says ${declared(family)}, playbooks sum to ${summed(family)}`,
      );
    }
    // The measured values, pinned so a silent change to both files is still caught.
    assert.strictEqual(declared("poster"), 27);
    assert.strictEqual(declared("banner"), 22);
    assert.strictEqual(declared("social"), 19);
    assert.strictEqual(declared("hero"), 5);
  });

  check("the word veto fires per family, at that family's own budget", () => {
    const words = (n: number) => [Array.from({ length: n }, (_, i) => `t${i}`).join(" ")];
    // One string each time, so only the word rule can fire.
    assert.ok(!copyIsDense("poster", words(27)), "27 words is the poster budget, not over it");
    assert.ok(copyIsDense("poster", words(28)));
    assert.ok(!copyIsDense("banner", words(22)));
    assert.ok(copyIsDense("banner", words(23)));
    assert.ok(!copyIsDense("social_ad", words(19)));
    assert.ok(copyIsDense("social_ad", words(20)));
    assert.ok(!copyIsDense("product_hero", words(5)));
    assert.ok(copyIsDense("product_hero", words(6)));
  });

  check("word counting: punctuation does not inflate it, Vietnamese syllables count", () => {
    assert.strictEqual(countCopyWords(["Freeship mọi đơn hàng từ 500k!"]), 6);
    assert.strictEqual(countCopyWords(["VƯỢT KHỎI MỌI GIỚI HẠN - CHẠM ĐẾN SỰ TINH KHIẾT TỐI THƯỢNG."]), 12);
    assert.strictEqual(countCopyWords(["  spaced   out  "]), 2);
    assert.strictEqual(countCopyWords([]), 0);
    assert.strictEqual(countCopyWords(null), 0);
  });

  check("veto: those thresholds are the ones AssetProfile actually declares", () => {
    // If a profile's max_strings changes, this fails rather than the veto
    // quietly moving.
    const src = read("lib/image-engine/evolution/experiment/AssetProfile.ts");
    const budget = (family: string) => {
      const m = new RegExp(`${family}:\\s*\\{[^}]*?max_strings:\\s*(\\d+)`, "s").exec(src);
      assert.ok(m, `${family} max_strings not found`);
      return Number(m![1]);
    };
    assert.strictEqual(budget("poster"), 3);
    assert.strictEqual(budget("banner"), 2);
    assert.strictEqual(budget("hero"), 1);
  });

  check("veto: it does not fire on balanced or bold", () => {
    const many = ["a", "b", "c", "d", "e"];
    assert.deepStrictEqual(decide({ choice: "balanced", assetType: "poster", copyStrings: many }).adjustments, []);
    assert.deepStrictEqual(decide({ choice: "bold", assetType: "poster", copyStrings: many }).adjustments, []);
  });

  check("veto: empty copy is not dense", () => {
    assert.deepStrictEqual(decide({ choice: "restrained", assetType: "poster", copyStrings: [] }).adjustments, []);
    assert.deepStrictEqual(decide({ choice: "restrained", assetType: "poster" }).adjustments, []);
    // Blank lines are not strings the renderer has to draw. Six raw entries, of
    // which three are real: counted raw this would exceed the poster's budget of
    // 3 and trip the veto.
    assert.deepStrictEqual(
      decide({ choice: "restrained", assetType: "poster", copyStrings: ["a", "", "  ", "b", "", "c"] }).adjustments,
      [],
    );
    // And the fourth real string does trip it, so the filter is not just
    // swallowing everything.
    assert.strictEqual(
      decide({ choice: "restrained", assetType: "poster", copyStrings: ["a", "", "b", "c", "d"] }).level,
      "balanced",
    );
  });

  check("an explicit choice is overridden by nothing except ceiling and veto", () => {
    const d = decide({
      choice: "restrained",
      concept: "poster ấn tượng bold striking",
      brandStylePreferred: ["bold", "playful"],
      objective: "promotion",
      assetType: "poster",
      copyStrings: ["one"],
    });
    assert.strictEqual(d.level, "restrained");
    assert.strictEqual(d.source, "user_selected");
    assert.deepStrictEqual(d.adjustments, []);
  });

  // ── 4. The contract the UI and the engine both read ───────────────────

  console.log("\n-- shape and labels --");

  check("every decision carries a non-empty Vietnamese reason", () => {
    const inputs: ApproachInput[] = [
      { choice: "restrained" },
      { choice: "bold", assetType: "product_hero" },
      { concept: "sang trọng" },
      { brandStylePreferred: ["minimal"] },
      { objective: "branding" },
      {},
      { choice: "restrained", assetType: "poster", copyStrings: ["a", "b", "c", "d"] },
    ];
    for (const input of inputs) {
      const d = inferCreativeApproach(input);
      assert.ok(d.reason_vi.trim().length > 0, `empty reason for ${JSON.stringify(input)}`);
      assert.ok(APPROACH_LEVELS.includes(d.level), `bad level ${d.level}`);
      for (const a of d.adjustments) assert.ok(a.reason_vi.trim().length > 0, "empty adjustment reason");
    }
  });

  check("the three level labels are the ones the brief specified", () => {
    assert.strictEqual(LEVEL_LABEL_VI.restrained, "Tối giản & sang trọng");
    assert.strictEqual(LEVEL_LABEL_VI.balanced, "Cân bằng");
    assert.strictEqual(LEVEL_LABEL_VI.bold, "Táo bạo & sáng tạo");
  });

  check("the function is pure: the same input twice gives the same object", () => {
    const input: ApproachInput = {
      concept: "poster sang trọng",
      brandStylePreferred: ["minimal"],
      objective: "branding",
      assetType: "poster",
      copyStrings: ["a"],
    };
    assert.deepStrictEqual(inferCreativeApproach(input), inferCreativeApproach(input));
  });

  check("the module is isomorphic: no node-only import anywhere in its graph", () => {
    // The browser shows the suggestion and the server recomputes it, so a single
    // `fs` import in this graph would break the client bundle.
    for (const rel of [
      "lib/image-engine/director/CreativeApproach.ts",
      "lib/image-engine/director/ConceptStructuringLayer.ts",
      "lib/image-engine/evolution/experiment/AssetProfile.ts",
    ]) {
      const src = read(rel);
      assert.ok(!/from\s+"(?:node:)?(?:fs|path|os|crypto|child_process)"/.test(src), `${rel} imports a node module`);
      assert.ok(!/require\(/.test(src), `${rel} uses require()`);
    }
    // Only type-only imports may cross into the feature layer, so nothing is
    // pulled in at runtime.
    const src = read("lib/image-engine/director/CreativeApproach.ts");
    for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*from\s+"([^"]+)"/gm)) {
      assert.ok(
        !m[1].includes("features/"),
        `runtime import of the feature layer: ${m[1]} — make it "import type"`,
      );
    }
  });

  // ── 5. The mount, so defect 3 cannot return ───────────────────────────

  console.log("\n-- mount regression --");

  const PANEL = "features/picture-engine/components/brief/CreativeBriefPanel.tsx";
  const FORM = "features/picture-engine/components/brief/MarketingContextForm.tsx";

  check("the panel imports and renders MarketingContextForm", () => {
    const src = read(PANEL);
    assert.ok(/import\s*\{[^}]*MarketingContextForm[^}]*\}\s*from\s*"\.\/MarketingContextForm"/.test(src), "not imported");
    assert.ok(/<MarketingContextForm\b/.test(src), "not rendered");
  });

  check("a target_audience control is reachable from the panel", () => {
    // The exact defect: `AIStrategyPanel.tsx:73` printed "Chưa nhập đối tượng
    // cụ thể" because nothing rendered this control.
    const panel = read(PANEL);
    const m = /<MarketingContextForm\b[\s\S]*?\/>/.exec(panel);
    assert.ok(m, "the MarketingContextForm element was not found");
    assert.ok(/fields=\{\[[^\]]*"target_audience"[^\]]*\]\}/.test(m![0]), "target_audience is not in the fields list");
    assert.ok(/onChange\(\{\s*target_audience:/.test(read(FORM)), "the form has no target_audience writer");
  });

  check("the panel asks for objective as well", () => {
    const m = /<MarketingContextForm\b[\s\S]*?\/>/.exec(read(PANEL));
    assert.ok(/fields=\{\[[^\]]*"objective"[^\]]*\]\}/.test(m![0]), "objective is not in the fields list");
  });

  check("exactly one industry control: the panel's own inline one", () => {
    const panel = read(PANEL);
    const m = /<MarketingContextForm\b[\s\S]*?\/>/.exec(panel);
    assert.ok(!/"industry"/.test(m![0]), "the mounted form was asked to render industry too");
    const inline = [...panel.matchAll(/INDUSTRY_OPTIONS\.map/g)].length;
    assert.strictEqual(inline, 1, `the panel renders ${inline} industry lists`);
  });

  check("the form renders only the fields it is asked for", () => {
    const src = read(FORM);
    for (const field of ["industry", "objective", "target_audience", "target_channel"]) {
      assert.ok(
        new RegExp(`show\\("${field}"\\)`).test(src),
        `${field} is not gated by the fields list`,
      );
    }
  });

  check("the objective select can represent the unset default", () => {
    // `defaultCreativeBrief` ships `objective: ""`
    // (`picture-engine.store.ts:91`). Without an empty option the select would
    // display the first real objective while the state held "", so the panel
    // would show a choice the user never made.
    const src = read(FORM);
    assert.ok(/<option value="">/.test(src), "no empty option for the unset state");
  });

  check("the campaign-context block is collapsed and optional", () => {
    const panel = read(PANEL);
    assert.ok(/Bối cảnh chiến dịch \(không bắt buộc\)/.test(panel), "the title is missing");
    // Never a gate on rendering: the submit button's own condition is untouched.
    assert.ok(/disabled=\{!canGenerate \|\| isGenerating\}/.test(panel), "the render button's condition changed");
  });

  // ── 6. The field reaches the server ───────────────────────────────────

  console.log("\n-- data plumbing --");

  check("creative_approach is an optional field on CreativeDirection", () => {
    const src = read("features/picture-engine/types/picture-engine.types.ts");
    assert.ok(/creative_approach\?:\s*ApproachChoice/.test(src), "not declared optional on the type");
  });

  check("the zod schema accepts it and tolerates its absence", () => {
    const src = read("features/picture-engine/schemas/creative-brief.schema.ts").replace(/\s+/g, " ");
    const m = /creative_approach: z\.enum\(\[([^\]]*)\]\)\.optional\(\)/.exec(src);
    assert.ok(m, "the zod field is missing, not an enum, or not optional");
    const accepted = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    assert.deepStrictEqual(accepted, ["auto", "balanced", "bold", "restrained"]);
  });

  check("the client actually sends it", () => {
    // `creativeDirection` is NOT serialised whole: `picture-engine.api.ts:93` is
    // an explicit four-key allow-list, so a new field has to be named there or
    // it never leaves the browser.
    const src = read("features/picture-engine/services/picture-engine.api.ts");
    const m = /const creativeDirection = compact\(\{[\s\S]*?\}\);/.exec(src);
    assert.ok(m, "the creativeDirection compact() call was not found");
    assert.ok(/creative_approach:/.test(m![0]), "creative_approach is not in the allow-list");
  });

  check("the store default leaves it unset, so nothing changes for existing users", () => {
    const src = read("features/picture-engine/stores/picture-engine.store.ts");
    const m = /export const defaultCreativeBrief[\s\S]*?\n\};/.exec(src);
    assert.ok(m, "defaultCreativeBrief not found");
    const cd = /creative_direction:\s*\{[\s\S]*?\n\s{2}\},/.exec(m![0]);
    assert.ok(cd, "creative_direction block not found");
    assert.ok(
      !/creative_approach:\s*"(?:restrained|balanced|bold)"/.test(cd![0]),
      "the default pins a real level; absent or \"auto\" is required so goldens do not move",
    );
  });

  check("the route needs no change: creativeDirection is parsed whole", () => {
    const src = read("app/api/image/generate-simple/route.ts");
    assert.ok(
      /const cdRaw = formData\.get\("creativeDirection"\)[\s\S]{0,120}JSON\.parse\(cdRaw\)/.test(src),
      "the route no longer parses creativeDirection as one object",
    );
  });

  check("the tone the adapter already computes is no longer discarded", () => {
    // F3 of the analysis: `SimpleInputAdapterService.ts:317` parsed the concept
    // and threw `intent.tone` away. Observability only — copy roles unchanged.
    const src = read("lib/image-engine/service/SimpleInputAdapterService.ts");
    const m = /console\.log\("\[SIMPLE\]\[CONTENT_MESSAGE\]",[\s\S]*?\}\);/.exec(src);
    assert.ok(m, "the CONTENT_MESSAGE log was not found");
    assert.ok(/tone:\s*intent\.tone/.test(m![0]), "intent.tone is still discarded");
  });

  check("STEP 1 BOUNDARY: no prompt or engine behaviour depends on the level yet", () => {
    // Step 1 is display plus plumbing. Until the gate passes, nothing may read
    // the level on a path that reaches a prompt.
    for (const rel of [
      "lib/image-engine/evolution/ExperimentPipeline.ts",
      "lib/image-engine/llm/marketing-brain.service.ts",
      "lib/image-engine/evolution/experiment/AssetContext.ts",
      "lib/image-engine/evolution/experiment/DirectionEvaluator.ts",
    ]) {
      assert.ok(!/creative_approach|CreativeApproach/.test(read(rel)), `${rel} already reads the level`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
