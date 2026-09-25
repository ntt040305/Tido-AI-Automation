import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * The vision loop.
 *
 * This is the first part of the system that looks at a picture, and that makes
 * it the first part that can lie about having looked. Almost everything below
 * tests one of two properties.
 *
 * HONESTY: `analyzed_image` is true only when a provider received bytes and
 * answered about them. Every failure mode -- no provider, empty buffer,
 * unreadable format, a throw, prose instead of JSON, malformed JSON -- must
 * come back false with a reason. A loop that trusts an unseen verdict will
 * happily "correct" a render nobody looked at.
 *
 * RESTRAINT: the loop fixes execution, never direction. A model shown one frame
 * does not know why the director chose a sparse, off-centre, high-contrast
 * treatment, and offered the chance it will regress every interesting decision
 * toward the average poster. The scope allowlist is what stops it, so the tests
 * push actual direction-rewriting actions at it and require them dropped.
 */

const {
  emptyVisionAnalysis,
  sanitizeActions,
  hasActionableFindings,
  visionAnalysisTelemetry,
  CORRECTABLE_SCOPES,
} = require("./evolution/experiment/VisionAnalysisResult");
const { VisionAnalyzerService } = require("./evolution/experiment/VisionAnalyzerService");
const {
  decideDesignChanges,
  renderDesignDecisions,
  compareDesignQuality,
  designDecisionTelemetry,
  PROTECTED_FIELDS,
  EDITABLE_FIELDS,
} = require("./evolution/experiment/VisionDesignDecisionEngine");
const {
  bridgeVisionToCorrections,
  applyTypographyCorrections,
  applyLayoutCorrections,
  renderCorrections,
  correctionTelemetry,
} = require("./evolution/experiment/VisionCorrectionBridge");
const {
  RenderIterationService,
  buildImprovementInstruction,
  iterationServiceTelemetry,
} = require("./evolution/experiment/RenderIterationService");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const done = (e?: any) => {
    if (e) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    ${e.message}`);
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const r = fn();
    if (r && typeof (r as any).then === "function") {
      return (r as Promise<void>).then(() => done()).catch(done);
    }
    done();
  } catch (e: any) {
    done(e);
  }
  return Promise.resolve();
}

/** A minimal valid PNG header, so mime sniffing succeeds on real-looking bytes. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);

/** A provider that answers with whatever the test hands it. */
function providerReturning(reply: string | (() => never), name = "test-provider") {
  return {
    name,
    calls: 0,
    async analyzeImage(this: any) {
      this.calls++;
      if (typeof reply === "function") return reply();
      return reply;
    },
  };
}

const GOOD_REPLY = JSON.stringify({
  strengths: [{ what: "the product reads as a real manufactured object" }],
  issues: [{ what: "the closing line is hard to read", where: "lower right", confidence: "high" }],
  typography_problems: [{ what: "the closing line renders as GHE THU, missing its diacritics" }],
  layout_problems: [{ what: "the headline is tangent to the cup's rim" }],
  product_accuracy: [],
  improvement_actions: [
    {
      action: "Render the closing line as 'Ghé thử' with full Vietnamese diacritics",
      because: "the current text is misspelled",
      area: "typography",
      scope: "error",
    },
    {
      action: "Move the headline clear of the cup's rim by at least its own cap height",
      because: "the tangent reads as a mistake",
      area: "layout",
      scope: "composition",
    },
  ],
});

async function main() {
  console.log("\nNothing claims to have seen what it did not");

  await check("No provider means no analysis", async () => {
    const r = await new VisionAnalyzerService(null).analyze({ image: PNG });
    assert.strictEqual(r.analyzed_image, false);
    assert.ok(r.unavailable_reason, "no reason was given for not looking");
  });

  await check("An empty buffer is not an image", async () => {
    const r = await new VisionAnalyzerService(providerReturning(GOOD_REPLY)).analyze({
      image: Buffer.alloc(0),
    });
    assert.strictEqual(r.analyzed_image, false);
  });

  await check("Unrecognisable bytes are refused before a call is spent", async () => {
    const p = providerReturning(GOOD_REPLY);
    const r = await new VisionAnalyzerService(p).analyze({ image: Buffer.from("not an image") });
    assert.strictEqual(r.analyzed_image, false);
    assert.strictEqual(p.calls, 0, "a model call was spent on bytes that were not an image");
  });

  await check("A provider that throws does not claim sight", async () => {
    const r = await new VisionAnalyzerService(
      providerReturning(() => {
        throw new Error("gateway down");
      }),
    ).analyze({ image: PNG });
    assert.strictEqual(r.analyzed_image, false);
    assert.ok(/gateway down/.test(r.unavailable_reason || ""), "the failure was not reported");
  });

  await check("Prose instead of JSON is not an analysis", async () => {
    const r = await new VisionAnalyzerService(
      providerReturning("The image looks quite good overall!"),
    ).analyze({ image: PNG });
    assert.strictEqual(r.analyzed_image, false);
  });

  await check("Malformed JSON is not an analysis", async () => {
    const r = await new VisionAnalyzerService(
      providerReturning('{"issues": [ this is broken'),
    ).analyze({ image: PNG });
    assert.strictEqual(r.analyzed_image, false);
  });

  await check("A real reply for real bytes is marked as seen", async () => {
    const r = await new VisionAnalyzerService(providerReturning(GOOD_REPLY)).analyze({ image: PNG });
    assert.strictEqual(r.analyzed_image, true);
    assert.strictEqual(r.provider, "test-provider");
    assert.ok(r.image_hash, "no hash recorded, so findings cannot be traced to an image");
  });

  await check("Only one place in the codebase can set the flag", () => {
    // The invariant this whole contract rests on. If a second assignment
    // appears, the guarantee is gone and every test above becomes decorative.
    const dir = path.join(__dirname, "evolution/experiment");
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".ts")) continue;
      const code = fs
        .readFileSync(path.join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (/analyzed_image:\s*true/.test(code)) offenders.push(f);
    }
    assert.deepStrictEqual(
      offenders,
      ["VisionAnalyzerService.ts"],
      `analyzed_image: true is set in: ${offenders.join(", ")}`,
    );
  });

  await check("The findings are carried, not invented", async () => {
    const r = await new VisionAnalyzerService(providerReturning(GOOD_REPLY)).analyze({ image: PNG });
    assert.strictEqual(r.typography_problems.length, 1);
    assert.ok(/GHE THU/.test(r.typography_problems[0].what));
    assert.strictEqual(r.product_accuracy.length, 0, "an empty list was padded");
    assert.strictEqual(r.issues[0].where, "lower right");
    assert.strictEqual(r.issues[0].confidence, "high");
  });

  await check("The intended copy is given to the model to compare against", async () => {
    let seen = "";
    const p = {
      name: "spy",
      async analyzeImage(req: any) {
        seen = req.instruction;
        return GOOD_REPLY;
      },
    };
    await new VisionAnalyzerService(p).analyze({ image: PNG, expectedCopy: ["Ghé thử"] });
    assert.ok(/Ghé thử/.test(seen), "the model was asked to check text it was never shown");
  });

  console.log("\nThe loop fixes mistakes, not the creative direction");

  await check("Actions outside the permitted scopes are dropped", () => {
    const { kept, dropped } = sanitizeActions([
      { action: "Fix the misspelled closing line", scope: "error" },
      { action: "Use a warmer, more inviting palette", scope: "art_direction" },
      { action: "Switch to a lifestyle scene with a model holding the cup", scope: "concept" },
      { action: "Move the headline off the cup's rim", scope: "composition" },
    ] as any);
    assert.strictEqual(kept.length, 2, "a direction rewrite survived the filter");
    assert.strictEqual(dropped.length, 2);
    assert.ok(dropped.every((d: any) => /palette|lifestyle/.test(d.action)));
  });

  await check("An unrecognised scope is never coerced into a permitted one", () => {
    // Guessing here would smuggle an unvetted instruction into a render.
    const { kept } = sanitizeActions([{ action: "Reframe the whole idea", scope: "" }] as any);
    assert.strictEqual(kept.length, 0);
  });

  await check("The permitted scopes are exactly the four agreed", () => {
    assert.deepStrictEqual([...CORRECTABLE_SCOPES], [
      "error",
      "readability",
      "product_accuracy",
      "composition",
    ]);
  });

  await check("The correction prompt tells the renderer what to preserve first", () => {
    const i = buildImprovementInstruction([
      { action: "Fix the closing line", scope: "error" },
    ] as any);
    assert.ok(i, "no instruction was built");
    const preserve = i.indexOf("Keep the creative direction");
    const change = i.indexOf("Fix the closing line");
    assert.ok(preserve > -1, "the instruction does not tell the renderer to hold the direction");
    assert.ok(preserve < change, "the problems are listed before the direction is protected");
  });

  await check("No corrections means no instruction", () => {
    assert.strictEqual(buildImprovementInstruction([]), undefined);
    assert.strictEqual(
      buildImprovementInstruction([{ action: "Rework the concept", scope: "concept" }] as any),
      undefined,
      "an instruction was built entirely from rejected actions",
    );
  });

  console.log("\nThe loop degrades to the first render, always");

  const first = { version: 1, imageUrl: "first.png", imageBuffer: PNG };

  await check("With no analyzer, the first render is returned untouched", async () => {
    const o = await new RenderIterationService().run({ first, analyzer: null });
    assert.strictEqual(o.chosen.imageUrl, "first.png");
    assert.strictEqual(o.analysis.analyzed_image, false);
    assert.strictEqual(o.comparison.second, "");
  });

  await check("An unseen image never triggers a second render", async () => {
    let rerendered = false;
    const o = await new RenderIterationService().run({
      first,
      analyzer: new VisionAnalyzerService(providerReturning("not json")),
      rerender: async () => {
        rerendered = true;
        return { version: 2, imageUrl: "second.png", imageBuffer: PNG };
      },
    });
    assert.strictEqual(rerendered, false, "a correction was rendered from an unseen verdict");
    assert.strictEqual(o.chosen.imageUrl, "first.png");
  });

  await check("A clean review spends nothing on a second render", async () => {
    let rerendered = false;
    const clean = JSON.stringify({ strengths: [{ what: "reads well" }], improvement_actions: [] });
    const o = await new RenderIterationService().run({
      first,
      analyzer: new VisionAnalyzerService(providerReturning(clean)),
      rerender: async () => {
        rerendered = true;
        return { version: 2, imageUrl: "second.png", imageBuffer: PNG };
      },
    });
    assert.strictEqual(rerendered, false, "a second render was spent on a clean image");
    assert.strictEqual(o.analysis.analyzed_image, true);
    assert.ok(/nothing that needed changing/.test(o.comparison.recommendation));
  });

  await check("A failed second render leaves the first in place", async () => {
    const o = await new RenderIterationService().run({
      first,
      analyzer: new VisionAnalyzerService(providerReturning(GOOD_REPLY)),
      rerender: async () => {
        throw new Error("provider 500");
      },
    });
    assert.strictEqual(o.chosen.imageUrl, "first.png");
    assert.ok(o.improvement_instruction, "the instruction was discarded along with the render");
  });

  await check("The second render only wins when it is actually better", async () => {
    // Two problems first, one after: a genuine improvement.
    let call = 0;
    const analyzer = new VisionAnalyzerService({
      name: "staged",
      async analyzeImage() {
        call++;
        return call === 1
          ? GOOD_REPLY
          : JSON.stringify({ issues: [{ what: "one small thing" }], improvement_actions: [] });
      },
    });
    const o = await new RenderIterationService().run({
      first,
      analyzer,
      rerender: async () => ({ version: 2, imageUrl: "second.png", imageBuffer: PNG }),
    });
    assert.strictEqual(o.chosen.imageUrl, "second.png");
    assert.ok(/resolved/.test(o.comparison.recommendation));
  });

  await check("A worse second render is discarded", async () => {
    let call = 0;
    const worse = JSON.stringify({
      issues: [{ what: "a" }, { what: "b" }],
      typography_problems: [{ what: "c" }],
      layout_problems: [{ what: "d" }],
      improvement_actions: [],
    });
    const analyzer = new VisionAnalyzerService({
      name: "staged",
      async analyzeImage() {
        call++;
        return call === 1 ? GOOD_REPLY : worse;
      },
    });
    const o = await new RenderIterationService().run({
      first,
      analyzer,
      rerender: async () => ({ version: 2, imageUrl: "second.png", imageBuffer: PNG }),
    });
    assert.strictEqual(o.chosen.imageUrl, "first.png", "a worse render was shipped");
    assert.ok(/did not reduce/.test(o.comparison.recommendation));
  });

  await check("An unreviewable second render is not preferred on faith", async () => {
    let call = 0;
    const analyzer = new VisionAnalyzerService({
      name: "staged",
      async analyzeImage() {
        call++;
        return call === 1 ? GOOD_REPLY : "the model went down";
      },
    });
    const o = await new RenderIterationService().run({
      first,
      analyzer,
      rerender: async () => ({ version: 2, imageUrl: "second.png", imageBuffer: PNG }),
    });
    assert.strictEqual(o.chosen.imageUrl, "first.png");
    assert.ok(/no basis to prefer/.test(o.comparison.recommendation));
  });

  await check("The comparison names both renders and a recommendation", async () => {
    const o = await new RenderIterationService().run({
      first,
      analyzer: new VisionAnalyzerService(providerReturning(GOOD_REPLY)),
      rerender: async () => ({ version: 2, imageUrl: "second.png", imageBuffer: PNG }),
    });
    assert.strictEqual(o.comparison.first, "first.png");
    assert.strictEqual(o.comparison.second, "second.png");
    assert.ok(o.comparison.recommendation.length > 10);
  });

  console.log("\nA disabled loop is the old pipeline, not a copy of it");

  await check("The flag gate returns the input object by identity", () => {
    // "Disabled" must mean the pipeline as it was before this feature existed,
    // not a path believed to be equivalent to it.
    const src = fs.readFileSync(path.join(__dirname, "evolution/VisionReviewLayer.ts"), "utf8");
    assert.ok(
      /if \(!decision\.flags\?\.features\?\.vision_iteration_v1\) return result;/.test(src),
      "a disabled review does not return the original result untouched",
    );
  });

  await check("The loop is core architecture, and the kill switch still turns it off", () => {
    // Phase 5.5.5 made the review part of the one pipeline: every render gets
    // it, which is a model call per render by design. The gate is kept, because
    // the kill switch is how that spend is stopped in an outage.
    const src = fs.readFileSync(path.join(__dirname, "evolution/VisionReviewLayer.ts"), "utf8");
    assert.ok(/vision_iteration_v1/.test(src), "the review is not gated on the flag");
    const { DEFAULT_FLAGS, CORE_FEATURES, readFlags } = require("./evolution/feature-flags");
    assert.ok(CORE_FEATURES.includes("vision_iteration_v1"), "the review is not core");
    assert.strictEqual(DEFAULT_FLAGS.features.vision_iteration_v1, true, "the review is off by default");
    const prev = process.env.TIDO_PIPELINE_KILL_SWITCH;
    process.env.TIDO_PIPELINE_KILL_SWITCH = "true";
    try {
      assert.strictEqual(readFlags().features.vision_iteration_v1, false, "the kill switch cannot stop the review");
    } finally {
      if (prev === undefined) delete process.env.TIDO_PIPELINE_KILL_SWITCH;
      else process.env.TIDO_PIPELINE_KILL_SWITCH = prev;
    }
  });

  await check("The review happens once, above both pipelines", () => {
    // It used to happen at each render site inside ExperimentPipeline. That
    // was wrong twice: a branch was missed immediately, leaving the feature
    // enabled and unreachable on the common path, and stable users could never
    // have received it at all. One insertion point, above the fork.
    const router = fs.readFileSync(path.join(__dirname, "evolution/PipelineRouter.ts"), "utf8");
    const exp = fs.readFileSync(path.join(__dirname, "evolution/ExperimentPipeline.ts"), "utf8");
    assert.strictEqual(
      (router.match(/await reviewRender\(/g) || []).length,
      1,
      "the router does not review exactly once",
    );
    assert.ok(
      !/VisionAnalyzerService|reviewRender|applyVisionLoop/.test(exp),
      "ExperimentPipeline still reviews renders, so the loop can run twice",
    );
  });

  await check("The review runs after generation, never before", () => {
    const router = fs.readFileSync(path.join(__dirname, "evolution/PipelineRouter.ts"), "utf8");
    const ran = router.indexOf("await ExperimentPipeline.run(request, options, decision)");
    const reviewed = router.indexOf("await reviewRender(");
    assert.ok(ran > 0 && reviewed > ran, "the review is positioned before the render completes");
  });

  await check("A disabled loop loads none of the vision code", () => {
    // The flag is checked before any dynamic import, so an off loop costs one
    // property read rather than a module graph.
    const src = fs.readFileSync(path.join(__dirname, "evolution/VisionReviewLayer.ts"), "utf8");
    const gate = src.indexOf("vision_iteration_v1");
    const firstImport = src.indexOf("await import(");
    assert.ok(gate > 0 && firstImport > gate, "vision modules are imported before the flag is checked");
  });

  await check("The correction re-renders through the one pipeline, never a second one", () => {
    // Phase 5.5.5: there is no stable pipeline to re-render through.
    const router = fs.readFileSync(path.join(__dirname, "evolution/PipelineRouter.ts"), "utf8");
    const i = router.indexOf("await reviewRender(");
    const block = router.slice(i, i + 1500);
    assert.ok(/ExperimentPipeline\.run\(correctedRequest/.test(block), "the pipeline cannot re-render");
    assert.ok(!/StablePipeline/.test(router), "the router still reaches a second pipeline");
  });

  await check("It cannot turn a finished render into a failed request", () => {
    const src = fs.readFileSync(path.join(__dirname, "evolution/VisionReviewLayer.ts"), "utf8");
    const i = src.indexOf("export async function reviewRender");
    const body = src.slice(i);
    assert.ok(/catch \(err/.test(body), "the review is not wrapped in a catch");
    assert.ok(
      /return result;/.test(body.slice(body.indexOf("catch (err"))),
      "the catch does not fall back to the render that already succeeded",
    );
  });

  console.log("\nTelemetry counts without leaking what was seen");

  await check("Neither telemetry function carries finding text", async () => {
    const r = await new VisionAnalyzerService(providerReturning(GOOD_REPLY)).analyze({ image: PNG });
    const t = JSON.stringify(visionAnalysisTelemetry(r));
    assert.ok(!t.includes("GHE THU"), "analysis telemetry leaked a finding");
    assert.strictEqual(visionAnalysisTelemetry(r).typography_problems, 1);

    const o = await new RenderIterationService().run({
      first,
      analyzer: new VisionAnalyzerService(providerReturning(GOOD_REPLY)),
    });
    const t2 = JSON.stringify(iterationServiceTelemetry(o));
    assert.ok(!t2.includes("GHE THU"), "loop telemetry leaked a finding");
  });

  await check("hasActionableFindings requires sight", () => {
    assert.strictEqual(hasActionableFindings(emptyVisionAnalysis("nothing looked")), false);
    assert.strictEqual(
      hasActionableFindings({
        ...emptyVisionAnalysis(),
        analyzed_image: false,
        improvement_actions: [{ action: "Fix it", scope: "error" }],
      } as any),
      false,
      "an unseen analysis was treated as actionable",
    );
  });

  console.log("\nFindings become typed corrections, not prose");

  const seen = (over: any = {}) => ({
    analyzed_image: true,
    strengths: [],
    issues: [],
    typography_problems: [],
    layout_problems: [],
    product_accuracy: [],
    improvement_actions: [],
    ...over,
  });

  await check("An unseen analysis produces no corrections", () => {
    const c = bridgeVisionToCorrections(seen({ analyzed_image: false, typography_problems: [{ what: "headline too small" }] }));
    assert.strictEqual(c.typography.length, 0, "corrections were derived from an unseen image");
  });

  await check("A weak headline becomes a hierarchy correction", () => {
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] }),
    );
    assert.strictEqual(c.typography.length, 1);
    assert.strictEqual(c.typography[0].action, "increase_headline_hierarchy");
    assert.strictEqual(c.typography[0].role, "headline");
    assert.strictEqual(c.typography[0].priority, "high");
  });

  await check("An overlap becomes a layout correction on the right zone", () => {
    const c = bridgeVisionToCorrections(
      seen({ layout_problems: [{ what: "the cta overlaps the product" }] }),
    );
    assert.strictEqual(c.layout.length, 1);
    assert.strictEqual(c.layout[0].action, "separate_overlapping_zones");
    assert.strictEqual(c.layout[0].zone, "cta");
  });

  await check("Misrendered text is always high priority", () => {
    // A misspelling is not a matter of degree; it is simply wrong.
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the cta renders as gibberish", confidence: "low" }] }),
    );
    assert.strictEqual(c.typography[0].action, "correct_text_content");
    assert.strictEqual(c.typography[0].priority, "high");
  });

  await check("Corrections quote the finding rather than paraphrasing it", () => {
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the headline is barely visible" }] }),
    );
    assert.strictEqual(c.typography[0].because, "the headline is barely visible");
  });

  await check("Findings with no rule are recorded, not silently dropped", () => {
    // The table is narrow on purpose; the only way to learn where it is too
    // narrow is to see what keeps falling through.
    const c = bridgeVisionToCorrections(
      seen({ issues: [{ what: "the mood feels a little cold for a summer campaign" }] }),
    );
    assert.strictEqual(c.typography.length, 0);
    assert.strictEqual(c.layout.length, 0);
    assert.strictEqual(c.untranslated.length, 1);
  });

  await check("The same problem reported twice yields one correction", () => {
    const c = bridgeVisionToCorrections(
      seen({
        typography_problems: [{ what: "headline too small" }],
        issues: [{ what: "the headline is too small to read" }],
      }),
    );
    assert.strictEqual(c.typography.length, 1, "a duplicate correction was emitted");
  });

  await check("The correction vocabulary cannot express a direction change", () => {
    // The closed action sets are the guarantee. If a palette or concept action
    // ever appears here, vision has been given authority it must not have.
    const src = fs.readFileSync(
      path.join(__dirname, "evolution/experiment/VisionCorrectionBridge.ts"),
      "utf8",
    );
    const types = src.slice(
      src.indexOf("export type TypographyCorrectionAction"),
      src.indexOf("export type CorrectionPriority"),
    );
    for (const forbidden of ["palette", "colour", "color", "mood", "concept", "crop", "style"]) {
      assert.ok(
        !new RegExp(`"[a-z_]*${forbidden}[a-z_]*"`).test(types),
        `the correction vocabulary can express "${forbidden}"`,
      );
    }
  });

  console.log("\nCorrections are applied to the systems that already exist");

  const TYPO_SYSTEM = {
    personality: null,
    attention_order: [],
    specs: [
      { role: "headline", zone: "headline", scale: 2, weight: "medium", tracking: "normal", alignment: "left", purpose: "p", because: "b" },
      { role: "cta", zone: "cta", scale: 1, weight: "medium", tracking: "normal", alignment: "left", purpose: "p", because: "b" },
    ],
    validation: {},
  };

  await check("A hierarchy correction raises the headline's scale", () => {
    const out = applyTypographyCorrections(TYPO_SYSTEM, [
      { action: "increase_headline_hierarchy", role: "headline", priority: "high", because: "x" },
    ]);
    assert.ok(out.specs[0].scale > 2, "the scale did not increase");
    assert.strictEqual(TYPO_SYSTEM.specs[0].scale, 2, "the input system was mutated");
  });

  await check("Scale changes are bounded rather than absolute", () => {
    // The director set the original value for a reason; a correction adjusts
    // it, and a runaway headline is the same defect in the other direction.
    let sys: any = TYPO_SYSTEM;
    for (let i = 0; i < 12; i++) {
      sys = applyTypographyCorrections(sys, [
        { action: "increase_headline_hierarchy", role: "headline", priority: "high", because: "x" },
      ]);
    }
    assert.ok(sys.specs[0].scale <= 6, `scale ran away to ${sys.specs[0].scale}`);
  });

  await check("A correction for an absent role changes nothing", () => {
    const out = applyTypographyCorrections(TYPO_SYSTEM, [
      { action: "increase_headline_hierarchy", role: "body", priority: "high", because: "x" },
    ]);
    assert.deepStrictEqual(out.specs, TYPO_SYSTEM.specs);
  });

  const GEOMETRY = {
    grid: { columns: 6, rows: 6, margin: 6, safe_inset: 10 },
    zones: [
      { name: "product", x: 50, y: 50, width: 40, height: 40, priority: 9, because: "b" },
      { name: "cta", x: 96, y: 96, width: 10, height: 6, priority: 4, because: "b" },
    ],
    eye_path: {},
    score: {},
  };

  await check("A safe-area correction pulls the zone inside the inset", () => {
    const out = applyLayoutCorrections(GEOMETRY, [
      { action: "move_cta_to_safe_area", zone: "cta", priority: "high", because: "x" },
    ]);
    const cta = out.zones.find((z: any) => z.name === "cta");
    assert.ok(cta.x <= 100 - 10 - 5, `cta.x stayed at ${cta.x}, outside the safe inset`);
    assert.ok(cta.y <= 100 - 10 - 3, `cta.y stayed at ${cta.y}, outside the safe inset`);
    assert.strictEqual(GEOMETRY.zones[1].x, 96, "the input geometry was mutated");
  });

  await check("Separating zones moves the text, never the product", () => {
    const out = applyLayoutCorrections(GEOMETRY, [
      { action: "separate_overlapping_zones", zone: "cta", priority: "high", because: "x" },
    ]);
    const product = out.zones.find((z: any) => z.name === "product");
    assert.strictEqual(product.x, 50, "the product was moved to accommodate text");
    assert.strictEqual(product.y, 50, "the product was moved to accommodate text");
  });

  await check("The rendered instruction protects the direction first", () => {
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the headline lacks dominance" }] }),
    );
    const text = renderCorrections(c);
    assert.ok(text, "no instruction was rendered");
    assert.ok(
      text.indexOf("Keep the concept, mood, palette") < text.indexOf("headline"),
      "the corrections are listed before the direction is protected",
    );
  });

  await check("The instruction reads as a designer, not an enum", () => {
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the headline lacks dominance" }] }),
    );
    const text = renderCorrections(c);
    assert.ok(!/increase_headline_hierarchy/.test(text), "a raw action name reached the renderer");
  });

  await check("No corrections means no instruction, so no second render", () => {
    assert.strictEqual(renderCorrections({ typography: [], layout: [], untranslated: ["x"] }), undefined);
  });

  await check("Bridge telemetry counts without leaking findings", () => {
    const c = bridgeVisionToCorrections(
      seen({ typography_problems: [{ what: "the headline lacks dominance in this frame" }] }),
    );
    const t = JSON.stringify(correctionTelemetry(c));
    assert.ok(!t.includes("lacks dominance"), "telemetry leaked a finding");
    assert.ok(/increase_headline_hierarchy/.test(t), "telemetry lost the action name");
  });

  console.log("\nDesign reasoning sits between seeing and changing");

  const BLUEPRINT = {
    story: { value: "coffee as a morning ritual", because: "b", confidence: "high" },
    concept: {
      big_idea: { value: "the pause before the day", because: "b", confidence: "high" },
      visual_story: { value: "steam in first light", because: "b", confidence: "high" },
      emotional_hook: { value: "unhurried calm", because: "b", confidence: "medium" },
    },
    visual_world: {
      color_story: { value: "warm neutrals", because: "b", confidence: "high" },
      atmosphere: { value: "low dawn light", because: "b", confidence: "high" },
    },
    brand_expression: { emotional_direction: { value: "quiet confidence", because: "b", confidence: "high" } },
    layout: { product_position: { value: "lower left, off-centre", because: "b", confidence: "high" } },
  };

  const decisionInput = (over: any = {}) => ({
    analysis: seen(over.analysis || {}),
    blueprint: BLUEPRINT,
    typography: over.typography === undefined ? TYPO_SYSTEM : over.typography,
    layout: over.layout === undefined ? GEOMETRY : over.layout,
  });

  await check("CASE 1 — a typography finding produces a typography decision", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] } }),
    );
    assert.strictEqual(r.typography_decisions.length, 1);
    const d = r.typography_decisions[0];
    assert.strictEqual(d.role, "headline");
    assert.ok(d.decision, "no decision was stated");
    assert.ok(d.reason, "no reason was given");
    assert.ok(d.decision_confidence, "no confidence was assigned");
  });

  await check("The decision names the value it changes, before and after", () => {
    // The difference between a rule firing and a designer deciding. "Make it
    // bigger" is not checkable; "from 2 to 2.7" is.
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] } }),
    );
    const d = r.typography_decisions[0];
    assert.strictEqual(d.from, 2, "the starting value was not read from the real spec");
    assert.ok(typeof d.to === "number" && d.to > 2, `the target value was ${d.to}`);
    assert.ok(/from 2 to/.test(d.decision), `the decision did not state the move: ${d.decision}`);
  });

  await check("The reason reads as a designer, not as a rule", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance" }] } }),
    );
    const reason = r.typography_decisions[0].reason;
    assert.ok(reason.length > 40, `the reason is too thin to be reasoning: "${reason}"`);
    assert.ok(!/increase_headline_hierarchy/.test(reason), "a raw action name leaked into the reason");
    // It must say what the element is failing to DO, not merely that it is small.
    assert.ok(/eye|anchor|first|read|order/i.test(reason), `the reason does not name the role: "${reason}"`);
  });

  await check("CASE 2 — a layout finding produces a layout decision", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { layout_problems: [{ what: "the cta runs off the lower edge" }] } }),
    );
    assert.strictEqual(r.layout_decisions.length, 1);
    const d = r.layout_decisions[0];
    assert.strictEqual(d.zone, "cta");
    assert.strictEqual(d.decision_confidence, "high", "a measurable safe-area breach was not high confidence");
    assert.ok(d.from, "the starting position was not read from the real geometry");
    assert.ok(d.to, "the resulting position was not recorded");
    assert.notStrictEqual(d.from, d.to, "the decision claimed a move that did not happen");
  });

  await check("CASE 3 — vision cannot change the creative direction", () => {
    const r = decideDesignChanges(
      decisionInput({
        analysis: {
          issues: [
            { what: "the mood is too cold for a summer campaign" },
            { what: "the concept would work better as a lifestyle scene" },
            { what: "the palette should be warmer" },
          ],
        },
      }),
    );
    assert.strictEqual(r.typography_decisions.length, 0, "a direction change became a typography decision");
    assert.strictEqual(r.layout_decisions.length, 0, "a direction change became a layout decision");
    assert.strictEqual(r.untranslated.length, 3, "direction findings were not recorded as untranslated");
  });

  await check("The protected list is read from the blueprint, not asserted", () => {
    const r = decideDesignChanges(decisionInput());
    for (const e of ["creative concept", "visual story", "colour story", "brand mood", "product hero position"]) {
      assert.ok(r.protected_elements.includes(e), `${e} was not protected`);
    }
    // A blueprint that decided nothing protects nothing: claiming otherwise
    // would be the same species of lie as claiming to have seen an image.
    const empty = decideDesignChanges({ ...decisionInput(), blueprint: { concept: {}, visual_world: {}, brand_expression: {}, layout: {} } as any });
    assert.deepStrictEqual(empty.protected_elements, []);
  });

  await check("The protected and editable field sets never overlap", () => {
    const protectedAll = new Set(Object.values(PROTECTED_FIELDS).flat());
    for (const [section, fields] of Object.entries(EDITABLE_FIELDS)) {
      for (const f of fields as string[]) {
        const clash = (PROTECTED_FIELDS[section] || []).includes(f);
        assert.ok(!clash, `${section}.${f} is both editable and protected`);
      }
    }
    for (const concept of ["big_idea", "visual_story", "creative_tension", "emotional_hook"]) {
      assert.ok(protectedAll.has(concept), `${concept} is not protected`);
    }
  });

  await check("The protected set matches the blueprint's real concept fields", () => {
    // If the blueprint grows a concept field, this fails rather than the field
    // quietly becoming something vision may influence.
    const { SECTION_FIELDS } = require("./evolution/experiment/CreativeBlueprint");
    assert.deepStrictEqual(
      [...PROTECTED_FIELDS.concept].sort(),
      [...SECTION_FIELDS.concept].sort(),
      "the protected concept fields have drifted from the blueprint's own list",
    );
  });

  console.log("\nConfidence decides what is acted on");

  await check("Low confidence records a decision but does not apply it", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "low" }] } }),
    );
    const d = r.typography_decisions[0];
    assert.strictEqual(d.decision_confidence, "low");
    assert.strictEqual(d.applied, false, "a low-confidence decision was applied");
    assert.strictEqual(r.typography, undefined, "the system was modified by a low-confidence decision");
  });

  await check("High confidence applies to the real system", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] } }),
    );
    assert.strictEqual(r.typography_decisions[0].applied, true);
    assert.ok(r.typography, "the typography system was not produced");
    const spec = r.typography.specs.find((s: any) => s.role === "headline");
    assert.ok(spec.scale > 2, "the real spec was not adjusted");
    assert.strictEqual(TYPO_SYSTEM.specs[0].scale, 2, "the input system was mutated");
  });

  await check("Misrendered text is always high confidence", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the cta rendered as gibberish", confidence: "low" }] } }),
    );
    assert.strictEqual(r.typography_decisions[0].decision_confidence, "high");
    assert.strictEqual(r.typography_decisions[0].applied, true);
  });

  await check("A decision without the design system still decides", () => {
    // Confidence is about evidence for the problem, not about whether this
    // process happens to hold the structure. Gating on the structure made every
    // decision low, so nothing applied and the feature was inert.
    const r = decideDesignChanges({
      analysis: seen({ typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] }),
      blueprint: BLUEPRINT,
      typography: null,
      layout: null,
    });
    assert.strictEqual(r.typography_decisions[0].decision_confidence, "high");
    assert.strictEqual(r.typography_decisions[0].applied, true);
    assert.strictEqual(r.typography_decisions[0].from, undefined, "a value was claimed without a source");
  });

  await check("An unseen analysis decides nothing", () => {
    const r = decideDesignChanges({
      ...decisionInput(),
      analysis: { ...seen({ typography_problems: [{ what: "headline too small" }] }), analyzed_image: false },
    });
    assert.strictEqual(r.typography_decisions.length, 0);
  });

  await check("Only applied decisions reach the renderer", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "low" }] } }),
    );
    assert.strictEqual(renderDesignDecisions(r), undefined, "a low-confidence decision was sent to a render");
  });

  await check("The instruction protects the blueprint's own elements first", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance", confidence: "high" }] } }),
    );
    const text = renderDesignDecisions(r);
    assert.ok(text, "no instruction was built");
    assert.ok(/creative concept/.test(text), "the instruction does not name what to preserve");
    assert.ok(
      text.indexOf("Hold these exactly") < text.indexOf("Increase headline"),
      "the changes are listed before the direction is protected",
    );
  });

  console.log("\nThe two renders are compared as a designer would");

  await check("Comparison is structured reasoning, not a score", () => {
    const worse = seen({ issues: [{ what: "a" }, { what: "b" }], typography_problems: [{ what: "c" }] });
    const better = seen({ issues: [{ what: "a" }] });
    const c = compareDesignQuality(worse, better);
    for (const k of ["typography_quality", "layout_quality", "readability", "product_focus", "overall_reasoning"]) {
      assert.ok(typeof (c as any)[k] === "string" && (c as any)[k].length > 5, `${k} is not reasoning`);
    }
    assert.strictEqual(c.recommendation, "second");
  });

  await check("A render that came back worse is not recommended", () => {
    const first = seen({ issues: [{ what: "a" }] });
    const second = seen({ issues: [{ what: "a" }, { what: "b" }], layout_problems: [{ what: "c" }] });
    const c = compareDesignQuality(first, second);
    assert.strictEqual(c.recommendation, "first");
    assert.ok(/introduced more problems/.test(c.overall_reasoning));
  });

  await check("An unchanged render is not worth replacing", () => {
    const a = seen({ issues: [{ what: "x" }] });
    const c = compareDesignQuality(a, seen({ issues: [{ what: "y" }] }));
    assert.strictEqual(c.recommendation, "first", "an equal render was promoted");
    assert.ok(/changed nothing measurable/.test(c.overall_reasoning));
  });

  await check("An unreviewed render is never preferred", () => {
    const c = compareDesignQuality(seen({ issues: [{ what: "a" }] }), null);
    assert.strictEqual(c.recommendation, "first");
    assert.ok(/no basis to prefer/.test(c.overall_reasoning));
  });

  await check("The comparison names each dimension's direction", () => {
    const first = seen({ typography_problems: [{ what: "a" }, { what: "b" }], layout_problems: [{ what: "c" }] });
    const second = seen({ typography_problems: [{ what: "a" }] });
    const c = compareDesignQuality(first, second);
    assert.ok(/more cleanly/.test(c.typography_quality), c.typography_quality);
    assert.ok(/sits better/.test(c.layout_quality), c.layout_quality);
    assert.ok(/unchanged/.test(c.product_focus), c.product_focus);
  });

  await check("Comparison carries no numeric quality score", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "evolution/experiment/VisionDesignDecisionEngine.ts"),
      "utf8",
    );
    const i = src.indexOf("export interface DesignQualityComparison");
    const body = src.slice(i, src.indexOf("}", i));
    assert.ok(!/:\s*number/.test(body), "a numeric score entered the design comparison");
  });

  await check("Decision telemetry counts without leaking the reasoning", () => {
    const r = decideDesignChanges(
      decisionInput({ analysis: { typography_problems: [{ what: "the headline lacks dominance in this frame", confidence: "high" }] } }),
    );
    const t = JSON.stringify(designDecisionTelemetry(r));
    assert.ok(!t.includes("lacks dominance"), "telemetry leaked a finding");
    assert.strictEqual(designDecisionTelemetry(r).typography_applied, 1);
  });

  await check("The design context never rides into the API response", () => {
    // The blueprint and design systems are attached non-enumerably so a spread
    // that builds the HTTP payload skips them. They are internal objects and
    // would be a large, surprising leak of engine state.
    const src = fs.readFileSync(path.join(__dirname, "evolution/ExperimentPipeline.ts"), "utf8");
    const i = src.indexOf("private static attachDesignContext");
    assert.ok(i > 0, "the pipeline does not attach design context");
    assert.ok(
      /enumerable:\s*false/.test(src.slice(i, i + 1200)),
      "the design context is enumerable and will leak into responses",
    );
  });

  await check("No fabricated quality score reaches the interface", () => {
    // A hardcoded "94 / 100 AI Creative Score Estimate" survived in
    // AIStrategyPanel through several passes of this work, appearing under
    // every image this product has ever made -- including ones the vision
    // review later found to have misspelled text. It is the one element of a
    // reasoning panel a user would quote back, and everything truthful around
    // it was lending it credibility.
    const dir = path.join(__dirname, "../../features/picture-engine/components");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name);
        if (f.isDirectory()) walk(full);
        else if (f.name.endsWith(".tsx")) {
          const code = fs
            .readFileSync(full, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
          // A literal "NN / 100" sitting in JSX text, bound to no value.
          if (/>\s*\d{2,3}\s*\/\s*100\s*</.test(code)) {
            offenders.push(path.relative(dir, full).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(dir);
    assert.deepStrictEqual(offenders, [], `a hardcoded score is rendered in: ${offenders.join(", ")}`);
  });

  console.log("\nThe review reports what the spec asked for");

  await check("Telemetry carries the five required counters", () => {
    const { NO_REVIEW } = require("./evolution/VisionReviewLayer");
    for (const k of [
      "vision_called",
      "analyzed_image",
      "second_render_created",
      "second_render_selected",
      "rejected_actions",
    ]) {
      assert.ok(k in NO_REVIEW, `telemetry is missing ${k}`);
    }
  });

  await check("Every field the review produces reaches the API", () => {
    // This caught a real miss. `visionReview` was built, attached to the
    // result, typed on the contract -- and never listed in the route's
    // passthrough, so it existed everywhere except where anyone could see it.
    // Producing a field and forwarding it are two edits, and the second is the
    // easy one to forget.
    const route = fs.readFileSync(
      path.join(__dirname, "../../app/api/image/generate-simple/route.ts"),
      "utf8",
    );
    for (const field of ["visionAnalysis", "visionReview", "renderComparison", "creativeIntelligence"]) {
      const count = (route.match(new RegExp(`result\\.${field} \\?`, "g")) || []).length;
      assert.strictEqual(count, 2, `${field} is forwarded at ${count} of the route's 2 success paths`);
    }
  });

  await check("Review telemetry cannot carry customer content", () => {
    const src = fs.readFileSync(path.join(__dirname, "evolution/VisionReviewLayer.ts"), "utf8");
    const i = src.indexOf("export interface VisionReviewTelemetry");
    const body = src.slice(i, src.indexOf("}", i));
    // Every field is a boolean or a count. A string field here would be the
    // first place a customer's copy could reach a log.
    assert.ok(!/:\s*string/.test(body), "a string field entered review telemetry");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
