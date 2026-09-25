import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Phases 3.3, 3.5 and 4 — patterns, recall, and the directions not taken.
 *
 * WHAT THIS SUITE COVERS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------
 * Everything here runs without a database or a model. It covers the judgement:
 * what counts as a pattern, what a pattern is allowed to say, which directions
 * get recorded, and the caps that stop memory making every render look alike.
 *
 * Counting, isolation and vector search are properties of Postgres and are
 * proved against a live database by `verify-creative-memory.ts`.
 */

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { conceptRows, patternRows } = require("../persistence/record-creative-memory");
const { strongest, asSentence, MAX_RECALL } = require("../persistence/recall-memory");
const {
  PATTERN_DIMENSIONS,
  MIN_PATTERN_SUPPORT,
  patternQualifies,
} = require("@tido/shared");

const WEB = path.join(__dirname, "..", "..");
const MIGRATIONS = path.join(WEB, "..", "..", "packages", "infrastructure", "migrations");
const PATTERNS_SQL = fs.readFileSync(path.join(MIGRATIONS, "0009_creative_patterns.sql"), "utf-8");
const CONCEPTS_SQL = fs.readFileSync(path.join(MIGRATIONS, "0010_creative_concepts.sql"), "utf-8");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

/** A judgment exactly as CreativeDirectorV1 returns one. */
const JUDGMENT = {
  directions: [
    {
      name: "luxury minimal",
      core_idea: "the object alone, given room",
      visual_language: "one soft source, deep negative space, no props",
      why_it_fits: "the surface is matte and rewards restraint",
    },
    {
      name: "cinematic premium",
      core_idea: "a moment around the object",
      visual_language: "hard raking light, deep shadow",
      why_it_fits: "drama suits a launch",
    },
    {
      name: "modern commercial",
      core_idea: "the object in use",
      visual_language: "bright even light, clean backdrop",
      why_it_fits: "reads fast in a feed",
    },
  ],
  selected: "luxury minimal",
  selection_reason: "the observed surface is matte, and hard light would kill it",
  rejected_reason: "cinematic premium was the strongest alternative, turned down because raking light flattens an unglazed surface",
  strategy: { routes_offered: ["luxury minimal", "cinematic premium", "modern commercial", "editorial still life"] },
  reasoning: {
    composition: { value: "off-centre, weight lower left" },
    typography: { value: "one serif headline, generous tracking" },
    lighting: { value: "single soft source from the left" },
  },
};

function render(over: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = { success: true, generationId: "gen_test" };
  Object.defineProperty(result, "creativeJudgment", { value: JUDGMENT, enumerable: false, configurable: true });
  for (const [k, v] of Object.entries(over)) {
    Object.defineProperty(result, k, { value: v, enumerable: false, configurable: true });
  }
  return result;
}

console.log("\nPhase 4 — the directions a brief could have gone");

check("every direction the director considered is recorded", () => {
  const rows = conceptRows(render());
  const routes = rows.map((r: { route: string }) => r.route);
  for (const d of JUDGMENT.directions) assert.ok(routes.includes(d.name), `${d.name} was lost`);
});

check("exactly one is marked as the one that ran", () => {
  const rows = conceptRows(render());
  assert.strictEqual(rows.filter((r: { selected: boolean }) => r.selected).length, 1);
  assert.strictEqual(rows.find((r: { selected: boolean }) => r.selected).route, "luxury minimal");
});

check("the winner carries the director's selection reason", () => {
  const chosen = conceptRows(render()).find((r: { selected: boolean }) => r.selected);
  assert.ok(chosen.whyThisRoute.includes("matte"), chosen.whyThisRoute);
});

check("a rejection reason is never attached to the winner", () => {
  // A reason for turning something down, attached to the thing that was kept,
  // is a contradiction. The database refuses it too.
  for (const row of conceptRows(render())) {
    if (row.selected) assert.strictEqual(row.rejectedReason, null);
  }
});

check("the director's one named rejection is attached once, not to everything", () => {
  // Attaching it to every losing route would put words in the director's mouth
  // about directions it never commented on.
  const rejected = conceptRows(render()).filter((r: { rejectedReason: string | null }) => r.rejectedReason);
  assert.strictEqual(rejected.length, 1, `${rejected.length} routes claim the same rejection`);
});

check("routes offered but never written up are still recorded", () => {
  const rows = conceptRows(render());
  const offered = rows.find((r: { route: string }) => r.route === "editorial still life");
  assert.ok(offered, "an offered route vanished");
  assert.strictEqual(offered.origin, "offered");
});

check("a direction the director authored is distinguishable from one it was handed", () => {
  const rows = conceptRows(render());
  assert.strictEqual(rows.find((r: { route: string }) => r.route === "luxury minimal").origin, "authored");
  assert.strictEqual(rows.find((r: { route: string }) => r.route === "editorial still life").origin, "offered");
});

check("a render with no judgment records no concepts", () => {
  assert.deepStrictEqual(conceptRows({ success: true } as never), []);
});

check("a selection the director named but never described is still recorded", () => {
  const r: Record<string, unknown> = { success: true };
  Object.defineProperty(r, "creativeJudgment", {
    value: { selected: "quiet documentary", selection_reason: "it suits the product" },
    enumerable: false,
    configurable: true,
  });
  const rows = conceptRows(r as never);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].selected, true);
});

console.log("\nPhase 3.3 — what is observed as a pattern");

check("the chosen direction is observed", () => {
  const rows = patternRows(render(), "run-1", 0);
  assert.ok(rows.some((r: { dimension: string; value: string }) => r.dimension === "direction" && r.value === "luxury minimal"));
});

check("the director's own reasoning becomes one observation per axis", () => {
  const rows = patternRows(render(), "run-1", 0);
  for (const axis of ["composition", "typography", "lighting"]) {
    assert.ok(rows.some((r: { dimension: string }) => r.dimension === axis), `${axis} was not observed`);
  }
});

check("what recurs together is observed as a combination", () => {
  // A direction alone is weak guidance. A direction that keeps arriving with a
  // particular composition is what a creative department would recognise.
  const rows = patternRows(render(), "run-1", 0);
  const combo = rows.find((r: { dimension: string }) => r.dimension === "combination");
  assert.ok(combo, "no combination observed");
  assert.ok(combo.value.includes("luxury minimal") && combo.value.includes("+"), combo.value);
});

check("a dimension the render did not produce is not observed", () => {
  // A null typography means the layer that builds it did not run. Recording
  // "no typography" would turn a disabled feature into a house style.
  const bare: Record<string, unknown> = { success: true };
  Object.defineProperty(bare, "creativeJudgment", {
    value: { selected: "luxury minimal", directions: [] },
    enumerable: false,
    configurable: true,
  });
  const rows = patternRows(bare as never, "run-1", 0);
  for (const r of rows) assert.notStrictEqual(r.dimension, "typography");
  assert.ok(rows.every((r: { value: string }) => r.value.length > 0));
});

check("every observation names the run it came from", () => {
  // Without it the counters cannot be made idempotent, and re-running
  // extraction over history would multiply every count.
  for (const r of patternRows(render(), "run-7", 2)) assert.strictEqual(r.runId, "run-7");
});

check("nothing is observed as approved at render time", () => {
  // A render finishing says something was MADE. Counting that as a success is
  // how a system learns from its own output.
  for (const r of patternRows(render(), "run-1", 0)) assert.strictEqual(r.approved, false);
});

check("vision problems travel with the observation", () => {
  for (const r of patternRows(render(), "run-1", 4)) assert.strictEqual(r.problems, 4);
});

check("every dimension observed is one the database accepts", () => {
  const declared = [
    ...PATTERNS_SQL.matchAll(/'(direction|composition|typography|layout|lighting|structure|combination)'/g),
  ].map((m) => m[1]);
  for (const r of patternRows(render(), "run-1", 0)) {
    assert.ok(PATTERN_DIMENSIONS.includes(r.dimension), `${r.dimension} is not a dimension`);
    assert.ok(declared.includes(r.dimension), `${r.dimension} is not in the check constraint`);
  }
});

console.log("\nWhat a pattern must earn before it is shown");

check("three runs is the bar, and it is the same bar UserKit uses", () => {
  assert.strictEqual(MIN_PATTERN_SUPPORT, 3);
  const kit = fs.readFileSync(path.join(__dirname, "evolution/experiment/UserKit.ts"), "utf-8");
  assert.ok(/minOccurrences = 3/.test(kit), "the two thresholds have drifted apart");
});

check("a pattern seen twice influences nothing", () => {
  assert.strictEqual(patternQualifies({ support_count: 2, approved_count: 0, problem_count: 0 }), false);
  assert.strictEqual(patternQualifies({ support_count: 3, approved_count: 0, problem_count: 0 }), true);
});

check("a pattern that keeps producing problems and was never kept is withheld", () => {
  // Evidence of something that keeps going wrong. Presenting it as guidance
  // would teach the system to repeat it.
  assert.strictEqual(patternQualifies({ support_count: 9, approved_count: 0, problem_count: 5 }), false);
  assert.strictEqual(patternQualifies({ support_count: 9, approved_count: 1, problem_count: 5 }), true);
});

check("the threshold lives in one place, not also in SQL", () => {
  const withoutIndexes = PATTERNS_SQL.replace(/create [a-z ]*index[\s\S]*?;/g, "");
  assert.ok(!/support_count\s*>=\s*3/.test(withoutIndexes), "the threshold was duplicated into the schema");
});

console.log("\nPhase 3.5 — memory as context, not as a rule");

const many = [
  { id: 1, dimension: "composition", value: "off-centre", support_count: 40, approved_count: 0, problem_count: 0 },
  { id: 2, dimension: "composition", value: "centred", support_count: 30, approved_count: 0, problem_count: 0 },
  { id: 3, dimension: "composition", value: "low and left", support_count: 20, approved_count: 0, problem_count: 0 },
  { id: 4, dimension: "direction", value: "luxury minimal", support_count: 5, approved_count: 4, problem_count: 0 },
  { id: 5, dimension: "lighting", value: "single soft source", support_count: 3, approved_count: 1, problem_count: 0 },
  { id: 6, dimension: "typography", value: "one serif headline", support_count: 2, approved_count: 0, problem_count: 0 },
];

check("at most one pattern per dimension crosses the boundary", () => {
  // The convergence rule. Eleven strong composition patterns would otherwise
  // contribute eleven composition sentences and every render would converge on
  // the same frame -- the store making output MORE uniform.
  const picked = strongest(many);
  const dims = picked.map((p: { dimension: string }) => p.dimension);
  assert.strictEqual(new Set(dims).size, dims.length, `repeated dimension in ${dims.join(",")}`);
});

check("an unqualified pattern never crosses it", () => {
  const picked = strongest(many);
  assert.ok(!picked.some((p: { id: number }) => p.id === 6), "a pattern seen twice was recalled");
});

check("approvals outrank raw frequency", () => {
  // A pattern a human kept four times beats one the machine produced forty
  // times that nobody ever looked at.
  const contested = [
    { id: 1, dimension: "direction", value: "seen often", support_count: 40, approved_count: 0, problem_count: 0 },
    { id: 2, dimension: "direction", value: "kept often", support_count: 5, approved_count: 4, problem_count: 0 },
  ];
  assert.strictEqual(strongest(contested)[0].value, "kept often");
});

check("a recalled sentence carries the evidence for itself", () => {
  // A bare assertion cannot be weighed. "Kept in 4 of 5" and "seen in 3, none
  // kept" are different claims and must read differently.
  const kept = asSentence({ dimension: "direction", value: "luxury minimal", approved_count: 4, support_count: 5 });
  assert.ok(kept.includes("kept in 4 of 5"), kept);
  const unkept = asSentence({ dimension: "direction", value: "x", approved_count: 0, support_count: 3 });
  assert.ok(unkept.includes("none yet kept"), unkept);
});

check("recall is capped", () => {
  assert.ok(MAX_RECALL > 0 && MAX_RECALL <= 8, `${MAX_RECALL}`);
});

check("memory reaches the prompt as an observation, not an instruction", () => {
  const pipeline = fs.readFileSync(path.join(__dirname, "evolution/ExperimentPipeline.ts"), "utf-8");
  const block = pipeline.slice(pipeline.indexOf("WHAT THIS WORKSPACE'S OWN WORK SUGGESTS"));
  assert.ok(/not instructions/i.test(block.slice(0, 400)), "the block does not say it is not an instruction");
  assert.ok(/Ignore any of these that the brief above contradicts/.test(block.slice(0, 500)),
    "the block does not yield to the brief");
  assert.ok(/do not let them/i.test(block.slice(0, 600)), "the block does not warn against converging");
});

check("memory is the first thing dropped when the prompt budget is tight", () => {
  const pipeline = fs.readFileSync(path.join(__dirname, "evolution/ExperimentPipeline.ts"), "utf-8");
  const sections = pipeline.slice(pipeline.indexOf("const sections = ["), pipeline.indexOf("].filter(Boolean) as string[]"));
  assert.ok(sections.indexOf("memoryText") > sections.indexOf("prefText"), "memory outranks preferences");
  assert.ok(sections.indexOf("memoryText") > sections.indexOf("renderAssetDNA"),
    "memory outranks the product's observed surface");
});

check("memory and preferences reach the director together, outside the production gate", () => {
  // Until Data Flow Hardening both lived inside `if (productionOn)` --
  // `design_production_v1`, OFF -- so recall was wired and inert. The audit of
  // 2026-09-24 confirmed that on live data, and the gate was lifted
  // deliberately: both channels now reach the Creative Director as one context
  // block, for every experiment render, and the production block no longer
  // repeats them.
  //
  // Still asserted as a pair, for the reason this check always existed: the
  // two channels must travel together, and a retrieval layer that looks
  // connected and reaches nothing is the failure the Phase 3 audit found.
  const pipeline = fs.readFileSync(path.join(__dirname, "evolution/ExperimentPipeline.ts"), "utf-8");
  const gate = pipeline.search(/^\s*if \(productionOn\) \{/m);
  const director = pipeline.indexOf("memoryContextBrief(decision.standingPreferences, decision.creativeMemory)");
  assert.ok(gate > 0 && director > 0, "the director no longer receives memory");
  assert.ok(director < gate, "memory is behind the production gate again");
  assert.ok(pipeline.indexOf("judge(brief, judgmentFlags)") > director, "the director is judged before memory is attached");
  assert.ok(/const prefs = memoryContext \? \[\]/.test(pipeline), "preferences would be stated twice");
  assert.ok(/const recalled = memoryContext \? \[\]/.test(pipeline), "memory would be stated twice");
});

check("the engine is handed sentences, never an account", () => {
  const router = fs.readFileSync(path.join(__dirname, "evolution/PipelineRouter.ts"), "utf-8");
  const context = router.match(/export interface RoutingContext \{[\s\S]*?\n\}/);
  assert.ok(context, "RoutingContext is gone");
  assert.ok(/creativeMemory\?: string\[\]/.test(context![0]), "memory does not travel as sentences");
  assert.ok(!/userId|firebaseUid|actor/i.test(context![0]), "the router was given an identifier for a person");
});

console.log("\nThe boundaries these phases must not cross");

check("the engine still cannot reach a database", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.startsWith("run-")) continue;
      const src = fs.readFileSync(full, "utf-8");
      if (/from ["']@tido\/infrastructure["']|from ["']@supabase|persistence\/(record|recall)-/.test(src)) {
        offenders.push(path.relative(WEB, full));
      }
    }
  };
  walk(path.join(WEB, "lib", "image-engine"));
  assert.deepStrictEqual(offenders, [], `the engine reached persistence: ${offenders.join(", ")}`);
});

check("no replacement for PatternExtractor was written", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-creative-memory.ts"), "utf-8");
  assert.ok(/PatternExtractor/.test(src), "the existing extractor is not being used");
  // It is used for the question it was written to answer -- the creative DEVICE
  // in an idea -- not bent into a composition detector it was never meant to be.
  assert.ok(/PatternExtractor\.extract\(/.test(src));
});

check("no second concept engine was written", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-creative-memory.ts"), "utf-8");
  for (const banned of ["CreativeDirectorV1", "llm", "prompt", "generateConcept"]) {
    assert.ok(!new RegExp(`${banned}\\s*[(.]`, "i").test(src), `a concept engine was written via ${banned}`);
  }
});

check("the judgment leaves the engine non-enumerably", () => {
  const result = render();
  assert.ok((result as Record<string, unknown>).creativeJudgment, "not attached");
  assert.strictEqual(Object.keys(result).includes("creativeJudgment"), false, "it is enumerable");
  assert.strictEqual(JSON.stringify(result).includes("cinematic premium"), false, "it reaches JSON");
});

console.log("\nWhat the migrations are required to say");

check("both tables have row level security and no client write", () => {
  for (const [name, sql] of [["creative_patterns", PATTERNS_SQL], ["creative_concepts", CONCEPTS_SQL]] as const) {
    assert.ok(new RegExp(`alter table public\\.${name} enable row level security`).test(sql), `${name}: RLS off`);
    const policies = [...sql.matchAll(new RegExp(`create policy (\\w+) on public\\.${name}\\s+for (\\w+)`, "g"))];
    assert.ok(policies.length >= 1, `${name}: no policy`);
    for (const [, p, verb] of policies) assert.strictEqual(verb, "select", `${p} grants ${verb}`);
  }
});

check("a pattern is visible only to whoever could see the work behind it", () => {
  assert.ok(/is_org_member\(org_id\)/.test(PATTERNS_SQL), "patterns are not scoped to the workspace");
  assert.ok(/user_id = public\.current_profile_id\(\)/.test(PATTERNS_SQL), "no personal fallback");
});

check("a pattern belongs to exactly one owner", () => {
  assert.ok(/creative_patterns_one_owner/.test(PATTERNS_SQL), "ownership is not constrained");
});

check("one run cannot record two winners", () => {
  assert.ok(/creative_concepts_one_selected/.test(CONCEPTS_SQL));
  assert.ok(/where selected = true/.test(CONCEPTS_SQL));
});

check("a rejection reason cannot be attached to the winner", () => {
  assert.ok(/creative_concepts_reason_only_on_rejected/.test(CONCEPTS_SQL));
});

check("the pattern search is owner-filtered inside the query", () => {
  const fn = PATTERNS_SQL.slice(PATTERNS_SQL.indexOf("create or replace function public.search_creative_patterns"));
  assert.ok(/cp\.org_id = p_org/.test(fn) && /cp\.user_id = p_user/.test(fn), "not owner-filtered");
  assert.ok(fn.indexOf("p_org") < fn.indexOf("order by"), "the filter runs after the ordering");
  assert.ok(/from anon/.test(PATTERNS_SQL) && /from authenticated/.test(PATTERNS_SQL), "not server-only");
});

check("approval promotion is idempotent by construction", () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS, "0011_pattern_approval_runs.sql"), "utf-8");
  assert.ok(/approved_runs jsonb not null default/.test(sql), "no record of which runs were credited");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
