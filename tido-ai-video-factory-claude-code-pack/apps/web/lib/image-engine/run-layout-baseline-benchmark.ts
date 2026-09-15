import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CommercialLayoutService } from "./service/CommercialLayoutService";
import {
  briefAnchors,
  FORMAT_BIAS_BRIEFS,
  FORMATS,
  GENERIC_MARKERS,
  LayoutBrief,
  MULTI_PRODUCT_BRIEFS,
  OBJECTIVE_BRIEFS,
} from "./benchmark/layout-baseline-dataset";

/**
 * Phase 5.0 — what the layout engine does today, measured before anything is
 * built to replace it.
 *
 * Why a baseline at all
 * ---------------------
 * Phase 5 will claim that layout reasoning became responsive to the brief. That
 * claim is worth nothing without a number it beat. This run produces that
 * number, and it produces it from the system as it actually ships — no flags, no
 * experiment path, no model.
 *
 * Offline and deterministic on purpose. `CommercialLayoutService.plan()` is a
 * pure function, so every figure below can be reproduced exactly, by anyone,
 * without a gateway, a provider or a single đồng of spend.
 *
 * What this is NOT
 * ----------------
 * Not a pass/fail of the current engine. A fixed table is a legitimate thing to
 * have shipped and it is the reason layout is consistent today. The rows marked
 * OBSERVED are measurements with no verdict attached; only the rows marked PASS
 * or FAIL assert something that must be true now and must stay true after 5.1.
 *
 *   npx tsx lib/image-engine/run-layout-baseline-benchmark.ts
 *
 * Writes data/benchmarks/layout-baseline-<timestamp>.json so 5.4 can diff
 * against the same object rather than against a number in a chat log.
 */

interface Observation {
  group: string;
  id: string;
  label: string;
  format: string;
  dominant_element: string;
  dominant_importance: number;
  priority_fingerprint: string;
  eye_flow: string;
  hierarchy: string;
  negative_space: string;
  reasoning_fingerprint: string;
  prompt_chars: number;
  zones: Record<string, string>;
}

const observations: Observation[] = [];

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

function observed(name: string, detail: string) {
  console.log(`  OBS   ${name}`);
  console.log(`        ${detail}`);
  verdicts.push(`OBSERVED ${name} — ${detail}`);
}

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

function observe(group: string, brief: LayoutBrief, format: string, aspectRatio = "4:5"): Observation {
  const plan = CommercialLayoutService.plan({
    assetType: format,
    aspectRatio,
    copyItems: brief.copyItems,
    hasLogoAsset: brief.hasLogoAsset,
    objective: brief.objective,
  });
  const top = [...plan.visual_priority].sort((a, b) => b.importance - a.importance)[0];
  const zones: Record<string, string> = {};
  for (const z of plan.zones) zones[z.role] = `x${z.x} y${z.y} w${z.width} h${z.height} ${z.align}`;

  // The reasoning, separated from the geometry. This is the part Phase 5 claims
  // it will make responsive, so it is fingerprinted on its own.
  const reasoning = [
    plan.eye_flow,
    plan.negative_space_strategy,
    ...plan.visual_priority.map((p) => `${p.element}:${p.role}`),
  ].join("|");

  const o: Observation = {
    group,
    id: brief.id,
    label: brief.label,
    format,
    dominant_element: top?.element || "(none)",
    dominant_importance: top?.importance ?? 0,
    priority_fingerprint: plan.visual_priority
      .map((p) => `${p.element}:${p.importance}`)
      .join(","),
    eye_flow: plan.eye_flow,
    hierarchy: plan.hierarchy.join(" > "),
    negative_space: plan.negative_space_strategy,
    reasoning_fingerprint: sha(reasoning),
    prompt_chars: plan.promptBlock.length,
    zones,
  };
  observations.push(o);
  return o;
}

const distinct = (xs: string[]) => new Set(xs).size;

console.log("=".repeat(78));
console.log("Phase 5.0 — Layout Intelligence Baseline");
console.log("=".repeat(78));
console.log("  offline, deterministic, no model, no render");
console.log("");

// ── 1. format layout bias ───────────────────────────────────────────────────
console.log("TEST 1 — five different worlds, one format (poster)\n");
const t1 = FORMAT_BIAS_BRIEFS.map((b) => observe("format_bias", b, "poster"));
console.log(`    ${"brief".padEnd(22)}${"dominant".padEnd(12)}${"eye flow".padEnd(28)}reasoning`);
for (const o of t1) {
  console.log(
    `    ${o.label.padEnd(22)}${o.dominant_element.padEnd(12)}${o.eye_flow.padEnd(28)}${o.reasoning_fingerprint}`
  );
}
const t1Dominant = distinct(t1.map((o) => o.dominant_element));
const t1Reasoning = distinct(t1.map((o) => o.reasoning_fingerprint));
const t1Negative = distinct(t1.map((o) => o.negative_space));
observed(
  "Dominant element across five unrelated products",
  t1Dominant === 1
    ? `1/5 distinct — every brief answered "${t1[0].dominant_element}"`
    : `${t1Dominant}/5 distinct: ${[...new Set(t1.map((o) => o.dominant_element))].join(", ")}`
);
observed(
  "Whole layout reasoning across five unrelated products",
  `${t1Reasoning}/5 distinct fingerprints, ${t1Negative}/5 distinct negative-space strategies`
);

// ── 2. strategy adaptation ──────────────────────────────────────────────────
console.log("\nTEST 2 — one coffee, four jobs\n");
const t2 = OBJECTIVE_BRIEFS.map((b) => observe("objective", b, "poster"));
console.log(`    ${"objective".padEnd(32)}${"dominant".padEnd(12)}priority`);
for (const o of t2) {
  console.log(`    ${o.label.padEnd(32)}${o.dominant_element.padEnd(12)}${o.priority_fingerprint}`);
}
const t2Priority = distinct(t2.map((o) => o.priority_fingerprint));
const t2Reasoning = distinct(t2.map((o) => o.reasoning_fingerprint));
const t2Flow = distinct(t2.map((o) => o.eye_flow));
observed(
  "Attention budget responds to the objective",
  `${t2Priority}/4 distinct attention budgets across trust / desire / purchase / memory`
);
observed(
  "Eye flow and negative space respond to the objective",
  `${t2Flow}/4 distinct eye flows, ${t2Reasoning}/4 distinct full reasoning fingerprints`
);

// ── 3. multi product ────────────────────────────────────────────────────────
console.log("\nTEST 3 — one to four products, everything else held constant\n");
const t3 = MULTI_PRODUCT_BRIEFS.map((b) => observe("multi_product", b, "poster"));
for (const o of t3) {
  console.log(`    ${o.label.padEnd(14)}${o.dominant_element.padEnd(12)}${o.priority_fingerprint}`);
}
const t3Distinct = distinct(t3.map((o) => o.reasoning_fingerprint));
observed(
  "Layout reasoning responds to how many products are in the frame",
  `${t3Distinct}/4 distinct — 1, 2, 3 and 4 products produce ${
    t3Distinct === 1 ? "one identical plan" : `${t3Distinct} plans`
  }`
);

// This one is structural, not statistical: a function cannot respond to a value
// it is never given. Asserted against the source so it stays true or stays loud.
const LAYOUT_SRC = fs.readFileSync(
  path.join(process.cwd(), "lib", "image-engine", "service", "CommercialLayoutService.ts"),
  "utf-8"
);
const planSignature = LAYOUT_SRC.slice(
  LAYOUT_SRC.indexOf("public static plan(input: {"),
  LAYOUT_SRC.indexOf("}): CommercialLayoutPlan")
);
gate(
  "The layout engine is not silently reading a product count",
  !/product_?[Cc]ount|products\b/.test(planSignature),
  "plan() accepts no product count, so spatial relationship and depth cannot vary with it — " +
    "this is a missing input, not a weak heuristic"
);
// An input a function accepts and never reads is a lever connected to nothing.
// Checked against the body rather than asserted, so it corrects itself the day
// somebody wires it up.
const planBody = LAYOUT_SRC.slice(
  LAYOUT_SRC.indexOf("}): CommercialLayoutPlan"),
  LAYOUT_SRC.indexOf("public static designConsiderations")
);
const acceptedButUnread = ["targetChannel", "aspectRatio"].filter(
  (name) => planSignature.includes(name) && !planBody.includes(`input.${name}`) && !planBody.includes(`${name},`)
);
gate(
  "Every input plan() accepts is read somewhere in its body",
  acceptedButUnread.length === 0,
  acceptedButUnread.length
    ? `accepted and never used: ${acceptedButUnread.join(", ")} — a lever connected to nothing`
    : "every declared input is referenced"
);

// ── 4. reasoning specificity ────────────────────────────────────────────────
console.log("\nTEST 4 — is the reasoning about this brief\n");
let grounded = 0;
let genericHits = 0;
for (const brief of FORMAT_BIAS_BRIEFS) {
  const o = t1.find((x) => x.id === brief.id)!;
  const text = `${o.negative_space} ${o.eye_flow}`.toLowerCase();
  const anchors = briefAnchors(brief);
  if (anchors.some((a) => a && text.includes(a.toLowerCase()))) grounded++;
  for (const marker of GENERIC_MARKERS) if (text.includes(marker)) genericHits++;
}
observed(
  "Reasoning names something the brief supplied",
  `${grounded}/${FORMAT_BIAS_BRIEFS.length} mention the product, the brand, the audience or the objective`
);
observed(
  "Reasoning leans on brief-independent phrases",
  `${genericHits} generic markers across ${FORMAT_BIAS_BRIEFS.length} briefs ` +
    `(a phrase that reads the same under every brief)`
);

// ── distribution across every format ────────────────────────────────────────
console.log("\nTEST 4b — distribution across all six formats\n");
console.log(`    ${"format".padEnd(16)}${"answers".padEnd(10)}dominant elements seen`);
const biasedFormats: string[] = [];
for (const format of FORMATS) {
  const rows = FORMAT_BIAS_BRIEFS.map((b) => observe("distribution", b, format));
  const seen = [...new Set(rows.map((r) => r.dominant_element))];
  const top = Math.max(
    ...seen.map((s) => rows.filter((r) => r.dominant_element === s).length)
  );
  if (top / rows.length > 0.4) biasedFormats.push(format);
  console.log(`    ${format.padEnd(16)}${String(seen.length).padEnd(10)}${seen.join(", ")}`);
}
observed(
  "Formats whose dominant element is effectively fixed",
  `${biasedFormats.length}/${FORMATS.length} formats answer with one element more than 40% of the time: ` +
    (biasedFormats.join(", ") || "none")
);

// ── 5. zone stability ───────────────────────────────────────────────────────
console.log("\nTEST 5 — the compositor contract\n");
const CONTRACT_ROLES = ["HEADLINE", "CTA", "LOGO"];
const contract: Record<string, Record<string, string>> = {};
for (const format of FORMATS) {
  const plan = CommercialLayoutService.plan({
    assetType: format,
    aspectRatio: "4:5",
    copyItems: ["x"],
    hasLogoAsset: true,
  });
  contract[format] = {};
  for (const z of plan.zones) {
    if (CONTRACT_ROLES.includes(z.role)) {
      contract[format][z.role] = `x${z.x} y${z.y} w${z.width} h${z.height} ${z.align}`;
    }
  }
}
// Same call twice: the zones a compositor will read must not depend on when it asked.
let unstable = 0;
for (const format of FORMATS) {
  const again = CommercialLayoutService.plan({
    assetType: format,
    aspectRatio: "4:5",
    copyItems: ["x"],
    hasLogoAsset: true,
  });
  for (const z of again.zones) {
    if (!CONTRACT_ROLES.includes(z.role)) continue;
    if (contract[format][z.role] !== `x${z.x} y${z.y} w${z.width} h${z.height} ${z.align}`) unstable++;
  }
}
gate(
  "Text zones are stable across identical calls",
  unstable === 0,
  `${unstable} of the HEADLINE / CTA / LOGO zones moved between two identical calls`
);

// The objective changes the attention budget. It must not move a zone, because a
// zone is where composited type will land.
let movedByObjective = 0;
for (const format of FORMATS) {
  for (const brief of OBJECTIVE_BRIEFS) {
    const plan = CommercialLayoutService.plan({
      assetType: format,
      aspectRatio: "4:5",
      copyItems: ["x"],
      hasLogoAsset: true,
      objective: brief.objective,
    });
    for (const z of plan.zones) {
      if (!CONTRACT_ROLES.includes(z.role)) continue;
      if (contract[format][z.role] !== `x${z.x} y${z.y} w${z.width} h${z.height} ${z.align}`) {
        movedByObjective++;
      }
    }
  }
}
gate(
  "The campaign objective never moves a text zone",
  movedByObjective === 0,
  `${movedByObjective} zone shifts caused by the objective — this is the contract Phase 5.1 must not break`
);
for (const format of FORMATS) {
  console.log(`    ${format.padEnd(16)}${Object.entries(contract[format]).map(([r, v]) => `${r}(${v})`).join("  ")}`);
}

// ── report ──────────────────────────────────────────────────────────────────
const outDir = path.join(process.cwd(), "data", "benchmarks");
const file = path.join(outDir, `layout-baseline-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
try {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        phase: "5.0",
        generated: new Date().toISOString(),
        note: "Baseline of CommercialLayoutService before any LayoutDecision exists. Phase 5.4 diffs against this.",
        verdicts,
        zone_contract: contract,
        observations,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  console.log(`\nbaseline written: ${file}`);
} catch (err: any) {
  console.log(`\nbaseline NOT written: ${err?.message || err}`);
}

console.log("");
console.log("=".repeat(78));
console.log(`${passed} assertions passed, ${failed} failed, ${observations.length} observations recorded`);
console.log("=".repeat(78));
