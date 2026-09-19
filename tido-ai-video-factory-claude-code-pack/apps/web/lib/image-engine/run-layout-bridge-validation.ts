import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CommercialLayoutService } from "./service/CommercialLayoutService";
import { CreativeDirectorV1 } from "./evolution/experiment/CreativeDirectorV1";
import { buildLayoutContext, renderLayoutContext } from "./evolution/experiment/LayoutContextBridge";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { PromptBudgetManagerService } from "./service/PromptBudgetManagerService";
import { PromptBudgetValidator } from "./compiler/PromptBudgetValidator";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";
import {
  FORMAT_BIAS_BRIEFS,
  MULTI_PRODUCT_BRIEFS,
  OBJECTIVE_BRIEFS,
} from "./benchmark/layout-baseline-dataset";

/**
 * Phase 5.1 validation — does the bridge actually change layout decisions?
 *
 * Phase 5.1 could only answer half of this. The gateway was down, so benchmarks 2
 * and 3 ran against hand-written fixtures, which proved the bridge carries
 * variation and proved nothing about whether the director produces any. That
 * caveat was the weakest part of the last report. The gateway is up, so this run
 * replaces the fixtures with real director output.
 *
 * Benchmarks 1, 4 and 5 stay offline and deterministic. Benchmarks 2 and 3 each
 * cost four director calls at roughly nineteen seconds apiece; results are cached
 * to disk so a rerun is free and so the numbers below can be checked against the
 * answers that produced them.
 *
 *   npx tsx lib/image-engine/run-layout-bridge-validation.ts
 *   TIDO_LAYOUT_VALIDATION_REFRESH=1 npx tsx ...   # ignore the cache, call again
 *
 * A score here is a measurement, not a grade. The only pass/fail claims are in
 * benchmarks 4 and 5, where something can actually be broken.
 */

const REFRESH = process.env.TIDO_LAYOUT_VALIDATION_REFRESH === "1";
const CACHE = path.join(process.cwd(), "data", "benchmarks", "layout-validation-cache.json");

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const distinct = (xs: string[]) => new Set(xs).size;

/** Token overlap after stripping punctuation. Crude, and adequate for "is this the same sentence". */
function similarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(" ")
        .filter((w) => w.length > 3)
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return Number((shared / Math.min(A.size, B.size)).toFixed(3));
}

function maxPairwise(texts: string[]): { max: number; pairs: string[] } {
  let max = 0;
  const pairs: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const s = similarity(texts[i], texts[j]);
      max = Math.max(max, s);
      pairs.push(String(s));
    }
  }
  return { max, pairs };
}

const cache: Record<string, any> = (() => {
  try {
    return REFRESH ? {} : JSON.parse(fs.readFileSync(CACHE, "utf-8"));
  } catch {
    return {};
  }
})();
let liveCalls = 0;

async function judgeCached(key: string, brief: any, flags: any): Promise<CreativeJudgment | null> {
  if (cache[key]) return cache[key];
  liveCalls++;
  const started = Date.now();
  const j = await new CreativeDirectorV1().judge(brief, flags);
  process.stdout.write(`      [live ${Math.round((Date.now() - started) / 1000)}s] ${key}\n`);
  if (j) cache[key] = j;
  return j;
}

function planOf(format: string, objective?: string, copyItems?: string[], hasLogoAsset?: boolean) {
  return CommercialLayoutService.plan({
    assetType: format,
    aspectRatio: "4:5",
    copyItems,
    hasLogoAsset,
    objective,
  });
}

/** Everything the renderer is told about layout: the plan's reasoning plus the bridge block. */
function layoutContextOf(args: {
  format: string;
  objective?: string;
  copyItems?: string[];
  hasLogoAsset?: boolean;
  productCount: number;
  judgment: CreativeJudgment | null;
}) {
  const plan = planOf(args.format, args.objective, args.copyItems, args.hasLogoAsset);
  const planReasoning = [
    plan.eye_flow,
    plan.negative_space_strategy,
    ...plan.visual_priority.map((p) => `${p.element}:${p.role}`),
  ].join("|");
  const block = renderLayoutContext(
    buildLayoutContext({ judgment: args.judgment, productCount: args.productCount })
  );
  return {
    plan,
    planReasoning,
    planFp: sha(planReasoning),
    block,
    contextFp: sha(`${planReasoning}|${block}`),
    hierarchy: plan.hierarchy.join(" > "),
  };
}

const report: any = { phase: "5.1-validation", generated: new Date().toISOString(), benchmarks: {} };
let assertionsPassed = 0;
let assertionsFailed = 0;
function assertion(name: string, ok: boolean, detail: string) {
  if (ok) assertionsPassed++;
  else assertionsFailed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`        ${detail}`);
}

(async () => {
  console.log("=".repeat(78));
  console.log("Phase 5.1 Validation — does the bridge change layout decisions?");
  console.log("=".repeat(78));
  console.log(`  cache: ${REFRESH ? "ignored (refreshing)" : Object.keys(cache).length + " cached judgments"}`);
  console.log("");

  // ── 1. product count sensitivity ──────────────────────────────────────────
  console.log("BENCHMARK 1 — product count, everything else held constant\n");
  const b1 = MULTI_PRODUCT_BRIEFS.map((b, i) =>
    layoutContextOf({
      format: "poster",
      objective: b.objective,
      copyItems: b.copyItems,
      hasLogoAsset: b.hasLogoAsset,
      productCount: i + 1,
      judgment: null,
    })
  );
  console.log(`    ${"products".padEnd(11)}${"plan".padEnd(15)}${"hierarchy".padEnd(40)}context`);
  b1.forEach((r, i) => {
    console.log(`    ${String(i + 1).padEnd(11)}${r.planFp.padEnd(15)}${r.hierarchy.padEnd(40)}${r.contextFp}`);
  });
  const b1PlanD = distinct(b1.map((r) => r.planFp));
  const b1HierD = distinct(b1.map((r) => r.hierarchy));
  const b1CtxD = distinct(b1.map((r) => r.contextFp));
  const layoutVariationScore = Number((b1CtxD / b1.length).toFixed(2));
  console.log(
    `\n    plan reasoning ${b1PlanD}/4 distinct   hierarchy ${b1HierD}/4   full layout context ${b1CtxD}/4`
  );
  console.log(`    LAYOUT VARIATION SCORE: ${layoutVariationScore}  (was 0.25 at Phase 5.0)`);
  report.benchmarks.b1 = { plan: b1PlanD, hierarchy: b1HierD, context: b1CtxD, score: layoutVariationScore };

  // ── 2. strategy sensitivity, live ─────────────────────────────────────────
  console.log("\nBENCHMARK 2 — one product, four campaign goals (LIVE director)\n");
  const b2: { label: string; block: string; layoutText: string; ctxFp: string }[] = [];
  for (const brief of OBJECTIVE_BRIEFS) {
    const j = await judgeCached(
      `b2:${brief.id}`,
      {
        concept: brief.product,
        brandName: brief.brand,
        useCase: "poster",
        aspectRatio: "4:5",
        objective: brief.objective,
        audience: brief.audience,
      },
      { exploration: false, reasoning: false, antiGeneric: false, consumer: true, brand: true }
    );
    const r = layoutContextOf({
      format: "poster",
      objective: brief.objective,
      hasLogoAsset: brief.hasLogoAsset,
      productCount: 1,
      judgment: j,
    });
    const ctx = buildLayoutContext({ judgment: j, productCount: 1 });
    b2.push({
      label: brief.label,
      block: r.block,
      // The layout-relevant reasoning only, which is what benchmark 2 asks about.
      layoutText: [...(ctx?.creative_purpose || []), ...(ctx?.viewer_state || [])].join(" "),
      ctxFp: r.contextFp,
    });
  }
  for (const r of b2) {
    console.log(`    ${r.label.padEnd(32)}${r.ctxFp}  ${r.layoutText.length} chars`);
  }
  const b2Sim = maxPairwise(b2.map((r) => r.layoutText));
  const trustVsDesire = similarity(b2[0].layoutText, b2[1].layoutText);
  const strategyScore = Number((1 - b2Sim.max).toFixed(2));
  console.log(`\n    pairwise similarity: ${b2Sim.pairs.join("  ")}`);
  console.log(`    trust vs desire: ${trustVsDesire}   (Phase 5.0: identical, similarity 1.0)`);
  console.log(`    distinct layout contexts: ${distinct(b2.map((r) => r.ctxFp))}/4`);
  console.log(`    STRATEGY DIFFERENTIATION SCORE: ${strategyScore}`);
  console.log("\n    What trust and desire now say, verbatim:\n");
  for (const i of [0, 1]) {
    console.log(`      ${b2[i].label}`);
    for (const line of b2[i].layoutText.split(/(?=WHO IS LOOKING|WHAT THEY|WHAT EARNS|WHAT CREATES|THE FIRST|EMOTIONAL|THE ROUTE)/)) {
      if (line.trim()) console.log(`        ${line.trim().slice(0, 150)}`);
    }
    console.log("");
  }
  report.benchmarks.b2 = {
    trust_vs_desire: trustVsDesire,
    max_pairwise: b2Sim.max,
    distinct_contexts: distinct(b2.map((r) => r.ctxFp)),
    score: strategyScore,
  };

  // ── 3. product relationship sensitivity, live ─────────────────────────────
  console.log("BENCHMARK 3 — four groups of products, relationship NOT supplied (LIVE)\n");
  // The relationship is never stated in the brief. The director has to read it
  // out of what the products are; a benchmark that names it would be measuring
  // the fixture, which is what Phase 5.1 could only do.
  const REL_CASES = [
    { id: "family", label: "A — a range", concept: "Ba chai cold brew cùng một hạt, ba mức đậm nhạt khác nhau" },
    { id: "alternatives", label: "B — alternatives", concept: "Ba loại sữa để chọn pha cùng cà phê: sữa bò, sữa yến mạch, sữa hạnh nhân" },
    { id: "routine", label: "C — a routine", concept: "Bộ ba dùng buổi sáng: gói hạt xay sẵn, phin giấy, bình giữ nhiệt" },
    { id: "independent", label: "D — unrelated items", concept: "Ba mặt hàng đang giảm giá tuần này: cà phê chai, bánh quy bơ, ly sứ" },
  ];
  const b3: { label: string; relType: string; text: string; ctxFp: string }[] = [];
  for (const c of REL_CASES) {
    const j = await judgeCached(
      `b3:${c.id}`,
      {
        concept: c.concept,
        brandName: "Cafe Florian",
        useCase: "poster",
        aspectRatio: "4:5",
        objective: "Giới thiệu tới khách quen của quán",
        audience: "Khách quen của quán, 25-40",
        productCount: 3,
      },
      { exploration: false, reasoning: false, antiGeneric: false, multiProductStaging: true }
    );
    const ctx = buildLayoutContext({ judgment: j, productCount: 3 });
    const r = layoutContextOf({ format: "poster", productCount: 3, judgment: j, hasLogoAsset: true });
    b3.push({
      label: c.label,
      relType: j?.staging?.relationship?.relationship_type || "(none produced)",
      text: (ctx?.product_structure || []).join(" "),
      ctxFp: r.contextFp,
    });
  }
  for (const r of b3) {
    console.log(`    ${r.label.padEnd(22)}${r.relType.slice(0, 80)}`);
  }
  const b3Sim = maxPairwise(b3.map((r) => r.text));
  const relScore = Number((1 - b3Sim.max).toFixed(2));
  const b3Produced = b3.filter((r) => r.relType !== "(none produced)").length;
  console.log(`\n    relationships produced: ${b3Produced}/4`);
  console.log(`    distinct relationship phrasings: ${distinct(b3.map((r) => r.relType))}/4`);
  console.log(`    pairwise similarity of product structure: ${b3Sim.pairs.join("  ")}`);
  console.log(`    PRODUCT RELATIONSHIP DIFFERENTIATION SCORE: ${relScore}`);
  report.benchmarks.b3 = {
    produced: b3Produced,
    distinct: distinct(b3.map((r) => r.relType)),
    max_pairwise: b3Sim.max,
    score: relScore,
    relationships: b3.map((r) => ({ label: r.label, relationship_type: r.relType })),
  };

  // ── 4. prompt budget ──────────────────────────────────────────────────────
  console.log("\nBENCHMARK 4 — what it costs the prompt\n");
  // Real lengths, from the 100 renders this system has already logged.
  const logged = fs
    .readFileSync(path.join(process.cwd(), "data", "evolution", "generation-log.jsonl"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l).prompt_chars as number;
      } catch {
        return 0;
      }
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const p = (q: number) => logged[Math.floor(logged.length * q)] || 0;
  const blocks = [...b2.map((r) => r.block), ...b1.map((r) => r.block)].filter(Boolean);
  const maxBlock = Math.max(...blocks.map((b) => b.length), 0);
  const meanBlock = Math.round(blocks.reduce((t, b) => t + b.length, 0) / Math.max(1, blocks.length));
  const TH = {
    optimizer_hard_limit: ProviderPromptOptimizer.HARD_LIMIT,
    budget_emergency_target: PromptBudgetManagerService.EMERGENCY_TARGET,
    budget_hard_maximum: PromptBudgetManagerService.HARD_MAXIMUM,
    provider_hard_limit: PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT,
  };
  console.log(`    logged prompts (${logged.length} real renders): p50 ${p(0.5)}  p90 ${p(0.9)}  max ${logged[logged.length - 1]}`);
  console.log(`    layout context block: mean ${meanBlock}, max observed ${maxBlock}, hard cap 1600`);
  for (const q of [0.5, 0.9, 1.0]) {
    const base = q === 1.0 ? logged[logged.length - 1] : p(q);
    const after = base + maxBlock;
    console.log(
      `    ${(q === 1.0 ? "max" : `p${q * 100}`).padEnd(5)} ${base} -> ${after}  (+${((maxBlock / base) * 100).toFixed(1)}%)  ` +
        `provider limit ${TH.provider_hard_limit}: ${after > TH.provider_hard_limit ? "OVER" : "ok"}`
    );
  }
  assertion(
    "The block cannot by itself push a typical prompt over the provider limit",
    p(0.5) + 1600 <= TH.provider_hard_limit,
    `p50 ${p(0.5)} + worst-case block 1600 = ${p(0.5) + 1600}, provider limit ${TH.provider_hard_limit}`
  );
  // The honest question is not whether a long prompt plus the block is long. It
  // is how many prompts the block PUSHES over a line they were under. Prompts
  // already above it were already above it, and the bridge did not put them there.
  const alreadyOver = logged.filter((n) => n > TH.provider_hard_limit).length;
  const newlyOver = logged.filter(
    (n) => n <= TH.provider_hard_limit && n + 1600 > TH.provider_hard_limit
  ).length;
  assertion(
    "The block pushes few prompts across the provider limit",
    newlyOver / logged.length <= 0.15,
    `${newlyOver}/${logged.length} logged prompts would newly cross ${TH.provider_hard_limit} ` +
      `(${alreadyOver}/${logged.length} were already above it before the bridge existed)`
  );
  report.benchmarks.b4 = {
    logged_p50: p(0.5),
    logged_p90: p(0.9),
    logged_max: logged[logged.length - 1],
    block_mean: meanBlock,
    block_max_observed: maxBlock,
    block_cap: 1600,
    thresholds: TH,
    already_over_before_bridge: alreadyOver,
    newly_over_because_of_block: newlyOver,
  };

  // ── 5. stable isolation ───────────────────────────────────────────────────
  console.log("\nBENCHMARK 5 — stable isolation\n");
  const baselineFiles = fs
    .readdirSync(path.join(process.cwd(), "data", "benchmarks"))
    .filter((f) => f.startsWith("layout-baseline-"))
    .sort();
  let moved = 0;
  let same = 0;
  if (baselineFiles.length) {
    const baseline = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "benchmarks", baselineFiles[baselineFiles.length - 1]), "utf-8")
    );
    // All three groups. Omitting FORMAT_BIAS_BRIEFS resolved 35 of the 43
    // observations to an undefined brief, so they were replanned with no
    // objective and reported as moved while the service was untouched.
    const all = [...FORMAT_BIAS_BRIEFS, ...OBJECTIVE_BRIEFS, ...MULTI_PRODUCT_BRIEFS];
    for (const o of baseline.observations as any[]) {
      const brief = all.find((b) => b.id === o.id);
      const plan = planOf(o.format, brief?.objective, brief?.copyItems, brief?.hasLogoAsset);
      const fp = sha(
        [plan.eye_flow, plan.negative_space_strategy, ...plan.visual_priority.map((x) => `${x.element}:${x.role}`)].join("|")
      );
      if (fp === o.reasoning_fingerprint) same++;
      else moved++;
    }
  }
  assertion(
    "CommercialLayoutService still produces the Phase 5.0 output exactly",
    moved === 0 && same > 0,
    `${same}/${same + moved} fingerprints identical, ${moved} moved`
  );
  const bridgeOff = renderLayoutContext(buildLayoutContext({ judgment: null, productCount: 0 }));
  assertion(
    "The bridge is optional and inert when it has nothing to carry",
    bridgeOff === "",
    "a null judgment with no products produces no block at all"
  );
  for (const file of [
    ["service", "CommercialLayoutService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assertion(
      `${file[1]} does not know the bridge exists`,
      !/LayoutContextBridge|layout_context_bridge_v1|LAYOUT CONTEXT/.test(src),
      "no reference to the bridge, the flag or the block heading"
    );
  }
  report.benchmarks.b5 = { fingerprints_same: same, fingerprints_moved: moved };

  // ── write ─────────────────────────────────────────────────────────────────
  report.scores = {
    layout_variation: layoutVariationScore,
    strategy_differentiation: strategyScore,
    product_relationship_differentiation: relScore,
  };
  report.live_calls = liveCalls;
  try {
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n", "utf-8");
    const out = path.join(
      process.cwd(),
      "data",
      "benchmarks",
      `layout-validation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf-8");
    console.log(`\nreport: ${out}`);
    console.log(`cache:  ${CACHE} (${liveCalls} live calls this run)`);
  } catch (err: any) {
    console.log(`\nreport NOT written: ${err?.message || err}`);
  }

  console.log("");
  console.log("=".repeat(78));
  console.log(
    `scores — layout ${layoutVariationScore}  strategy ${strategyScore}  relationship ${relScore}   ` +
      `| ${assertionsPassed} assertions passed, ${assertionsFailed} failed`
  );
  console.log("=".repeat(78));
})();
