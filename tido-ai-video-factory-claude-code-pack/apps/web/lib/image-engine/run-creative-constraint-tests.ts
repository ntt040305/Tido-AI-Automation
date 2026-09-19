import assert from "assert";
import fs from "fs";
import path from "path";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";

/**
 * Creative Constraint Calibration.
 *
 * Two ways this phase can fail, and they pull in opposite directions.
 *
 * The first is doing nothing: a block of prose that reads well and changes no
 * render. The tests can only partly reach that — an image is the only real
 * evidence — so what they check is that the block says something specific and
 * checkable rather than something agreeable.
 *
 * The second is the one this file mostly guards. The obvious way to stop a
 * renderer over-decorating is to tell it what each kind of product deserves:
 * perfume gets an empty frame, food gets ingredients, seasonal gets a capped
 * ornament budget. That is the hardcoded creative rule this project has banned
 * since its first phase, and it would be wrong exactly when it mattered. So
 * several tests below do nothing but confirm the absence of such a table, and
 * one confirms the block does not overcorrect into demanding empty frames.
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

const judgment = (): CreativeJudgment =>
  ({ directions: [], selected: "", selection_reason: "" } as CreativeJudgment);

const COMPILED = [
  "## ROLE",
  "Make a commercial photograph.",
  "## COMMERCIAL LAYOUT",
  "FORMAT: poster.",
  "## FINAL OUTPUT",
  "Render it.",
].join("\n");

const block = (productCount = 1) =>
  NanoBananaPromptComposer.applyCreativeConstraint("", { productCount }).prompt.trim();

console.log("\n=== Creative Constraint Calibration ===\n");

// ── the ordering it exists to state ─────────────────────────────────────────

check("The four priorities appear, in the required order", () => {
  const b = block(1);
  const order = [
    "1. Product identity",
    "2. What this image has to achieve commercially",
    "3. The creative intent",
    "4. Atmosphere and environment",
  ];
  let cursor = -1;
  for (const line of order) {
    const at = b.indexOf(line);
    assert.ok(at > 0, `missing priority line: ${line}`);
    assert.ok(at > cursor, `out of order: ${line}`);
    cursor = at;
  }
  assert.ok(/Fourth means it yields/.test(b), "the ordering is listed but not enforced in words");
});

check("Product identity is stated as fact, not as a starting point", () => {
  const b = block(1);
  assert.ok(/shape, label, colour, material and proportions are facts/.test(b));
});

// ── what intent may and may not do ──────────────────────────────────────────

check("Every lever the brief grants creative intent is named", () => {
  // The phase brief lists these explicitly. A block that quietly dropped one
  // would narrow creative intent past what was asked.
  const b = block(1);
  for (const lever of [
    "Composition",
    "hierarchy",
    "camera position",
    "lighting",
    "colour",
    "mood",
    "which element the eye",
  ]) {
    assert.ok(b.includes(lever), `creative intent lost a lever it was granted: ${lever}`);
  }
});

check("The four things intent must not force are all refused", () => {
  const b = block(1);
  assert.ok(/does not ask for objects to be added/.test(b), "object insertion is not refused");
  assert.ok(/not a list of props to build/.test(b), "props are not refused");
  assert.ok(
    /Reach atmosphere first through light, colour, depth of field, surface and framing/.test(b),
    "no alternative to adding objects is offered"
  );
});

check("An added object has to be traceable to this brief", () => {
  // The adaptive mechanism, and the only one. It is the same grounding
  // discipline the strategy and visual-DNA layers already use: point at the
  // line, or it does not go in the frame.
  const b = block(1);
  assert.ok(/Point to the line in this prompt that asks for it/.test(b));
  assert.ok(/say what it does for the sale/.test(b));
  assert.ok(/If two things compete for the eye, one of them is decoration/.test(b));
});

check("It does not overcorrect into demanding empty frames", () => {
  // The failure mode of the fix. A renderer told only to remove things produces
  // a bare product on grey, which is the generic output Phase 0C was about.
  const b = block(1);
  assert.ok(/NOT AN INSTRUCTION TO EMPTY THE FRAME/.test(b));
  assert.ok(/A full frame and a bare one are both correct answers/.test(b));
});

// ── it must not become a lookup table ───────────────────────────────────────

check("No product category appears anywhere in the block", () => {
  const b = block(3).toLowerCase();
  for (const category of [
    "perfume", "luxury", "food", "drink", "coffee", "beverage", "cosmetic", "skincare",
    "fashion", "electronics", "tech", "seasonal", "tết", "christmas", "holiday",
  ]) {
    assert.ok(!b.includes(category), `the block names a product category: ${category}`);
  }
});

check("No prescribed treatment appears either", () => {
  // Naming no category but prescribing "minimal", "premium" or an object budget
  // would be the same table wearing different words.
  const b = block(3).toLowerCase();
  for (const prescription of [
    "minimal background", "premium feel", "at most", "no more than", "ingredients are allowed",
    "centered", "left side", "right side", "rule of thirds",
  ]) {
    assert.ok(!b.includes(prescription), `the block prescribes a treatment: ${prescription}`);
  }
});

check("The block adapts only by pointing at the prompt around it", () => {
  // Two very different briefs must get the same block. The difference in output
  // has to come from the brief the block points at, never from the block.
  assert.strictEqual(block(1), block(1));
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "NanoBananaPromptComposer.ts"),
    "utf-8"
  );
  const start = src.indexOf("CREATIVE_CONSTRAINT_BLOCK");
  const end = src.indexOf("productSubjectLine(productCount: number)");
  const region = src.slice(start, end);
  assert.ok(!/switch\s*\(|if\s*\(.*industry|categor/i.test(region), "the block branches on something");
});

// ── the product subject claim ───────────────────────────────────────────────

check("With no product attached, nothing is claimed about one", () => {
  const b = block(0);
  assert.ok(!/SUPPLIED AS/.test(b), "a claim was made about products that were not attached");
});

check("One product and three products are stated correctly", () => {
  const one = block(1);
  assert.ok(/THE PRODUCT IN THIS FRAME IS SUPPLIED AS A PHOTOGRAPH/.test(one));
  assert.ok(/It is the subject/.test(one));
  const three = block(3);
  assert.ok(/THE 3 PRODUCTS IN THIS FRAME ARE SUPPLIED AS PHOTOGRAPHS/.test(three));
  assert.ok(/They are the subject/.test(three));
});

check("Nothing added may outrank the attached product visually", () => {
  const b = block(2);
  assert.ok(/may overlap them, obscure their outline, or hold more contrast than they do/.test(b));
});

// ── placement, cost, wiring ─────────────────────────────────────────────────

check("Off by default", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, judgment(), true);
  assert.ok(!out.includes("## CREATIVE CONSTRAINT"));
});

check("It is the last thing the renderer reads", () => {
  // A constraint that arrives before the thing it constrains has to be
  // remembered rather than applied.
  const out = NanoBananaPromptComposer.compose(
    COMPILED,
    judgment(),
    false,
    undefined,
    "## LAYOUT CONTEXT\nPRODUCT STRUCTURE\n3 distinct products share this frame.",
    false,
    { productCount: 3 }
  );
  assert.ok(out.includes("## CREATIVE CONSTRAINT"));
  assert.ok(
    out.indexOf("## LAYOUT CONTEXT") < out.indexOf("## CREATIVE CONSTRAINT"),
    "the constraint precedes the context it constrains"
  );
  assert.ok(
    out.trim().endsWith("more contrast than they do."),
    "something was appended after the constraint"
  );
});

check("It works without the layout bridge", () => {
  // The over-decoration comes from any creative intent reaching the renderer.
  // Tying this to the bridge would leave the commonest path uncalibrated.
  const out = NanoBananaPromptComposer.compose(COMPILED, judgment(), false, undefined, undefined, false, {
    productCount: 1,
  });
  assert.ok(out.includes("## CREATIVE CONSTRAINT"));
  assert.ok(!out.includes("## LAYOUT CONTEXT"));
});

check("Nothing in the compiled prompt is rewritten", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, judgment(), true, undefined, undefined, false, {
    productCount: 1,
  });
  for (const section of ["## ROLE", "## COMMERCIAL LAYOUT", "FORMAT: poster.", "## FINAL OUTPUT"]) {
    assert.ok(out.includes(section), `${section} was altered`);
  }
});

check("The cost is bounded and reported", () => {
  const r = NanoBananaPromptComposer.applyCreativeConstraint("BASE", { productCount: 3 });
  assert.ok(r.added > 0 && r.added < 1800, `the block costs ${r.added} characters`);
  assert.strictEqual(r.added, r.prompt.length - "BASE".length);
  console.log(`      (constraint costs +${r.added} chars at 3 products)`);
});

check("The flag exists and defaults to off", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "feature-flags.ts"),
    "utf-8"
  );
  assert.ok(/creative_constraint_calibration_v1: boolean;/.test(src));
  assert.ok(/creative_constraint_calibration_v1: false,/.test(src));
});

check("Both provider paths receive the constraint", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    (src.match(/creativeConstraint/g) || []).length >= 5,
    "the constraint does not reach both the concurrent and the controlled path"
  );
  assert.ok(
    !/creativeConstraint\s*=\s*layoutBridgeOn/.test(src),
    "the constraint was tied to the bridge flag"
  );
});

check("Stable files were not touched", () => {
  for (const file of [
    ["service", "CommercialLayoutService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
    ["provider", "ImgStudioImageGenerationProvider.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(
      !/CREATIVE CONSTRAINT|creative_constraint_calibration_v1|applyCreativeConstraint/.test(src),
      `${file[1]} now knows about the constraint layer`
    );
  }
});

console.log("");
console.log("=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
