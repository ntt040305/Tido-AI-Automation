import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CommercialLayoutService } from "./service/CommercialLayoutService";
import { buildLayoutContext, renderLayoutContext } from "./evolution/experiment/LayoutContextBridge";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";
import {
  MULTI_PRODUCT_BRIEFS,
  OBJECTIVE_BRIEFS,
  FORMAT_BIAS_BRIEFS,
} from "./benchmark/layout-baseline-dataset";

/**
 * Phase 5.1 — did the bridge change what the renderer is told about layout?
 *
 * Read the measurement design before the numbers, because the obvious way to run
 * this benchmark produces a flattering result that means nothing.
 *
 * The bridge does not touch `CommercialLayoutService`. Rerunning the Phase 5.0
 * script unchanged therefore reproduces Phase 5.0 exactly — 1/4 distinct for one
 * through four products — and reporting that as "no improvement" would be as
 * wrong as quietly rerunning a different measurement and reporting the
 * difference as progress. What changed is not the layout plan. It is the layout
 * CONTEXT that reaches the prompt, which is the plan block plus the bridge block.
 *
 * So this runs three separate things and keeps them apart:
 *
 *   A  The plan, unchanged. Proof that Stable was not touched, by measurement
 *      rather than by assertion.
 *   B  The context, with an EMPTY judgment. Nothing here is authored by me: the
 *      product count comes from the pipeline, so any differentiation is real.
 *   C  The context, with fixture judgments. This measures pass-through fidelity
 *      and NOTHING ELSE. The fixtures are hand-written, so distinctness in C is
 *      evidence that the bridge carries variation, never evidence that the
 *      director produces it. Only a live director run can show that.
 *
 *   npx tsx lib/image-engine/run-layout-bridge-benchmark.ts
 */

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const distinct = (xs: string[]) => new Set(xs).size;

/**
 * Must reproduce Phase 5.0's fingerprint exactly, or Part A compares two
 * different measurements and reports the difference as a regression.
 *
 * It did, on the first run: this added `importance` to the hash and forced
 * `hasLogoAsset`, and 43 of 43 fingerprints "moved" while the service under test
 * had not been opened. Kept verbatim from the baseline script rather than
 * rewritten, because a fingerprint is only a baseline if it is the same function.
 */
function planFingerprint(
  format: string,
  objective?: string,
  copyItems?: string[],
  hasLogoAsset?: boolean
): string {
  const plan = CommercialLayoutService.plan({
    assetType: format,
    aspectRatio: "4:5",
    copyItems,
    hasLogoAsset,
    objective,
  });
  return sha(
    [
      plan.eye_flow,
      plan.negative_space_strategy,
      ...plan.visual_priority.map((p) => `${p.element}:${p.role}`),
    ].join("|")
  );
}

/** Plan reasoning plus bridge block — what actually describes layout to the renderer. */
function contextFingerprint(args: {
  format: string;
  objective?: string;
  copyItems?: string[];
  hasLogoAsset?: boolean;
  productCount: number;
  judgment: CreativeJudgment | null;
}): { fp: string; chars: number; block: string } {
  const planFp = planFingerprint(args.format, args.objective, args.copyItems, args.hasLogoAsset);
  const block = renderLayoutContext(
    buildLayoutContext({ judgment: args.judgment, productCount: args.productCount })
  );
  return { fp: sha(`${planFp}|${block}`), chars: block.length, block };
}

const empty = (): CreativeJudgment =>
  ({ directions: [], selected: "", selection_reason: "" } as CreativeJudgment);

console.log("=".repeat(78));
console.log("Phase 5.1 — Layout Context Bridge, before and after");
console.log("=".repeat(78));
console.log("  offline, deterministic, no model, no render");
console.log("");

const report: any = { phase: "5.1", generated: new Date().toISOString(), parts: {} };

// ── A. the plan is untouched ────────────────────────────────────────────────
console.log("PART A — the layout plan itself, which the bridge does not touch\n");
const baselineFiles = fs
  .readdirSync(path.join(process.cwd(), "data", "benchmarks"))
  .filter((f) => f.startsWith("layout-baseline-"))
  .sort();
let baselineMatch = "no Phase 5.0 baseline found to compare against";
if (baselineFiles.length) {
  const baseline = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "benchmarks", baselineFiles[baselineFiles.length - 1]), "utf-8")
  );
  let same = 0;
  let moved = 0;
  for (const o of baseline.observations as any[]) {
    const brief =
      [...FORMAT_BIAS_BRIEFS, ...OBJECTIVE_BRIEFS, ...MULTI_PRODUCT_BRIEFS].find((b) => b.id === o.id);
    const fp = planFingerprint(o.format, brief?.objective, brief?.copyItems, brief?.hasLogoAsset);
    if (fp === o.reasoning_fingerprint) same++;
    else moved++;
  }
  baselineMatch = `${same}/${same + moved} plan fingerprints identical to the Phase 5.0 baseline, ${moved} moved`;
  console.log(`    ${baselineMatch}`);
  console.log(
    `    ${moved === 0 ? "PASS" : "FAIL"}  CommercialLayoutService produces byte-identical reasoning`
  );
  report.parts.A = { baselineFile: baselineFiles[baselineFiles.length - 1], same, moved };
} else {
  console.log(`    ${baselineMatch}`);
}

// ── B. product count, nothing authored ──────────────────────────────────────
console.log("\nPART B — one to four products, with an EMPTY judgment\n");
console.log("    Nothing in this table is hand-written. The count comes from the pipeline,");
console.log("    so any differentiation here is the bridge doing real work.\n");
const bBefore = MULTI_PRODUCT_BRIEFS.map((b) => planFingerprint("poster", b.objective, b.copyItems, b.hasLogoAsset));
const bAfter = MULTI_PRODUCT_BRIEFS.map((b, i) =>
  contextFingerprint({
    format: "poster",
    objective: b.objective,
    copyItems: b.copyItems,
    hasLogoAsset: b.hasLogoAsset,
    productCount: i + 1,
    judgment: empty(),
  })
);
console.log(`    ${"products".padEnd(12)}${"plan only".padEnd(16)}${"plan + context".padEnd(18)}context chars`);
for (let i = 0; i < 4; i++) {
  console.log(
    `    ${String(i + 1).padEnd(12)}${bBefore[i].padEnd(16)}${bAfter[i].fp.padEnd(18)}${bAfter[i].chars}`
  );
}
const bBeforeD = distinct(bBefore);
const bAfterD = distinct(bAfter.map((x) => x.fp));
console.log(`\n    before: ${bBeforeD}/4 distinct        after: ${bAfterD}/4 distinct`);
console.log(`    ${bAfterD > bBeforeD ? "IMPROVED" : "NO CHANGE"}`);
report.parts.B = { before: bBeforeD, after: bAfterD };

console.log("\n    What one and three products now say, verbatim:\n");
for (const n of [1, 3]) {
  const block = renderLayoutContext(buildLayoutContext({ judgment: empty(), productCount: n }));
  for (const line of block.split("\n").filter((l) => l && !l.startsWith("This section"))) {
    console.log(`      ${line}`);
  }
  console.log("");
}

// ── C. objective differentiation ────────────────────────────────────────────
console.log("PART C — trust versus desire\n");
const cEmpty = OBJECTIVE_BRIEFS.map((b) =>
  contextFingerprint({
    format: "poster",
    objective: b.objective,
    hasLogoAsset: b.hasLogoAsset,
    productCount: 1,
    judgment: empty(),
  })
);
const cEmptyD = distinct(cEmpty.map((x) => x.fp));
console.log(`    with an empty judgment:  ${cEmptyD}/4 distinct`);
console.log(`    Phase 5.0 measured 3/4, with trust and desire identical. The bridge alone`);
console.log(`    does not change that, and should not: it carries decisions and there are`);
console.log(`    none to carry. Differentiating trust from desire is the director's job.`);

// Fixtures. Hand-written, and labelled as such everywhere they are reported.
const FIXTURES: Record<string, Partial<CreativeJudgment>> = {
  coffee_trust: {
    consumer: { viewer: "người mua lần đầu", first_feeling: "nghi ngờ nhẹ", trust_driver: "thấy quy trình rang thật" } as any,
  },
  coffee_desire: {
    consumer: { viewer: "khách quen buổi sáng", first_feeling: "thèm", desire_driver: "hơi lạnh đọng trên vỏ chai" } as any,
  },
  coffee_purchase: {
    consumer: { viewer: "người đang đi làm", intended_action: "ghé mua trước 9h" } as any,
  },
  coffee_memory: {
    brand: { emotional_territory: "quán quen của khu phố" } as any,
  },
};
const cFixture = OBJECTIVE_BRIEFS.map((b) =>
  contextFingerprint({
    format: "poster",
    objective: b.objective,
    hasLogoAsset: b.hasLogoAsset,
    productCount: 1,
    judgment: { ...empty(), ...FIXTURES[b.id] } as CreativeJudgment,
  })
);
const cFixtureD = distinct(cFixture.map((x) => x.fp));
console.log(`\n    with hand-written fixture judgments:  ${cFixtureD}/4 distinct`);
console.log(`    PASS-THROUGH ONLY. The fixtures are written by hand, so this shows the`);
console.log(`    bridge carries variation. It is not evidence that the director produces it.`);
report.parts.C = { empty_judgment: cEmptyD, fixture_passthrough: cFixtureD, fixtures_are_hand_written: true };

// ── cost ────────────────────────────────────────────────────────────────────
console.log("\nPART D — what it costs the prompt\n");
const costs = [1, 2, 3, 4].map(
  (n) => renderLayoutContext(buildLayoutContext({ judgment: empty(), productCount: n })).length
);
const rich = renderLayoutContext(
  buildLayoutContext({
    judgment: {
      ...empty(),
      staging: {
        relationship: {
          relationship_type: "một dải ba vị từ cùng một hạt",
          strategic_reason: "khách đã tin hạt, chưa biết có ba vị",
          visual_implication: "ba chai đọc như một dải",
          hierarchy_implication: "chai gốc dẫn",
        },
        grouping: "gathered on one tray",
        depth_order: "chai gốc trước",
      } as any,
      consumer: { viewer: "khách quen", first_feeling: "tò mò", trust_driver: "thấy hạt thật" } as any,
      brand: { emotional_territory: "quán quen của khu phố" } as any,
    } as CreativeJudgment,
    productCount: 3,
  })
).length;
console.log(`    empty judgment, 1–4 products: ${costs.join(", ")} chars`);
console.log(`    full director output, 3 products: ${rich} chars (cap 1600)`);
report.parts.D = { empty: costs, full: rich, cap: 1600 };

const outFile = path.join(
  process.cwd(),
  "data",
  "benchmarks",
  `layout-bridge-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);
try {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n", "utf-8");
  console.log(`\nreport written: ${outFile}`);
} catch (err: any) {
  console.log(`\nreport NOT written: ${err?.message || err}`);
}
console.log("=".repeat(78));
