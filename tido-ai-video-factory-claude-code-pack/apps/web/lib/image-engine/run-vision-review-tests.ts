/**
 * Phase 7 — the render judged against its own decisions. Offline.
 *
 * What this suite is for
 * ----------------------
 *   1. INTENTIONAL FAILURES ARE DETECTED. A frame that disagrees with the plan,
 *      type that was decided elegant and composited heavy, a product that came
 *      back the wrong size, an invented logo -- each is planted and each must
 *      be found.
 *   2. EVERY ISSUE NAMES AN OWNER, AND THE RIGHT ONE. The cascade is the point:
 *      a frame that never matched its plan is the PROMPT's failure; a frame
 *      that matched its plan and still misses the idea is the PLAN's or the
 *      BLUEPRINT's. Reporting "wrong camera" without that distinction sends the
 *      fix to the wrong place.
 *   3. NOTHING IS JUDGED THAT NOBODY LOOKED AT. Every dimension with no
 *      evidence returns `unknown` and says why, and a review with no
 *      observation and no decisions judges nothing at all.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { buildVisionReview, visionReviewTelemetry } = require("./evolution/experiment/VisionReview");
const { NEUTRAL_TREATMENT, TREATMENT_AXES } = require("./evolution/experiment/TypographyDNA");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

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
    failures.push(`${name}\n    ${(e as Error).message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

// ── fixtures: a decided render, and the pixels that came back ─────────────

const field = (value: string, from = "director") => ({ value, because: `the ${from}'s decision`, from });

/** A composition that decided a close hero product on the right third. */
function plan(over: Record<string, unknown> = {}) {
  return {
    hero_subject: field("the bottle, met rather than observed"),
    product_role: { value: "hero", because: "the product holds the frame", from: "geometry" },
    storytelling_intent: field("coffee as a considered ritual"),
    product_position: {
      value: { x: 55, y: 20, width: 35, height: 60, label: "centre right" },
      because: "the layout placed it against the right third",
      from: "geometry",
    },
    product_scale: { value: { share: 21, label: "measured — clearly present" }, because: "close framing", from: "director" },
    negative_space: { value: { share: 48, purpose: "the empty left is what makes the restraint credible" }, because: "decided", from: "director" },
    typography_zone: { value: { x: 4, y: 24, width: 48, height: 52, label: "centre left", product_zone: "right", share: 0.25 }, because: "decided", from: "geometry" },
    typography_relationship: field("the copy takes the left the product leaves open"),
    visual_hierarchy: [
      { element: "product", rank: 1, because: "the largest zone" },
      { element: "headline", rank: 2, because: "read after the product" },
    ],
    camera_angle: field("eye level, straight on"),
    camera_distance: field("close — the subject fills the frame"),
    camera_lens_behavior: field("the background falls away"),
    environment: field("a stone counter"),
    lighting_direction: field("from the side, raking across the surface"),
    lighting_quality: field("one low window light"),
    atmosphere: field("still, composed"),
    foreground_background_relationship: field("shallow"),
    depth_structure: [],
    supporting_elements: [],
    questions: {},
    provenance: { director: 10, geometry: 3, product: 0, brand: 0, derived: 3, absent: 0 },
    completeness: 1,
    ...over,
  };
}

/** The typographic decision: restrained, solid ink, light and widely spaced. */
function dna(over: Record<string, unknown> = {}) {
  return {
    typography_role: "the hero statement",
    emotional_purpose: "restraint as a form of confidence",
    relationship_to_product: "subordinate to the product",
    relationship_to_scene: "light type on a dark frame",
    visual_behavior: "light strokes, widely spaced; nothing applied to the surface",
    uniqueness_reason: "this brief reads as restraint",
    hierarchy_strategy: "the headline carries the entry and everything else is read after it",
    headline_behavior: "light, widely spaced, in the centre left the composition kept quiet for it",
    supporting_text_behavior: "clearly subordinate, never a second headline",
    color_direction: "light ink on a dark frame, so the words are the brightest thing in their own area",
    avoid_rules: ["nothing that reads as type laid over a finished photograph: the words are part of the picture or they are wrong"],
    treatment: { ...NEUTRAL_TREATMENT, weight: 400, tracking: 0.07 },
    personality: "editorial",
    font_character: "high stroke contrast",
    font_need: { contrast: 0.9, humanist: false, display: false, because: "modulated strokes" },
    because: {},
    refused: [],
    accent: "#e8b04a",
    ...over,
  };
}

/** What was actually composited. */
function design(headline: Record<string, unknown> = {}) {
  return {
    version: 3,
    canvas: { width: 1024, height: 1024, aspect_ratio: "1:1", unit: "px", background: { color: "#111111" } },
    text_mode: "exact",
    brand: null,
    assets: {},
    scene_is_single_raster: true,
    layers: [
      {
        kind: "text", role: "headline", id: "h", name: "Text", content: "Slow mornings", lines: ["Slow mornings"],
        font_family: "Cambria", font_fallback: "serif", font_size: 96, font_weight: 400,
        line_height: 1.2, letter_spacing: 0.07, color: "#f2efe8", align: "left",
        x: 40, y: 200, width: 400, height: 120, rotation: 0, opacity: 1, z: 3,
        treatment: { ...NEUTRAL_TREATMENT, weight: 400, tracking: 0.07 },
        ...headline,
      },
    ],
  };
}

/** The frame as measured: a product where the plan put it. */
function map(over: Record<string, unknown> = {}) {
  return {
    size: 64,
    luminance: [],
    detail: [],
    product: { x: 55, y: 20, width: 35, height: 60 },
    focal: { x: 70, y: 45 },
    mean_luminance: 0.18,
    mean_detail: 0.09,
    ...over,
  };
}

const blueprint = (over: Record<string, unknown> = {}) => ({
  concept: {
    big_idea: { value: "coffee as a considered ritual", because: "x", derived_from: "director", confidence: "high" },
    emotional_hook: { value: "restraint as a form of confidence", because: "x", derived_from: "director", confidence: "high" },
  },
  brand_expression: {},
  ...over,
});

/** A model that looked and reported the given issues. */
const sawIssues = (issues: string[], extra: Record<string, unknown> = {}) => ({
  analyzed_image: true,
  strengths: [],
  issues: issues.map((what) => ({ what, confidence: "high" })),
  typography_problems: [],
  layout_problems: [],
  product_accuracy: [],
  improvement_actions: [],
  ...extra,
});

const clean = () => ({ ...sawIssues([]) });

function main() {
  console.log("\nVision review — did the picture do what was decided?\n");

  // ── 1. a render that honoured its decisions ─────────────────────────────
  console.log("1 — a faithful render passes without being flattered");

  check("a render matching its plan and its DNA is aligned everywhere measurable", () => {
    const r = buildVisionReview({ analysis: clean(), plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    assert.strictEqual(r.composition_alignment.alignment, "aligned", r.composition_alignment.because);
    assert.strictEqual(r.typography_alignment.alignment, "aligned", r.typography_alignment.because);
    assert.strictEqual(r.product_visibility.alignment, "aligned", r.product_visibility.because);
    assert.strictEqual(r.visual_hierarchy.alignment, "aligned", r.visual_hierarchy.because);
    assert.strictEqual(r.achieved_creative_goal, "yes");
    assert.strictEqual(r.severity, "none");
    assert.deepStrictEqual(r.detected_issues, []);
  });

  check("there is no score anywhere in the artifact", () => {
    // A number would hide a beautiful picture of the wrong idea behind an
    // average, and those need opposite fixes.
    const r = buildVisionReview({ analysis: clean(), plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    const flat = JSON.stringify(r);
    assert.ok(!/"score"|"rating"|_score|out of 10|\/10/.test(flat), `the review carries a score: ${flat.slice(0, 200)}`);
    const src = stripComments(read("lib/image-engine/evolution/experiment/VisionReview.ts"));
    assert.ok(!/score/i.test(src.replace(/quality score/gi, "")), "the module computes a score");
  });

  // ── 2. INTENTIONAL FAILURES ─────────────────────────────────────────────
  console.log("\n2 — planted failures, and who owns each");

  check("a product that came back somewhere else is caught, and owned by the prompt", () => {
    // The plan placed it centre-right; the render put it centre-left. The plan
    // was fine -- the instruction did not carry.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), design: design(), blueprint: blueprint(),
      map: map({ product: { x: 5, y: 20, width: 35, height: 60 }, focal: { x: 20, y: 45 } }),
    });
    assert.strictEqual(r.composition_alignment.alignment, "missed", r.composition_alignment.because);
    const issue = r.detected_issues.find((i: { what: string }) => /product came back/.test(i.what));
    assert.ok(issue, `no placement issue was raised: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "PromptCompiler", `owned by ${issue.owner}, not the layer that failed to transmit`);
    assert.ok(issue.improvement_direction.length > 20, "the issue says what is wrong and not what to do");
  });

  check("a frame the map cannot read is UNKNOWN, not a failure", () => {
    // Found live: a white detergent bottle on a white ground. The product
    // filled a third of the frame and `CompositionMap.product` was null,
    // because there was no region busier than the rest. The first version of
    // this layer called that a BLOCKING "the frame has no product" and would
    // have sent someone to fix a picture that was correct.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), design: design(), blueprint: blueprint(),
      map: map({ product: null, focal: null }),
    });
    assert.strictEqual(r.composition_alignment.alignment, "unknown", r.composition_alignment.because);
    assert.ok(/cannot locate the product/.test(r.composition_alignment.because), r.composition_alignment.because);
    assert.deepStrictEqual(r.detected_issues, [], "an unreadable measurement was reported as a render failure");
    assert.strictEqual(r.severity, "none");
  });

  check("a product the MODEL says is absent is still caught", () => {
    // The measurement being blind does not make the layer blind: a model that
    // reports the product missing is evidence, and is acted on.
    const r = buildVisionReview({
      analysis: { ...clean(), product_accuracy: [{ what: "the supplied bottle is missing from the frame", confidence: "high" }] },
      plan: plan(), dna: dna(), design: design(), blueprint: blueprint(), map: map(),
    });
    assert.strictEqual(r.product_visibility.alignment, "missed");
    assert.strictEqual(r.severity, "blocking");
  });

  check("DUPLICATE TEXT: composited and drawn again by the model", () => {
    // Found live. Every client line appeared twice -- once composited, once
    // painted by the image model, which the prompt had told to draw none. The
    // composited layer matched its decision perfectly, so the first version of
    // this layer called typography "aligned" while the picture was unusable.
    const r = buildVisionReview({
      analysis: {
        ...clean(),
        typography_critique: {
          findings: [
            { area: "duplicate_text", blocking: true, what: "the headline appears twice in the frame" },
            { area: "duplicate_text", blocking: true, what: "the subheadline appears twice in the frame" },
          ],
        },
      },
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    assert.strictEqual(r.typography_alignment.alignment, "missed", r.typography_alignment.because);
    assert.strictEqual(r.severity, "blocking");
    const issue = r.detected_issues.find((i: { what: string }) => /appears twice/.test(i.what));
    assert.ok(issue, `the measured duplicate was not raised: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "Renderer", "the model drew text it was told not to draw; that is not a decision fault");
    assert.ok(/told it not to/.test(issue.because), issue.because);
  });

  check("a measured blocking fault outranks a perfectly applied treatment", () => {
    const withFault = buildVisionReview({
      analysis: { ...clean(), typography_critique: { findings: [{ area: "collision", blocking: true, what: "the headline crosses the product" }] } },
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    const without = buildVisionReview({ analysis: clean(), plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    assert.strictEqual(without.typography_alignment.alignment, "aligned");
    assert.strictEqual(withFault.typography_alignment.alignment, "missed");
    assert.strictEqual(withFault.typography_alignment.from_observation, true, "a measured fault is claimed as a decision comparison");
  });

  check("a hero that came back the size of a prop is caught", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), design: design(), blueprint: blueprint(),
      map: map({ product: { x: 55, y: 40, width: 12, height: 14 } }),
    });
    assert.strictEqual(r.product_visibility.alignment, "missed", r.product_visibility.because);
    const issue = r.detected_issues.find((i: { what: string }) => /hero/.test(i.what));
    assert.ok(issue, "a hero at 2% of the frame raised nothing");
    assert.strictEqual(issue.owner, "PromptCompiler");
  });

  check("TYPOGRAPHY: decided elegant, composited heavy and playful", () => {
    // The spec's own example. The DNA decided light, widely spaced, solid ink;
    // the compositor set it at 900 with a raised surface.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), map: map(), blueprint: blueprint(),
      design: design({ font_weight: 900, treatment: { ...NEUTRAL_TREATMENT, relief: 0.8, weight: 900, tracking: -0.01 } }),
    });
    assert.strictEqual(r.typography_alignment.alignment, "partial", r.typography_alignment.because);
    const issue = r.detected_issues.find((i: { what: string }) => /type was set/.test(i.what));
    assert.ok(issue, `no typographic issue was raised: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "Renderer", "a decided treatment that was not applied is not the DNA's fault");
    assert.ok(/weight 900/.test(r.typography_alignment.observed), r.typography_alignment.observed);
  });

  check("a treatment reduced for a reason the DNA recorded is not reported as drift", () => {
    // The DNA itself refused the luminosity on a bright frame. The compositor
    // honouring that refusal is the system working, not a defect.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({
        treatment: { ...NEUTRAL_TREATMENT, luminosity: 0.9, weight: 400, tracking: 0.07 },
        refused: ["luminosity 0.90: the frame came back bright"],
      }),
      design: design(),
    });
    assert.strictEqual(r.typography_alignment.alignment, "aligned", r.typography_alignment.because);
    assert.ok(/recorded/.test(r.typography_alignment.because), r.typography_alignment.because);
    assert.deepStrictEqual(r.detected_issues, []);
  });

  check("a decided treatment that never reached the layer is the compositor's", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({ treatment: { ...NEUTRAL_TREATMENT, luminosity: 0.8, weight: 400, tracking: 0.07 } }),
      design: design({ treatment: undefined }),
    });
    assert.strictEqual(r.typography_alignment.alignment, "missed");
    const issue = r.detected_issues.find((i: { owner: string }) => i.owner === "Renderer");
    assert.ok(issue && /never applied/.test(issue.what), JSON.stringify(r.detected_issues));
  });

  check("CREATIVE: the frame executed its plan and still reads as generic", () => {
    // The spec's other example. Composition aligned, so the instruction worked
    // — which means the DECISION is what failed, not the transmission.
    const r = buildVisionReview({
      analysis: sawIssues(["the image could be any premium coffee brand; it reads as stock photography"]),
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    assert.strictEqual(r.creative_alignment.alignment, "missed", r.creative_alignment.because);
    const issue = r.detected_issues.find((i: { what: string }) => /any premium coffee/.test(i.what));
    assert.ok(issue, "a generic frame raised nothing");
    assert.strictEqual(issue.owner, "CreativeBlueprint", `owned by ${issue.owner}: the composition was honoured, so the idea is what failed`);
    assert.ok(/reconsider the route/.test(issue.improvement_direction), issue.improvement_direction);
  });

  check("the same complaint on a frame that ignored its plan belongs to the prompt", () => {
    // THE CASCADE. Identical model finding, different root cause, because the
    // composition never reached the picture and the idea was never tested.
    const r = buildVisionReview({
      analysis: sawIssues(["the image could be any premium coffee brand; it reads as stock photography"]),
      plan: plan(), dna: dna(), design: design(), blueprint: blueprint(),
      map: map({ product: { x: 5, y: 20, width: 35, height: 60 } }),
    });
    const issue = r.detected_issues.find((i: { what: string }) => /any premium coffee/.test(i.what));
    assert.ok(issue);
    assert.strictEqual(issue.owner, "PromptCompiler", "the idea was blamed for a frame that never followed its instructions");
    assert.ok(/never tested/.test(issue.improvement_direction), issue.improvement_direction);
  });

  check("an invented logo is blocking and belongs to the renderer", () => {
    const r = buildVisionReview({
      analysis: sawIssues(["a synthetic brand logo was generated in the lower right"]),
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    assert.strictEqual(r.brand_consistency.alignment, "missed");
    assert.strictEqual(r.severity, "blocking");
    const issue = r.detected_issues.find((i: { owner: string }) => i.owner === "Renderer");
    assert.ok(issue && /synthetic/.test(issue.what), JSON.stringify(r.detected_issues));
  });

  check("a product that is not the supplied product is blocking, whatever else is right", () => {
    const r = buildVisionReview({
      analysis: { ...clean(), product_accuracy: [{ what: "the bottle shape is different from the reference", confidence: "high" }] },
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    assert.strictEqual(r.product_visibility.alignment, "missed");
    assert.strictEqual(r.severity, "blocking");
    const issue = r.detected_issues.find((i: { owner: string }) => i.owner === "Renderer");
    assert.ok(issue && /not a style question/.test(issue.improvement_direction), JSON.stringify(r.detected_issues));
  });

  check("the eye landing away from the planned first read belongs to the composition", () => {
    // The frame did what it was told; the plan's own reading order is what does
    // not survive. That is a planning decision, not a transmission failure.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), design: design(), blueprint: blueprint(),
      map: map({ focal: { x: 10, y: 80 } }),
    });
    assert.strictEqual(r.visual_hierarchy.alignment, "partial");
    const issue = r.detected_issues.find((i: { owner: string }) => i.owner === "CompositionPlan");
    assert.ok(issue && /read first/.test(issue.what), JSON.stringify(r.detected_issues));
  });

  // ── 3. ownership is complete and honest ─────────────────────────────────
  console.log("\n3 — every issue has an owner, and unknowns say so");

  check("every issue names an owner and what that owner should change", () => {
    const r = buildVisionReview({
      analysis: sawIssues(["the image reads as stock photography", "something unrelated the layer cannot place"]),
      plan: plan(), dna: dna(), map: map({ product: { x: 5, y: 20, width: 35, height: 60 } }),
      design: design({ font_weight: 900 }), blueprint: blueprint(),
    });
    assert.ok(r.detected_issues.length >= 3, `only ${r.detected_issues.length} issues from three planted failures`);
    for (const i of r.detected_issues) {
      assert.ok(i.owner, "an issue has no owner");
      assert.ok(i.because.length > 15, `"${i.what}" names an owner without saying why`);
      assert.ok(i.improvement_direction.length > 15, `"${i.what}" says nothing to do`);
      assert.ok(["blocking", "major", "minor"].includes(i.severity), `unknown severity ${i.severity}`);
    }
    assert.ok(r.improvement_direction.some((d: string) => d.startsWith("PromptCompiler:")), JSON.stringify(r.improvement_direction));
  });

  check("a finding the layer cannot attribute is carried, not dropped or guessed", () => {
    const r = buildVisionReview({
      analysis: sawIssues(["the reflection in the counter looks physically wrong"]),
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    const issue = r.detected_issues.find((i: { what: string }) => /reflection/.test(i.what));
    assert.ok(issue, "the model's finding was dropped");
    assert.strictEqual(issue.owner, "Unattributed", "an owner was guessed for a finding nothing contradicts");
    assert.ok(/needs a person/.test(issue.improvement_direction), issue.improvement_direction);
  });

  check("nothing is judged that nobody looked at", () => {
    const r = buildVisionReview({});
    for (const k of ["creative_alignment", "composition_alignment", "typography_alignment", "product_visibility", "visual_hierarchy", "brand_consistency"] as const) {
      assert.strictEqual(r[k].alignment, "unknown", `${k} reached a verdict with no evidence`);
      assert.ok(r[k].because.length > 10, `${k} is unknown without saying why`);
    }
    assert.strictEqual(r.achieved_creative_goal, "unknown");
    assert.strictEqual(r.not_judged.length, 6);
    assert.ok(/Nothing could be compared/.test(r.overall_assessment), r.overall_assessment);
  });

  check("an idea cannot be judged when no model looked", () => {
    const r = buildVisionReview({ plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    assert.strictEqual(r.creative_alignment.alignment, "unknown");
    assert.ok(/cannot be checked by arithmetic/.test(r.creative_alignment.because), r.creative_alignment.because);
    // But everything measurable is still judged.
    assert.strictEqual(r.composition_alignment.alignment, "aligned");
    assert.strictEqual(r.composition_alignment.from_observation, false);
  });

  check("measured dimensions are marked as measured, not as opinion", () => {
    const r = buildVisionReview({ analysis: clean(), plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    assert.strictEqual(r.composition_alignment.from_observation, false, "the composition check claims to be an opinion");
    assert.strictEqual(r.typography_alignment.from_observation, false);
    assert.strictEqual(r.product_visibility.from_observation, false);
    assert.strictEqual(r.creative_alignment.from_observation, true, "the idea check claims to be a measurement");
  });

  // ── 4. the assessment is about the idea ─────────────────────────────────
  console.log("\n4 — the verdict is about the idea, not the craft");

  check("the assessment names the idea and the layers to change", () => {
    const r = buildVisionReview({
      analysis: sawIssues(["the image could be any premium coffee brand"]),
      plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint(),
    });
    assert.ok(r.overall_assessment.includes("considered ritual"), r.overall_assessment);
    assert.ok(/CreativeBlueprint/.test(r.overall_assessment), r.overall_assessment);
    assert.strictEqual(r.achieved_creative_goal, "no");
  });

  check("a partly-honoured render says partly rather than failing outright", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), dna: dna(), blueprint: blueprint(),
      design: design({ font_weight: 900 }), map: map(),
    });
    assert.strictEqual(r.achieved_creative_goal, "partly");
    assert.strictEqual(r.severity, "minor");
  });

  // ── 4.5 Phase 7.5: the five typographic questions ───────────────────────
  console.log("\n4.5 — typography judged as art direction, not as placement");

  check("EXAMPLE 1 — artisan pizza: a discount-style glow is caught as off-direction", () => {
    // A handmade brief where a FUTURISTIC reading argued for emitted light and
    // lost. Glow is not forbidden in general — it is forbidden HERE, because
    // this brief already had that argument, and the finding says so.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({
        avoid_rules: ["do not drift back toward the near future: it argued for a different luminosity in this brief and lost"],
        headline_behavior: "heavy, openly spaced, in the quiet the oven arch leaves",
        treatment: { ...NEUTRAL_TREATMENT, weight: 700, tracking: 0.02 },
      }),
      design: design({ font_weight: 700, treatment: { ...NEUTRAL_TREATMENT, luminosity: 0.7, weight: 700 } }),
    });
    const issue = r.detected_issues.find((i: { what: string }) => /luminosity/.test(i.what));
    assert.ok(issue, `an off-direction glow raised nothing: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "TypographyDNA");
    // Actionable: it says which way to move, not that the typography is "bad".
    assert.ok(/move away from the near future/.test(issue.improvement_direction), issue.improvement_direction);
    assert.ok(issue.improvement_direction.length > 40, "the finding names a fault without a direction");
  });

  check("EXAMPLE 2 — summer beverage: weak hierarchy is caught and named", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({ hierarchy_strategy: "the headline wins the entry; everything else is read after it" }),
      design: {
        ...design(),
        layers: [
          { ...design().layers[0], role: "headline", font_size: 60, id: "h" },
          { ...design().layers[0], role: "subheadline", font_size: 90, id: "s", content: "Fresh every day" },
        ],
      } as never,
    });
    const issue = r.detected_issues.find((i: { what: string }) => /reading order is inverted/.test(i.what));
    assert.ok(issue, `an inverted hierarchy raised nothing: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.severity, "major");
    assert.ok(/restore the order/.test(issue.improvement_direction), issue.improvement_direction);
  });

  check("EXAMPLE 3 — luxury: type that does nothing where the direction asked for something", () => {
    // The honest version of "does it look generic": a brief that argued for a
    // behaviour and got letters that do nothing lost its direction somewhere.
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({ treatment: { ...NEUTRAL_TREATMENT, contact: 0.6, weight: 400, tracking: 0.07 }, refused: [] }),
      design: design({ treatment: { ...NEUTRAL_TREATMENT, weight: 400, tracking: 0.07 } }),
    });
    const issue = r.detected_issues.find((i: { what: string }) => /applied rather than designed/.test(i.what));
    assert.ok(issue, `type that expressed nothing raised nothing: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "Renderer");
  });

  check("type stranded against its own frame is caught", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(),
      dna: dna({ relationship_to_scene: "light type on a dark frame" }),
      design: design({ color: "#101010" }),
    });
    const issue = r.detected_issues.find((i: { what: string }) => /set dark where the composition expected/.test(i.what));
    assert.ok(issue, `dark ink on a dark frame raised nothing: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.severity, "major");
  });

  check("type sitting over the product is caught, and owned by the composition", () => {
    const r = buildVisionReview({
      analysis: clean(), plan: plan(), map: map(), blueprint: blueprint(), dna: dna(),
      design: {
        ...design(),
        scene_content: { product: { x: 0, y: 15, width: 60, height: 30 }, focal: { x: 30, y: 30 } },
      } as never,
    });
    const issue = r.detected_issues.find((i: { what: string }) => /compete for the same area/.test(i.what));
    assert.ok(issue, `type over the product raised nothing: ${JSON.stringify(r.detected_issues)}`);
    assert.strictEqual(issue.owner, "CompositionPlan");
  });

  check("a faithful render triggers none of the five", () => {
    const r = buildVisionReview({ analysis: clean(), plan: plan(), dna: dna(), design: design(), map: map(), blueprint: blueprint() });
    assert.deepStrictEqual(r.detected_issues, [], "the typographic checks fire on a correct render");
  });

  check("a DNA written before this phase does not crash the critic", () => {
    // These arrive from a stored design document, which may predate the fields.
    const older = dna();
    delete (older as Record<string, unknown>).avoid_rules;
    delete (older as Record<string, unknown>).hierarchy_strategy;
    delete (older as Record<string, unknown>).headline_behavior;
    const r = buildVisionReview({ analysis: clean(), plan: plan(), dna: older, design: design(), map: map(), blueprint: blueprint() });
    assert.strictEqual(r.typography_alignment.alignment, "aligned");
  });

  // ── 5. telemetry ────────────────────────────────────────────────────────
  console.log("\n5 — what is logged");

  check("telemetry names alignments and owners, never the copy", () => {
    const r = buildVisionReview({
      analysis: sawIssues(["the image reads as stock"]), plan: plan(), dna: dna(),
      design: design(), map: map(), blueprint: blueprint(),
    });
    const t = JSON.stringify(visionReviewTelemetry(r));
    assert.ok(!t.includes("Slow mornings"), "the telemetry leaked the client's copy");
    assert.ok(/achieved/.test(t) && /owners/.test(t) && /observed_dimensions/.test(t));
    assert.deepStrictEqual(visionReviewTelemetry(null), { vision_review: false });
  });

  check("the axes it compares are the ones the DNA actually has", () => {
    // If a behaviour is added to the DNA and not to the comparison, a decided
    // treatment could drift unnoticed.
    const src = stripComments(read("lib/image-engine/evolution/experiment/VisionReview.ts"));
    assert.ok(/TREATMENT_AXES/.test(src), "the typography check hard-codes which behaviours it compares");
    assert.ok(TREATMENT_AXES.length >= 6);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
