import fs from "fs";
import path from "path";

/**
 * Phase 1.1A — did the rebalance change which route gets chosen?
 *
 *   npx tsx lib/image-engine/run-phase11a-route-benchmark.ts            (2 repeats)
 *   npx tsx lib/image-engine/run-phase11a-route-benchmark.ts --repeats=4
 *   npx tsx lib/image-engine/run-phase11a-route-benchmark.ts --mock     (no LLM)
 *
 * Renders no images. Route selection happens in `CreativeDirectorV1.judge`,
 * before any pipeline stage, so this calls the director directly — no provider,
 * no credits, no ninety-second wait for a picture nothing here looks at. The
 * pattern is taken from `run-strategy-benchmark.ts`, which established it.
 *
 * The measurement
 * ---------------
 * Phase 0.5 found the director choosing routes that explicitly disclaim having
 * an idea in 6 of 12 renders. Three entries across the menus say so in their own
 * words — "the object itself is the idea", "the object against controlled
 * nothing", "the object is itself the reason to stop". A route that names itself
 * that way is the category default with a label on it.
 *
 * The same six briefs run twice per arm, challenge OFF then ON. Nothing else
 * moves. The target set before the work started: 6/12 down to 2/12 or fewer.
 *
 * Why this is not proof on its own: the director is stochastic and twelve
 * samples per arm is a small number. A result near the boundary should be re-run
 * with --repeats=4 before anyone acts on it, and the render benchmark is what
 * decides whether a different route produced a better picture.
 */

const ARGS = process.argv.slice(2);
const MOCK = ARGS.includes("--mock");
/** Strips the judgment flags back to route selection alone. Not the default — see `judge`. */
const MINIMAL = ARGS.includes("--minimal");
const REPEATS = Number(ARGS.find((a) => a.startsWith("--repeats="))?.split("=")[1] || 2);

/* eslint-disable @typescript-eslint/no-var-requires */
const { CreativeDirectorV1 } = require("./evolution/experiment/CreativeDirectorV1");
const { assetContextBrief, assetContextFor, shuffleRoutes } = require("./evolution/experiment/AssetContext");
const { PHASE0_SCENARIOS } = require("./benchmark/phase0-render-dataset");

/** Routes whose own wording says there is no idea beyond the object. */
const IDEA_DISCLAIMING = [
  "iconic product composition — the object itself is the idea",
  "studio isolation — the object against controlled nothing",
  "product as hook — the object is itself the reason to stop",
];

/** `useCase` as the scenarios state it, mapped to the menu key. */
const MENU_KEY: Record<string, string> = { ugc: "ugc_thumbnail", product_hero: "product_hero" };

type Sample = {
  scenario: string;
  arm: "OFF" | "ON";
  repeat: number;
  asset_type: string;
  selected: string | null;
  disclaiming: boolean;
  risks: string | null;
  earns_it: string | null;
  runner_up: string | null;
  why_not: string | null;
  ok: boolean;
};

async function sampleOnce(s: any, challenge: boolean, repeat: number): Promise<Sample> {
  const assetType = MENU_KEY[s.brief.useCase] || s.brief.useCase;
  const ctx = assetContextFor(assetType, true);
  const routes: string[] = ctx?.possible_strategies ? shuffleRoutes(ctx.possible_strategies) : [];
  const brief = {
    assetContext: ctx
      ? assetContextBrief(ctx, { includeStrategies: true, includeChallenges: challenge })
      : undefined,
    concept: s.baseConcept,
    brandName: s.brief.brandName,
    useCase: assetType,
    aspectRatio: s.brief.aspectRatio,
    objective: s.brief.objective,
    audience: s.brief.audience,
    routes,
  };
  let judgment: any = null;
  try {
    judgment = await new CreativeDirectorV1().judge(brief, {
      // The flag set from the Phase 0.4 render run, not a minimal one.
      //
      // The first version of this benchmark ran with reasoning, brand, consumer,
      // semantics and antiGeneric all OFF and measured 3/12 disclaiming in BOTH
      // arms — against a 6/12 render baseline. That is not an improvement, it is
      // a different measurement: the risk-averse behaviour being corrected was
      // observed with those flags ON, and switching them off removes the context
      // that produced it. Reporting 6→3 from that run would have been the
      // "quietly rerunning a different measurement and reporting the difference
      // as progress" error this codebase warns about in `run-layout-bridge-benchmark`.
      //
      // The triad still stays off: strategy selection replaces exploration
      // rather than joining it, and a run with both on measures two
      // direction-generators arguing, which is not the thing under test.
      exploration: false,
      reasoning: !MINIMAL,
      antiGeneric: !MINIMAL,
      strategy: !MINIMAL,
      brand: !MINIMAL,
      consumer: !MINIMAL,
      semantics: !MINIMAL,
      strategySelection: true,
      formatChallenge: challenge,
    } as any);
  } catch {
    /* a failed director call is a null sample, not a crash */
  }
  const st = judgment?.strategy;
  const selected: string | null = st?.selected ?? null;
  const winner = st?.candidates?.find((c: any) => c?.route === selected);
  return {
    scenario: s.id,
    arm: challenge ? "ON" : "OFF",
    repeat,
    asset_type: assetType,
    selected,
    disclaiming: Boolean(selected && IDEA_DISCLAIMING.includes(selected)),
    risks: winner?.risks || null,
    earns_it: winner?.earns_it || null,
    runner_up: st?.runner_up ?? null,
    why_not: st?.why_not_runner_up ?? null,
    ok: Boolean(selected),
  };
}

const L = (s = "") => console.log(s);
const bar = "=".repeat(78);

async function main() {
  L(bar);
  L("Phase 1.1A — Format Challenge, route selection A/B");
  L(bar);
  L(`  ${PHASE0_SCENARIOS.length} briefs x ${REPEATS} repeats x 2 arms = ${PHASE0_SCENARIOS.length * REPEATS * 2} director calls`);
  L("  No images rendered. No credits spent on pictures.");
  L("  OFF = failure modes as today.   ON = failure modes paired with challenges.");
  L(`  judgment flags: ${MINIMAL ? "MINIMAL (route selection only)" : "the Phase 0.4 render set"}`);
  L("");

  const samples: Sample[] = [];
  for (const arm of [false, true]) {
    for (let r = 1; r <= REPEATS; r++) {
      for (const s of PHASE0_SCENARIOS) {
        process.stdout.write(`  ${arm ? "ON " : "OFF"} r${r} ${s.id.padEnd(18)} ... `);
        const sample = await sampleOnce(s, arm, r);
        samples.push(sample);
        L(sample.ok ? `${sample.disclaiming ? "DISCLAIMING" : "idea"}  ${sample.selected}` : "FAILED");
      }
    }
  }

  const off = samples.filter((s) => s.arm === "OFF" && s.ok);
  const on = samples.filter((s) => s.arm === "ON" && s.ok);
  const rate = (xs: Sample[]) => `${xs.filter((x) => x.disclaiming).length}/${xs.length}`;

  L("");
  L("-".repeat(78));
  L("RESULT — routes that disclaim having an idea");
  L("-".repeat(78));
  L(`  OFF  ${rate(off)}`);
  L(`  ON   ${rate(on)}`);
  L("");
  L(`  Phase 0.5 baseline (12 renders, challenge off): 6/12`);
  L(`  Target set before the work started:             <= 2/12`);
  L("");

  L("-".repeat(78));
  L("DID THE CANDIDATES ACTUALLY ANSWER A CHALLENGE?");
  L("-".repeat(78));
  const withRisk = on.filter((s) => s.risks);
  const withEarn = on.filter((s) => s.earns_it);
  L(`  named a risk        ${withRisk.length}/${on.length}`);
  L(`  said how it earns it ${withEarn.length}/${on.length}`);
  L("");
  L("  An empty risk with the flag on is the old behaviour in a new field:");
  L("  the director answered the challenge by risking nothing.");
  L("");
  for (const s of withRisk.slice(0, 4)) {
    L(`  ${s.scenario} (${s.selected})`);
    L(`     risks:  ${String(s.risks).slice(0, 96)}`);
    L(`     earns:  ${String(s.earns_it).slice(0, 96)}`);
    L("");
  }

  L("-".repeat(78));
  L("PER SCENARIO");
  L("-".repeat(78));
  L(`  ${"scenario".padEnd(18)}${"OFF disclaiming".padEnd(18)}ON disclaiming`);
  for (const s of PHASE0_SCENARIOS) {
    const o = off.filter((x) => x.scenario === s.id);
    const n = on.filter((x) => x.scenario === s.id);
    L(`  ${s.id.padEnd(18)}${rate(o).padEnd(18)}${rate(n)}`);
  }
  L("");

  const report = {
    report_id: `phase11a-routes-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generated_at: new Date().toISOString(),
    repeats: REPEATS,
    idea_disclaiming_routes: IDEA_DISCLAIMING,
    baseline: "6/12 from the Phase 0.5 render run",
    target: "<= 2/12",
    off: { total: off.length, disclaiming: off.filter((s) => s.disclaiming).length },
    on: {
      total: on.length,
      disclaiming: on.filter((s) => s.disclaiming).length,
      named_risk: withRisk.length,
      said_how_earned: withEarn.length,
    },
    samples,
  };
  const dir = path.join(process.cwd(), "data", "benchmarks");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${report.report_id}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf-8");
  L(`report written: ${out}`);
  L(bar);
}

main().catch((err) => {
  console.error("route benchmark failed:", err?.message || err);
  process.exit(1);
});
