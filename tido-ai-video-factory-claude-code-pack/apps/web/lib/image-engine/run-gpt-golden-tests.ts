/**
 * Golden tests for the GPT dialect's brief and its code-built prompt. Offline, no cost.
 *
 * WHY THIS EXISTS
 * ---------------
 * The art-director work adds a second way to write a Sunburst master prompt, behind
 * `GPT_ART_DIRECTOR`. The whole safety argument for that flag is "with it off, nothing
 * changes" — and before this file that was an opinion. It is now a file comparison:
 * fourteen briefs through the real compiler, byte-for-byte against stored text.
 *
 * WHAT IT PINS, AND WHAT IT DELIBERATELY DOES NOT
 * -----------------------------------------------
 * Pinned: the filled request template (every slot the director is shown) and
 * `buildGptFallbackPrompt` (the prompt sent when the director fails twice). Both are
 * pure functions of the brief, so a golden over them is stable.
 *
 * Not pinned: anything the director writes. That is a model call — not deterministic,
 * not free, and a golden over it would be a flake generator.
 *
 * TWO DIRECTORIES, ONE SUITE
 * --------------------------
 *   golden/gpt/        flag OFF. The baseline. A diff here means the rollback moved.
 *   golden/gpt-ad/     flag ON.  The art-director output, so its own changes are visible.
 *
 * HOW TO UPDATE
 * -------------
 * `npx tsx lib/image-engine/run-gpt-golden-tests.ts --update` rewrites them. Updating is
 * a deliberate act and the diff belongs in the commit message: a golden that changes
 * silently is worse than no golden.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import {
  GPT_BRIEF_FIXTURES,
  artDirectorBriefInputFor,
  briefInputFor,
  type GptBriefFixture,
} from "./prompt-v2/gpt-brief-fixtures";
import { buildGptMessages } from "./prompt-v2/build-gpt";
import { buildGptFallbackPrompt } from "./prompt-v2/gpt-fallback";
import { clearTemplateCache } from "./prompt-v2/templates";

const UPDATE = process.argv.includes("--update");
// Inside the source tree: `apps/web/data` is gitignored, and a golden that is not
// committed is not a golden.
const ROOT = path.join(__dirname, "prompt-v2", "golden");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    const first = (e as Error).message.split("\n").slice(0, 3).join("\n    ");
    failures.push(`${name}\n    ${first}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${first}`);
  }
}

/**
 * The whole deterministic output for one fixture, as one text file.
 *
 * One file rather than two because the two halves are read together: a reviewer asking
 * "what did the director see, and what would it have got without one" wants both on the
 * screen at once.
 */
function renderFixture(fx: GptBriefFixture, artDirector: boolean): string {
  const input = artDirector ? artDirectorBriefInputFor(fx) : briefInputFor(fx);
  const built = buildGptMessages(input);
  const fallback = buildGptFallbackPrompt(input, built.templates.playbook);
  return [
    `# ${fx.id}`,
    `# ${fx.notes}`,
    `# templates: ${built.templates.version} / ${built.templates.playbookName} / ${built.templates.dialect}`,
    "",
    ...(artDirector
      ? [
          "=== ART DIRECTION SHEET (the decisions, with their concrete values) ===",
          JSON.stringify(input.sheet, null, 2),
          "",
          `=== PRINT RULE (${input.printRule?.branch}) ===`,
          `${input.printRule?.text}`,
          `reason: ${input.printRule?.reason}`,
          "",
        ]
      : []),
    "=== DIRECTOR REQUEST (the filled request template) ===",
    built.user.content,
    "",
    "=== CODE-BUILT FALLBACK PROMPT ===",
    fallback,
    "",
  ].join("\n");
}

function goldenPath(dir: string, id: string): string {
  return path.join(ROOT, dir, `${id}.txt`);
}

function compare(dir: string, fx: GptBriefFixture, actual: string) {
  const file = goldenPath(dir, fx.id);
  if (UPDATE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, actual, "utf8");
    return;
  }
  assert.ok(fs.existsSync(file), `no golden at ${path.relative(process.cwd(), file)} — run with --update`);
  const expected = fs.readFileSync(file, "utf8");
  if (expected !== actual) {
    // The first differing line is the useful part of a 4,000-character diff.
    const a = expected.split("\n");
    const b = actual.split("\n");
    const at = a.findIndex((line, i) => line !== b[i]);
    throw new Error(
      `golden drift at line ${at + 1}\n    expected: ${JSON.stringify(a[at]?.slice(0, 120))}\n    actual:   ${JSON.stringify(b[at]?.slice(0, 120))}`,
    );
  }
}

async function main() {
  console.log(`\nGPT dialect golden tests${UPDATE ? " (UPDATING)" : ""}\n`);

  // ── Flag OFF: the baseline the rollback depends on ─────────────────────
  console.log("flag OFF — today's brief, pinned");
  delete process.env.GPT_ART_DIRECTOR;
  clearTemplateCache();
  for (const fx of GPT_BRIEF_FIXTURES) {
    check(`off/${fx.id}`, () => compare("gpt", fx, renderFixture(fx, false)));
  }

  // ── Flag ON: the art-director output ──────────────────────────────────
  //
  // Skipped entirely while the flag has no effect, so this file is runnable and
  // meaningful from the commit that introduces it rather than only after Phase 2.
  const onDir = path.join(ROOT, "gpt-ad");
  const onExpected = UPDATE || fs.existsSync(onDir);
  if (onExpected) {
    console.log("\nflag ON — the art-director brief, pinned");
    process.env.GPT_ART_DIRECTOR = "true";
    clearTemplateCache();
    for (const fx of GPT_BRIEF_FIXTURES) {
      check(`on/${fx.id}`, () => compare("gpt-ad", fx, renderFixture(fx, true)));
    }
    delete process.env.GPT_ART_DIRECTOR;
    clearTemplateCache();
  } else {
    console.log("\nflag ON — no goldens yet, skipped (run with --update once the flag has an effect)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
