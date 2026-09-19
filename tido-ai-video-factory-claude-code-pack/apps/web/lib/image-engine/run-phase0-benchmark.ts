import fs from "fs";
import path from "path";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import { resolveSelectedDirection } from "./evolution/experiment/CreativeDirectionResolver";
import { toCreativeDecision, applyCreativeDecision } from "./evolution/experiment/CreativeDecision";
import { PHASE0_SCENARIOS, PHASE0_CROSS_CHECK, compileFixture } from "./benchmark/phase0-render-dataset";
import { Phase0TransmissionScorer } from "./benchmark/Phase0TransmissionScorer";
import { PHASE0_DIMENSIONS } from "./benchmark/phase0-benchmark.types";
import type {
  Phase0Bottleneck,
  Phase0DimensionDelta,
  Phase0DimensionId,
  Phase0Flags,
  Phase0Record,
  Phase0Report,
  Phase0Scenario,
  Phase0ScenarioResult,
} from "./benchmark/phase0-benchmark.types";

/**
 * Phase 0.4 stage 1 — the transmission benchmark.
 *
 * Offline, deterministic, no model, no render, no cost. Run it as often as you
 * like; it will return the same numbers every time, which is the point.
 *
 *   npx tsx lib/image-engine/run-phase0-benchmark.ts
 *
 * What it measures, stated before the numbers
 * -------------------------------------------
 * Six scenarios, each composed twice — Phase 0.3's bridge off, then on, with
 * nothing else moved. It reports what reaches the prompt.
 *
 * Three limits, all of which a reader needs before the table means anything:
 *
 *   1. The judgments are FIXTURES. This measures whether the composer transmits
 *      a decision. It is not evidence the director would produce one.
 *   2. The compiled prompts are FIXTURES. Control mode also rewrites the request
 *      upstream via `applyCreativeDecision`, which changes what the compiler
 *      emits. Both arms here are control mode, so that rewrite is identical on
 *      both sides and the DELTA stays clean — but the absolute scores exclude
 *      whatever the rewrite contributes.
 *   3. Nothing here is a picture. `ai_artifact_level` is unscored by design, and
 *      six of seven dimensions are proxies. Stage 2 is where images happen.
 */

const OUT_DIR = path.join(process.cwd(), "data", "benchmarks");

// ── compose one arm ───────────────────────────────────────────────────────

/**
 * Mirrors `ExperimentPipeline.wrapProvider`'s call exactly.
 *
 * `controlled` and `carryNonSceneReasoning` are the two arguments the Phase 0
 * flags reach. `layoutContext`, `alignLayoutPriority` and `creativeConstraint`
 * belong to the layout and constraint flags, which are outside Phase 0's scope
 * and stay off in BOTH arms — so they cannot contribute to the delta.
 */
function composeArm(scenario: Phase0Scenario, flags: Phase0Flags, arm: "OFF" | "ON"): Phase0Record {
  const controlled = Boolean(flags.creative_director_control_v1);
  const carry = Boolean(flags.creative_bridge_v1);

  // 1. The request, as the brief states it.
  let concept = scenario.baseConcept;
  let hardRequirements = [...scenario.baseHardRequirements];

  // 2. Control mode rewrites the REQUEST — it does not append to the prompt.
  //    This is the step whose omission made the first run of this benchmark
  //    report a missing direction block as a system defect.
  if (controlled) {
    const decision = toCreativeDecision(scenario.judgment);
    if (decision) {
      const rewritten = applyCreativeDecision(
        { concept, useCase: scenario.brief.useCase, aspectRatio: scenario.brief.aspectRatio, hardRequirements } as any,
        decision,
        // `false`, mirroring ExperimentPipeline:650. The bridge's four summaries
        // are carried by the composer as full sections instead. One carrier.
        false
      );
      concept = rewritten.concept;
      hardRequirements = rewritten.hardRequirements || [];
    }
  }

  // 3. The compiler emits the prompt from the (possibly rewritten) request.
  const compiledPrompt = compileFixture(scenario.template, concept, hardRequirements);

  // 4. The composer appends, reorders and — in control mode with the bridge on —
  //    carries the non-scene reasoning back.
  const prompt = NanoBananaPromptComposer.compose(
    compiledPrompt,
    scenario.judgment,
    controlled,
    undefined,
    undefined,
    false,
    undefined,
    carry
  );

  const direction = resolveSelectedDirection(scenario.judgment);
  const composition = scenario.judgment.reasoning?.composition?.choice ?? null;
  const carrier: "control_rewrite" | "appended_block" | "none" = prompt.includes("## CREATIVE DIRECTION")
    ? "appended_block"
    : concept !== scenario.baseConcept
      ? "control_rewrite"
      : "none";

  return {
    scenario_id: scenario.id,
    kind: scenario.kind,
    arm,
    input: {
      brief: scenario.brief,
      asset_type: scenario.kind,
      products: scenario.products,
      constraints: scenario.constraints,
      flags,
    },
    creative: {
      selected_direction: direction?.name ?? null,
      direction_source: direction?.source ?? null,
      visual_language: direction?.appearance ?? [],
      reasoning: direction?.reasoning ?? "",
      rejected_reasons: direction?.rejectedReasons ?? [],
      layout_strategy: composition,
      carrier,
      effective_concept: concept,
      effective_hard_requirements: hardRequirements,
    },
    final: {
      generated_prompt: prompt,
      prompt_chars: prompt.length,
      delta_chars: prompt.length - compiledPrompt.length,
      // Stage 2 fills these. Named now so the record shape does not change
      // between stages and a stage-1 report cannot be read as a full one.
      provider_used: null,
      rendered_image_path: null,
    },
  };
}

// ── run ───────────────────────────────────────────────────────────────────

const results: Phase0ScenarioResult[] = [];

for (const s of PHASE0_SCENARIOS) {
  const off = composeArm(s, s.flags.off, "OFF");
  const on = composeArm(s, s.flags.on, "ON");
  const offScore = Phase0TransmissionScorer.score(off, s);
  const onScore = Phase0TransmissionScorer.score(on, s);

  const deltas: Phase0DimensionDelta[] = PHASE0_DIMENSIONS.map((def) => {
    const o = offScore.dimensions.find((d) => d.dimension === def.id)?.score ?? null;
    const n = onScore.dimensions.find((d) => d.dimension === def.id)?.score ?? null;
    return { dimension: def.id, off: o, on: n, delta: o === null || n === null ? null : n - o };
  });

  const inert = off.final.generated_prompt === on.final.generated_prompt;
  const warnings: string[] = [];
  if (inert) {
    warnings.push(
      "OFF and ON produced byte-identical prompts. The flags moved nothing on this scenario."
    );
  }
  if (!off.creative.selected_direction) {
    warnings.push("No direction resolved from the fixture judgment — the fixture itself is empty.");
  }

  results.push({
    scenario_id: s.id,
    kind: s.kind,
    challenge: s.challenge,
    off,
    on,
    off_score: offScore,
    on_score: onScore,
    deltas,
    inert,
    warnings,
  });
}

// ── aggregate ─────────────────────────────────────────────────────────────

const offMean = Number(
  (results.reduce((a, r) => a + r.off_score.transmission_overall, 0) / results.length).toFixed(2)
);
const onMean = Number(
  (results.reduce((a, r) => a + r.on_score.transmission_overall, 0) / results.length).toFixed(2)
);

const byDimension = PHASE0_DIMENSIONS.map((def) => {
  const offs = results.map((r) => r.off_score.dimensions.find((d) => d.dimension === def.id)?.score).filter((x): x is number => x !== null && x !== undefined);
  const ons = results.map((r) => r.on_score.dimensions.find((d) => d.dimension === def.id)?.score).filter((x): x is number => x !== null && x !== undefined);
  const om = offs.length ? Number((offs.reduce((a, b) => a + b, 0) / offs.length).toFixed(2)) : null;
  const nm = ons.length ? Number((ons.reduce((a, b) => a + b, 0) / ons.length).toFixed(2)) : null;
  return {
    dimension: def.id,
    prompt_method: def.prompt_method,
    off_mean: om,
    on_mean: nm,
    delta: om === null || nm === null ? null : Number((nm - om).toFixed(2)),
  };
});

// ── bottlenecks ───────────────────────────────────────────────────────────

const bottlenecks: Phase0Bottleneck[] = [];

const inertScenarios = results.filter((r) => r.inert).map((r) => r.scenario_id);
if (inertScenarios.length) {
  bottlenecks.push({
    severity: "BLOCKING",
    summary: `${inertScenarios.length} of ${results.length} scenarios produced identical prompts with the bridge off and on. On those, Phase 0.3 is inert.`,
    affected_scenarios: inertScenarios,
    evidence: inertScenarios.map((id) => `${id}: OFF and ON prompts are byte-identical`),
  });
}

for (const d of byDimension) {
  if (d.prompt_method === "NOT_MEASURABLE") continue;
  if (d.on_mean !== null && d.on_mean <= 5) {
    bottlenecks.push({
      severity: d.on_mean <= 3 ? "BLOCKING" : "MAJOR",
      dimension: d.dimension,
      summary: `${d.dimension} transmits weakly even with the bridge on (mean ${d.on_mean}/10).`,
      affected_scenarios: results
        .filter((r) => (r.on_score.dimensions.find((x) => x.dimension === d.dimension)?.score ?? 10) <= 5)
        .map((r) => r.scenario_id),
      evidence:
        results
          .flatMap((r) => r.on_score.dimensions.filter((x) => x.dimension === d.dimension))
          .flatMap((x) => x.evidence.filter((e) => e.startsWith("[ ]")))
          .slice(0, 6),
    });
  }
}

/**
 * Carrier gaps — the check this benchmark exists to make.
 *
 * Phase 0.1 replaced four ad-hoc readers of "which direction was chosen" with
 * one resolver. `CreativeDecision.ts` is NOT one of the four it replaced, and it
 * still reads the two branches asymmetrically. So a field can resolve correctly
 * and still never reach the renderer, which is the original defect wearing a
 * different hat — and it is invisible to every test that asserts on the resolver.
 */
const carrierGaps: Phase0Bottleneck[] = [];

const strategyArms = results.filter((r) => r.on.creative.direction_source === "strategy");
const missingRenderAs = strategyArms.filter((r) => !/Render it as: \S/.test(r.on.final.generated_prompt));
if (missingRenderAs.length) {
  carrierGaps.push({
    severity: "BLOCKING",
    dimension: "creative_concept_strength",
    summary:
      `Phase 0.2 is half-delivered. On ${missingRenderAs.length}/${strategyArms.length} strategy-branch scenarios the candidate's ` +
      "`visual_language` resolves correctly but never reaches the prompt in control mode: " +
      "`toCreativeDecision` sets `environment_decision` from `chosen?.visual_language` (the EXPLORATION field) only, " +
      "so `Render it as:` is never emitted and the renderer gets a subject with no photograph.",
    affected_scenarios: missingRenderAs.map((r) => r.scenario_id),
    evidence: [
      "CreativeDecision.ts:258  environment_decision: clean(chosen?.visual_language)",
      "CreativeDecision.ts:233  scene_definition DOES fall back to the strategy winner — the asymmetry is in one field, not the file",
      "CreativeDirectionResolver.ts:112  the resolver reads candidate.visual_language correctly",
      ...missingRenderAs.slice(0, 3).map((r) => `${r.scenario_id}: resolver returned 2 appearance lines, prompt carries 0 'Render it as:'`),
    ],
  });
}

/** All three carriers. See the note in `Phase0TransmissionScorer.conceptStrength`. */
const NAMED = (p: string) =>
  /This image answers the brief as: \S/.test(p) ||
  /CHOSEN DIRECTION: \S/.test(p) ||
  /The creative direction chosen for this image: \S/.test(p);

const explorationArms = results.filter((r) => r.on.creative.direction_source === "exploration");
const unnamed = explorationArms.filter((r) => !NAMED(r.on.final.generated_prompt));
if (unnamed.length) {
  carrierGaps.push({
    severity: "MAJOR",
    dimension: "creative_concept_strength",
    summary:
      `On ${unnamed.length}/${explorationArms.length} exploration-branch scenarios the direction's NAME never reaches the prompt in control mode. ` +
      "`selected_direction` is computed from both branches and logged, but it is never emitted into the request.",
    affected_scenarios: unnamed.map((r) => r.scenario_id),
    evidence: [
      "CreativeDecision.ts:247  selected_direction is computed from both branches",
      "CreativeDecision.ts  ...and, before Phase 0.4, used only for telemetry",
    ],
  });
}

bottlenecks.push(...carrierGaps);

const unmeasurable = PHASE0_DIMENSIONS.filter((d) => d.prompt_method === "NOT_MEASURABLE").map((d) => d.id);
bottlenecks.push({
  severity: "MAJOR",
  summary: `${unmeasurable.length} of ${PHASE0_DIMENSIONS.length} dimensions cannot be scored without a render. The transmission result is not a picture-quality result.`,
  affected_scenarios: results.map((r) => r.scenario_id),
  evidence: unmeasurable.map((d) => `${d}: NOT_MEASURABLE at the prompt stage`),
});

const report: Phase0Report = {
  report_id: `phase0-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  dataset_id: "phase0-render-validation",
  generated_at: new Date().toISOString(),
  stage: "TRANSMISSION",
  scenario_count: results.length,
  results,
  summary: { off_mean: offMean, on_mean: onMean, delta: Number((onMean - offMean).toFixed(2)), inert_scenarios: inertScenarios },
  by_dimension: byDimension,
  bottlenecks,
  requires_render: unmeasurable as Phase0DimensionId[],
  warnings: results.flatMap((r) => r.warnings.map((w) => `${r.scenario_id}: ${w}`)),
};

// ── print ─────────────────────────────────────────────────────────────────

const L = (s = "") => console.log(s);
const bar = "=".repeat(78);

L(bar);
L("Phase 0.4 — Transmission Benchmark (stage 1 of 2)");
L(bar);
L("  offline, deterministic, no model, no render, no cost");
L("");
L("  The judgments and compiled prompts are FIXTURES. This measures whether the");
L("  composer TRANSMITS a decision. It is not evidence the director would produce");
L("  one — only a live director run shows that.");
L("");
L(`  ${results.length} scenarios x 2 arms = ${results.length * 2} compositions`);
L("  OFF = control mode on, bridge off     ON = control mode on, bridge on");
L("");

L("-".repeat(78));
L("PER SCENARIO");
L("-".repeat(78));
L(`  ${"scenario".padEnd(18)}${"kind".padEnd(15)}${"OFF".padEnd(7)}${"ON".padEnd(7)}${"delta".padEnd(8)}chars OFF→ON`);
for (const r of results) {
  const d = r.on_score.transmission_overall - r.off_score.transmission_overall;
  L(
    `  ${r.scenario_id.padEnd(18)}${r.kind.padEnd(15)}` +
      `${String(r.off_score.transmission_overall).padEnd(7)}${String(r.on_score.transmission_overall).padEnd(7)}` +
      `${(d >= 0 ? "+" : "") + d.toFixed(2).padEnd(7)}${r.off.final.prompt_chars} → ${r.on.final.prompt_chars}` +
      (r.inert ? "   INERT" : "")
  );
}
L("");
L(`  mean OFF ${offMean}   mean ON ${onMean}   delta ${(onMean - offMean >= 0 ? "+" : "") + (onMean - offMean).toFixed(2)}`);
L("");

L("-".repeat(78));
L("PER DIMENSION");
L("-".repeat(78));
L(`  ${"dimension".padEnd(32)}${"method".padEnd(17)}${"OFF".padEnd(7)}${"ON".padEnd(7)}delta`);
for (const d of byDimension) {
  const fmt = (v: number | null) => (v === null ? "—" : String(v));
  const dl = d.delta === null ? "—" : (d.delta >= 0 ? "+" : "") + d.delta;
  L(`  ${d.dimension.padEnd(32)}${d.prompt_method.padEnd(17)}${fmt(d.off_mean).padEnd(7)}${fmt(d.on_mean).padEnd(7)}${dl}`);
}
L("");
L("  '—' is not a low score. It is a dimension no prompt can honestly answer.");
L("");

L("-".repeat(78));
L("CARRIER CHECK — did the decision reach the prompt, and by which route?");
L("-".repeat(78));
L(`  ${"scenario".padEnd(18)}${"branch".padEnd(13)}${"named".padEnd(8)}${"scene".padEnd(8)}${"rendered-as".padEnd(13)}reason`);
for (const r of results) {
  const p = r.on.final.generated_prompt;
  const yn = (b: boolean) => (b ? "yes" : "NO ");
  L(
    `  ${r.scenario_id.padEnd(18)}${String(r.on.creative.direction_source).padEnd(13)}` +
      `${yn(NAMED(p)).padEnd(8)}` +
      `${yn(/\nSCENE: \S/.test(p) || /HOW IT SHOULD APPEAR:/.test(p)).padEnd(8)}` +
      `${yn(/Render it as: \S/.test(p) || (p.match(/HOW IT SHOULD APPEAR:/g) || []).length >= 2).padEnd(13)}` +
      `${yn(/Why that route here: \S/.test(p) || /WHY THIS DIRECTION: \S/.test(p) || /Why this direction here: \S/.test(p))}`
  );
}
L("");
L("  'rendered-as' is the Phase 0.2 half — how the frame looks, not what is in it.");
L("");

L("-".repeat(78));
L("WHAT THE BRIDGE ADDED, VERBATIM (scenario A)");
L("-".repeat(78));
{
  const a = results[0];
  const offLines = new Set(a.off.final.generated_prompt.split("\n"));
  const added = a.on.final.generated_prompt.split("\n").filter((l) => !offLines.has(l) && l.trim());
  if (added.length) for (const l of added.slice(0, 22)) L(`    ${l}`);
  else L("    nothing — the two prompts are identical");
}
L("");

L("-".repeat(78));
L("BOTTLENECKS");
L("-".repeat(78));
for (const b of bottlenecks) {
  L(`  [${b.severity}] ${b.summary}`);
  for (const e of b.evidence.slice(0, 4)) L(`      ${e}`);
  L("");
}

L("-".repeat(78));
L("STAGE 2 — NOT RUN");
L("-".repeat(78));
L(`  ${report.requires_render.join(", ")} cannot be scored without an image.`);
L("  Run: npx tsx lib/image-engine/run-phase0-render-checklist.ts");
L(`  Then: ${PHASE0_CROSS_CHECK.title}`);
L("");

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${report.report_id}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf-8");
  L(`report written: ${out}`);
} catch (err: any) {
  L(`report NOT written: ${err?.message || err}`);
}
L(bar);
