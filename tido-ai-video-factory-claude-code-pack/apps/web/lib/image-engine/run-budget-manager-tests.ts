import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Phase 0A — characterization of `PromptBudgetManagerService.enforceBudget()`.
 *
 * What a characterization test is for
 * -----------------------------------
 * This suite does not assert that the budget manager is correct. It asserts what
 * the budget manager CURRENTLY DOES, including the parts that are wrong, so that
 * Phase 0B can change one behaviour on purpose and prove it changed nothing
 * else. Every assertion below passes on the unmodified file.
 *
 * Four cases document a defect rather than a feature. They are marked DEFECT
 * CAPTURED and each names what Phase 0B is expected to change. An assertion that
 * is not marked that way is a behaviour Phase 0B must preserve exactly.
 *
 * Why the thresholds are read rather than written
 * -----------------------------------------------
 * `EMERGENCY_TARGET` and `HARD_MAXIMUM` are `static readonly`, initialised from
 * `process.env` at MODULE LOAD. A test that hard-coded 22,000 would silently
 * test nothing on a machine where `.env.local` sets 30,000 — which is exactly
 * how a benchmark in this project measured a degraded prompt without noticing.
 * So every fixture is sized relative to the value the class actually holds at
 * runtime, and the suite prints that value before it asserts anything.
 *
 * No production file is modified, and nothing is imported for side effects
 * beyond the service under test.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { PromptBudgetManagerService } = require("./service/PromptBudgetManagerService");
const { ProviderPromptOptimizer } = require("./compiler/ProviderPromptOptimizer");
const {
  tierFor,
  TIER_PROTECTED,
  TIER_CREATIVE,
  TIER_ORDINARY,
  TIER_SUPPORTING,
  TIER_BACKGROUND,
} = require("./compiler/prompt-section-policy");

const TARGET: number = PromptBudgetManagerService.EMERGENCY_TARGET;
const HARD_MAX: number = PromptBudgetManagerService.HARD_MAXIMUM;

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
 * Filler whose every line is unique and longer than 40 characters.
 *
 * Both properties are load-bearing. `dedupeLines` treats any line under 40
 * characters as structural and leaves it alone, and collapses any two lines that
 * normalise to the same key — so filler that repeated itself would make a
 * length-driven test measure de-duplication instead of section dropping.
 */
function pad(id: string, chars: number): string {
  const lines: string[] = [];
  let total = 0;
  let n = 0;
  while (total < chars) {
    const line = `${id} substantive requirement ${n} that must survive verbatim ${"y".repeat(40)}`;
    lines.push(line);
    total += line.length + 1;
    n++;
  }
  return lines.join("\n");
}

/** A section with a `## ` heading, padded to roughly `chars`. */
function section(heading: string, chars: number): string {
  return `## ${heading}\n${pad(heading, chars)}`;
}

/** A bracket block of the kind services emit inside a `## ` section. */
function bracket(name: string, chars: number): string {
  return `[${name}]\n${pad(name, chars)}`;
}

/**
 * Sizes a fixture relative to the live threshold instead of to a literal.
 *
 * `EMERGENCY_TARGET` is 22,000 by default and 30,000 when `.env.local` is
 * loaded, so a fixture written as "25,000 characters" tests section dropping on
 * one machine and tests nothing at all on another. Weights are taken from a real
 * compiled prompt and scaled to land a fixed proportion above whatever the
 * threshold currently is.
 */
const OVERAGE = 1.16;
function scaled(weights: Array<[string, number]>): Array<[string, number]> {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const budget = Math.round(TARGET * OVERAGE);
  return weights.map(([name, w]) => [name, Math.max(60, Math.round((w / total) * budget))]);
}

const run = (prompt: string) => new PromptBudgetManagerService().enforceBudget(prompt, 1, "HIGH");

/**
 * Section and bracket boundaries in document order.
 *
 * This mirrors the service's own boundary rule rather than calling it: the
 * parser is private, and a characterization test that reached into it would be
 * asserting on an implementation detail instead of on observable behaviour.
 */
const BRACKET_LINE = new RegExp("^\\[([A-Z0-9 &—,'\\-]+)\\]\\s*$");
function boundaries(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    const b = line.match(BRACKET_LINE);
    if (h) out.push(h[1]);
    else if (b) out.push(b[1]);
  }
  return out;
}

console.log("=".repeat(74));
console.log("Phase 0A — PromptBudgetManager Characterization");
console.log("=".repeat(74));
console.log(`  EMERGENCY_TARGET (reduction starts above) : ${TARGET}`);
console.log(`  HARD_MAXIMUM     (truncation above)       : ${HARD_MAX}`);
console.log(`  PROMPT_TARGET_CHARS env                   : ${process.env.PROMPT_TARGET_CHARS ?? "(unset)"}`);
console.log(`  PROMPT_HARD_MAXIMUM_CHARS env             : ${process.env.PROMPT_HARD_MAXIMUM_CHARS ?? "(unset)"}`);
console.log("");

// ─────────────────────────────────────────────────────────────────────────
// PART 1.1 — below the threshold
// ─────────────────────────────────────────────────────────────────────────
console.log("PART 1.1 — prompt below EMERGENCY_TARGET\n");

const cleanUnder = [
  section("ROLE", 400),
  section("USER HARD REQUIREMENTS", 3000),
  section("ART DIRECTION", 3000),
  section("CONFLICT PRIORITY", 400),
].join("\n");

check("a clean sub-threshold prompt is returned byte-identical", () => {
  assert.ok(cleanUnder.length < TARGET, `fixture is ${cleanUnder.length}, not below ${TARGET}`);
  const r = run(cleanUnder);
  assert.strictEqual(r.final_prompt, cleanUnder, "the prompt was modified below the threshold");
  assert.strictEqual(r.before, cleanUnder.length);
  assert.strictEqual(r.after, cleanUnder.length);
});

check("a clean sub-threshold prompt drops no sections and no duplicate lines", () => {
  const r = run(cleanUnder);
  assert.deepStrictEqual(r.removals, [], "a section was removed below the threshold");
  assert.strictEqual(r.duplicate_lines_removed, 0);
  assert.strictEqual(r.truncated, false);
});

check("the guard is inclusive: a prompt of exactly EMERGENCY_TARGET is not reduced", () => {
  const head = "## ROLE\n";
  const exact = (head + pad("EXACT", TARGET)).slice(0, TARGET);
  assert.strictEqual(exact.length, TARGET, `fixture is ${exact.length}, expected exactly ${TARGET}`);
  const r = run(exact);
  assert.deepStrictEqual(r.removals, [], "a prompt of exactly EMERGENCY_TARGET was reduced");
});

// DEFECT CAPTURED — "below the threshold means untouched" is FALSE. Passes 0 and
// 1 rewrite the text before the length guard is ever consulted.
check("DEFECT CAPTURED: a sub-threshold prompt IS modified when it repeats a line", () => {
  const repeated = "This same substantive instruction is stated by two separate layers verbatim.";
  const withDupes = [
    "## ROLE",
    repeated,
    pad("A", 500),
    "## USER HARD REQUIREMENTS",
    repeated,
    pad("B", 500),
  ].join("\n");
  assert.ok(withDupes.length < TARGET);
  const r = run(withDupes);
  assert.strictEqual(r.duplicate_lines_removed, 1, "de-duplication did not run below the threshold");
  assert.notStrictEqual(r.final_prompt, withDupes, "expected the prompt to have changed");
  assert.deepStrictEqual(r.removals, [], "a section was removed, which is not what changed it");
});

check("DEFECT CAPTURED: a sub-threshold prompt IS modified when it carries metadata", () => {
  const withMeta = ["## ART DIRECTION", "confidence: 0.87", pad("M", 500)].join("\n");
  assert.ok(withMeta.length < TARGET);
  const r = run(withMeta);
  assert.ok(!r.final_prompt.includes("confidence: 0.87"), "the metadata survived");
  assert.strictEqual(r.removals.length, 0, "a section was removed, which is not what stripped it");
});

// ─────────────────────────────────────────────────────────────────────────
// PART 1.2 — above the threshold
// ─────────────────────────────────────────────────────────────────────────
console.log("\nPART 1.2 — prompt above EMERGENCY_TARGET\n");

const overSized = scaled([
  ["ROLE", 400],
  ["CREATIVE INTENT", 2500],
  ["CAMPAIGN STRATEGY", 2500],
  ["USER HARD REQUIREMENTS", 2500],
  ["PRODUCT INSTANCE REQUIREMENTS", 2000],
  ["ART DIRECTION", 2500],
  ["PROFESSIONAL KNOWLEDGE", 2500],
  ["OUTPUT CONTEXT", 1500],
  ["BRAND KNOWLEDGE", 1500],
  ["COMMERCIAL LAYOUT", 2000],
  ["CONFLICT PRIORITY", 400],
  ["FINAL OUTPUT", 400],
])
  .map(([h, c]) => section(h, c))
  .join("\n");

const overResult = run(overSized);

// Fixture hygiene, asserted rather than assumed. An earlier draft of this file
// topped the fixture up with a second section of the same name, whose filler
// therefore duplicated the first — de-duplication then absorbed ~2,000
// characters of the overage and the suite was measuring the wrong pass while
// still going green.
check("the oversized fixture exercises section dropping, not de-duplication", () => {
  assert.ok(overSized.length > TARGET, `fixture is ${overSized.length}, not above ${TARGET}`);
  assert.strictEqual(
    overResult.duplicate_lines_removed,
    0,
    "the fixture contains duplicate lines, so this case no longer isolates section dropping"
  );
});

check("a prompt above EMERGENCY_TARGET enters the section-dropping path", () => {
  assert.ok(overResult.removals.length > 0, "no section was removed above the threshold");
  assert.ok(overResult.removals.every((x: any) => x.reason === "LOW_PRIORITY_SECTION"));
});

check("sections are dropped highest-priority-number first", () => {
  const order = overResult.removals.map((x: any) => x.priority);
  const sorted = [...order].sort((a, b) => b - a);
  assert.deepStrictEqual(order, sorted, `drop order was not descending by priority: ${order.join(",")}`);
});

check("priority 0 sections are never dropped", () => {
  const names = overResult.removals.map((x: any) => String(x.section).toUpperCase());
  for (const keep of ["ROLE", "CONFLICT PRIORITY", "FINAL OUTPUT"]) {
    assert.ok(!names.includes(keep), `${keep} was dropped`);
  }
});

check("BRAND KNOWLEDGE is the first casualty when present", () => {
  assert.strictEqual(String(overResult.removals[0].section).toUpperCase(), "BRAND KNOWLEDGE");
  assert.strictEqual(overResult.removals[0].priority, TIER_BACKGROUND);
});

check("reduction stops once the running estimate reaches the target", () => {
  const totalDropped = overResult.removals.reduce((n: number, x: any) => n + x.chars, 0);
  const lastDropped = overResult.removals[overResult.removals.length - 1].chars;
  assert.ok(
    overSized.length - (totalDropped - lastDropped) > TARGET,
    "the final removal was not needed to reach the target"
  );
});

// ─────────────────────────────────────────────────────────────────────────
// PART 1.3 — a realistic Creative Decision prompt
// ─────────────────────────────────────────────────────────────────────────
console.log("\nPART 1.3 — realistic Creative Decision prompt\n");

/**
 * The prompt production actually hands this service.
 *
 * Section names, order and sizes are the measured poster arm of the Phase 18
 * benchmark (25,577 characters against a 22,000 target). Two absences are
 * deliberate and were got wrong in an earlier draft of this file: PROFESSIONAL
 * KNOWLEDGE and OUTPUT CONTEXT are NOT here, because `ProviderPromptOptimizer`
 * has already dropped them as P1 before the budget manager ever runs. Including
 * them handed the reduction loop two cheap victims it does not have in
 * production, so the loop stopped early and the defect did not reproduce.
 *
 * `[CREATIVE & RENDER CONSTRAINTS]` sits inside `## FINAL OUTPUT`, which is
 * priority 0. That pairing is the sharpest form of the defect: a section the
 * ranking declares undroppable, losing its body anyway.
 */
const W = Object.fromEntries(
  scaled([
    ["ROLE", 858],
    ["CREATIVE INTENT", 4053],
    ["CAMPAIGN STRATEGY", 4549],
    ["PRODUCT INSTANCE REQUIREMENTS", 1845],
    ["REFERENCE SEMANTICS", 1824],
    ["USER HARD REQUIREMENTS", 4408],
    ["RESOLVED ART DIRECTION", 2840],
    ["COMMERCIAL LAYOUT PLAN", 2143],
    ["TYPOGRAPHY & READABLE COPY", 851],
    ["CONFLICT PRIORITY", 887],
    ["FINAL OUTPUT", 545],
    ["CREATIVE & RENDER CONSTRAINTS", 734],
  ])
) as Record<string, number>;

const realistic = [
  section("ROLE", W["ROLE"]),
  section("CREATIVE INTENT", W["CREATIVE INTENT"]),
  section("CAMPAIGN STRATEGY", W["CAMPAIGN STRATEGY"]),
  section("PRODUCT INSTANCE REQUIREMENTS", W["PRODUCT INSTANCE REQUIREMENTS"]),
  section("REFERENCE SEMANTICS", W["REFERENCE SEMANTICS"]),
  section("USER HARD REQUIREMENTS", W["USER HARD REQUIREMENTS"]),
  "## ART DIRECTION",
  bracket("RESOLVED ART DIRECTION", W["RESOLVED ART DIRECTION"]),
  "## COMMERCIAL LAYOUT",
  bracket("COMMERCIAL LAYOUT PLAN", W["COMMERCIAL LAYOUT PLAN"]),
  section("TYPOGRAPHY & READABLE COPY", W["TYPOGRAPHY & READABLE COPY"]),
  section("CONFLICT PRIORITY", W["CONFLICT PRIORITY"]),
  section("FINAL OUTPUT", W["FINAL OUTPUT"]),
  bracket("CREATIVE & RENDER CONSTRAINTS", W["CREATIVE & RENDER CONSTRAINTS"]),
].join("\n");

const realisticResult = run(realistic);
const before = boundaries(realistic);
const after = boundaries(realisticResult.final_prompt);
const gone = before.filter((n) => !after.includes(n));
const removedNames = realisticResult.removals.map((x: any) => String(x.section));

check("DEFECT CAPTURED: a bracket block is parsed as an independent section", () => {
  assert.ok(before.includes("RESOLVED ART DIRECTION"), "fixture did not contain the bracket block");
  assert.ok(
    removedNames.includes("RESOLVED ART DIRECTION"),
    `the bracket block was not dropped as its own section; removed: ${removedNames.join(", ")}`
  );
});

// FLIPPED BY PHASE 0B. Before the fix this read `priority, 5` — the default for
// a name no rule matches. The block now inherits `## ART DIRECTION`.
check("FLIPPED BY 0B: an unrecognised bracket inherits its parent instead of defaulting", () => {
  const b = realisticResult.removals.find((x: any) => x.section === "RESOLVED ART DIRECTION");
  assert.ok(b, "RESOLVED ART DIRECTION was not removed in this fixture");
  assert.strictEqual(b.priority, tierFor("ART DIRECTION"), "the block no longer inherits ## ART DIRECTION");
  assert.notStrictEqual(b.priority, TIER_ORDINARY, "it fell back to the unrecognised default");
});

check("DEFECT CAPTURED: ## ART DIRECTION survives as a heading with no content", () => {
  assert.ok(after.includes("ART DIRECTION"), "the heading did not survive");
  assert.ok(!after.includes("RESOLVED ART DIRECTION"), "the body was not dropped");
  const body =
    realisticResult.final_prompt
      .split(/\n(?=## )/)
      .find((s: string) => s.startsWith("## ART DIRECTION")) || "";
  assert.ok(
    body.trim().length < 40,
    `ART DIRECTION kept ${body.trim().length} characters, expected a stub`
  );
});

check("COMMERCIAL LAYOUT (p6) is dropped before ART DIRECTION content (p4 after 0B)", () => {
  const layout = removedNames.indexOf("COMMERCIAL LAYOUT");
  const resolved = removedNames.indexOf("RESOLVED ART DIRECTION");
  assert.ok(layout >= 0, "COMMERCIAL LAYOUT was not dropped in this fixture");
  assert.ok(resolved >= 0, "RESOLVED ART DIRECTION was not dropped in this fixture");
  assert.ok(layout < resolved, "the documented drop order changed");
});

// DEFECT CAPTURED — the most consequential consequence of the bracket split, and
// the one that was not predicted before this suite was run. Because the bracket
// block opens a new section, the `## ` heading above it is left owning nothing
// but its own line, so the reduction loop spends whole removals recovering ~20
// characters each and must then keep going and drop real content.
check("DEFECT CAPTURED: dropping a ## heading above a bracket block frees almost nothing", () => {
  const layout = realisticResult.removals.find((x: any) => x.section === "COMMERCIAL LAYOUT");
  assert.ok(layout, "COMMERCIAL LAYOUT was not dropped in this fixture");
  assert.ok(
    layout.chars < 40,
    `## COMMERCIAL LAYOUT freed ${layout.chars} characters, expected only its own heading line`
  );
  // The plan it was supposed to be carrying is dropped separately, at a
  // different priority, as if the two were unrelated documents.
  const plan = realisticResult.removals.find((x: any) => x.section === "COMMERCIAL LAYOUT PLAN");
  assert.ok(plan, "the layout plan was not dropped as a separate section");
  assert.ok(
    plan.chars > layout.chars * 50,
    `the body (${plan.chars}) should dwarf the heading (${layout.chars})`
  );
  // FLIPPED BY PHASE 0B. Before the fix this asserted the two were ranked
  // DIFFERENTLY — heading at 6, body at the unrecognised default of 5 — which is
  // what let the body be discarded on its own schedule.
  assert.strictEqual(
    plan.priority,
    layout.priority,
    "the body is no longer ranked with the heading that owns it"
  );
});

check("the realistic fixture reproduces the production symptom exactly", () => {
  // Measured in production: ART DIRECTION survived at 16 characters on 4 of 5
  // asset types, COMMERCIAL LAYOUT disappeared entirely on 5 of 5.
  assert.ok(after.includes("ART DIRECTION"), "ART DIRECTION did not survive as a stub");
  assert.ok(!after.includes("COMMERCIAL LAYOUT"), "COMMERCIAL LAYOUT did not disappear entirely");
  assert.ok(!after.includes("COMMERCIAL LAYOUT PLAN"), "the layout plan survived");
  assert.ok(!after.includes("RESOLVED ART DIRECTION"), "the resolved art direction survived");
});

check("identity, copy and control sections survive the realistic prompt", () => {
  for (const keep of [
    "PRODUCT INSTANCE REQUIREMENTS",
    "USER HARD REQUIREMENTS",
    "CONFLICT PRIORITY",
    "FINAL OUTPUT",
    "ROLE",
  ]) {
    assert.ok(after.includes(keep), `${keep} did not survive`);
  }
});

check("sections_kept re-parses the OUTPUT, so an emptied heading still counts as kept", () => {
  assert.ok(
    realisticResult.sections_kept.includes("ART DIRECTION"),
    "sections_kept no longer reports the emptied heading"
  );
});

// ─────────────────────────────────────────────────────────────────────────
// PART 1.4 — invariants Phase 0B must preserve
// ─────────────────────────────────────────────────────────────────────────
console.log("\nPART 1.4 — invariants Phase 0B must not break\n");

check("enforceBudget is deterministic for the same input", () => {
  const a = run(realistic);
  const b = run(realistic);
  assert.strictEqual(a.final_prompt, b.final_prompt);
  assert.deepStrictEqual(a.removals, b.removals);
});

check("enforceBudget does not mutate its argument", () => {
  const copy = `${realistic}`;
  run(realistic);
  assert.strictEqual(realistic, copy);
});

check("the result never exceeds HARD_MAXIMUM", () => {
  const r = run(pad("HUGE", HARD_MAX * 2));
  assert.ok(r.after <= HARD_MAX, `result was ${r.after}, above ${HARD_MAX}`);
});

check("truncation is reported rather than silent", () => {
  const r = run(pad("HUGE", HARD_MAX * 2));
  assert.strictEqual(r.truncated, true, "a truncated prompt did not report truncated:true");
});

check("every removal is itemised with section, priority and size", () => {
  assert.ok(realisticResult.removals.length > 0, "nothing was removed, so nothing was itemised");
  for (const x of realisticResult.removals) {
    assert.ok(typeof x.section === "string" && x.section.length > 0);
    assert.ok(Number.isInteger(x.priority));
    assert.ok(x.chars > 0);
    assert.strictEqual(x.reason, "LOW_PRIORITY_SECTION");
  }
});

check("content before the first boundary is preserved as PREAMBLE", () => {
  const withPreamble =
    "A preamble line that belongs to no section at all and is long enough to be substantive.\n" + overSized;
  const r = run(withPreamble);
  assert.ok(r.final_prompt.startsWith("A preamble line"), "the preamble was dropped");
});

// ─────────────────────────────────────────────────────────────────────────
// PART 1.5 — Phase 0B regression suite
// ─────────────────────────────────────────────────────────────────────────
console.log("\nPART 1.5 — Phase 0B regression: nested priority inheritance\n");

/** A parent heading with one bracketed child, sized to force reduction. */
function nested(parent: string, child: string, childChars: number): string {
  return [
    section("USER HARD REQUIREMENTS", Math.round(TARGET * 0.9)),
    `## ${parent}`,
    bracket(child, childChars),
    section("CONFLICT PRIORITY", 300),
  ].join("\n");
}

check("REGRESSION: a bracket child is ranked with the heading that owns it", () => {
  // ART DIRECTION is priority 4. The child carries no rule of its own.
  const r = run(nested("ART DIRECTION", "RESOLVED ART DIRECTION", 4000));
  const child = r.removals.find((x: any) => x.section === "RESOLVED ART DIRECTION");
  assert.ok(child, "the child was not reached by the reduction loop");
  assert.strictEqual(child.priority, TIER_CREATIVE, "the child did not inherit ## ART DIRECTION");
});

check("REGRESSION: the same child under a different parent takes that parent's rank", () => {
  // Same block name, two headings that sit in different tiers. If the fix were a
  // name lookup rather than inheritance, both of these would return one number.
  // ART DIRECTION and COMMERCIAL LAYOUT now share a tier, so the contrast is
  // drawn against PROFESSIONAL KNOWLEDGE instead.
  const a = run(nested("ART DIRECTION", "RESOLVED ART DIRECTION", 4000));
  const b = run(nested("PROFESSIONAL KNOWLEDGE", "RESOLVED ART DIRECTION", 4000));
  const pa = a.removals.find((x: any) => x.section === "RESOLVED ART DIRECTION");
  const pb = b.removals.find((x: any) => x.section === "RESOLVED ART DIRECTION");
  assert.ok(pa && pb, "the child was not reached under both parents");
  assert.strictEqual(pa.priority, TIER_CREATIVE);
  assert.strictEqual(pb.priority, TIER_SUPPORTING);
  assert.notStrictEqual(pa.priority, pb.priority, "the child stopped following its parent");
});

check("REGRESSION: a child of a priority 0 heading is never dropped", () => {
  // This is the sharpest form of the defect: `[CREATIVE & RENDER CONSTRAINTS]`
  // is appended after `## FINAL OUTPUT`, and used to be discarded at priority 6
  // out of a section the ranking calls undroppable. Measured in production as a
  // flat -734 characters on all five asset types.
  const withChildOfZero = [
    section("USER HARD REQUIREMENTS", Math.round(TARGET * 0.95)),
    section("PROFESSIONAL KNOWLEDGE", 3000),
    section("FINAL OUTPUT", 500),
    bracket("CREATIVE & RENDER CONSTRAINTS", 800),
  ].join("\n");
  const r = run(withChildOfZero);
  assert.ok(r.removals.length > 0, "the fixture did not force any reduction");
  assert.ok(
    !r.removals.some((x: any) => x.section === "CREATIVE & RENDER CONSTRAINTS"),
    "a child of a priority 0 heading was dropped"
  );
  assert.ok(
    r.final_prompt.includes("[CREATIVE & RENDER CONSTRAINTS]"),
    "the constraints block did not survive"
  );
});

check("REGRESSION: low priority sections can still be removed", () => {
  // The fix must not make the prompt un-reducible. BRAND KNOWLEDGE is priority 7
  // and still goes first.
  assert.ok(overResult.removals.length > 0, "nothing is droppable any more");
  assert.strictEqual(String(overResult.removals[0].section).toUpperCase(), "BRAND KNOWLEDGE");
  assert.ok(overResult.after <= HARD_MAX, "reduction no longer reaches the budget");
  assert.strictEqual(overResult.truncated, false, "reduction now falls through to hard truncation");
});

check("REGRESSION: a bracket before any heading keeps its own rank", () => {
  // No parent exists yet, so behaviour here is unchanged from before the fix.
  // Sized so the reduction loop must reach the bracket: the supporting section
  // alone does not cover the overage, so the leading bracket is dropped too and
  // its rank becomes observable. Fixed character counts made this depend on
  // whatever EMERGENCY_TARGET happened to be.
  const preambleBracket = [
    bracket("CREATIVE & RENDER CONSTRAINTS", Math.round(TARGET * 0.12)),
    section("USER HARD REQUIREMENTS", TARGET),
    section("PROFESSIONAL KNOWLEDGE", Math.round(TARGET * 0.05)),
  ].join("\n");
  const r = run(preambleBracket);
  const c = r.removals.find((x: any) => x.section === "CREATIVE & RENDER CONSTRAINTS");
  assert.ok(c, "the leading bracket was not droppable, so it inherited something");
  assert.strictEqual(
    c.priority,
    tierFor("CREATIVE & RENDER CONSTRAINTS"),
    "a bracket with no parent no longer uses its own rule"
  );
});

check("REGRESSION: parent-child ranking is deterministic", () => {
  const a = run(realistic);
  const b = run(realistic);
  assert.deepStrictEqual(
    a.removals.map((x: any) => `${x.section}:${x.priority}`),
    b.removals.map((x: any) => `${x.section}:${x.priority}`)
  );
});

// ─────────────────────────────────────────────────────────────────────────
// PART 1.6 — Creative Signal Preservation
// ─────────────────────────────────────────────────────────────────────────
console.log("\nPART 1.6 — creative signal preservation\n");

/** The five sections the Creative Director's reasoning travels in. */
const CREATIVE_SIGNAL = [
  "CREATIVE INTENT",
  "CAMPAIGN STRATEGY",
  "ART DIRECTION",
  "COMMERCIAL LAYOUT",
  "CREATIVE & RENDER CONSTRAINTS",
];

/**
 * A prompt over budget that still holds ordinary droppable content.
 *
 * This is the case the fix is for. The realistic fixture in PART 1.3 has had its
 * knowledge and brand sections removed by the optimizer already, so nothing but
 * creative signal is left to drop there — no ranking can save it. Here the
 * cheaper material is still present, which is where a ranking decides the
 * outcome rather than merely recording it.
 */
const withDroppableBallast = [
  section("ROLE", 400),
  section("USER HARD REQUIREMENTS", Math.round(TARGET * 0.26)),
  section("PRODUCT INSTANCE REQUIREMENTS", Math.round(TARGET * 0.08)),
  section("TYPOGRAPHY & READABLE COPY", Math.round(TARGET * 0.04)),
  section("CREATIVE INTENT", Math.round(TARGET * 0.12)),
  section("CAMPAIGN STRATEGY", Math.round(TARGET * 0.12)),
  "## ART DIRECTION",
  bracket("RESOLVED ART DIRECTION", Math.round(TARGET * 0.1)),
  "## COMMERCIAL LAYOUT",
  bracket("COMMERCIAL LAYOUT PLAN", Math.round(TARGET * 0.08)),
  // Ballast: 0.32 of the target in droppable material against an overage of
  // roughly 0.22, so the ranking has a real choice to make rather than being
  // forced into the creative tier by arithmetic.
  section("PROFESSIONAL KNOWLEDGE", Math.round(TARGET * 0.14)),
  section("BRAND KNOWLEDGE", Math.round(TARGET * 0.1)),
  section("OUTPUT CONTEXT", Math.round(TARGET * 0.08)),
  section("CONFLICT PRIORITY", 400),
  section("FINAL OUTPUT", 500),
  bracket("CREATIVE & RENDER CONSTRAINTS", Math.round(TARGET * 0.04)),
].join("\n");

const preserved = run(withDroppableBallast);
const survivors = boundaries(preserved.final_prompt);

check("the preservation fixture is genuinely over budget", () => {
  assert.ok(
    withDroppableBallast.length > TARGET,
    `fixture is ${withDroppableBallast.length}, not above ${TARGET}`
  );
  assert.ok(preserved.removals.length > 0, "no reduction happened, so nothing is being proved");
  assert.strictEqual(preserved.truncated, false, "the fixture fell through to hard truncation");
});

check("PRESERVED: Art Direction survives compression", () => {
  assert.ok(survivors.includes("ART DIRECTION"), "the heading was dropped");
  assert.ok(survivors.includes("RESOLVED ART DIRECTION"), "the resolved art direction was dropped");
});

check("PRESERVED: Creative Intent survives compression", () => {
  assert.ok(survivors.includes("CREATIVE INTENT"), "creative intent was dropped");
});

check("PRESERVED: Creative Strategy survives compression", () => {
  assert.ok(survivors.includes("CAMPAIGN STRATEGY"), "campaign strategy was dropped");
});

check("PRESERVED: Layout reasoning survives compression", () => {
  assert.ok(survivors.includes("COMMERCIAL LAYOUT"), "the layout heading was dropped");
  assert.ok(survivors.includes("COMMERCIAL LAYOUT PLAN"), "the layout plan was dropped");
});

check("PRESERVED: Typography reasoning and the copy it carries survive", () => {
  assert.ok(survivors.includes("TYPOGRAPHY & READABLE COPY"), "the copy section was dropped");
});

check("PRESERVED: no creative signal is dropped while cheaper material remains", () => {
  const droppedCreative = preserved.removals
    .map((x: any) => String(x.section).toUpperCase())
    .filter((n: string) => CREATIVE_SIGNAL.includes(n));
  assert.deepStrictEqual(
    droppedCreative,
    [],
    `creative signal was dropped with ballast still available: ${droppedCreative.join(", ")}`
  );
});

check("technical sections still behave: knowledge and background go first", () => {
  const order = preserved.removals.map((x: any) => String(x.section).toUpperCase());
  assert.ok(order.length > 0, "nothing was dropped");
  assert.strictEqual(order[0], "BRAND KNOWLEDGE", `first casualty was ${order[0]}`);
  for (const n of order) {
    assert.ok(
      ["BRAND KNOWLEDGE", "OUTPUT CONTEXT", "PROFESSIONAL KNOWLEDGE", "CREATIVE EXECUTION"].includes(n),
      `${n} was dropped before the supporting tiers were exhausted`
    );
  }
});

check("PROTECTED: user requirements and product truth are never dropped", () => {
  for (const n of ["USER HARD REQUIREMENTS", "PRODUCT INSTANCE REQUIREMENTS", "TYPOGRAPHY & READABLE COPY"]) {
    assert.strictEqual(tierFor(n), TIER_PROTECTED, `${n} is no longer protected`);
    assert.ok(survivors.includes(n), `${n} was dropped`);
  }
});

check("creative signal is droppable, so an extreme prompt cannot fall into truncation", () => {
  // Deliberately NOT tier 0. If these were undroppable the protected set could
  // exceed the budget on its own and the loop would hand an oversized prompt to
  // Pass 3, which cuts mid-sentence.
  for (const n of CREATIVE_SIGNAL) {
    assert.strictEqual(tierFor(n), TIER_CREATIVE, `${n} is not classified as creative signal`);
    assert.ok(tierFor(n) > TIER_PROTECTED, `${n} became undroppable, which risks hard truncation`);
  }
  const extreme = [
    section("ROLE", 400),
    section("CREATIVE INTENT", HARD_MAX),
    section("ART DIRECTION", HARD_MAX),
    section("FINAL OUTPUT", 400),
  ].join("\n");
  const r = run(extreme);
  assert.ok(r.removals.length > 0, "an extreme prompt dropped nothing at all");
  assert.ok(r.after <= HARD_MAX, "the result exceeded the hard maximum");
});

check("the two reducers no longer disagree about any section", () => {
  // `ProviderPromptOptimizer` keeps its own arrays; this asserts they say the
  // same thing as the policy, which is what stopped being true and caused the
  // defect. A future edit to either side fails here rather than in production.
  const p0: string[] = (ProviderPromptOptimizer as any).P0_SECTIONS;
  const conflicts = p0.filter((name) => {
    const t = tierFor(name);
    return t !== TIER_PROTECTED && t !== TIER_CREATIVE;
  });
  assert.deepStrictEqual(
    conflicts,
    [],
    `the optimizer never drops these, but the policy ranks them droppable: ${conflicts.join(", ")}`
  );

  const p1: string[] = (ProviderPromptOptimizer as any).P1_DROP_ORDER;
  const wronglyProtected = p1.filter((name) => tierFor(name) <= TIER_CREATIVE);
  assert.deepStrictEqual(
    wronglyProtected,
    [],
    `the optimizer drops these, but the policy calls them creative or protected: ${wronglyProtected.join(", ")}`
  );
});

// ─────────────────────────────────────────────────────────────────────────
// PART 2 — characterization report and the snapshot Phase 0B compares against
// ─────────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(74));
console.log("Budget Characterization Report — realistic Creative Decision prompt");
console.log("=".repeat(74));
console.log(`Input  length : ${realistic.length}`);
console.log(`Input  blocks : ${before.length}`);
console.log(`Output length : ${realisticResult.after}`);
console.log(`Output blocks : ${after.length}`);
console.log(`Lost   chars  : ${realistic.length - realisticResult.after}`);
console.log(`Dupes removed : ${realisticResult.duplicate_lines_removed}`);
console.log(`Truncated     : ${realisticResult.truncated}`);
console.log("\nBefore:");
before.forEach((n) => console.log(`  - ${n}`));
console.log("\nAfter:");
after.forEach((n) => console.log(`  - ${n}`));
console.log("\nRemoved, in the order the service dropped them:");
realisticResult.removals.forEach((x: any) =>
  console.log(`  - ${x.section}  (priority ${x.priority}, -${x.chars} chars)`)
);
console.log("\nDisappeared from the document:");
gone.forEach((n) => console.log(`  - ${n}`));
console.log("\nPriority behaviour observed:");
console.log("  - descending priority number first, ties broken by later document position");
console.log("  - priority 0 never dropped");
console.log("  - unrecognised names, including every bracket block, default to 5");
console.log(`  - stopped after ${realisticResult.removals.length} removals`);

const BASELINE = path.join(__dirname, "budget-characterization.baseline.json");
const CURRENT = path.join(__dirname, "budget-characterization.current.json");
const snapshot = {
  captured_at_phase: "0A",
  note: "Behaviour BEFORE the Phase 0B fix. Written once, then never again; Phase 0B diffs against it.",
  thresholds: { emergency_target: TARGET, hard_maximum: HARD_MAX },
  realistic_prompt: {
    input_chars: realistic.length,
    output_chars: realisticResult.after,
    blocks_before: before,
    blocks_after: after,
    blocks_removed: realisticResult.removals.map((x: any) => ({
      section: x.section,
      priority: x.priority,
      chars: x.chars,
    })),
    duplicate_lines_removed: realisticResult.duplicate_lines_removed,
    truncated: realisticResult.truncated,
  },
  oversized_prompt: {
    input_chars: overSized.length,
    output_chars: overResult.after,
    blocks_removed: overResult.removals.map((x: any) => `${x.section}:p${x.priority}`),
  },
  clean_sub_threshold_prompt: {
    input_chars: cleanUnder.length,
    byte_identical: run(cleanUnder).final_prompt === cleanUnder,
  },
};
/**
 * The baseline is written once and then left alone.
 *
 * An earlier version of this file rewrote it on every run, which meant the first
 * run after the Phase 0B fix silently replaced the pre-fix record with the
 * post-fix one — destroying the only thing the fix was supposed to be measured
 * against. The current run always goes to a separate file.
 */
try {
  if (!fs.existsSync(BASELINE)) {
    fs.writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    console.log(`\nBaseline created: ${BASELINE}`);
  } else {
    console.log(`\nBaseline preserved: ${BASELINE}`);
  }
  fs.writeFileSync(
    CURRENT,
    JSON.stringify({ ...snapshot, captured_at_phase: "current" }, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Current run written: ${CURRENT}`);

  const base = JSON.parse(fs.readFileSync(BASELINE, "utf-8"));
  const wasRemoved: Record<string, number> = {};
  for (const x of base.realistic_prompt.blocks_removed) wasRemoved[x.section] = x.priority;
  const nowRemoved: Record<string, number> = {};
  for (const x of realisticResult.removals) nowRemoved[String(x.section)] = x.priority;

  const names = [...new Set([...Object.keys(wasRemoved), ...Object.keys(nowRemoved)])];
  const changes = names
    .map((n) => ({ n, was: wasRemoved[n], now: nowRemoved[n] }))
    .filter((r) => r.was !== r.now);

  console.log("\nBaseline vs current — removals on the realistic prompt:");
  if (!changes.length) {
    console.log("  (identical)");
  } else {
    for (const c of changes) {
      const from = c.was === undefined ? "kept" : `dropped at p${c.was}`;
      const to = c.now === undefined ? "KEPT" : `dropped at p${c.now}`;
      console.log(`  ${c.n.padEnd(32)} ${from}  ->  ${to}`);
    }
  }
  console.log(
    `  chars lost: ${base.realistic_prompt.input_chars - base.realistic_prompt.output_chars}` +
      `  ->  ${realistic.length - realisticResult.after}`
  );
} catch (err: any) {
  console.log(`\nSnapshot step failed: ${err?.message || String(err)}`);
}

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
