import fs from "fs";
import path from "path";
import { CompactPromptFormatter } from "./compiler/CompactPromptFormatter";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";

/**
 * MASTER_PROMPT_OPTIMIZATION_V2 — Task 7.
 *
 *   npx tsx lib/image-engine/run-prompt-optimization-v2.ts [--all] [--file PATH]
 *
 * Replays the V2 pipeline over master prompts this system actually produced and
 * wrote to disk, rather than over a synthetic prompt built to be compressible.
 * The default subject is the largest Bernard Cafe render on disk.
 *
 * Preservation is checked, not assumed: the report names what was removed and
 * separately confirms that identity, composition, lighting and visual direction
 * are still in the output. A compression ratio on its own says nothing about
 * whether the picture will still be right.
 */

const args = process.argv.slice(2);
const RENDERS = "data/generated/image-renders";

/** Lines that must survive. Absence of any of these is a failure, not a saving. */
const PRESERVE_CHECKS: { name: string; pattern: RegExp }[] = [
  { name: "product identity", pattern: /PRODUCT IDENTITY|identity lock|preserve[^.\n]*(?:silhouette|label|logo|geometry)/i },
  { name: "reference relationship", pattern: /REFERENCE (?:INTERPRETATION|SEMANTICS)|reference image/i },
  { name: "composition", pattern: /composition|visual hierarchy|layout|framing/i },
  { name: "camera", pattern: /camera|perspective|viewpoint|lens|angle/i },
  { name: "lighting", pattern: /light(?:ing)?|illuminat/i },
  { name: "materials", pattern: /material|surface|texture|finish/i },
  { name: "realism", pattern: /realis(?:m|tic)|physical|coheren/i },
  { name: "typography / copy", pattern: /typograph|readable copy|text/i },
];

function findBernard(): string {
  const dirs = fs.existsSync(RENDERS) ? fs.readdirSync(RENDERS) : [];
  let best = "";
  let bestSize = 0;
  for (const d of dirs) {
    const f = path.join(RENDERS, d, "master_prompt.md");
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, "utf-8");
    if (!/bernard/i.test(content)) continue;
    if (content.length > bestSize) {
      bestSize = content.length;
      best = f;
    }
  }
  return best;
}

/**
 * The knowledge section, compressed the way the compiler now compresses it.
 *
 * The compiler applies `KnowledgeBlockCompressor` while rendering blocks, before
 * the template is filled. A prompt already on disk was compiled before that
 * existed, so replaying V2 over it means applying the same compression to the
 * section it would have applied it to.
 */
function compressKnowledgeSection(prompt: string): { text: string; saved: number; blocks: number } {
  const start = prompt.indexOf("## PROFESSIONAL KNOWLEDGE");
  if (start < 0) return { text: prompt, saved: 0, blocks: 0 };
  const after = prompt.indexOf("\n## ", start + 1);
  const end = after < 0 ? prompt.length : after;
  const section = prompt.slice(start, end);

  const parts = section.split(/\n(?=#### )/);
  const head = parts.shift() || "";
  let blocks = 0;
  const rebuilt = parts.map((block) => {
    const nl = block.indexOf("\n");
    if (nl < 0) return block;
    blocks++;
    const heading = block.slice(0, nl);
    const body = block.slice(nl + 1);
    return `${heading}\n${KnowledgeBlockCompressor.compress(body).text}`;
  });

  const compressed = [head.trimEnd(), ...rebuilt].join("\n");
  return {
    text: prompt.slice(0, start) + compressed + prompt.slice(end),
    saved: section.length - compressed.length,
    blocks,
  };
}

function report(file: string): { before: number; after: number; ok: boolean } {
  const raw = fs.readFileSync(file, "utf-8");
  const bar = "=".repeat(88);
  console.log(bar);
  console.log(`SUBJECT  ${file}`);
  console.log(bar);

  const knowledge = compressKnowledgeSection(raw);
  const optimized = ProviderPromptOptimizer.optimize(knowledge.text);
  const compact = CompactPromptFormatter.format(optimized.optimizedPrompt, ProviderPromptOptimizer.WARN_THRESHOLD);
  const final = compact.applied ? compact.prompt : optimized.optimizedPrompt;

  const before = raw.length;
  const after = final.length;

  console.log("\nSTAGES");
  console.log(`  compiled                       ${String(before).padStart(7)}`);
  console.log(
    `  knowledge blocks compressed    ${String(knowledge.text.length).padStart(7)}   (-${knowledge.saved}, ${knowledge.blocks} blocks)`
  );
  console.log(
    `  non-generative + merges + tier ${String(optimized.telemetry.after_chars).padStart(7)}   ` +
      `(-${knowledge.text.length - optimized.telemetry.after_chars}, ${optimized.telemetry.merges_applied} merges)`
  );
  console.log(`  compact format                 ${String(after).padStart(7)}   ${compact.applied ? "applied" : "NOT applied"}`);
  console.log(`\n  ratio                          ${((after / before) * 100).toFixed(1)}% of original`);
  console.log(`  saved                          ${before - after} chars`);

  const status =
    after > ProviderPromptOptimizer.HARD_LIMIT
      ? "OVER HARD LIMIT"
      : after > ProviderPromptOptimizer.SOFT_THRESHOLD
        ? "COMPRESSING"
        : "OK";
  console.log(
    `  budget                         ${status}  (soft ${ProviderPromptOptimizer.SOFT_THRESHOLD}, ` +
      `hard ${ProviderPromptOptimizer.HARD_LIMIT})`
  );

  console.log("\nREMOVED");
  for (const r of optimized.telemetry.removed_sections) console.log(`  - ${r}`);
  if (!optimized.telemetry.removed_sections.length) console.log("  (nothing matched)");

  console.log("\nPRESERVED (checked against the final prompt)");
  let ok = true;
  for (const c of PRESERVE_CHECKS) {
    const present = c.pattern.test(final);
    if (!present) ok = false;
    console.log(`  ${present ? "kept   " : "MISSING"}  ${c.name}`);
  }
  if (compact.applied) {
    console.log(`\n  compact sections: ${compact.sections.join(" · ")}`);
    if (compact.unmapped.length) console.log(`  kept as additional direction: ${compact.unmapped.join(", ")}`);
  } else {
    console.log(`\n  compact format skipped: ${compact.reason}`);
  }

  if (args.includes("--sample")) {
    console.log("\nFIRST 1200 CHARS OF THE FINAL PROMPT");
    console.log("-".repeat(88));
    console.log(final.slice(0, 1200));
    console.log("-".repeat(88));
  }

  return { before, after, ok };
}

function main() {
  const explicit = args.includes("--file") ? args[args.indexOf("--file") + 1] : "";
  if (explicit) {
    report(explicit);
    return;
  }

  if (args.includes("--all")) {
    const dirs = fs.existsSync(RENDERS) ? fs.readdirSync(RENDERS) : [];
    const files = dirs
      .map((d) => path.join(RENDERS, d, "master_prompt.md"))
      .filter((f) => fs.existsSync(f))
      .map((f) => ({ f, size: fs.statSync(f).size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 20);

    let before = 0;
    let after = 0;
    let failures = 0;
    for (const { f } of files) {
      const r = report(f);
      before += r.before;
      after += r.after;
      if (!r.ok) failures++;
      console.log("");
    }
    console.log("=".repeat(88));
    console.log(`ACROSS ${files.length} LARGEST PROMPTS`);
    console.log("=".repeat(88));
    console.log(`  total ${before} -> ${after}  (${((after / before) * 100).toFixed(1)}%)`);
    console.log(`  mean  ${Math.round(before / files.length)} -> ${Math.round(after / files.length)}`);
    console.log(`  prompts with a missing preserved element: ${failures}`);
    return;
  }

  const bernard = findBernard();
  if (!bernard) {
    console.error("No Bernard Cafe master prompt found under", RENDERS);
    process.exit(1);
  }
  report(bernard);
}

main();
