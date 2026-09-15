import assert from "assert";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The optimizer's ceiling comes from configuration, and nothing inside it still
 * assumes 20,000.
 *
 * Why most of this runs in child processes
 * ----------------------------------------
 * `HARD_LIMIT` is a `static readonly` initialised at MODULE LOAD. Setting
 * `process.env` inside a test that has already imported the class changes
 * nothing, and a suite written that way passes while proving nothing — the
 * exact mistake that let a benchmark in this project measure a degraded prompt
 * for a week. So each configuration is exercised in a fresh Node process with
 * the environment set before the import happens.
 *
 * The one in-process case is the unconfigured fallback, which this runner
 * inherits.
 */

const HERE = __dirname;
let probeSeq = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err?.message || String(err)}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${err?.message || String(err)}`);
  }
}

/**
 * Boots the optimizer in a fresh process under `env` and reports what it
 * resolved, plus what it does to a prompt of `promptChars`.
 */
function probe(env: Record<string, string | undefined>, promptChars: number) {
  const script = `
    const { ProviderPromptOptimizer: O } = require(${JSON.stringify(
      path.join(HERE, "compiler", "ProviderPromptOptimizer.ts")
    )});
    // Proportions taken from a real compiled prompt so the before/after figures
    // mean something. An earlier draft put every spare character into
    // PROFESSIONAL KNOWLEDGE, which is P1: the old ceiling then deleted 98% of
    // the prompt in one move, and the comparison flattered the fix.
    const fill = (tag, chars) => {
      const out = [];
      let total = 0, n = 0;
      while (total < chars) {
        const l = tag + " substantive instruction " + n + " " + "z".repeat(40);
        out.push(l); total += l.length + 1; n++;
      }
      return out.join("\\n");
    };
    const W = ${promptChars};
    const prompt = [
      "## ROLE", fill("role", W * 0.03),
      "## CREATIVE INTENT", fill("intent", W * 0.16),
      "## CAMPAIGN STRATEGY", fill("strategy", W * 0.18),
      "## USER HARD REQUIREMENTS", fill("uhr", W * 0.17),
      "## PRODUCT INSTANCE REQUIREMENTS", fill("product", W * 0.07),
      "## ART DIRECTION", fill("art", W * 0.11),
      "## COMMERCIAL LAYOUT", fill("layout", W * 0.08),
      "## PROFESSIONAL KNOWLEDGE", fill("knowledge", W * 0.08),
      "## BRAND KNOWLEDGE", fill("brand", W * 0.05),
      "## OUTPUT CONTEXT", fill("ctx", W * 0.04),
      "## CONFLICT PRIORITY", fill("conflict", W * 0.03),
      "## FINAL OUTPUT", fill("final", W * 0.04),
    ].join("\\n");
    const res = O.optimize(prompt);
    process.stdout.write("@@" + JSON.stringify({
      hard: O.HARD_LIMIT,
      soft: O.SOFT_THRESHOLD,
      warn: O.WARN_THRESHOLD,
      before: prompt.length,
      after: res.optimizedPrompt.length,
      status: res.telemetry.budget_status,
      removed: res.telemetry.removed_sections,
      kept_art: res.optimizedPrompt.includes("## ART DIRECTION"),
    }) + "@@");
  `;
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  // Written to a file rather than passed with `-e`: the script carries quotes,
  // backslashes and newlines, and on Windows those do not survive the shell.
  const file = path.join(os.tmpdir(), `tido-ceiling-${process.pid}-${probeSeq++}.ts`);
  let out = "";
  try {
    fs.writeFileSync(file, script, "utf-8");
    out = execFileSync("npx", ["tsx", file], {
      cwd: path.join(HERE, "..", ".."),
      env: childEnv,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* the probe result matters, the temp file does not */
    }
  }
  const m = out.match(/@@([\s\S]*?)@@/);
  if (!m) throw new Error(`child produced no result: ${out.slice(-400)}`);
  return JSON.parse(m[1]) as {
    hard: number;
    soft: number;
    warn: number;
    before: number;
    after: number;
    status: string;
    removed: string[];
    kept_art: boolean;
  };
}

console.log("=".repeat(74));
console.log("ProviderPromptOptimizer — ceiling alignment");
console.log("=".repeat(74));
console.log(`  PROMPT_HARD_MAXIMUM_CHARS in this process : ${process.env.PROMPT_HARD_MAXIMUM_CHARS ?? "(unset)"}`);
console.log("");

/* eslint-disable @typescript-eslint/no-var-requires */
const { ProviderPromptOptimizer } = require("./compiler/ProviderPromptOptimizer");

// ── the configured value is honoured ──────────────────────────────────────
// The signal budget is switched off in these cases on purpose. They are about
// the ceiling, and leaving both budgets live would mean a failure here could not
// be attributed to either. The budget has its own cases further down.
const at30k = probe({ PROMPT_HARD_MAXIMUM_CHARS: "30000", PROMPT_MAX_GENERIC_RATIO: "99" }, 26000);

check("PROMPT_HARD_MAXIMUM_CHARS=30000 is the ceiling the optimizer holds to", () => {
  assert.strictEqual(at30k.hard, 30000, `optimizer resolved ${at30k.hard}`);
});

check("no hidden 20000 remains: a 26k prompt is not cut to 20k", () => {
  assert.ok(at30k.before > 20000, `fixture is ${at30k.before}, not above the old literal`);
  assert.ok(
    at30k.after > 20000,
    `output was ${at30k.after} — something still enforces the old 20,000 limit`
  );
  assert.ok(at30k.after <= 30000, `output was ${at30k.after}, above the configured ceiling`);
});

check("under the configured ceiling nothing is dropped whole", () => {
  assert.deepStrictEqual(
    at30k.removed.filter((r) => r !== "FORMATTING_COMPRESSION"),
    [],
    `sections were dropped under the ceiling: ${at30k.removed.join(", ")}`
  );
  assert.strictEqual(at30k.kept_art, true, "ART DIRECTION was dropped");
});

check("budget_status is measured against the configured ceiling", () => {
  assert.notStrictEqual(at30k.status, "OVER_HARD_LIMIT", `status was ${at30k.status} at ${at30k.after} chars`);
});

// ── backward compatibility ────────────────────────────────────────────────
const unset = probe({ PROMPT_HARD_MAXIMUM_CHARS: undefined, PROMPT_MAX_GENERIC_RATIO: "99" }, 26000);

check("an unconfigured environment still behaves exactly as before", () => {
  assert.strictEqual(unset.hard, 20000, `fallback resolved to ${unset.hard}`);
  assert.strictEqual(unset.soft, 17000, `soft threshold moved to ${unset.soft}`);
  assert.ok(unset.removed.length > 0, "an oversized prompt dropped nothing under the old ceiling");
});

check("the same prompt is reduced under the old ceiling and not under the new one", () => {
  assert.ok(
    unset.after < at30k.after,
    `unset=${unset.after} vs 30000=${at30k.after} — the ceiling made no difference`
  );
});

// ── the bands cannot invert ───────────────────────────────────────────────
const tiny = probe({ PROMPT_HARD_MAXIMUM_CHARS: "12000", PROMPT_MAX_GENERIC_RATIO: "99" }, 14000);

check("a ceiling below the soft threshold clamps it instead of inverting the bands", () => {
  assert.strictEqual(tiny.hard, 12000);
  assert.ok(tiny.soft <= tiny.hard, `soft ${tiny.soft} is above hard ${tiny.hard}`);
  assert.strictEqual(tiny.warn, tiny.soft, "the WARN_THRESHOLD alias drifted from SOFT_THRESHOLD");
});

check("a malformed value falls back rather than producing NaN", () => {
  const bad = probe({ PROMPT_HARD_MAXIMUM_CHARS: "not-a-number", PROMPT_MAX_GENERIC_RATIO: "99" }, 22000);
  assert.strictEqual(bad.hard, 20000, `malformed config resolved to ${bad.hard}`);
});

check("a non-positive value falls back rather than disabling the optimizer", () => {
  const zero = probe({ PROMPT_HARD_MAXIMUM_CHARS: "0", PROMPT_MAX_GENERIC_RATIO: "99" }, 22000);
  assert.strictEqual(zero.hard, 20000, `zero resolved to ${zero.hard}`);
});

// ── determinism and alias integrity, in this process ──────────────────────
check("the resolved ceiling is deterministic within a process", () => {
  assert.strictEqual(ProviderPromptOptimizer.HARD_LIMIT, ProviderPromptOptimizer.HARD_LIMIT);
  assert.strictEqual(ProviderPromptOptimizer.WARN_THRESHOLD, ProviderPromptOptimizer.SOFT_THRESHOLD);
  assert.ok(
    ProviderPromptOptimizer.SOFT_THRESHOLD <= ProviderPromptOptimizer.HARD_LIMIT,
    "the soft threshold sits above the hard limit"
  );
});

check("the optimizer no longer contradicts the validator that blocks the render", () => {
  const { PromptBudgetValidator } = require("./compiler/PromptBudgetValidator");
  assert.ok(
    ProviderPromptOptimizer.HARD_LIMIT <= PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT,
    `optimizer ${ProviderPromptOptimizer.HARD_LIMIT} exceeds the provider limit ` +
      `${PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT}, so it would pass on prompts the render refuses`
  );
});

// ── the creative signal budget ────────────────────────────────────────────
console.log("\nCreative signal budget\n");

/** A prompt whose generic content outweighs its decided direction. */
function dilutedPrompt(creativeChars: number, genericChars: number): string {
  const fill = (tag: string, chars: number) => {
    const out: string[] = [];
    let total = 0;
    let n = 0;
    while (total < chars) {
      const l = `${tag} substantive instruction ${n} ${"z".repeat(40)}`;
      out.push(l);
      total += l.length + 1;
      n++;
    }
    return out.join("\n");
  };
  return [
    "## ROLE",
    fill("role", 400),
    "## ART DIRECTION",
    fill("art", creativeChars / 2),
    "## CREATIVE INTENT",
    fill("intent", creativeChars / 2),
    "## PROFESSIONAL KNOWLEDGE",
    fill("knowledge", genericChars),
    "## CONFLICT PRIORITY",
    fill("conflict", 300),
  ].join("\n");
}

check("signalMix separates decided direction from general craft", () => {
  const mix = ProviderPromptOptimizer.signalMix(dilutedPrompt(4000, 8000));
  assert.ok(mix.creative > 3500, `creative measured ${mix.creative}`);
  assert.ok(mix.generic > 7500, `generic measured ${mix.generic}`);
  assert.ok(mix.ratio > 1.5, `ratio measured ${mix.ratio}`);
  // ROLE and CONFLICT PRIORITY are scaffolding and belong to neither side.
  assert.ok(mix.sections["ROLE"] > 0, "the section map is empty");
  assert.ok(
    mix.creative + mix.generic < dilutedPrompt(4000, 8000).length,
    "scaffolding was charged to one of the two sides"
  );
});

check("A dilute prompt is corrected even when it is well under the ceiling", () => {
  // The whole point of a second budget. This prompt breaks no length limit and
  // is exactly the failure that shipped: accepted by every threshold, and
  // rendered generic.
  const prompt = dilutedPrompt(4000, 8000);
  assert.ok(
    prompt.length < ProviderPromptOptimizer.HARD_LIMIT,
    `fixture is ${prompt.length}, not under the ceiling`
  );
  const out = ProviderPromptOptimizer.optimize(prompt);
  const after = ProviderPromptOptimizer.signalMix(out.optimizedPrompt);
  assert.ok(after.ratio <= 0.15, `ratio is still ${after.ratio}`);
  assert.ok(
    out.telemetry.removed_sections.some((r: string) => /PROFESSIONAL KNOWLEDGE/.test(r)),
    "the generic block survived"
  );
});

check("PRESERVED: correcting the mix removes dilution, never the decision", () => {
  const prompt = dilutedPrompt(4000, 8000);
  const before = ProviderPromptOptimizer.signalMix(prompt);
  const after = ProviderPromptOptimizer.signalMix(
    ProviderPromptOptimizer.optimize(prompt).optimizedPrompt
  );
  assert.strictEqual(
    after.creative,
    before.creative,
    "creative content changed while the budget was being enforced"
  );
  assert.ok(after.generic < before.generic, "no dilution was removed");
});

check("A prompt already within the budget is left alone", () => {
  const prompt = dilutedPrompt(8000, 500);
  const before = ProviderPromptOptimizer.signalMix(prompt);
  assert.ok(before.ratio <= 0.15, `fixture starts at ${before.ratio}`);
  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok(
    !out.telemetry.removed_sections.some((r: string) => /PROFESSIONAL KNOWLEDGE/.test(r)),
    "a prompt inside the budget was reduced anyway"
  );
});

check("The budget is configurable, and can be switched off entirely", () => {
  const off = probe({ PROMPT_HARD_MAXIMUM_CHARS: "32000", PROMPT_MAX_GENERIC_RATIO: "99" }, 24000);
  const on = probe({ PROMPT_HARD_MAXIMUM_CHARS: "32000", PROMPT_MAX_GENERIC_RATIO: "0.15" }, 24000);
  assert.ok(
    on.after < off.after,
    `the budget made no difference: off=${off.after} on=${on.after}`
  );
  // Switched off, the ceiling alone governs — the behaviour this repairs.
  assert.strictEqual(off.status !== "OVER_HARD_LIMIT", true, "the disabled case broke the ceiling");
});

check("Telemetry reports the mix on every run, not only when it is wrong", () => {
  // The regression was invisible for a day because nothing printed the ratio;
  // the length was inside every limit the whole time.
  const src = fs.readFileSync(path.join(HERE, "compiler", "ProviderPromptOptimizer.ts"), "utf-8");
  const block = src.slice(src.indexOf('console.log("[PROMPT_OPTIMIZER]"'), src.indexOf("if (mix.ratio >"));
  for (const field of ["creative_chars", "generic_chars", "generic_ratio", "section_chars"]) {
    assert.ok(block.includes(field), `${field} is not logged on every run`);
  }
  assert.ok(/SIGNAL_DILUTE/.test(src), "a prompt that cannot be corrected is not reported");
});

console.log("\n" + "-".repeat(74));
console.log("Before / after, same 26,000-character prompt:");
console.log(`  ceiling 20000 (unset)  : ${unset.before} -> ${unset.after}   dropped: ${unset.removed.join(", ") || "none"}`);
console.log(`  ceiling 30000          : ${at30k.before} -> ${at30k.after}   dropped: ${at30k.removed.join(", ") || "none"}`);
console.log("-".repeat(74));

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
