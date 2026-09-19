import assert from "assert";
import fs from "fs";
import path from "path";
import {
  buildLayoutContext,
  layoutContextTelemetry,
  renderLayoutContext,
} from "./evolution/experiment/LayoutContextBridge";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";

/**
 * Layout Context Bridge.
 *
 * The bridge carries decisions; it does not make them. Almost every test below
 * is a version of that one claim, because the way this component fails is not by
 * breaking — it is by starting to help. A bridge that fills a gap with a
 * sensible default, that maps a director's phrase onto a tidy category, or that
 * describes a relationship nobody decided, has become a template with a
 * different name, and it would be the fourth time this project shipped one.
 *
 * So: what the director said must appear verbatim, and what the director did not
 * say must appear nowhere.
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

const judgment = (over: Partial<CreativeJudgment> = {}): CreativeJudgment =>
  ({ directions: [], selected: "", selection_reason: "", ...over } as CreativeJudgment);

const STAGING = {
  relationship: {
    relationship_type: "một bộ ba pha chế cùng một hạt, uống theo ba cách",
    strategic_reason: "Khách quen đã tin hạt này, cái họ chưa biết là nó ra được ba vị",
    visual_implication: "Ba chai phải đọc như một dải, không phải ba lần chụp riêng",
    hierarchy_implication: "Chai giữa dẫn vì đó là vị gốc, hai chai kia đứng lùi nửa bước",
  },
  hierarchy: "chai gốc dẫn",
  grouping: "gathered on one tray",
  shared_ground: "một mặt gỗ",
  light_direction: "một nguồn từ trái sau",
  depth_order: "chai gốc trước, hai chai kia lùi",
  interaction: "chạm nhau ở vai chai",
  reason: "vì đây là một dải sản phẩm",
} as any;

console.log("\n=== Layout Context Bridge ===\n");

// ── it carries, it does not invent ──────────────────────────────────────────

check("Nothing to carry produces nothing", () => {
  assert.strictEqual(buildLayoutContext({ judgment: null, productCount: 0 }), null);
  assert.strictEqual(renderLayoutContext(null), "");
});

check("A director's relationship is quoted, not classified", () => {
  // The single most important assertion in this file. `relationship_type` is
  // free text so that no vocabulary of collection / bundle / comparison can grow
  // here; if the phrase survives the trip unchanged, none has.
  const ctx = buildLayoutContext({
    judgment: judgment({ staging: STAGING }),
    productCount: 3,
  })!;
  const block = renderLayoutContext(ctx);
  assert.ok(
    block.includes("một bộ ba pha chế cùng một hạt, uống theo ba cách"),
    "the director's own words did not survive"
  );
  for (const category of ["collection", "hero_support", "comparison", "bundle", "lifestyle_scene"]) {
    assert.ok(!block.includes(category), `the bridge mapped the phrase onto "${category}"`);
  }
});

check("All four relationship fields reach the block", () => {
  const block = renderLayoutContext(
    buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })
  );
  assert.ok(block.includes("Khách quen đã tin hạt này"), "strategic_reason missing");
  assert.ok(block.includes("Ba chai phải đọc như một dải"), "visual_implication missing");
  assert.ok(block.includes("Chai giữa dẫn"), "hierarchy_implication missing");
});

check("One product says there is no relationship, rather than inventing one", () => {
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 1 })!);
  assert.ok(/One product/.test(block));
  assert.ok(/no relationship between products to establish/i.test(block));
  assert.ok(!/WHAT THEY ARE TO EACH OTHER/.test(block), "a relationship was described for one product");
});

check("Several products with no decision say so plainly", () => {
  // The honest output for a real gap. Papering over it is how "three products"
  // became "three separate subjects placed side by side" in the renders.
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 3 })!);
  assert.ok(/3 distinct products share this frame/.test(block));
  assert.ok(/No relationship between these products has been decided/.test(block));
  assert.ok(!/WHAT THEY ARE TO EACH OTHER/.test(block));
});

check("An absent section is absent, not filled", () => {
  const ctx = buildLayoutContext({ judgment: judgment(), productCount: 2 })!;
  assert.strictEqual(ctx.creative_purpose.length, 0, "a creative purpose was invented");
  assert.strictEqual(ctx.viewer_state.length, 0, "a viewer state was invented");
  const block = renderLayoutContext(ctx);
  assert.ok(!/CREATIVE PURPOSE/.test(block));
  assert.ok(!/VIEWER STATE/.test(block));
});

// ── the three context groups ────────────────────────────────────────────────

check("Product count reaches the block, which is the whole point of the phase", () => {
  for (const n of [2, 3, 4, 5]) {
    const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: n })!);
    assert.ok(block.includes(`${n} distinct products`), `count ${n} did not travel`);
  }
});

check("Creative purpose carries the chosen route and why", () => {
  const block = renderLayoutContext(
    buildLayoutContext({
      judgment: judgment({
        strategy: {
          selected: "pattern interrupt — something the feed does not contain",
          selection_reason: "vì khách lướt qua vào 7h sáng và không dừng vì một ly cà phê đẹp",
        } as any,
      }),
      productCount: 1,
    })!
  );
  assert.ok(block.includes("pattern interrupt"));
  assert.ok(block.includes("7h sáng"));
});

check("Emotional territory and intended action reach creative purpose", () => {
  const block = renderLayoutContext(
    buildLayoutContext({
      judgment: judgment({
        brand: { emotional_territory: "sự yên tâm của người pha quen tay" } as any,
        consumer: { intended_action: "ghé quán sáng mai" } as any,
      }),
      productCount: 1,
    })!
  );
  assert.ok(block.includes("sự yên tâm của người pha quen tay"));
  assert.ok(block.includes("ghé quán sáng mai"));
});

check("Viewer state carries who is looking and what they feel", () => {
  const block = renderLayoutContext(
    buildLayoutContext({
      judgment: judgment({
        consumer: {
          viewer: "người mua lần đầu, chưa biết thương hiệu",
          first_feeling: "nghi ngờ nhẹ",
          trust_driver: "thấy nguyên liệu thật",
          desire_driver: "hơi nước bốc lên",
          attention: { first_second: "màu của ly", then: "bàn tay", finally: "logo" },
        } as any,
      }),
      productCount: 1,
    })!
  );
  for (const s of ["người mua lần đầu", "nghi ngờ nhẹ", "thấy nguyên liệu thật", "hơi nước bốc lên", "màu của ly"]) {
    assert.ok(block.includes(s), `"${s}" did not travel`);
  }
});

check("The format's own viewing behaviour reaches viewer state", () => {
  const block = renderLayoutContext(
    buildLayoutContext({
      judgment: judgment(),
      productCount: 1,
      assetIntent: { viewer_behavior: "seen mid-scroll, at arm's length, for under a second" } as any,
    })!
  );
  assert.ok(block.includes("seen mid-scroll"));
});

// ── it must not become a second layout authority ────────────────────────────

check("The block defers geometry to COMMERCIAL LAYOUT explicitly", () => {
  const block = renderLayoutContext(
    buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })!
  );
  assert.ok(/context, not geometry/.test(block), "the block does not say what it is");
  assert.ok(
    /COMMERCIAL LAYOUT section above remains responsible for zones/.test(block),
    "the block does not hand geometry back"
  );
  assert.ok(/COMMERCIAL LAYOUT is correct/.test(block), "the block does not resolve its own conflicts");
});

check("The bridge emits no geometry of its own", () => {
  const ctx = buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })!;
  // The context lines only. The closing sentence names zones and safe margins on
  // purpose — it hands them back to COMMERCIAL LAYOUT, which is the opposite of
  // claiming them and is asserted by the test above. What must not happen is a
  // coordinate or a zone assignment inside the context itself.
  const content = [...ctx.product_structure, ...ctx.creative_purpose, ...ctx.viewer_state].join("\n");
  assert.ok(!/\d+\s?%/.test(content), "a percentage appears in the context lines");
  assert.ok(
    !/\b(?:top|bottom|left|right)\s+(?:third|half|edge|corner)\b/i.test(content),
    "the context places something"
  );
  for (const zone of ["HEADLINE", "CTA", "LOGO", "safe margin"]) {
    assert.ok(!content.includes(zone), `the context assigns ${zone}`);
  }
});

check("The bridge makes no LLM call and reads no file", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "LayoutContextBridge.ts"),
    "utf-8"
  );
  for (const forbidden of ["fetch(", "LLMProvider", "generateChatCompletion", "require(", "readFile", "await "]) {
    assert.ok(!src.includes(forbidden), `the bridge reaches for ${forbidden}`);
  }
});

// ── budget and determinism ──────────────────────────────────────────────────

check("A talkative director cannot double the prompt", () => {
  const long = "x".repeat(4000);
  const block = renderLayoutContext(
    buildLayoutContext({
      judgment: judgment({
        staging: { ...STAGING, relationship: { ...STAGING.relationship, strategic_reason: long } } as any,
        consumer: { viewer: long, first_feeling: long } as any,
      }),
      productCount: 4,
    })!
  );
  assert.ok(block.length <= 1601, `the block reached ${block.length} characters`);
});

check("The same judgment always produces the same block", () => {
  const build = () =>
    renderLayoutContext(buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })!);
  assert.strictEqual(build(), build());
});

check("Telemetry carries counts, never brief text", () => {
  const ctx = buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })!;
  const t = layoutContextTelemetry(ctx, 500) as any;
  const serialized = JSON.stringify(t);
  assert.ok(!/hạt|chai|Khách/.test(serialized), "telemetry leaks brief content");
  assert.strictEqual(t.product_count, 3);
  assert.strictEqual(t.has_relationship, true);
});

// ── the composer seam ───────────────────────────────────────────────────────

const COMPILED = "## ROLE\nMake a photograph.\n\n## COMMERCIAL LAYOUT\nFORMAT: poster.\n\n## FINAL OUTPUT\nRender it.";

check("Without a context the composed prompt is what it always was", () => {
  const withNothing = NanoBananaPromptComposer.compose(COMPILED, judgment(), true, undefined, undefined);
  const before = NanoBananaPromptComposer.compose(COMPILED, judgment(), true, undefined);
  assert.strictEqual(withNothing, before, "passing no context changed the prompt");
  assert.ok(!withNothing.includes("LAYOUT CONTEXT"));
});

check("With a context the block is appended, and nothing is replaced", () => {
  const block = renderLayoutContext(
    buildLayoutContext({ judgment: judgment({ staging: STAGING }), productCount: 3 })!
  );
  const out = NanoBananaPromptComposer.compose(COMPILED, judgment(), true, undefined, block);
  assert.ok(out.includes("## LAYOUT CONTEXT"));
  // Every original section survives, unedited.
  for (const section of ["## ROLE", "## COMMERCIAL LAYOUT", "FORMAT: poster.", "## FINAL OUTPUT"]) {
    assert.ok(out.includes(section), `${section} was removed or rewritten`);
  }
  assert.ok(out.indexOf("## COMMERCIAL LAYOUT") < out.indexOf("## LAYOUT CONTEXT"), "context precedes the layout it defers to");
});

check("The context also travels in control mode", () => {
  // Control mode suppresses the judgment block because the direction already
  // governs the scene from inside the prompt. Nothing in that path tells the
  // layout section how many products there are, so this must not be suppressed.
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 4 })!);
  const out = NanoBananaPromptComposer.compose(COMPILED, judgment(), true, undefined, block);
  assert.ok(out.includes("4 distinct products"), "control mode dropped the product count");
});

// ── priority alignment (Phase 5.1.5) ───────────────────────────────

const WITH_CLAUSE =
  ["## ROLE", "Make a photograph.", "", "## CAMPAIGN STRATEGY", "Sell coffee. "].join("\n") +
  "The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; " +
  "where those conflict with this section, they win, and an explicit client directive beats both." +
  ["", "", "## COMMERCIAL LAYOUT", "FORMAT: poster.", "", "## FINAL OUTPUT", "Render it."].join("\n");

check("Off by default: the clause survives untouched", () => {
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 3 })!);
  const out = NanoBananaPromptComposer.compose(WITH_CLAUSE, judgment(), true, undefined, block);
  assert.ok(out.includes("where those conflict with this section, they win"), "the clause was rewritten with the flag off");
});

check("On: the winner-takes-all clause is gone", () => {
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 3 })!);
  const out = NanoBananaPromptComposer.compose(WITH_CLAUSE, judgment(), true, undefined, block, true);
  assert.ok(!out.includes("where those conflict with this section, they win"), "the clause is still there");
  assert.ok(/COMMERCIAL LAYOUT gives the binding geometry/.test(out));
  assert.ok(/LAYOUT CONTEXT gives the creative intent/.test(out));
  assert.ok(/satisfy both rather than choosing between them/.test(out));
});

check("Geometry stays binding — the point that must not be lost", () => {
  // The old clause was protecting something real: the reserved zones are a
  // contract with the compositor that places type over this render later. A
  // rewrite that freed the renderer to move them would produce images the
  // typography stage cannot finish.
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 3 })!);
  const out = NanoBananaPromptComposer.compose(WITH_CLAUSE, judgment(), true, undefined, block, true);
  assert.ok(/not negotiable/.test(out), "the geometry is no longer stated as binding");
  assert.ok(/reserved zones, safe margins/.test(out), "the zones are not named as the binding part");
  assert.ok(/inside the geometry/.test(out), "intent is not scoped to within the constraints");
});

check("The client directive still beats both", () => {
  const block = renderLayoutContext(buildLayoutContext({ judgment: judgment(), productCount: 2 })!);
  const out = NanoBananaPromptComposer.compose(WITH_CLAUSE, judgment(), true, undefined, block, true);
  assert.ok(/client directive beats all of them/.test(out), "a locked rule was dropped in the rewrite");
});

check("No context means no rewrite, even with the flag on", () => {
  // The replacement names LAYOUT CONTEXT. Naming a section the prompt does not
  // contain is worse than the sentence it replaced.
  const out = NanoBananaPromptComposer.compose(WITH_CLAUSE, judgment(), true, undefined, undefined, true);
  assert.ok(out.includes("where those conflict with this section, they win"));
  assert.ok(!out.includes("LAYOUT CONTEXT gives the creative intent"));
});

check("A prompt with no clause gets the relationship stated, and says so", () => {
  // 99 of the 100 logged renders exceed the optimizer soft threshold, and above
  // it the optimizer strips precedence prose out of CAMPAIGN STRATEGY by design.
  // A pure find-and-replace would therefore have been a no-op in production
  // while looking, from the outside, exactly like a working feature.
  const stripped = WITH_CLAUSE.replace(
    "The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; " +
      "where those conflict with this section, they win, and an explicit client directive beats both.",
    ""
  );
  const r = NanoBananaPromptComposer.applyLayoutPriority(stripped);
  assert.strictEqual(r.mode, "stated");
  assert.ok(/HOW TO READ THESE TWO SECTIONS/.test(r.prompt));
  assert.ok(/not negotiable/.test(r.prompt), "geometry is not stated as binding in the short form");
  assert.ok(/Satisfy both rather than choosing/.test(r.prompt));
});

check("A reworded compiler clause falls back to stating, never to silence", () => {
  const drifted = WITH_CLAUSE.replace("they win", "they take precedence");
  const r = NanoBananaPromptComposer.applyLayoutPriority(drifted);
  assert.strictEqual(r.mode, "stated", "a drifted clause produced neither a replace nor a statement");
  assert.ok(r.prompt.includes("they take precedence"), "a partial match mangled the drifted clause");
});

check("The rewrite happens once, and only to that clause", () => {
  const twice = `${WITH_CLAUSE}

${WITH_CLAUSE}`;
  const out = NanoBananaPromptComposer.applyLayoutPriority(twice).prompt;
  assert.strictEqual(
    (out.match(/COMMERCIAL LAYOUT gives the binding geometry/g) || []).length,
    1,
    "the replacement was applied more than once"
  );
  for (const section of ["## ROLE", "## COMMERCIAL LAYOUT", "FORMAT: poster.", "## FINAL OUTPUT"]) {
    assert.ok(out.includes(section), `${section} was disturbed by the rewrite`);
  }
});

check("The rewrite costs the prompt a bounded amount", () => {
  const replaced = NanoBananaPromptComposer.applyLayoutPriority(WITH_CLAUSE);
  const replaceDelta = replaced.prompt.length - WITH_CLAUSE.length;
  const stripped = WITH_CLAUSE.replace(
    "The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; " +
      "where those conflict with this section, they win, and an explicit client directive beats both.",
    ""
  );
  const statedDelta =
    NanoBananaPromptComposer.applyLayoutPriority(stripped).prompt.length - stripped.length;
  assert.ok(replaceDelta > 0 && replaceDelta < 400, `replace changed length by ${replaceDelta}`);
  assert.ok(statedDelta > 0 && statedDelta < 400, `stating changed length by ${statedDelta}`);
  console.log(`      (replace +${replaceDelta} chars, state +${statedDelta} chars)`);
});

check("The priority flag rides on the bridge flag", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /const layoutPriorityOn = layoutBridgeOn && Boolean\(f\.layout_priority_alignment_v1\)/.test(src),
    "the priority flag can be enabled without the bridge"
  );
});

// ── wiring ──────────────────────────────────────────────────────────────────

check("The bridge flag is not wired into anyJudgment, and that is correct", () => {
  // The opposite of the staging and strategy defects. Those flags changed what
  // the director was ASKED and were resolved after the exit to stable. This one
  // asks the director for nothing, so a run carrying it alone has nothing to
  // carry and should exit to stable exactly as before.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/const layoutBridgeOn = Boolean\(f\.layout_context_bridge_v1\)/.test(src), "the flag is not read");
  assert.ok(
    !/judgmentFlags\.layoutContext|layoutContext:\s*layoutBridgeOn/.test(src),
    "the bridge joined judgmentFlags, which would route runs to experiment for a no-op"
  );
});

check("Both provider paths receive the context builder", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  const calls = src.match(/this\.wrapProvider\(/g) || [];
  assert.strictEqual(calls.length, 2, "the number of provider wrappings changed");
  assert.strictEqual(
    (src.match(/layoutContextFor/g) || []).length >= 4,
    true,
    "the builder does not reach both the concurrent and the controlled path"
  );
});

check("Stable files were not touched", () => {
  for (const file of [
    ["service", "CommercialLayoutService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(
      !/LayoutContextBridge|layout_context_bridge_v1|LAYOUT CONTEXT/.test(src),
      `${file[1]} now knows about the bridge`
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
