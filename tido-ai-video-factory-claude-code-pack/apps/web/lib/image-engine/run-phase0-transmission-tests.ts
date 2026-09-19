import assert from "assert";
import { toCreativeDecision, applyCreativeDecision } from "./evolution/experiment/CreativeDecision";
import { resolveSelectedDirection } from "./evolution/experiment/CreativeDirectionResolver";
import { buildLayoutContext, renderLayoutContext } from "./evolution/experiment/LayoutContextBridge";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";

/**
 * Phase 0.4 Task 3 — the creative execution payload survives every path.
 *
 *   npx tsx lib/image-engine/run-phase0-transmission-tests.ts
 *
 * Four paths, one question: does the renderer learn the same things about what to
 * make, regardless of which branch of the director produced the decision, whether
 * the decision is reused, and whether control mode is on?
 *
 * The defect class these exist for
 * --------------------------------
 * Twice now a field has resolved correctly, been logged correctly, and reached
 * the renderer by no route at all — `environment_decision` on the strategy
 * branch, and the direction NAME on the exploration branch. Both were invisible
 * to every test that asserted on the resolver, because the resolver was right
 * both times. The loss was in the emitter.
 *
 * So these tests assert on the PROMPT, not on the objects. An assertion that
 * `decision.environment_decision` is non-empty would have passed throughout the
 * entire period the bug existed.
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

// ── one set of values, expressed on both branches ─────────────────────────

const V = {
  name: "process evidence",
  core_idea: "chai trên mặt gỗ, hạt rang rải quanh chân chai",
  visual_language: "ánh sáng xiên một phía, nhãn nửa trong bóng",
  why: "khách quen đã tin quán",
  selection_reason: "vì lời hứa phải kiểm chứng được bằng mắt",
  why_not: "nó lặp lại thứ kệ hàng đã nói",
};

const REASONING = {
  camera: { choice: "85mm ngang tầm ngực", reason: "r" },
  lighting: { choice: "một nguồn chính một tấm hắt", reason: "r" },
  composition: { choice: "chai lệch trái một phần ba", reason: "r" },
  typography: { choice: "không vẽ chữ", reason: "r" },
  colour: { choice: "bảng màu sản phẩm dẫn", reason: "r" },
};

const SHARED = {
  reasoning: REASONING,
  brand: { personality: "p", positioning: "q", emotional_territory: "quán quen của khu phố", audience_perception: "a", inferred: "i" },
  consumer: { viewer: "v", first_feeling: "f", trust_driver: "t", desire_driver: "d", intended_action: "ghé mua trước 9h", attention: { first_second: "1", then: "2", finally: "3" } },
  semantics: [{ element: "hạt rang rải quanh", meaning: "nguồn gốc kiểm chứng được" }],
  generic_check: { flagged: ["nền studio mặc định"], justification: "thay bằng mặt bàn thật của quán", revised: true },
};

const exploration = (): CreativeJudgment =>
  ({
    directions: [{ name: V.name, core_idea: V.core_idea, visual_language: V.visual_language, why_it_fits: V.why }],
    selected: V.name,
    selection_reason: V.selection_reason,
    rejected_reason: V.why_not,
    ...SHARED,
  }) as unknown as CreativeJudgment;

const strategy = (): CreativeJudgment =>
  ({
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [{ route: V.name, core_idea: V.core_idea, visual_language: V.visual_language, why_this_route: V.why, assessment: {} }],
      selected: V.name,
      selection_reason: V.selection_reason,
      runner_up: "product-as-hero",
      why_not_runner_up: V.why_not,
      routes_offered: [V.name, "product-as-hero"],
      routes_developed: [V.name],
    },
    ...SHARED,
  }) as unknown as CreativeJudgment;

const COMPILED = [
  "## ROLE", "Make one photograph.", "",
  "## CREATIVE INTENT", "__CONCEPT__", "",
  "## USER HARD REQUIREMENTS", "__HARD__", "",
  "## COMMERCIAL LAYOUT", "- Top 12% reserved.", "",
  "## FINAL OUTPUT", "Return one photograph.",
].join("\n");

/** The full chain, exactly as ExperimentPipeline wires it. */
function toPrompt(j: CreativeJudgment, opts: { controlled: boolean; bridge: boolean; layout: boolean }): string {
  let concept = "brief";
  let hard: string[] = [];
  if (opts.controlled) {
    const d = toCreativeDecision(j);
    if (d) {
      const r = applyCreativeDecision({ concept, useCase: "poster", aspectRatio: "1:1", hardRequirements: hard } as any, d, false);
      concept = r.concept;
      hard = r.hardRequirements || [];
    }
  }
  const layout = opts.layout ? renderLayoutContext(buildLayoutContext({ judgment: j, productCount: 1 })) : "";
  const compiled = COMPILED.replace("__CONCEPT__", concept).replace("__HARD__", hard.map((h) => `- ${h}`).join("\n"));
  return NanoBananaPromptComposer.compose(compiled, j, opts.controlled, undefined, layout || undefined, false, undefined, opts.bridge);
}

/**
 * The execution payload: what the renderer must learn in order to make the
 * picture. Reasoning ABOUT the choice is checked separately — it is carried by
 * the bridge, not by the decision, and conflating the two hid a bug once.
 */
const EXECUTION = [
  { label: "direction name", value: V.name },
  { label: "scene", value: V.core_idea },
  { label: "visual language", value: V.visual_language },
  { label: "selection reason", value: V.selection_reason },
  { label: "camera", value: REASONING.camera.choice },
  { label: "lighting", value: REASONING.lighting.choice },
  { label: "composition", value: REASONING.composition.choice },
  { label: "typography", value: REASONING.typography.choice },
];

function missingFrom(prompt: string): string[] {
  return EXECUTION.filter((f) => !prompt.includes(f.value)).map((f) => f.label);
}

/** Every combination of the flags that affect this path. */
const MODES = [
  { controlled: true, bridge: true, layout: true },
  { controlled: true, bridge: true, layout: false },
  { controlled: true, bridge: false, layout: true },
  { controlled: true, bridge: false, layout: false },
  { controlled: false, bridge: false, layout: false },
  { controlled: false, bridge: false, layout: true },
];
const describe = (m: (typeof MODES)[number]) =>
  `control=${m.controlled} bridge=${m.bridge} layout=${m.layout}`;

console.log("\n=== Phase 0.4 — creative execution payload survives every path ===\n");

// ── 1. exploration branch ─────────────────────────────────────────────────

check("1. EXPLORATION — the full execution payload reaches the prompt in every mode", () => {
  for (const m of MODES) {
    const missing = missingFrom(toPrompt(exploration(), m));
    assert.deepStrictEqual(missing, [], `${describe(m)} dropped: ${missing.join(", ")}`);
  }
});

check("1. EXPLORATION — the direction is named, without claiming to be a route", () => {
  const p = toPrompt(exploration(), { controlled: true, bridge: false, layout: false });
  assert.ok(p.includes(`The creative direction chosen for this image: ${V.name}`), "the direction is not named");
  assert.ok(
    !/answers the brief as:/.test(p),
    "an exploration run grew a strategy line — this is the contract run-evolution-tests.ts:2030 protects"
  );
});

// ── 2. strategy branch ────────────────────────────────────────────────────

check("2. STRATEGY — the full execution payload reaches the prompt in every mode", () => {
  for (const m of MODES) {
    const missing = missingFrom(toPrompt(strategy(), m));
    assert.deepStrictEqual(missing, [], `${describe(m)} dropped: ${missing.join(", ")}`);
  }
});

check("2. STRATEGY — the route is named, and the rendering instruction travels", () => {
  const p = toPrompt(strategy(), { controlled: true, bridge: false, layout: false });
  assert.ok(p.includes(`This image answers the brief as: ${V.name}`), "the route is not named");
  assert.ok(p.includes(`Render it as: ${V.visual_language}`), "the Phase 0.2 rendering instruction is missing");
});

// ── equivalence ───────────────────────────────────────────────────────────

check("EQUIVALENCE — neither branch carries execution information the other lacks", () => {
  for (const m of MODES) {
    const e = toPrompt(exploration(), m);
    const s = toPrompt(strategy(), m);
    const gaps = EXECUTION.filter((f) => e.includes(f.value) !== s.includes(f.value)).map((f) => f.label);
    assert.deepStrictEqual(gaps, [], `${describe(m)} branch gap: ${gaps.join(", ")}`);
  }
});

check("EQUIVALENCE — does not depend on the layout bridge being on", () => {
  // The gap this caught: the branches agreed only because LAYOUT CONTEXT happened
  // to carry the direction name that CreativeDecision dropped. Compensation by an
  // unrelated flag is not equivalence.
  const e = toPrompt(exploration(), { controlled: true, bridge: true, layout: false });
  const s = toPrompt(strategy(), { controlled: true, bridge: true, layout: false });
  for (const f of EXECUTION) {
    assert.strictEqual(e.includes(f.value), s.includes(f.value), `${f.label} differs with the layout bridge off`);
  }
});

check("EQUIVALENCE — the two branches produce identical decision objects for execution fields", () => {
  const a = toCreativeDecision(exploration())! as unknown as Record<string, string>;
  const b = toCreativeDecision(strategy())! as unknown as Record<string, string>;
  for (const f of ["scene_definition", "environment_decision", "camera_decision", "lighting_decision", "composition_decision", "typography_decision", "selected_direction", "creative_goal", "visual_story"]) {
    assert.strictEqual(a[f], b[f], `${f} differs: exploration="${a[f]}" strategy="${b[f]}"`);
  }
});

// ── 3. cached / reused decision ───────────────────────────────────────────

check("3. CACHED — deriving the decision twice from one judgment gives the same payload", () => {
  const j = strategy();
  const a = JSON.stringify(toCreativeDecision(j));
  const b = JSON.stringify(toCreativeDecision(j));
  assert.strictEqual(a, b, "toCreativeDecision is not idempotent — it carries hidden state");
});

check("3. CACHED — deriving the decision does not mutate the judgment it read", () => {
  // A judgment is reused: the composer receives the same object the decision was
  // built from. A mutation here would mean the appended block and the rewritten
  // brief disagree about what was decided.
  const j = strategy();
  const before = JSON.stringify(j);
  toCreativeDecision(j);
  assert.strictEqual(JSON.stringify(j), before, "toCreativeDecision mutated the judgment");
});

check("3. CACHED — applying one decision twice gives byte-identical requests", () => {
  const d = toCreativeDecision(strategy())!;
  const base = { concept: "brief", useCase: "poster", aspectRatio: "1:1", hardRequirements: ["keep"] } as any;
  const a = applyCreativeDecision(base, d, false);
  const b = applyCreativeDecision(base, d, false);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), "applyCreativeDecision is not idempotent");
});

check("3. CACHED — applying a decision does not mutate the request it was given", () => {
  const d = toCreativeDecision(strategy())!;
  const base = { concept: "brief", useCase: "poster", aspectRatio: "1:1", hardRequirements: ["keep"] } as any;
  const before = JSON.stringify(base);
  applyCreativeDecision(base, d, false);
  assert.strictEqual(JSON.stringify(base), before, "applyCreativeDecision mutated the caller's request");
});

check("3. CACHED — a reused judgment produces the same prompt on the second pass", () => {
  const j = exploration();
  const first = toPrompt(j, { controlled: true, bridge: true, layout: true });
  const second = toPrompt(j, { controlled: true, bridge: true, layout: true });
  assert.strictEqual(first, second, "the same judgment produced two different prompts");
});

// ── 4. control mode ───────────────────────────────────────────────────────

check("4. CONTROL — the payload survives the request rewrite on both branches", () => {
  for (const j of [exploration(), strategy()]) {
    const missing = missingFrom(toPrompt(j, { controlled: true, bridge: true, layout: false }));
    assert.deepStrictEqual(missing, [], `control mode dropped: ${missing.join(", ")}`);
  }
});

check("4. CONTROL — the scene is carried once, not twice", () => {
  // Control mode's whole purpose. The scene is IN the rewritten brief, so the
  // appended block must not state it again — one scene stated twice reads as two.
  for (const j of [exploration(), strategy()]) {
    const p = toPrompt(j, { controlled: true, bridge: true, layout: true });
    assert.ok(!p.includes("## CREATIVE DIRECTION"), "the scene block was appended on top of the rewritten brief");
    assert.strictEqual((p.match(new RegExp(V.core_idea.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1, "the scene appears more than once");
  }
});

check("4. CONTROL — the bridge restores non-scene reasoning, and only that", () => {
  const off = toPrompt(strategy(), { controlled: true, bridge: false, layout: false });
  const on = toPrompt(strategy(), { controlled: true, bridge: true, layout: false });
  for (const block of ["## BRAND POSITIONING", "## AUDIENCE", "## WHY THESE ELEMENTS"]) {
    assert.ok(!off.includes(block), `${block} leaked into the un-bridged arm`);
    assert.ok(on.includes(block), `${block} missing from the bridged arm`);
  }
  // The execution payload is identical either way: the bridge adds reasoning,
  // never the picture.
  assert.deepStrictEqual(missingFrom(off), missingFrom(on), "the bridge changed what the renderer is asked to make");
});

check("4. CONTROL — uncontrolled mode is unchanged by any of this", () => {
  for (const j of [exploration(), strategy()]) {
    const p = toPrompt(j, { controlled: false, bridge: false, layout: false });
    assert.ok(p.includes("## CREATIVE DIRECTION"), "the uncontrolled path stopped appending the direction");
    assert.deepStrictEqual(missingFrom(p), [], "the uncontrolled path lost execution information");
  }
});

// ── nothing invented ──────────────────────────────────────────────────────

check("An empty judgment produces no invented lines on either branch", () => {
  const bare = { directions: [], selected: "", selection_reason: "" } as unknown as CreativeJudgment;
  assert.strictEqual(toCreativeDecision(bare), null, "a decision was built from nothing");
  const p = NanoBananaPromptComposer.compose(COMPILED, bare, true, undefined, undefined, false, undefined, true);
  assert.ok(!/Render it as: \s*$/m.test(p), "an empty rendering instruction was emitted");
  assert.ok(!/creative direction chosen for this image: \s*$/im.test(p), "an empty direction line was emitted");
});

check("A judgment with a scene but no visual_language emits no rendering instruction", () => {
  const j = {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [{ route: "r", core_idea: "a shelf", why_this_route: "w", assessment: {} }],
      selected: "r", selection_reason: "", runner_up: "", why_not_runner_up: "", routes_offered: [], routes_developed: [],
    },
  } as unknown as CreativeJudgment;
  const d = toCreativeDecision(j)!;
  assert.strictEqual(d.environment_decision, "", "a rendering instruction was invented");
  const r = applyCreativeDecision({ concept: "c" } as any, d, false);
  assert.ok(!(r.hardRequirements || []).some((h: string) => h.startsWith("Render it as:")), "an empty 'Render it as:' was emitted");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
