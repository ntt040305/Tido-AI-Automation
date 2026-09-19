import assert from "assert";
import fs from "fs";
import path from "path";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import {
  directionTelemetry,
  resolveSelectedDirection,
} from "./evolution/experiment/CreativeDirectionResolver";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";

/**
 * Phase 0 — the chosen direction reaches the prompt.
 *
 * The defect these lock down was invisible in exactly the way this project keeps
 * producing: the director chose a route, logged it, and the block that announces
 * what happens in the frame never rendered, because it was keyed on the field
 * the OTHER branch fills.
 *
 * `strategySelection` and `exploration` are the two arms of one `if/else` in the
 * director. Turning strategy selection on turns exploration off, so `directions`
 * is empty and `selected` is "". Every render using strategy selection therefore
 * shipped without a CREATIVE DIRECTION section while the decision existed.
 */

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
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

const COMPILED = ["## ROLE", "Make a photograph.", "", "## FINAL OUTPUT", "Render it."].join("\n");

/** What the director returns when strategy selection ran and exploration did not. */
const strategyOnly = (): CreativeJudgment =>
  ({
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [],
      selected: "editorial advertising — a photograph with a point of view",
      selection_reason: "vì khách quen đã tin quán, thứ họ chưa thấy là cách pha",
      runner_up: "product-as-hero",
      why_not_runner_up: "it repeats what the shelf already says",
      routes_offered: ["a", "b", "c"],
      routes_developed: ["a", "b"],
    },
  }) as any;

/** What the director returns when exploration ran. */
const explorationOnly = (): CreativeJudgment =>
  ({
    directions: [
      {
        name: "Premium Brand",
        core_idea: "một bàn tay rót cold brew vào ly đá",
        visual_language: "ánh sáng bên, nền tối, không đạo cụ",
        why_it_fits: "khách quen không cần được thuyết phục",
      },
    ],
    selected: "Premium Brand",
    selection_reason: "vì nó im lặng hơn hai hướng kia",
    rejected_reason: "Commercial Safe",
  }) as any;

console.log("\n=== Phase 0 — the chosen direction reaches the prompt ===\n");

check("Strategy selection alone still produces a CREATIVE DIRECTION block", () => {
  // The regression. Before the fix this block was absent on every such render.
  const out = NanoBananaPromptComposer.compose(COMPILED, strategyOnly(), false);
  assert.ok(out.includes("## CREATIVE DIRECTION"), "the chosen direction was never announced");
  assert.ok(
    out.includes("CHOSEN DIRECTION: editorial advertising — a photograph with a point of view"),
    "the route did not travel as the direction"
  );
});

check("The route's own reason travels with it", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, strategyOnly(), false);
  assert.ok(out.includes("khách quen đã tin quán"), "selection_reason was dropped");
  assert.ok(
    out.includes("WHY OTHER DIRECTIONS WERE NOT USED: it repeats what the shelf already says"),
    "the rejected route was dropped"
  );
});

check("Exploration keeps the behaviour it always had", () => {
  // The fallback must not change the path that already worked.
  const out = NanoBananaPromptComposer.compose(COMPILED, explorationOnly(), false);
  assert.ok(out.includes("CHOSEN DIRECTION: Premium Brand"));
  assert.ok(out.includes("HOW IT SHOULD APPEAR: một bàn tay rót"), "the direction body was lost");
  assert.ok(out.includes("HOW IT SHOULD APPEAR: ánh sáng bên"));
  assert.ok(/WHY THIS DIRECTION: .*vì nó im lặng hơn/.test(out));
  assert.ok(out.includes("WHY OTHER DIRECTIONS WERE NOT USED: Commercial Safe"));
});

check("Exploration wins when both are present", () => {
  // Exploration produces a named direction with a body; a route is a sentence.
  // Where both exist the richer one is the direction, and the route still has
  // its own section.
  const both = { ...explorationOnly(), ...{ strategy: strategyOnly().strategy } } as CreativeJudgment;
  const out = NanoBananaPromptComposer.compose(COMPILED, both, false);
  assert.ok(out.includes("CHOSEN DIRECTION: Premium Brand"), "the route displaced an explored direction");
  assert.ok(out.includes("## THE ROUTE THIS BRIEF IS ANSWERED BY"), "the route section vanished");
});

check("A judgment with neither produces no block, rather than an empty one", () => {
  const empty = { directions: [], selected: "", selection_reason: "" } as CreativeJudgment;
  const out = NanoBananaPromptComposer.compose(COMPILED, empty, false);
  assert.ok(!out.includes("## CREATIVE DIRECTION"), "an empty direction block was emitted");
});

check("Nothing is invented when the route carries no reason", () => {
  const bare = {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: { selected: "quiet product portrait", candidates: [], selection_reason: "", runner_up: "", why_not_runner_up: "", routes_offered: [], routes_developed: [] },
  } as any;
  const out = NanoBananaPromptComposer.compose(COMPILED, bare, false);
  assert.ok(out.includes("CHOSEN DIRECTION: quiet product portrait"));
  assert.ok(!out.includes("WHY THIS DIRECTION"), "a reason was invented");
  assert.ok(!out.includes("WHY OTHER DIRECTIONS WERE NOT USED"), "a rejection was invented");
  assert.ok(!out.includes("HOW IT SHOULD APPEAR"), "an appearance was invented");
});

check("The compiled prompt is not otherwise disturbed", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, strategyOnly(), false);
  for (const s of ["## ROLE", "Make a photograph.", "## FINAL OUTPUT", "Render it."]) {
    assert.ok(out.includes(s), `${s} was altered`);
  }
});

check("The telemetry field falls back the same way", () => {
  // A trace that reports `undefined` for a decision that was made is how this
  // defect stayed invisible. The pipeline field must follow the composer.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /visual_direction: clip\(direction\?\.name\)/.test(src),
    "CREATIVE_STRATEGY_TRACE does not read through the resolver"
  );
  assert.ok(/\.\.\.directionTelemetry\(direction\)/.test(src), "the trace does not emit the resolver telemetry");
  assert.ok(/composer_used_direction: Boolean\(direction\)/.test(src), "composer_used_direction is not reported");
});

check("Stable files were not touched", () => {
  for (const file of [
    ["service", "CommercialLayoutService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["compiler", "ProviderPromptOptimizer.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(!/CHOSEN DIRECTION/.test(src), `${file[1]} now emits a creative direction`);
  }
});


// ── Phase 0.1 — the three cases the brief names ─────────────────────────────

check("CASE 1 — { selected: \"Premium Product Story\" } reaches the composer", () => {
  const j: any = { directions: [], selected: "Premium Product Story", selection_reason: "" };
  assert.strictEqual(resolveSelectedDirection(j)?.name, "Premium Product Story");
  const out = NanoBananaPromptComposer.compose(COMPILED, j, false);
  assert.ok(out.includes("CHOSEN DIRECTION: Premium Product Story"));
});

check("CASE 2 — { strategy: { selected: \"Editorial Advertising\" } } reaches the composer", () => {
  const j: any = { directions: [], selected: "", selection_reason: "", strategy: { selected: "Editorial Advertising" } };
  assert.strictEqual(resolveSelectedDirection(j)?.name, "Editorial Advertising");
  const out = NanoBananaPromptComposer.compose(COMPILED, j, false);
  assert.ok(out.includes("CHOSEN DIRECTION: Editorial Advertising"));
});

check("CASE 3 — {} produces no block and does not throw", () => {
  const j: any = {};
  assert.strictEqual(resolveSelectedDirection(j), null);
  const out = NanoBananaPromptComposer.compose(COMPILED, j, false);
  assert.ok(!out.includes("## CREATIVE DIRECTION"));
  assert.strictEqual(resolveSelectedDirection(null), null);
  assert.strictEqual(resolveSelectedDirection(undefined), null);
});

// ── the resolver's own contract ─────────────────────────────────────────────

check("A future strategySelection shape resolves without another rewrite", () => {
  // The point of the resolver. A new branch on the judgment should not require a
  // fifth reader somewhere else in the tree.
  const j: any = { strategySelection: { selected: "Documentary Product", selection_reason: "vì khách cần bằng chứng" } };
  const r = resolveSelectedDirection(j)!;
  assert.strictEqual(r.name, "Documentary Product");
  assert.strictEqual(r.source, "strategy");
  assert.ok(r.reasoning.includes("bằng chứng"));
});

check("Malformed input is survived, not crashed on", () => {
  for (const bad of [{ directions: null }, { selected: 42 }, { strategy: { selected: null } }, { directions: "x" }]) {
    assert.doesNotThrow(() => resolveSelectedDirection(bad as any));
  }
  assert.strictEqual(resolveSelectedDirection({ selected: "   " } as any), null, "whitespace became a direction");
});

check("Telemetry counts, and names the source", () => {
  const explored = directionTelemetry(resolveSelectedDirection(explorationOnly()));
  assert.strictEqual(explored.creative_direction_present, true);
  assert.strictEqual(explored.direction_source, "exploration");
  assert.strictEqual(explored.directions_count, 1);
  assert.strictEqual(explored.reasoning_present, true);

  const none = directionTelemetry(null);
  assert.strictEqual(none.creative_direction_present, false);
  assert.strictEqual(none.selected_direction, null);
  assert.strictEqual(none.directions_count, 0);
});

check("Telemetry carries the name but not the prose", () => {
  const t = directionTelemetry(resolveSelectedDirection(strategyOnly())) as any;
  const serialized = JSON.stringify(t);
  assert.ok(!serialized.includes("khách quen đã tin quán"), "the reasoning prose leaked into telemetry");
  assert.ok(serialized.includes("editorial advertising"), "the chosen name is missing");
});


// ── Phase 0.2 — strategy selection carries visual execution too ─────────────

check("A strategy candidate's visual_language reaches the prompt", () => {
  // The Phase 0.2 gap. The strategy branch already explored, evaluated against
  // six criteria and selected; what it never carried was HOW the frame is
  // rendered, so the renderer received a subject and invented the photograph.
  const j: any = {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      selected: "editorial advertising",
      selection_reason: "vì khách quen đã tin quán",
      why_not_runner_up: "",
      candidates: [
        {
          route: "editorial advertising",
          core_idea: "chai đặt trên sàng cà phê đang phơi",
          visual_language: "ánh xiên từ sau, nhãn nửa trong bóng, mặt gỗ mòn sát ống kính",
          why_this_route: "vì nguồn gốc là thứ họ chưa thấy",
          assessment: {},
        },
      ],
    },
  };
  const r = resolveSelectedDirection(j)!;
  assert.strictEqual(r.appearance.length, 2, "the strategy branch still carries only one half");
  assert.ok(r.appearance[0].includes("sàng cà phê"), "what happens in the frame is missing");
  assert.ok(r.appearance[1].includes("ánh xiên từ sau"), "how it is rendered is missing");

  const out = NanoBananaPromptComposer.compose(COMPILED, j, false);
  assert.ok(out.includes("HOW IT SHOULD APPEAR: chai đặt trên sàng"));
  assert.ok(out.includes("HOW IT SHOULD APPEAR: ánh xiên từ sau"));
});

check("A judgment made before Phase 0.2 still resolves", () => {
  // `visual_language` is optional on a candidate precisely so that every cached
  // judgment produced before the field existed keeps working.
  const j: any = {
    directions: [],
    selected: "",
    strategy: {
      selected: "documentary",
      candidates: [{ route: "documentary", core_idea: "một bàn tay rót", why_this_route: "x", assessment: {} }],
    },
  };
  const r = resolveSelectedDirection(j)!;
  assert.strictEqual(r.appearance.length, 1, "an absent field was turned into a line");
  assert.ok(!r.appearance.some((a) => !a), "an empty string reached the appearance list");
});

check("Both halves are asked for in the director contract AND the prose", () => {
  // Asking in prose while omitting the field from the JSON contract produced the
  // field on zero directions out of three once already; the comment at the
  // exploration shape records it. So both must be present.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  const contract = src.indexOf('"route": "<one of the routes offered');
  const block = src.slice(contract, contract + 400);
  assert.ok(/"visual_language"/.test(block), "the candidate contract does not declare visual_language");
  assert.ok(
    /A direction is not finished at what happens in the frame/.test(src),
    "the strategy prose does not ask for how it is rendered"
  );
});

check("The two branches are still mutually exclusive", () => {
  // Deliberate. Two systems inventing directions for one brief is the two-scene
  // defect an earlier phase was spent removing; this phase closes the gap by
  // completing the strategy branch, not by running both.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(
    /if \(flags\.strategySelection && brief\.routes\?\.length\) \{[\s\S]*?\} else if \(flags\.exploration\) \{/.test(src),
    "the branches are no longer exclusive"
  );
});

check("Exploration's own visual_language is untouched", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, explorationOnly(), false);
  assert.ok(out.includes("HOW IT SHOULD APPEAR: một bàn tay rót"));
  assert.ok(out.includes("HOW IT SHOULD APPEAR: ánh sáng bên"));
});


// ── Phase 0.3 — creative bridge calibration ─────────────────────────────────

/** Everything the director can produce, so suppression is visible per block. */
const fullJudgment = (): any => ({
  ...strategyOnly(),
  brand: { personality: "một quán quen", positioning: "cà phê pha kỹ", emotional_territory: "sự yên tâm", audience_perception: "tin cậy", inferred: "từ brief" },
  consumer: { viewer: "khách quen 25-40", first_feeling: "nhận ra", trust_driver: "thấy hạt thật", desire_driver: "hơi lạnh", intended_action: "ghé mua", attention: { first_second: "màu nước", then: "nhãn", finally: "logo" } },
  semantics: [{ element: "đất đỏ", communicates: "nguồn gốc", why_not_decorative: "nơi hạt lớn lên" }],
  reasoning: { camera: { choice: "a", reason: "b" }, lighting: { choice: "c", reason: "d" }, composition: { choice: "e", reason: "f" }, typography: { choice: "g", reason: "h" }, colour: { choice: "i", reason: "j" } },
});

const blocksOf = (out: string) =>
  (out.match(/^## .*$/gm) || []).filter((h) => h !== "## ROLE" && h !== "## FINAL OUTPUT");

check("Uncontrolled runs are unchanged by this phase", () => {
  // The whole judgment still travels. Phase 0.3 must be invisible here.
  const out = NanoBananaPromptComposer.compose(COMPILED, fullJudgment(), false);
  const b = blocksOf(out).join(" ");
  for (const s of ["CREATIVE DIRECTION", "THE ROUTE", "BRAND POSITIONING", "AUDIENCE", "VISUAL DECISIONS", "WHY THESE ELEMENTS"]) {
    assert.ok(b.includes(s), `${s} was lost from an uncontrolled run`);
  }
});

check("Control mode without the bridge still suppresses everything", () => {
  // The prior behaviour. Enabling control alone must not change on its own.
  const out = NanoBananaPromptComposer.compose(COMPILED, fullJudgment(), true);
  assert.deepStrictEqual(blocksOf(out), [], "control mode emitted judgment without the bridge flag");
});

check("Control mode with the bridge carries only what the brief does not", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, fullJudgment(), true, undefined, undefined, false, undefined, true);
  const b = blocksOf(out).join(" ");
  // Kept: written nowhere in the rewritten brief.
  assert.ok(b.includes("BRAND POSITIONING"), "brand reasoning is still deleted");
  assert.ok(b.includes("AUDIENCE"), "audience reasoning is still deleted");
  assert.ok(b.includes("WHY THESE ELEMENTS"), "element semantics are still deleted");
  // Suppressed: control mode already wrote these into the concept or the
  // hard requirements, and stating one scene twice reads as two scenes.
  assert.ok(!b.includes("CREATIVE DIRECTION"), "the scene is stated twice");
  assert.ok(!b.includes("THE ROUTE"), "the route is stated twice");
  assert.ok(!b.includes("VISUAL DECISIONS"), "camera and lighting are stated twice");
});

check("Staging is suppressed in control mode, where the brief already carries it", () => {
  const j = { ...fullJudgment(), staging: { relationship: { relationship_type: "một dải ba vị" }, grouping: "trên một khay" } };
  const on = NanoBananaPromptComposer.compose(COMPILED, j, true, undefined, undefined, false, undefined, true);
  assert.ok(!on.includes("SHARE ONE PHOTOGRAPH"), "staging is stated twice in control mode");
  const off = NanoBananaPromptComposer.compose(COMPILED, j, false);
  assert.ok(off.includes("SHARE ONE PHOTOGRAPH"), "staging was lost from an uncontrolled run");
});

check("Only one carrier: the terse hardRequirement lines are not also pushed", () => {
  // The bridge used to push four one-line summaries into hardRequirements
  // because control mode had deleted the sections carrying them. The composer
  // now carries those sections, so passing the flag to both would state each
  // twice — once as a sentence, once as a block.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /applyCreativeDecision\(request, decision, false\)/.test(src),
    "the decision still bridges into hardRequirements as well"
  );
  assert.ok(/carryNonSceneReasoning/.test(src), "the composer is not told to carry it");
});

check("The bridge flag reaches the controlled path only", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  // The concurrent (uncontrolled) wrapProvider call passes a literal false:
  // there is nothing to restore when the whole judgment is appended already.
  const marker = "// Uncontrolled: the whole judgment is appended anyway.";
  const at = src.indexOf(marker);
  assert.ok(at > 0, "the uncontrolled wrapProvider call lost its marker");
  assert.ok(
    /^\s*false\s*$/m.test(src.slice(at + marker.length, at + marker.length + 40)),
    "the uncontrolled path was given the bridge"
  );
});

console.log("");
console.log("=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
