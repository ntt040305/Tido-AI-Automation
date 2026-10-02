import { execFileSync } from "child_process";
import path from "path";

/**
 * The CIOS regression suite, behind `npm test`.
 *
 * Phase 4.0.3.7 asked for `npm test` and the package had no test script — the
 * suites have always been run one file at a time. This runs all of them in one
 * pass and fails on the first suite that fails, which is what a CI step needs.
 *
 * Each entry is a standalone script that prints its own "N passed, M failed"
 * line and exits non-zero on failure. Nothing here interprets that output; the
 * exit code is the contract.
 */

const SUITES = [
  // Knowledge and retrieval
  "run-reasoning-knowledge-tests",
  "run-knowledge-quality-tests",
  "run-knowledge-expansion-tests",
  // Creative decision and concept
  "run-creative-decision-tests",
  "run-creative-concept-tests",
  "run-slot-propagation-tests",
  "run-cios-shadow-tests",
  // Benchmarks
  "run-creative-benchmark-tests",
  "run-human-benchmark-tests",
  "run-concept-benchmark-tests",
  // Human insight, in the order the phases built it
  "run-insight-tests",
  "run-insight-l10-tests",
  "run-insight-l11-tests",
  "run-insight-l12-tests",
  // Creative taste
  "run-taste-tests",
  "run-taste-l2-tests",
  "run-taste-l3-tests",
  // Taste memory
  "run-taste-memory-tests",
  "run-taste-intelligence-tests",
  // Candidate population
  "run-population-tests",
  "run-critique-tests",
  // Image transport
  "run-image-transport-tests",
  // Prompt compilation
  "run-prompt-optimization-tests",
  // Creative Director Engine
  "run-director-tests",
  "run-commercial-execution-tests",
  "run-visual-controls-tests",
  "run-visual-controls-integration-tests",
  "run-content-message-tests",
  "run-asset-reasoning-tests",
  "run-creative-quality-tests",
  "run-creative-intelligence-tests",
  "run-vision-loop-tests",
  "run-asset-dna-tests",
  "run-user-kit-tests",
  "run-user-memory-tests",
  "run-asset-memory-tests",
  "run-asset-semantics-tests",
  "run-creative-memory-tests",
  "run-data-flow-hardening-tests",
  "run-creative-director-tests",
  "run-design-output-tests",
  "run-typography-composition-tests",
  "run-font-intelligence-tests",
  "run-typography-dna-tests",
  "run-composition-plan-tests",
  "run-prompt-ownership-tests",
  "run-creative-intent-tests",
  "run-vision-review-tests",
  "run-render-rate-limit-tests",
  "run-foundation-tests",
  "run-evolution-tests",
];

/**
 * `--keep-going` runs every suite even after one fails.
 *
 * The default stays as it was -- stop at the first red suite -- because for a CI
 * step the first failure is the answer. The flag exists for the one job the
 * default cannot do: measuring a BASELINE. Stopping at suite 27 of 51 leaves 24
 * suites unmeasured, and a refactor cannot be checked against numbers that were
 * never taken.
 */
const KEEP_GOING = process.argv.includes("--keep-going");

const here = path.dirname(__filename);
let failedSuite = "";
const failedSuites: string[] = [];
const results: { suite: string; line: string }[] = [];

for (const suite of SUITES) {
  process.stdout.write(`${suite.padEnd(34)} `);
  try {
    const out = execFileSync("npx", ["tsx", path.join(here, `${suite}.ts`)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || "completed";
    results.push({ suite, line });
    console.log(line);
  } catch (err: any) {
    const out = String(err.stdout || "") + String(err.stderr || "");
    const line = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || "FAILED";
    results.push({ suite, line });
    console.log(line);
    // Print the failures the suite reported, then stop: a red suite makes every
    // number after it uninterpretable.
    const detail = out.slice(out.indexOf("Failures:"));
    if (detail.startsWith("Failures:")) console.log(detail.trim());
    failedSuite = failedSuite || suite;
    failedSuites.push(suite);
    if (!KEEP_GOING) break;
  }
}

const total = results.reduce(
  (acc, r) => {
    const m = r.line.match(/(\d+) passed, (\d+) failed/);
    if (m) {
      acc.passed += Number(m[1]);
      acc.failed += Number(m[2]);
    }
    return acc;
  },
  { passed: 0, failed: 0 }
);

console.log("\n" + "=".repeat(56));
console.log(`${results.length}/${SUITES.length} suites · ${total.passed} passed, ${total.failed} failed`);
console.log("=".repeat(56));

if (failedSuite) {
  if (KEEP_GOING) {
    console.log(`\nFailing suites (${failedSuites.length}): ${failedSuites.join(", ")}`);
  } else {
    console.log(`\nStopped at ${failedSuite}. Re-run with --keep-going to measure every suite.`);
  }
  process.exit(1);
}
