/**
 * Grades stored prompts against the agency ladder. Free, deterministic, offline.
 *
 *   npx tsx lib/image-engine/run-prompt-grader.ts                  # newest creative-quality run
 *   npx tsx lib/image-engine/run-prompt-grader.ts --run=<dir>      # a specific run directory
 *   npx tsx lib/image-engine/run-prompt-grader.ts --file=<path>    # one prompt
 *   npx tsx lib/image-engine/run-prompt-grader.ts --detail=<case>  # the evidence for one case
 *
 * Reads `master_prompt.md` files, which hold what was SENT (since 8b9ef17; files
 * written before it are missing the execution tail and are reported as such).
 */
import fs from "fs";
import path from "path";
import {
  AGENCY_THRESHOLDS,
  MEASURABLE_DOMAINS,
  gradePrompt,
  type PromptGrade,
} from "./benchmark/PromptGrader";

const args = process.argv.slice(2);
const arg = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const BENCH_ROOT = path.join("data", "benchmarks", "creative-quality");

function newestRun(): string | null {
  if (!fs.existsSync(BENCH_ROOT)) return null;
  const runs = fs
    .readdirSync(BENCH_ROOT)
    .filter((d) => fs.existsSync(path.join(BENCH_ROOT, d, "cases")))
    .sort();
  return runs.length ? path.join(BENCH_ROOT, runs[runs.length - 1]) : null;
}

function casesIn(runDir: string): Array<{ name: string; file: string }> {
  const dir = path.join(runDir, "cases");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => ({ name, file: path.join(dir, name, "master_prompt.md") }))
    .filter((c) => fs.existsSync(c.file));
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const num = (n: number, w = 5) => String(n).padStart(w);

function row(name: string, g: PromptGrade): string {
  return [
    pad(name, 26),
    num(g.chars, 6),
    `${g.passed}/${g.of}`.padStart(5),
    `${g.l3_slot_coverage}/${MEASURABLE_DOMAINS.length}`.padStart(4),
    num(g.metrics.physical_params, 7),
    num(g.metrics.verdict_words, 6),
    num(g.metrics.category_labels, 7),
    num(g.metrics.dangling_refs, 6),
    num(g.metrics.restated_sentences, 6),
    String(g.metrics.meta_share.toFixed(3)).padStart(6),
    num(g.metrics.duplicate_guardrails, 5),
    (g.metrics.idea_mechanism ? "yes" : "NO").padStart(5),
  ].join(" ");
}

const HEADER = [
  pad("case", 26),
  pad(" chars", 6),
  "gates".padStart(5),
  "  l3".padStart(4),
  " params".padStart(7),
  "verdct".padStart(6),
  " labels".padStart(7),
  "dangl".padStart(6),
  "restd".padStart(6),
  "  meta".padStart(6),
  " dupG".padStart(5),
  " idea".padStart(5),
].join(" ");

function detail(name: string, g: PromptGrade): void {
  console.log(`\n── ${name} ─────────────────────────────────────────────`);
  console.log(`chars ${g.chars} · gates ${g.passed}/${g.of}`);
  console.log("\nDOMAINS");
  for (const d of g.domains) {
    const measurable = MEASURABLE_DOMAINS.includes(d.domain);
    const mark = !measurable ? "   " : d.l3 ? " L3" : " --";
    console.log(
      `${mark} ${pad(d.domain, 15)} lines ${num(d.lines, 4)}  parameterised ${num(d.parameterised, 3)}` +
        (d.examples.length ? `   e.g. ${d.examples.join(" | ")}` : ""),
    );
  }
  console.log("\nGATES");
  for (const gt of g.gates) {
    console.log(`${gt.ok ? " ok " : "FAIL"} ${pad(gt.id, 20)} ${String(gt.value).padStart(6)}  (${gt.threshold})  ${gt.because}`);
  }
  const f = g.found;
  if (f.verdicts.length) console.log(`\nVERDICT WORDS: ${f.verdicts.join(", ")}`);
  if (f.labels.length) console.log(`CATEGORY LABELS: ${[...new Set(f.labels)].join(" | ")}`);
  if (f.dangling.length) console.log(`DANGLING REFERENCES: ${f.dangling.join(" | ")}`);
  if (f.restated.length) console.log(`RESTATED:\n  ${f.restated.join("\n  ")}`);
}

function main(): void {
  const single = arg("file");
  if (single) {
    const g = gradePrompt(fs.readFileSync(single, "utf8"));
    detail(path.basename(single), g);
    return;
  }

  const runDir = arg("run") || newestRun();
  if (!runDir) {
    console.error("No creative-quality run found under", BENCH_ROOT);
    process.exit(1);
  }
  const cases = casesIn(runDir);
  if (!cases.length) {
    console.error("No master_prompt.md files in", runDir);
    process.exit(1);
  }

  const only = arg("detail");
  const graded = cases.map((c) => ({ name: c.name, grade: gradePrompt(fs.readFileSync(c.file, "utf8")) }));

  if (only) {
    const hit = graded.find((g) => g.name === only);
    if (!hit) {
      console.error(`No case named ${only}. Available: ${graded.map((g) => g.name).join(", ")}`);
      process.exit(1);
    }
    detail(hit.name, hit.grade);
    return;
  }

  console.log(`\nPROMPT GRADER — ${runDir}`);
  console.log(`thresholds: ${JSON.stringify(AGENCY_THRESHOLDS)}\n`);
  console.log(HEADER);
  console.log("-".repeat(HEADER.length));
  for (const g of graded) console.log(row(g.name, g.grade));

  const mean = (pick: (g: PromptGrade) => number) =>
    Math.round((graded.reduce((n, g) => n + pick(g.grade), 0) / graded.length) * 100) / 100;

  console.log("-".repeat(HEADER.length));
  console.log(
    row("MEAN", {
      chars: Math.round(mean((g) => g.chars)),
      passed: mean((g) => g.passed),
      of: graded[0].grade.of,
      l3_slot_coverage: mean((g) => g.l3_slot_coverage),
      metrics: {
        verdict_words: mean((g) => g.metrics.verdict_words),
        verdict_words_raw: mean((g) => g.metrics.verdict_words_raw),
        physical_params: mean((g) => g.metrics.physical_params),
        category_labels: mean((g) => g.metrics.category_labels),
        dangling_refs: mean((g) => g.metrics.dangling_refs),
        restated_sentences: mean((g) => g.metrics.restated_sentences),
        meta_lines: mean((g) => g.metrics.meta_lines),
        meta_share: mean((g) => g.metrics.meta_share),
        guardrails: mean((g) => g.metrics.guardrails),
        duplicate_guardrails: mean((g) => g.metrics.duplicate_guardrails),
        consequence_lines: mean((g) => g.metrics.consequence_lines),
        idea_stated: graded.every((g) => g.grade.metrics.idea_stated),
        idea_mechanism: graded.every((g) => g.grade.metrics.idea_mechanism),
      },
      domains: [],
      gates: [],
      found: { verdicts: [], labels: [], dangling: [], restated: [] },
    } as PromptGrade),
  );

  const failing = new Map<string, number>();
  for (const g of graded) for (const gt of g.grade.gates) if (!gt.ok) failing.set(gt.id, (failing.get(gt.id) ?? 0) + 1);
  console.log("\nGATES FAILING, worst first");
  for (const [id, n] of [...failing.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(id, 22)} ${n}/${graded.length} cases`);
  }

  const l3 = new Map<string, number>();
  for (const g of graded) for (const d of g.grade.domains) if (MEASURABLE_DOMAINS.includes(d.domain) && d.l3) l3.set(d.domain, (l3.get(d.domain) ?? 0) + 1);
  console.log("\nL3 BY DOMAIN (cases reaching at least one physical parameter)");
  for (const d of MEASURABLE_DOMAINS) console.log(`  ${pad(d, 14)} ${l3.get(d) ?? 0}/${graded.length}`);
  console.log(`\nRun --detail=<case> for the evidence behind one row.\n`);
}

main();
