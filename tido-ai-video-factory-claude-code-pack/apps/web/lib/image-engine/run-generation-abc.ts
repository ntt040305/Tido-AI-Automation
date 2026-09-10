import fs from "fs";
import path from "path";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CandidatePopulationBuilder, PopulationResult } from "./reasoning/CandidatePopulationBuilder";
import { DeterministicGenerationProvider } from "./reasoning/DeterministicGenerationProvider";
import { EmotionalMechanismExtractor } from "./reasoning/EmotionalMechanismExtractor";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { LLMCreativeCriticProvider } from "./reasoning/LLMCreativeCriticProvider";
import { LLMCreativeGenerationProvider } from "./reasoning/LLMCreativeGenerationProvider";
import { LLMProviderService } from "./llm/llm-provider.service";
import { ConceptBenchmarkCase, loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.7 Task 3 — three generators, one set of judges.
 *
 *   npx tsx lib/image-engine/run-generation-abc.ts [--out DIR] [--limit N]
 *
 *   A  the old generator      six expression modes, one territory
 *   B  the new deterministic  planned search + self-critique
 *   C  the LLM generator      the same search, written by a model
 *
 * The briefs, the evaluators, the scoring and every threshold are identical
 * across all three. Nothing is combined: each arm is reported on its own row and
 * there is no blended figure anywhere in the output, because averaging three
 * generators produces a number that describes none of them.
 *
 * The rule that governs arm C
 * --------------------------
 * C runs only if the gateway answers a real request. If it does not, C is
 * reported as NOT RUN with the reason, and no deterministic number is printed on
 * its row. Labelling fallback output as model output is the specific failure
 * Task 4 of this phase exists to end, and a benchmark is the easiest place in
 * the system for it to happen unnoticed.
 */

interface Arm {
  arm: string;
  ran: boolean;
  reason?: string;
  briefs: number;
  candidates: number;
  candidates_per_brief: number;
  unique_ideas: number;
  duplicate_rate: number;
  approval_rate: number;
  pursue: number;
  modify: number;
  reject: number;
  pursue_rate: number;
  modify_rate: number;
  reject_rate: number;
  mechanism_confidence: number;
  mechanismless_rate: number;
  breakthrough_briefs: number;
  bands: Record<string, number>;
  critique_dropped: number;
  critique_llm_reviewed: number;
}

const EMPTY = (arm: string, reason: string): Arm => ({
  arm,
  ran: false,
  reason,
  briefs: 0,
  candidates: 0,
  candidates_per_brief: 0,
  unique_ideas: 0,
  duplicate_rate: 0,
  approval_rate: 0,
  pursue: 0,
  modify: 0,
  reject: 0,
  pursue_rate: 0,
  modify_rate: 0,
  reject_rate: 0,
  mechanism_confidence: 0,
  mechanismless_rate: 0,
  breakthrough_briefs: 0,
  bands: {},
  critique_dropped: 0,
  critique_llm_reviewed: 0,
});

function measure(arm: string, run: ReturnType<typeof runTasteBenchmark>): Arm {
  const ideas = run.rankings.flatMap((r) => r.ranked);
  const mech = EmotionalMechanismExtractor.aggregate(run.mechanisms);
  const d = run.decisions;
  const pursue = d.filter((x) => x.decision === "PURSUE").length;
  const modify = d.filter((x) => x.decision === "MODIFY").length;
  const reject = d.filter((x) => x.decision === "REJECT").length;
  const briefs = run.rows.length || 1;
  const unique = new Set(ideas.map((x) => x.idea)).size;
  const bands: Record<string, number> = {};
  for (const x of d) bands[x.interpretation.band] = (bands[x.interpretation.band] || 0) + 1;
  const pools = run.populations.filter(Boolean) as PopulationResult[];

  return {
    arm,
    ran: true,
    briefs: run.rows.length,
    candidates: ideas.length,
    candidates_per_brief: Number((ideas.length / briefs).toFixed(2)),
    unique_ideas: unique,
    duplicate_rate: Number((1 - unique / (ideas.length || 1)).toFixed(3)),
    // Not rejected, over all briefs — the definition this phase's baseline used.
    approval_rate: Number((((pursue + modify) / briefs) * 100).toFixed(1)),
    pursue,
    modify,
    reject,
    pursue_rate: Number(((pursue / briefs) * 100).toFixed(1)),
    modify_rate: Number(((modify / briefs) * 100).toFixed(1)),
    reject_rate: Number(((reject / briefs) * 100).toFixed(1)),
    mechanism_confidence: mech.mean_confidence,
    mechanismless_rate: Number(((mech.mechanismless / (run.mechanisms.length || 1)) * 100).toFixed(1)),
    breakthrough_briefs: run.rankings.filter((r) =>
      r.ranked.some((x) => x.originality?.originality_type === "BREAKTHROUGH")
    ).length,
    bands,
    critique_dropped: pools.reduce((t, p) => t + p.critique.dropped, 0),
    critique_llm_reviewed: pools.reduce((t, p) => t + p.critique.llm_reviewed, 0),
  };
}

/** Everything one brief needs to build a pool. Mirrors the benchmark exactly. */
function inputFor(c: ConceptBenchmarkCase) {
  const brief = c.brief;
  const insight = HumanInsightGenerator.generate({
    challenge: c.creative_challenge || brief.creativeChallenge || "",
    audience: brief.audience || "",
    product: brief.product || "",
    category: c.industry,
    objective: brief.objective,
    objectiveKind: brief.objective,
    brand: brief.brand,
    market: "vn",
  });
  const terms = HumanTensionAnalyzer.terms({
    challenge: c.creative_challenge || "",
    audience: brief.audience || "",
    product: brief.product || "",
    category: c.industry,
    objective: brief.objective,
  });
  return {
    insight,
    terms,
    contradiction: InsightContradictionEngine.evaluate(insight),
    brandDNA: BrandDNAOwnership.resolve({
      brand: brief.brand,
      product: brief.product,
      category: c.industry,
      tone: brief.tone,
    }),
    brief: {
      brand: brief.brand || "",
      product: brief.product || "",
      audience: brief.audience || "",
      category: c.industry || "",
      objective: brief.objective,
      challenge: c.creative_challenge || brief.creativeChallenge || "",
      key_phrase: terms.key,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".generation-abc";
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 0;
  const { dataset_id, cases: all } = loadConceptBenchmark();
  const cases = limit > 0 ? all.slice(0, limit) : all;

  const bar = "=".repeat(94);
  console.log(bar);
  console.log(`GENERATION A/B/C — ${cases.length} briefs — ${dataset_id}`);
  console.log("Same briefs, same evaluators, same scoring, same thresholds. Arms are never combined.");
  console.log(bar);

  // ── Task 4: what is actually there ─────────────────────────────────────
  const llm = new LLMProviderService();
  const status = await llm.probe();
  console.log("\nLLM STATUS");
  console.log(`  ${status.status}`);
  console.log(`  base url : ${status.baseUrl}`);
  console.log(`  model    : ${status.model}`);
  console.log(`  detail   : ${status.detail}`);
  console.log(
    status.reachable
      ? "  Arm C will run against the model."
      : "  Arm C will NOT run. No deterministic output will be reported on its row."
  );

  // ── A ──────────────────────────────────────────────────────────────────
  const A = measure("A · old generator", runTasteBenchmark(cases, { useTasteMemory: false, legacyGeneration: true }));

  // ── B ──────────────────────────────────────────────────────────────────
  const B = measure("B · deterministic search", runTasteBenchmark(cases, { useTasteMemory: false }));

  // B without the critique, so the critique's effect is measured rather than
  // assumed. Reported as a diagnostic beside B, not as a fourth arm.
  const Bnc = measure("B0 · search, no critique", runTasteBenchmark(cases, { useTasteMemory: false, critique: false }));

  // ── C ──────────────────────────────────────────────────────────────────
  let C: Arm;
  if (!status.reachable) {
    C = EMPTY("C · LLM generator", `${status.status}: ${status.detail}`);
  } else {
    const generator = new LLMCreativeGenerationProvider(llm);
    const critic = new LLMCreativeCriticProvider(llm);
    const pools = new Map<string, PopulationResult>();
    for (const c of cases) {
      pools.set(
        c.case_id,
        await CandidatePopulationBuilder.build(inputFor(c), {
          // The LLM leads and the deterministic provider is the floor beneath it,
          // so a brief the model declines still reaches the evaluators.
          providers: [generator, new DeterministicGenerationProvider()],
          critic,
        })
      );
    }
    const llmAuthored = [...pools.values()].reduce(
      (t, p) => t + p.candidates.filter((x) => x.provider === "llm").length,
      0
    );
    if (llmAuthored === 0) {
      C = EMPTY("C · LLM generator", "the gateway answered the probe but authored no candidate");
    } else {
      C = measure("C · LLM generator", runTasteBenchmark(cases, { useTasteMemory: false, prebuiltPools: pools }));
      console.log(`\n  arm C: ${llmAuthored} candidates were authored by the model.`);
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────
  const arms = [A, B, C];
  const cell = (v: unknown, ran: boolean) => (ran ? String(v).padStart(14) : "—".padStart(14));
  const row = (label: string, get: (a: Arm) => unknown) =>
    console.log(`  ${label.padEnd(28)}${arms.map((a) => cell(get(a), a.ran)).join("")}`);

  console.log("\n" + bar);
  console.log(`  ${"".padEnd(28)}${"A old".padStart(14)}${"B determ.".padStart(14)}${"C llm".padStart(14)}`);
  console.log(bar);
  row("candidate count", (a) => a.candidates);
  row("candidates per brief", (a) => a.candidates_per_brief);
  row("unique ideas", (a) => a.unique_ideas);
  row("duplicate rate", (a) => a.duplicate_rate);
  console.log("");
  row("director approval %", (a) => `${a.approval_rate}%`);
  row("PURSUE %", (a) => `${a.pursue_rate}%`);
  row("MODIFY %", (a) => `${a.modify_rate}%`);
  row("REJECT %", (a) => `${a.reject_rate}%`);
  console.log("");
  row("mechanism confidence", (a) => a.mechanism_confidence);
  row("mechanismless %", (a) => `${a.mechanismless_rate}%`);
  row("breakthrough briefs", (a) => `${a.breakthrough_briefs}/${a.briefs}`);
  console.log("");
  for (const band of ["ECHO", "TRANSFORMED", "OBLIQUE", "DISCONNECTED"]) {
    row(`  ${band.toLowerCase()}`, (a) => a.bands[band] || 0);
  }
  console.log("");
  row("dropped by self-critique", (a) => a.critique_dropped);
  row("reviews a model answered", (a) => a.critique_llm_reviewed);

  for (const a of arms) {
    if (!a.ran) console.log(`\n  ${a.arm}: NOT RUN — ${a.reason}`);
  }

  console.log("\n" + bar);
  console.log("WHAT THE SELF-CRITIQUE CHANGED (arm B, with and without)");
  console.log(bar);
  const cmp = (label: string, on: unknown, off: unknown) =>
    console.log(`  ${label.padEnd(28)}${String(off).padStart(14)}${String(on).padStart(14)}`);
  console.log(`  ${"".padEnd(28)}${"no critique".padStart(14)}${"critique".padStart(14)}`);
  cmp("candidates", Bnc.candidates, B.candidates);
  cmp("director approval %", `${Bnc.approval_rate}%`, `${B.approval_rate}%`);
  cmp("PURSUE %", `${Bnc.pursue_rate}%`, `${B.pursue_rate}%`);
  cmp("mechanism confidence", Bnc.mechanism_confidence, B.mechanism_confidence);
  cmp("disconnected", Bnc.bands.DISCONNECTED || 0, B.bands.DISCONNECTED || 0);
  cmp("transformed", Bnc.bands.TRANSFORMED || 0, B.bands.TRANSFORMED || 0);
  cmp("breakthrough briefs", Bnc.breakthrough_briefs, B.breakthrough_briefs);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "generation-abc.json"),
    JSON.stringify({ dataset_id, llm_status: status, A, B, B_no_critique: Bnc, C }, null, 2)
  );
  console.log(`\nWritten to ${path.join(outDir, "generation-abc.json")}`);
}

main();
