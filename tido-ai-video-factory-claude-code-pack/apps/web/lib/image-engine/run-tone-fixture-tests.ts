/**
 * Tone precision — measured on realistic concepts, not on handpicked words.
 *
 * Why this file is separate from `run-creative-approach-tests.ts`
 * -------------------------------------------------------------
 * That suite pins behaviour one rule at a time. This one measures **precision and
 * recall** over a corpus, which is the only thing that can tell us whether the
 * strong/weak split in `director/tone-strength.ts` actually helps. The two answer
 * different questions and fail for different reasons.
 *
 * The honesty rule for this file
 * -----------------------------
 * Every expectation below was written down BEFORE the detector was run against
 * it, and expectations are never edited to make the suite green. Where the
 * detector and the fixture disagree, the fixture stays and the disagreement is
 * printed, counted, and carried into
 * `docs/migration/07-creative-direction-result.md`. A fixture tuned to pass
 * measures nothing.
 *
 * `ALLOWED_DISAGREEMENTS` is the one escape hatch, and it is an explicit list of
 * named cases with a reason each — not a tolerance threshold. A new disagreement
 * fails the suite.
 */
import assert from "assert";

import { toneSignal } from "./director/CreativeApproach";
import {
  STRONG_TERMS,
  WEAK_TERMS,
  FOLDED_TERMS,
  strongTonesIn,
  stripAccents,
} from "./director/tone-strength";
import { ConceptStructuringLayer } from "./director/ConceptStructuringLayer";

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

/** restrained | bold | null — what a careful human would expect of this brief. */
type Expected = "restrained" | "bold" | null;

interface Fixture {
  id: string;
  /** vn = with diacritics, vn_plain = without, en = English, mixed = both languages. */
  lang: "vn" | "vn_plain" | "en" | "mixed";
  text: string;
  expect: Expected;
  /** Why a human says so. Written with the expectation, before any run. */
  because: string;
}

/**
 * 34 concepts. The three groups that matter are the ones that used to be wrong:
 * product attributes read as treatment, goals read as treatment, and mixed intent.
 */
const FIXTURES: Fixture[] = [
  // ── 1. The two real strings from the product ────────────────────────────
  {
    id: "real-ui-saturn-water",
    lang: "vn",
    text:
      "kiểu mất trọng lượng ngoài vũ trụ. Nước tinh khiết bắn tung tóe nhưng tạo thành một vòng tròn bao quanh 2 chai giống như vành đai của sao Thổ vậy. Mấy cái lá rau má cũng đang bay lơ lửng xoay vòng vòng. Nền phía sau chuyển từ trắng sang xanh ngọc nhạt, nhìn ảo diệu vào.",
    expect: null,
    because:
      "describes a scene in detail and never states a treatment register; 'trọng' here is part of 'trọng lượng' and 'sang' is the preposition in 'sang xanh ngọc'",
  },
  {
    id: "real-form-placeholder",
    lang: "vn",
    text:
      "Chai serum cao cấp đặt trên bệ đá obsidian đen mờ, ánh sáng studio nghệ thuật tương phản cao, góc chụp 85mm",
    expect: null,
    because: "'cao cấp' is the product's tier; the rest is camera and lighting, not a boldness register",
  },

  // ── 2. Product attributes that must not signal ──────────────────────────
  {
    id: "attr-rau-ma-tuoi",
    lang: "vn",
    text: "Chai nước rau má tươi, nguyên liệu tươi mát hái trong ngày, đặt trên nền gỗ sáng",
    expect: null,
    because: "'tươi' and 'tươi mát' describe the ingredient, not the picture",
  },
  {
    id: "attr-do-tuoi",
    lang: "vn",
    text: "Sản phẩm dành cho độ tuổi 25-34, dùng hằng ngày",
    expect: null,
    because: "'tuổi' is age; it must not be read as 'tươi' under any folding",
  },
  {
    id: "attr-da-sach",
    lang: "vn",
    text: "Kem rửa mặt cho da sạch sâu, sạch mụn sau 7 ngày",
    expect: null,
    because: "'sạch' is a product claim about skin, not a clean layout",
  },
  {
    id: "attr-clean-beauty",
    lang: "en",
    text: "A clean beauty serum with a clean ingredient list, photographed on marble",
    expect: null,
    because: "'clean' here is the category claim, not the composition",
  },
  {
    id: "attr-cong-thuc-manh",
    lang: "vn",
    text: "Công thức mạnh gấp đôi, mùi hương mạnh và bền lâu",
    expect: null,
    because: "'mạnh' is potency, not a bold treatment",
  },
  {
    id: "attr-premium-ingredients",
    lang: "en",
    text: "Premium Madagascar vanilla, premium glass bottle, on a wooden table",
    expect: null,
    because: "'premium' is the tier claim, the English of 'cao cấp'",
  },
  {
    id: "attr-noi-bat-goal",
    lang: "vn",
    text: "Muốn sản phẩm nổi bật giữa kệ hàng siêu thị",
    expect: null,
    because: "'nổi bật' is the goal of every ad; it prescribes no treatment",
  },
  {
    id: "attr-vui-generic",
    lang: "vn",
    text: "Một bức ảnh vui cho dịp sinh nhật thương hiệu",
    expect: null,
    because: "'vui' is a generic adjective",
  },
  {
    id: "attr-an-tuong-goal",
    lang: "vn",
    text: "Tôi muốn một tấm ảnh ấn tượng để chạy quảng cáo",
    expect: null,
    because: "'ấn tượng' is a desired effect, the same kind of word as 'nổi bật'",
  },
  {
    id: "attr-gay-chu-y-goal",
    lang: "vn",
    text: "Ảnh cần gây chú ý trên newsfeed",
    expect: null,
    because: "'gây chú ý' names attention, not light or composition",
  },

  // ── 3. Real restraint requests ──────────────────────────────────────────
  {
    id: "restrained-sang-trong",
    lang: "vn",
    text: "Poster nước hoa theo phong cách sang trọng, nền tối, một luồng sáng duy nhất",
    expect: "restrained",
    because: "'sang trọng' states the register the picture should have",
  },
  {
    id: "restrained-toi-gian",
    lang: "vn",
    text: "Bố cục tối giản, nhiều khoảng trống, chỉ một chai giữa khung",
    expect: "restrained",
    because: "'tối giản' is a layout instruction",
  },
  {
    id: "restrained-don-gian",
    lang: "vn",
    text: "Giữ mọi thứ đơn giản, không thêm đạo cụ nào",
    expect: "restrained",
    because: "'đơn giản' states the treatment",
  },
  {
    id: "restrained-luxury-en",
    lang: "en",
    text: "A luxury watch on black stone, one soft light from the left",
    expect: "restrained",
    because: "'luxury' is the aesthetic register here",
  },
  {
    id: "restrained-minimal-en",
    lang: "en",
    text: "Minimal composition, generous negative space, a single bottle",
    expect: "restrained",
    because: "'minimal' is a layout instruction",
  },
  {
    id: "restrained-elegant-en",
    lang: "en",
    text: "An elegant still life of the perfume bottle beside dried flowers",
    expect: "restrained",
    because: "'elegant' names the treatment",
  },
  {
    id: "restrained-both-terms",
    lang: "vn",
    text: "Phong cách sang trọng và tối giản, tông màu trung tính",
    expect: "restrained",
    because: "two terms, one group — still restrained, not a conflict",
  },

  // ── 4. Real boldness requests ───────────────────────────────────────────
  {
    id: "bold-tao-bao",
    lang: "vn",
    text: "Tôi muốn một ý tưởng táo bạo, khác hẳn mọi quảng cáo sữa rửa mặt khác",
    expect: "bold",
    because: "'táo bạo' is exactly the word our own control offers the user",
  },
  {
    id: "bold-nang-dong",
    lang: "vn",
    text: "Hình ảnh năng động, chai nước đang bay giữa khung, bố cục chéo",
    expect: "bold",
    because: "'năng động' states a dynamic treatment",
  },
  {
    id: "bold-striking-en",
    lang: "en",
    text: "A striking asymmetric composition with hard shadows",
    expect: "bold",
    because: "'striking' with composition instructions is a treatment request",
  },
  {
    id: "bold-playful-en",
    lang: "en",
    text: "Playful arrangement of the three flavours, bright flat colours",
    expect: "bold",
    because: "'playful' is a design register",
  },
  {
    id: "bold-vibrant-en",
    lang: "en",
    text: "Vibrant colour blocking behind the can",
    expect: "bold",
    because: "'vibrant' describes the treatment of colour",
  },
  {
    id: "bold-bold-en",
    lang: "en",
    text: "Bold typography over the product, high contrast",
    expect: "bold",
    because: "'bold' as a design register",
  },

  // ── 5. Mixed intent: the brief contradicted itself ──────────────────────
  {
    id: "mixed-sang-trong-nang-dong",
    lang: "vn",
    text: "Phong cách sang trọng nhưng năng động",
    expect: null,
    because: "both groups asked for; only the person who wrote it can resolve it",
  },
  {
    id: "mixed-toi-gian-tao-bao",
    lang: "vn",
    text: "Bố cục tối giản nhưng ý tưởng táo bạo",
    expect: null,
    because: "restraint and boldness both stated",
  },
  {
    id: "mixed-luxury-playful-en",
    lang: "en",
    text: "A luxury feel but playful styling",
    expect: null,
    because: "both groups, in English",
  },

  // ── 6. Unaccented Vietnamese ────────────────────────────────────────────
  {
    id: "plain-sang-trong",
    lang: "vn_plain",
    text: "Poster nuoc hoa phong cach sang trong, nen toi mau",
    expect: "restrained",
    because: "a two-syllable strong term typed without diacritics",
  },
  {
    id: "plain-toi-gian",
    lang: "vn_plain",
    text: "Bo cuc toi gian, nhieu khoang trong",
    expect: "restrained",
    because: "'toi gian' is unambiguous",
  },
  {
    id: "plain-tao-bao",
    lang: "vn_plain",
    text: "Can mot y tuong tao bao",
    expect: "bold",
    because: "'tao bao' is unambiguous at two syllables",
  },
  {
    id: "plain-tuoi-mat",
    lang: "vn_plain",
    text: "Nuoc rau ma tuoi mat, nguyen lieu tuoi",
    expect: null,
    because: "'tuoi' is one syllable and must never fold to 'tươi'",
  },
  {
    id: "plain-do-tuoi",
    lang: "vn_plain",
    text: "San pham cho do tuoi 25-34",
    expect: null,
    because: "'tuoi' here is age; no folding may reach it",
  },
  {
    id: "plain-sang-trong-suot-collision",
    lang: "vn_plain",
    text: "Nen phia sau chuyen tu trang sang trong suot",
    expect: null,
    because:
      "'sang trong' appears, but as 'sang' + 'trong suốt' (becomes transparent) — a preposition, not 'sang trọng'",
  },

  // ── 7. Mixed-language and no-signal controls ────────────────────────────
  {
    id: "mixed-lang-luxury-vn",
    lang: "mixed",
    text: "Poster luxury cho dòng serum mới, nền đá cẩm thạch",
    expect: "restrained",
    because: "an English strong term inside a Vietnamese brief still states the register",
  },
  {
    id: "neutral-scene-only",
    lang: "vn",
    text: "Chai dầu gội đặt trên bệ đá, ánh sáng từ bên phải, nền xám",
    expect: null,
    because: "a scene with no register stated at all",
  },
  {
    id: "neutral-warm-only",
    lang: "vn",
    text: "Cảm giác ấm áp, thân thiện, gần gũi như bữa sáng gia đình",
    expect: null,
    because: "the warm group never signals how daring the frame should be",
  },
];

function main() {
  console.log("\n=== TONE FIXTURES ===\n");

  // ── The table, printed, so the report cannot drift from the code ────────
  console.log("-- the strong/weak split --");
  for (const g of STRONG_TERMS) {
    console.log(`  STRONG ${g.tone.padEnd(10)} ${g.terms.join(" · ")}`);
  }
  for (const w of WEAK_TERMS) {
    console.log(`  weak   ${w.tone.padEnd(10)} ${w.term.padEnd(12)} — ${w.why}`);
  }
  console.log(`  folded for unaccented input: ${FOLDED_TERMS.join(" · ")}`);

  check("every term in the real TONES table is classified exactly once", () => {
    // The guarantee that matters: a term added to `TONES` later cannot quietly
    // start, or stop, driving the creative approach. Read from the source so the
    // table itself is the reference.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "director", "ConceptStructuringLayer.ts"),
      "utf8",
    );
    const block = /const TONES[\s\S]*?\n\];/.exec(src);
    assert.ok(block, "the TONES table was not found");

    const tableTerms: string[] = [];
    for (const line of block![0].split("\n")) {
      const m = /vn\("([^"]+)"\),\s*tone:\s*"([^"]+)"/.exec(line);
      if (!m) continue;
      for (const alt of m[1].split("|")) {
        // "gây\\s?chú\\s?ý" -> "gây chú ý"
        tableTerms.push(alt.replace(/\\\\s\?/g, " ").replace(/\\s\?/g, " ").trim());
      }
    }
    assert.ok(tableTerms.length >= 25, `only ${tableTerms.length} table terms parsed`);

    const strong = new Set(STRONG_TERMS.flatMap((g) => g.terms));
    const weak = new Set(WEAK_TERMS.map((w) => w.term));
    const unclassified = tableTerms.filter((t) => !strong.has(t) && !weak.has(t));
    assert.deepStrictEqual(unclassified, [], `unclassified table terms: ${unclassified.join(", ")}`);

    for (const t of tableTerms) {
      assert.ok(!(strong.has(t) && weak.has(t)), `${t} is both strong and weak`);
    }
    console.log(`    (${tableTerms.length} table terms: ${strong.size} strong incl. additions, ${weak.size} weak)`);
  });

  check("every weak term carries a reason", () => {
    for (const w of WEAK_TERMS) {
      assert.ok(w.why.trim().length > 10, `${w.term} has no real reason`);
    }
  });

  check("no single-syllable Vietnamese term is strong", () => {
    // The precision rule in one assertion: a one-syllable Vietnamese word is
    // almost always a generic adjective or a product attribute.
    for (const g of STRONG_TERMS) {
      for (const term of g.terms) {
        if (/^[\x20-\x7e]+$/.test(term)) continue; // English terms are allowed to be one word
        assert.ok(term.split(/\s+/).length >= 2, `${term} is a single Vietnamese syllable and must be weak`);
      }
    }
  });

  check("no single-syllable term is ever accent-folded", () => {
    for (const term of FOLDED_TERMS) {
      assert.ok(term.split(/\s+/).length >= 2, `${term} is folded but has one syllable`);
    }
    assert.ok(!FOLDED_TERMS.includes("tươi"), "tươi must never be folded");
    assert.ok(!FOLDED_TERMS.includes("mạnh"), "mạnh must never be folded");
  });

  // ── Precision and recall over the corpus ────────────────────────────────

  /**
   * Known, named disagreements between a fixture and the detector.
   *
   * Empty is the goal. A case may only be listed here with a reason, and listing
   * one does not hide it: it is printed and carried into the report.
   */
  const ALLOWED_DISAGREEMENTS: Record<string, string> = {};

  console.log("\n-- corpus --");

  type Result = { f: Fixture; got: Expected };
  const results: Result[] = FIXTURES.map((f) => ({ f, got: (toneSignal(f.text)?.level ?? null) as Expected }));
  const disagreements = results.filter((r) => r.got !== r.f.expect);

  check("no duplicate fixture ids", () => {
    const ids = FIXTURES.map((f) => f.id);
    assert.strictEqual(new Set(ids).size, ids.length, "duplicate id");
  });

  check("the corpus is at least 30 concepts and covers all four input languages", () => {
    assert.ok(FIXTURES.length >= 30, `only ${FIXTURES.length} fixtures`);
    for (const lang of ["vn", "vn_plain", "en", "mixed"] as const) {
      assert.ok(FIXTURES.some((f) => f.lang === lang), `no ${lang} fixture`);
    }
    for (const expect of ["restrained", "bold", null] as const) {
      assert.ok(FIXTURES.some((f) => f.expect === expect), `no fixture expecting ${expect}`);
    }
  });

  // Precision and recall, per class, treating "no signal" as the negative class.
  const classes: Exclude<Expected, null>[] = ["restrained", "bold"];
  console.log("\n  class        TP  FP  FN   precision  recall");
  const metrics: Record<string, { p: number; r: number; tp: number; fp: number; fn: number }> = {};
  for (const cls of classes) {
    const tp = results.filter((r) => r.f.expect === cls && r.got === cls).length;
    const fp = results.filter((r) => r.f.expect !== cls && r.got === cls).length;
    const fn = results.filter((r) => r.f.expect === cls && r.got !== cls).length;
    const p = tp + fp === 0 ? 1 : tp / (tp + fp);
    const r = tp + fn === 0 ? 1 : tp / (tp + fn);
    metrics[cls] = { p, r, tp, fp, fn };
    console.log(
      `  ${cls.padEnd(12)} ${String(tp).padStart(2)}  ${String(fp).padStart(2)}  ${String(fn).padStart(2)}   ` +
        `${(p * 100).toFixed(1).padStart(8)}%  ${(r * 100).toFixed(1).padStart(5)}%`,
    );
  }
  const noSignalTotal = results.filter((r) => r.f.expect === null).length;
  const noSignalRight = results.filter((r) => r.f.expect === null && r.got === null).length;
  console.log(
    `  ${"no signal".padEnd(12)} ${String(noSignalRight).padStart(2)}  ${String(noSignalTotal - noSignalRight).padStart(2)}   -   ` +
      `${((noSignalRight / noSignalTotal) * 100).toFixed(1).padStart(8)}%      -`,
  );
  console.log(`\n  overall: ${results.length - disagreements.length}/${results.length} agree`);

  if (disagreements.length > 0) {
    console.log("\n  DISAGREEMENTS:");
    for (const d of disagreements) {
      console.log(`    ${d.f.id}: expected ${d.f.expect ?? "no signal"}, got ${d.got ?? "no signal"}`);
      console.log(`      because: ${d.f.because}`);
      const hits = strongTonesIn(d.f.text).map((h) => `${h.tone}="${h.match}"${h.unaccented ? " (unaccented)" : ""}`);
      console.log(`      matched: ${hits.length ? hits.join(", ") : "(nothing)"}`);
    }
  }

  check("every disagreement is a named, explained one", () => {
    const unexplained = disagreements.filter((d) => !(d.f.id in ALLOWED_DISAGREEMENTS));
    assert.deepStrictEqual(
      unexplained.map((d) => `${d.f.id}: want ${d.f.expect ?? "null"}, got ${d.got ?? "null"}`),
      [],
      "unexplained disagreement(s)",
    );
  });

  check("no product attribute or goal is read as a treatment (zero false positives)", () => {
    // The defect that prompted this round. Every fixture expecting no signal must
    // get no signal; a false positive here is the bug, not a rounding error.
    const falsePositives = results.filter((r) => r.f.expect === null && r.got !== null);
    assert.deepStrictEqual(
      falsePositives.map((r) => `${r.f.id} -> ${r.got}`),
      [],
      "a weak term drove the level",
    );
  });

  check("the two real strings from the product both yield no signal", () => {
    assert.strictEqual(toneSignal(FIXTURES[0].text), null, "the Saturn concept signalled");
    assert.strictEqual(toneSignal(FIXTURES[1].text), null, "the form placeholder signalled");
  });

  check("recall is perfect on explicit treatment requests", () => {
    for (const cls of classes) {
      assert.strictEqual(metrics[cls].fn, 0, `${cls} missed ${metrics[cls].fn} explicit request(s)`);
    }
  });

  // ── The old table is untouched ──────────────────────────────────────────

  console.log("\n-- parse() is unchanged --");

  check("parse() still reads every weak term exactly as it did", () => {
    // `intent.tone` has other readers. The split must not have reached them.
    assert.strictEqual(ConceptStructuringLayer.parse("Chai serum cao cấp").tone, "premium");
    assert.strictEqual(ConceptStructuringLayer.parse("rau má tươi").tone, "energetic");
    assert.strictEqual(ConceptStructuringLayer.parse("sản phẩm nổi bật").tone, "energetic");
    assert.strictEqual(ConceptStructuringLayer.parse("da sạch").tone, "minimal");
    assert.strictEqual(ConceptStructuringLayer.parse("công thức mạnh").tone, "bold");
    assert.strictEqual(ConceptStructuringLayer.parse("ảnh ấn tượng").tone, "bold");
  });

  check("tonesIn() still reports the full table, weak terms included", () => {
    // It is the faithful multi-read of `TONES` and stays that way; only the
    // inference switched to the strong set.
    const tones = ConceptStructuringLayer.tonesIn("serum cao cấp, rau má tươi").map((t) => t.tone);
    assert.deepStrictEqual(tones, ["premium", "energetic"]);
  });

  check("parse() does not match unaccented input, as before", () => {
    // The folding lives in `strongTonesIn` only.
    assert.strictEqual(ConceptStructuringLayer.parse("sang trong").tone, null);
    assert.strictEqual(ConceptStructuringLayer.parse("toi gian").tone, null);
    assert.deepStrictEqual(ConceptStructuringLayer.tonesIn("sang trong").map((t) => t.tone), []);
  });

  check("stripAccents handles đ, which NFD does not", () => {
    assert.strictEqual(stripAccents("đơn giản"), "don gian");
    assert.strictEqual(stripAccents("tối giản"), "toi gian");
    assert.strictEqual(stripAccents("táo bạo"), "tao bao");
    assert.strictEqual(stripAccents("sang trọng"), "sang trong");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
