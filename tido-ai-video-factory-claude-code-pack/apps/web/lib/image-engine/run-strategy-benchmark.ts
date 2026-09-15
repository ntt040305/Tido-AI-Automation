import fs from "fs";
import path from "path";

/**
 * Phase 4.1 — does strategy selection actually select?
 *
 * What this measures, and why these five things
 * ---------------------------------------------
 * Phase 4 removed the three fixed direction names and replaced them with the
 * routes each format offers. 160 unit tests prove the plumbing: the chosen route
 * reaches the decision, the candidate list does not leak, evidence that cannot
 * be quoted is downgraded. None of them prove the model chooses well, or chooses
 * differently, or chooses for a reason that belongs to this brief.
 *
 * That gap has a precedent in this project worth stating plainly. The previous
 * three directions were named Commercial Safe, Premium Brand and Creative
 * Exploration, and across seventeen runs Commercial Safe was selected zero
 * times — not because it was wrong, but because the block describing it was
 * written with a bias nobody noticed until somebody counted. Structure was fine.
 * Distribution was the defect, and only counting found it.
 *
 * So four of the five tests count distributions, and the fifth checks the cost.
 *
 * What it deliberately does NOT do
 * -------------------------------
 * It renders no images. Strategy selection happens in `CreativeDirectorV1.judge`,
 * before any pipeline stage, so the benchmark calls the director directly: no
 * provider, no 100 VND per sample, no ninety-second wait for a picture nothing
 * here looks at. It also adds no intelligence — every file it imports already
 * exists and is unmodified.
 *
 * Running it
 * ----------
 *   npx tsx lib/image-engine/run-strategy-benchmark.ts          # needs the gateway
 *   TIDO_STRATEGY_BENCH_MOCK=1 npx tsx ...                      # structure only
 *
 * Results are written to `data/benchmarks/strategy-<timestamp>.json` so a claim
 * about diversity can be checked later against the samples that produced it.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { CreativeDirectorV1 } = require("./evolution/experiment/CreativeDirectorV1");
const { assetContextBrief, assetContextFor, shuffleRoutes } = require("./evolution/experiment/AssetContext");
const { toCreativeDecision, applyCreativeDecision } = require("./evolution/experiment/CreativeDecision");
const { NanoBananaPromptComposer } = require("./evolution/experiment/NanoBananaPromptComposer");

const MOCK = process.env.TIDO_STRATEGY_BENCH_MOCK === "1";
const REPEATS = Number(process.env.TIDO_STRATEGY_BENCH_REPEATS || 3);

const ASSET_TYPES = ["poster", "social_ad", "banner", "product_hero", "ugc_thumbnail"];

/** Four products that should not be answered the same way. */
const PRODUCTS = [
  {
    id: "cold_brew",
    concept: "Ra mắt cold brew đóng chai cho Cafe Florian, bán mang đi buổi sáng",
    brandName: "Cafe Florian",
    audience: "nhân viên văn phòng 25-35 đi làm sớm",
    objective: "conversion",
  },
  {
    id: "serum",
    concept: "Giới thiệu serum Centella cho da nhạy cảm, nhấn vào thành phần dịu nhẹ",
    brandName: "Tido Skin",
    audience: "phụ nữ 25-40 có da dễ kích ứng",
    objective: "consideration",
  },
  {
    id: "sneaker",
    concept: "Mẫu giày chạy bộ mới, tập trung vào độ nảy của đế giữa",
    brandName: "Stride",
    audience: "người chạy phong trào, 20-35, chạy 3-5 buổi mỗi tuần",
    objective: "awareness",
  },
  {
    id: "power_tool",
    concept: "Máy khoan pin cho thợ chuyên nghiệp, nhấn vào thời lượng pin cả ca làm",
    brandName: "Vantek",
    audience: "thợ xây dựng và thợ điện làm nghề",
    objective: "consideration",
  },
];

interface Sample {
  test: string;
  asset_type: string;
  product_id: string;
  repeat: number;
  routes_offered: string[];
  selected: string | null;
  /** Position in the shuffled list the pipeline owns. */
  selected_position: number | null;
  /**
   * Position in the format's own table order. Tracked separately because the
   * asset context prints the routes a second time, unshuffled, so the canonical
   * order is visible to the model whether or not anyone intended it to be.
   */
  canonical_position: number | null;
  selection_reason: string;
  runner_up: string | null;
  candidates: number;
  director_ms: number;
  ok: boolean;
}

const samples: Sample[] = [];

/** Deterministic stand-in so the harness itself can be exercised without a gateway. */
let mockTick = 0;
function mockProvider() {
  return {
    async generateChatCompletion(messages: any[]) {
      // Only the block the pipeline shuffles. The asset context lists the same
      // routes again, in table order, so a looser match would read the wrong copy.
      const block = String(messages[1].content).split("ROUTES OFFERED FOR THIS FORMAT")[1] || "";
      const routes = [...block.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
      // Rotates rather than always answering first, so a harness bug that always
      // reports one route shows up as a harness bug rather than as a finding.
      const pick = routes[mockTick++ % Math.max(1, routes.length)] || "unknown";
      return JSON.stringify({
        strategy: {
          candidates: [{ route: pick, core_idea: "mock idea", why_this_route: "mock", assessment: {} }],
          selected: pick,
          selection_reason: `mock reason ${mockTick}`,
          runner_up: routes[(mockTick + 1) % Math.max(1, routes.length)] || "",
          why_not_runner_up: "mock",
          routes_offered: routes,
          routes_developed: [pick],
        },
      });
    },
  };
}

async function sampleOnce(
  test: string,
  assetType: string,
  product: (typeof PRODUCTS)[number],
  repeat: number
): Promise<Sample> {
  const ctx = assetContextFor(assetType, true);
  const routes: string[] = ctx?.possible_strategies ? shuffleRoutes(ctx.possible_strategies) : [];
  const brief = {
    assetContext: ctx ? assetContextBrief(ctx, { includeStrategies: true }) : undefined,
    concept: product.concept,
    brandName: product.brandName,
    useCase: assetType,
    aspectRatio: "1:1",
    objective: product.objective,
    audience: product.audience,
    routes,
  };
  const started = Date.now();
  // The triad stays off. Strategy selection replaces it rather than joining it,
  // and a run with both on measures two direction-generators arguing, which is
  // not the thing under test.
  const judgment = await new CreativeDirectorV1(MOCK ? mockProvider() : undefined).judge(brief, {
    exploration: false,
    reasoning: false,
    antiGeneric: false,
    strategySelection: true,
  });
  const st = judgment?.strategy;
  const selected = st?.selected ?? null;
  return {
    test,
    asset_type: assetType,
    product_id: product.id,
    repeat,
    routes_offered: routes,
    selected,
    selected_position: selected ? routes.indexOf(selected) : null,
    canonical_position: selected ? (ctx?.possible_strategies || []).indexOf(selected) : null,
    selection_reason: st?.selection_reason || "",
    runner_up: st?.runner_up ?? null,
    candidates: st?.candidates?.length ?? 0,
    director_ms: Date.now() - started,
    ok: Boolean(selected),
  };
}

/** Crude but adequate: token overlap after stripping punctuation. */
function similarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9À-ỹ]+/gi, " ")
        .split(" ")
        .filter((w) => w.length > 2)
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return Number((shared / Math.min(A.size, B.size)).toFixed(3));
}

let passed = 0;
let failed = 0;
const verdicts: string[] = [];
function gate(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
  }
  console.log(`        ${detail}`);
  verdicts.push(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
}

(async () => {
  console.log("=".repeat(78));
  console.log("Phase 4.1 — Creative Strategy Validation");
  console.log("=".repeat(78));
  console.log(`  mode      : ${MOCK ? "MOCK (structure only, no gateway)" : "LIVE"}`);
  console.log(`  repeats   : ${REPEATS}`);
  console.log(`  director  : ${process.env.LLM_DIRECTOR_TIMEOUT_MS || 60000}ms budget`);
  console.log("");

  // ── 1. validity across asset types ───────────────────────
  //
  // Not "are the five answers different". The five formats share no routes at
  // all — 28 routes, 28 distinct, zero overlap — so distinctness across formats
  // is guaranteed by the table and would pass on a model answering at random.
  // What is NOT guaranteed is that each format is answered from its own list:
  // an invented route, or one borrowed from another format, is the failure that
  // can actually happen here, and only this test would see it.
  console.log("TEST 1 — every format is answered from its own list");
  console.log("");
  for (const t of ASSET_TYPES) {
    for (let r = 1; r <= Math.min(2, REPEATS); r++) {
      samples.push(await sampleOnce("validity_asset", t, PRODUCTS[0], r));
    }
  }
  const byAsset = samples.filter((s) => s.test === "validity_asset");
  const valid = byAsset.filter((s) => s.selected && s.routes_offered.includes(s.selected));
  const invented = byAsset.filter((s) => s.selected && !s.routes_offered.includes(s.selected));
  for (const s of byAsset) {
    const mark = s.selected && s.routes_offered.includes(s.selected) ? "  " : "!!";
    console.log(`    ${mark} ${s.asset_type.padEnd(15)} ${s.selected ?? "(none)"}`);
  }
  gate(
    "The chosen route is one of the routes offered",
    byAsset.length > 0 && invented.length === 0 && valid.length === byAsset.length,
    `${valid.length}/${byAsset.length} valid, ${invented.length} invented or borrowed (need 0 invented)`
  );
  // Reported, not gated: the table makes this true by construction, and a gate
  // that cannot fail is worse than no gate because it reads like evidence.
  const distinctAsset = new Set(byAsset.map((s) => s.selected).filter(Boolean)).size;
  console.log(`    distinct routes across formats: ${distinctAsset} (route sets are disjoint, so this is structural, not a result)`);

  // ── 2. adaptation across products ───────────────────────────────────────
  console.log("\nTEST 2 — strategy adaptation across products, one format\n");
  for (const p of PRODUCTS) {
    samples.push(await sampleOnce("adaptation_product", "social_ad", p, 1));
  }
  const byProduct = samples.filter((s) => s.test === "adaptation_product");
  const productRoutes = byProduct.map((s) => s.selected).filter(Boolean) as string[];
  const distinctProduct = new Set(productRoutes).size;
  for (const s of byProduct) console.log(`    ${s.product_id.padEnd(12)} ${s.selected ?? "(none)"}`);
  gate(
    "Different products in one format are answered differently",
    distinctProduct >= 3,
    `${distinctProduct}/4 distinct routes (need >= 3)`
  );

  // ── 3. selection_reason specificity ─────────────────────────────────────
  console.log("\nTEST 3 — is the reason about THIS brief\n");
  const reasons = byProduct.filter((s) => s.selection_reason);
  let crossMax = 0;
  const pairs: string[] = [];
  for (let i = 0; i < reasons.length; i++) {
    for (let j = i + 1; j < reasons.length; j++) {
      const sim = similarity(reasons[i].selection_reason, reasons[j].selection_reason);
      crossMax = Math.max(crossMax, sim);
      pairs.push(`${reasons[i].product_id}/${reasons[j].product_id}=${sim}`);
    }
  }
  console.log(`    pairwise similarity: ${pairs.join("  ") || "(no reasons)"}`);
  gate(
    "A reason written for one product does not fit another",
    reasons.length >= 2 && crossMax < 0.5,
    `highest cross-product similarity ${crossMax} (need < 0.5)`
  );

  // The reason must name something the brief actually said.
  const grounded = reasons.filter((s) => {
    const p = PRODUCTS.find((x) => x.id === s.product_id)!;
    const anchors = [p.audience, p.objective, ...p.concept.split(/\s+/).filter((w) => w.length > 5)];
    return anchors.some((a) => a && s.selection_reason.toLowerCase().includes(String(a).toLowerCase().slice(0, 12)));
  });
  console.log(`    grounded in the brief: ${grounded.length}/${reasons.length}`);
  gate(
    "The reason quotes something the brief supplied",
    reasons.length > 0 && grounded.length / reasons.length >= 0.75,
    `${grounded.length}/${reasons.length} name the audience, the objective or the product (need >= 75%)`
  );

  // ── 4. route distribution and position bias ─────────────────────────────
  console.log("\nTEST 4 — distribution, and whether position decides\n");
  for (let r = 1; r <= REPEATS; r++) {
    for (const p of PRODUCTS.slice(0, 2)) {
      samples.push(await sampleOnce("distribution", "banner", p, r));
    }
  }
  const dist = samples.filter((s) => s.test === "distribution" && s.selected);
  const counts = new Map<string, number>();
  for (const s of dist) counts.set(s.selected!, (counts.get(s.selected!) || 0) + 1);
  const topShare = dist.length ? Math.max(...counts.values()) / dist.length : 1;
  for (const [route, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(2)}x  ${route}`);
  }
  gate(
    "No single route dominates the format",
    dist.length > 0 && topShare <= 0.6,
    `most-chosen route took ${(topShare * 100).toFixed(0)}% of ${dist.length} samples (need <= 60%)`
  );

  // The routes are shuffled every call, so if position still predicts the
  // choice, the list is being read as a ranking.
  const posCounts = new Map<number, number>();
  for (const s of dist) posCounts.set(s.selected_position!, (posCounts.get(s.selected_position!) || 0) + 1);
  const firstShare = dist.length ? (posCounts.get(0) || 0) / dist.length : 0;
  console.log(`    chosen from position 0: ${(firstShare * 100).toFixed(0)}%`);
  gate(
    "Position in the shuffled list does not decide the choice",
    dist.length > 0 && firstShare <= 0.45,
    `first-offered route chosen ${(firstShare * 100).toFixed(0)}% of the time (need <= 45%, chance is ~20%)`
  );

  // The shuffle only protects against the order the pipeline controls. The asset
  // context prints the same routes again in table order, so the canonical first
  // route is also sitting in the prompt looking like a default.
  const canonCounts = new Map<number, number>();
  for (const s of dist) canonCounts.set(s.canonical_position!, (canonCounts.get(s.canonical_position!) || 0) + 1);
  const canonFirst = dist.length ? (canonCounts.get(0) || 0) / dist.length : 0;
  console.log(`    chosen from canonical position 0: ${(canonFirst * 100).toFixed(0)}%`);
  gate(
    "The format's own table order does not decide the choice either",
    dist.length > 0 && canonFirst <= 0.45,
    `first route in the table chosen ${(canonFirst * 100).toFixed(0)}% of the time (need <= 45%)`
  );

  // ── 5. prompt size impact ───────────────────────────────────────────────
  console.log("\nTEST 5 — what the strategy costs the prompt\n");
  const withStrategy = samples.find((s) => s.test === "validity_asset" && s.ok);
  const compiled = [
    "## ROLE",
    "Make a commercial photograph.",
    "## PRODUCT INSTANCE REQUIREMENTS",
    "DISTINCT PRODUCT IDENTITY ISOLATION: each PRODUCT_xx is a separate physical identity.",
    "## FINAL OUTPUT",
    "Render it.",
  ].join("\n");
  const fakeJudgment: any = withStrategy
    ? {
        directions: [],
        selected: "",
        strategy: {
          selected: withStrategy.selected,
          selection_reason: withStrategy.selection_reason,
          why_not_runner_up: "",
          candidates: [],
          routes_offered: withStrategy.routes_offered,
          routes_developed: [],
        },
      }
    : null;
  const base = NanoBananaPromptComposer.compose(compiled, { directions: [], selected: "" } as any, false, undefined);
  const withStrat = fakeJudgment
    ? NanoBananaPromptComposer.compose(compiled, fakeJudgment, false, undefined)
    : base;
  const growth = withStrat.length - base.length;
  const briefCtx = assetContextFor("banner", true)!;
  const briefV1 = assetContextBrief(assetContextFor("banner", false)!);
  const briefV2 = assetContextBrief(briefCtx, { includeStrategies: true });
  console.log(`    director brief  ${briefV1.length} -> ${briefV2.length} chars  (+${briefV2.length - briefV1.length})`);
  console.log(`    final prompt    ${base.length} -> ${withStrat.length} chars  (+${growth})`);
  gate(
    "The chosen route costs the final prompt little",
    growth < 800,
    `the strategy block adds ${growth} characters to the prompt (need < 800)`
  );
  gate(
    "The route list stays out of the prompt",
    !/routes_offered|works_against|candidates/.test(withStrat),
    "no candidate list, no assessments, no telemetry in the composed prompt"
  );

  // ── report ──────────────────────────────────────────────────────────────
  const usable = samples.filter((s) => s.ok).length;
  console.log("\n" + "-".repeat(78));
  console.log(`samples: ${samples.length}  usable: ${usable}  director median: ${
    samples.length
      ? [...samples].map((s) => s.director_ms).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
      : 0
  }ms`);
  if (usable < samples.length) {
    console.log(`WARNING: ${samples.length - usable} samples produced no strategy. Every gate above is`);
    console.log("         measured on what survived, which is not the same as what was asked.");
  }

  const outDir = path.join(process.cwd(), "data", "benchmarks");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `strategy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({ mode: MOCK ? "mock" : "live", repeats: REPEATS, verdicts, samples }, null, 2) + "\n",
      "utf-8"
    );
    console.log(`raw samples: ${file}`);
  } catch (err: any) {
    console.log(`raw samples NOT written: ${err?.message || err}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(78));
  if (failed > 0) process.exit(1);
})();
