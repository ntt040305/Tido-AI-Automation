import fs from "fs";
import path from "path";
import { BenchmarkComparisonEngine } from "./benchmark/BenchmarkComparisonEngine";
import { BenchmarkDatasetRepository } from "./benchmark/BenchmarkDatasetRepository";
import { BenchmarkReportGenerator } from "./benchmark/BenchmarkReportGenerator";
import { BlindReviewPreparer } from "./benchmark/BlindReviewPreparer";
import { BenchmarkCaseResult } from "./benchmark/creative-benchmark.types";

/**
 * Benchmark execution runner.
 *
 *   npx tsx lib/image-engine/run-creative-benchmark.ts [--out DIR] [--industry X]
 *
 * Offline only. Live mode needs a legacy concept provider injected by the caller,
 * and that costs one LLM call per case — deliberately not something a script run
 * from a terminal does by default.
 *
 * Artefacts written
 * -----------------
 *   report.json        aggregate report, every case result inside it
 *   cases/<id>.json    one file per case: both outputs, scores, reasoning trace
 *   knowledge_usage.csv every retrieval across the run, one row per object
 *   blind_packet.json  the file a reviewer receives
 *   blind_key.json     the file they must not
 *
 * The packet and the key are separate files on purpose. Written into one object
 * the blinding becomes a matter of who remembers not to scroll.
 */

function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
    .join("\n");
}

/** Every retrieval in the run, flattened so the corpus can be analysed directly. */
function knowledgeUsageCsv(results: BenchmarkCaseResult[]): string {
  const rows: string[][] = [
    ["case_id", "industry", "knowledge_id", "domain", "score", "context_relevance", "routed_to", "dimension", "rule"],
  ];
  for (const r of results) {
    for (const k of r.reasoning_trace?.retrieved || []) {
      rows.push([
        r.case_id,
        r.industry,
        k.knowledge_id,
        k.domain,
        k.score.toFixed(3),
        k.context_relevance.toFixed(3),
        k.routed_to,
        k.dimension || "",
        k.rule,
      ]);
    }
  }
  return toCsv(rows);
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".benchmark-out";
  const industry = args.includes("--industry") ? args[args.indexOf("--industry") + 1] : undefined;

  const repo = new BenchmarkDatasetRepository();
  const dataset = repo.load();
  const cases = industry ? repo.getByIndustry(industry as any) : repo.getCases();

  if (!cases.length) {
    console.error(`No cases found${industry ? ` for industry "${industry}"` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${cases.length} case(s) in offline mode…`);
  const started = Date.now();
  const results = await BenchmarkComparisonEngine.runAll(cases, { mode: "offline" });
  const report = BenchmarkReportGenerator.generate(results, {
    datasetId: dataset.dataset_id,
    mode: "offline",
    reportId: "creative_benchmark_v1",
  });

  console.log("\n" + BenchmarkReportGenerator.format(report));
  console.log(`\nCompleted in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const { packet, key } = BlindReviewPreparer.prepare(results, cases);
  const blindProblems = BlindReviewPreparer.assertBlind(packet);

  fs.mkdirSync(path.join(outDir, "cases"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  for (const r of results) {
    fs.writeFileSync(path.join(outDir, "cases", `${r.case_id}.json`), JSON.stringify(r, null, 2));
  }
  fs.writeFileSync(path.join(outDir, "knowledge_usage.csv"), knowledgeUsageCsv(results));
  fs.writeFileSync(path.join(outDir, "blind_packet.json"), JSON.stringify(packet, null, 2));
  fs.writeFileSync(path.join(outDir, "blind_key.json"), JSON.stringify(key, null, 2));

  const retrievals = results.reduce((n, r) => n + (r.reasoning_trace?.retrieved.length || 0), 0);
  console.log(
    `\nWrote report.json, ${results.length} case files, knowledge_usage.csv (${retrievals} retrievals), ` +
      `blind_packet.json and blind_key.json to ${outDir}/`
  );

  if (blindProblems.length) {
    // A warning, not an error: the packet is still usable for the direction
    // dimensions. It is the concept questions that cannot be asked of it, and
    // saying so here is what stops it being handed over as though they could.
    console.log("\n⚠ The blind packet is NOT safe for concept-level review:");
    blindProblems.slice(0, 3).forEach((p) => console.log("   - " + p));
    console.log("   Run in live mode, or restrict review to direction dimensions.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
