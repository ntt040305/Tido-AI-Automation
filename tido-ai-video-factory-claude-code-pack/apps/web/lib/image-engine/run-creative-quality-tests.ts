import assert from "assert";
import fs from "fs";
import path from "path";
import { evaluate, CRITERIA } from "./run-creative-quality-benchmark";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { CommercialLayoutService } from "./service/CommercialLayoutService";

/**
 * Universal Creative Quality Framework, and the decisions it is meant to reward.
 *
 * The framework is only worth having if it can tell a reasoned prompt from a
 * competent-looking one, so the first tests check that it discriminates rather
 * than that it returns a number. The rest pin the behaviours this phase changed,
 * because each of them was previously a constant pretending to be a decision.
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

console.log("\nUniversal creative quality framework\n");

const REASONED = [
  "## CAMPAIGN STRATEGY",
  "BUSINESS GOAL: launch in skincare",
  "WHAT THIS IMAGE MUST ACHIEVE: it has to be remembered as a brand worth returning to, not acted on today.",
  "CONSUMER INSIGHT: buyers are protecting who they already are, not chasing a younger face.",
  "WHO THIS IS FOR: she has a developed sense of self and distrusts brands that try too hard, so the image has to be quieter than the category.",
  "CREATIVE MESSAGE: this is care, not correction.",
  "ASSET CONTEXT — POSTER:",
  "- What this format asks of the design: impact at first glance, before a word is read.",
  "- Why this format serves this campaign: a launch poster earns one uninterrupted second.",
  "THE SCENE — WHAT THE IMAGE ACTUALLY SHOWS:",
  "- What is happening: a woman in her late thirties stands at a window in early morning, one hand on the sill, the other lowering a serum bottle from her face, looking out rather than at the camera.",
  "## ART DIRECTION",
  "- COMPOSITION: her face and the bottle share the frame as equals so neither reads as the subject of an advertisement.",
  "- LIGHTING: soft directional morning light that keeps skin texture honest rather than flattening it.",
  "- MATERIALS & SURFACES: glass that catches light without glaring, specular response consistent with the window.",
  "## COMMERCIAL LAYOUT",
  "FORMAT: poster at 4:5.",
  "SAFE MARGIN: 6%.",
  "ATTENTION BUDGET (0–100).",
  "EYE FLOW: center out product first.",
  "NEGATIVE SPACE STRATEGY: a calm band above the product.",
  "RESERVED ZONES (percentages of the canvas).",
  "## TYPOGRAPHY & READABLE COPY",
  "Reproduce them exactly — spelling, capitalization, punctuation.",
  "## BRAND KNOWLEDGE",
  "BRAND NAME: Tido Skin",
  "LOCKED CLIENT INTENT — PRESERVE STRICTLY:",
  "- Non-negotiable: respect brand identity",
].join("\n");

const GENERIC = [
  "## CAMPAIGN STRATEGY",
  "BUSINESS GOAL: sell serum",
  "WHO THIS IS FOR: women 30-45",
  "## ART DIRECTION",
  "- LIGHTING: premium cinematic lighting.",
  "- COMPOSITION: beautiful premium composition.",
  "## COMMERCIAL LAYOUT",
  "FORMAT: poster at 4:5.",
].join("\n");

check("A reasoned prompt outscores a competent-looking generic one", () => {
  const good = evaluate("reasoned", REASONED);
  const bad = evaluate("generic", GENERIC);
  assert.ok(
    good.total > bad.total + 2,
    `framework does not discriminate: ${good.total} vs ${bad.total}`
  );
});

check("Every criterion is labelled MEASURED or PROXY", () => {
  // Production realism is read off a prompt, not off a picture. Averaging that
  // in as if it were measured is how a scorecard starts flattering the system.
  for (const c of CRITERIA) {
    assert.ok(["MEASURED", "PROXY"].includes(c.kind), `${c.key} has no kind`);
    assert.ok(c.question.endsWith("?"), `${c.key} does not state a question`);
  }
  assert.strictEqual(
    CRITERIA.filter((c) => c.kind === "PROXY").map((c) => c.key).join(","),
    "audience_suitability,production_realism",
    "the set of proxies changed without being re-justified"
  );
});

check("Generic adjectives lower the originality score", () => {
  const withVerdicts = evaluate("v", REASONED + "\n- premium luxury cinematic stunning treatment.");
  const without = evaluate("n", REASONED);
  assert.ok(
    withVerdicts.scores.originality < without.scores.originality,
    "verdict words were not penalised"
  );
});

check("The framework reports the knowledge gap rather than hiding it", () => {
  // Professional knowledge does not currently survive the budget. A framework
  // that scored 10/10 while the physical rules never reached the renderer would
  // be measuring the wrong thing.
  const withKnowledge = evaluate("k", REASONED + "\n## PROFESSIONAL KNOWLEDGE\nSpeculars stay plausible.");
  assert.ok(
    withKnowledge.scores.production_realism > evaluate("n", REASONED).scores.production_realism,
    "knowledge presence does not affect production realism"
  );
});

// ── The decisions this phase turned from constants into judgements ────────

check("Typography is reasoned about rather than given a fixed hierarchy", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  // The old line prescribed one order for every brand, format and campaign:
  // "primary emphasis > secondary subtitle > product identity/offer > action".
  assert.ok(
    !/Integrate the authorized copy using appropriate visual hierarchy/.test(src),
    "the fixed typographic hierarchy is still prescribed"
  );
  assert.ok(/Which string carries the message/.test(src), "typography asks no questions");
  assert.ok(/Reproduce them exactly/.test(src), "exact-copy integrity was lost in the rewrite");
});

check("Camera is decided by strategy when the strategy has a camera intent", () => {
  // It used to read `strategy.camera_direction`, which the brain deliberately
  // never sets, so camera always fell through to a knowledge default and arrived
  // as a focal length with no reason attached.
  const out = ArtDirectionResolverService.resolve({
    lockedIntent: {
      subject: [], environment: [], mood: [], style: [],
      camera_requirements: [], lighting_requirements: [],
      non_negotiable_constraints: [], important_user_requirements: [],
    } as any,
    marketingStrategy: {
      creative_angle: "a",
      commercial_goal: "b",
      target_customer_psychology: "c",
      prompt_guidance: "d",
      visual_translation: {
        camera_intent: "placed low so the bottle reads as something to look up to",
        subject_representation: "x",
        atmosphere: "y",
        lighting_character: "z",
        material_treatment: "m",
        composition_principle: "c",
        colour_direction: "col",
      },
    } as any,
    knowledgeDirection: { camera_direction: "eye-level 50mm commercial hero angle" } as any,
  } as any);
  assert.strictEqual(out.fields.camera!.source, "STRATEGY", "camera still falls to the knowledge default");
  assert.ok(/look up to/.test(out.fields.camera!.value), out.fields.camera!.value);
});

check("The identity lock states its rules once, not four times", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  // Nineteen bullet lines restating what REFERENCE SEMANTICS already separates.
  assert.ok(!/instanceLines\.push\(`- exact packaging`\)/.test(src), "the duplicated lock list survives");
  // But the two concepts that lived only here must still be stated.
  assert.ok(/never invent packaging/.test(src), "invented packaging is no longer forbidden anywhere");
  assert.ok(/never generate a logo or brand mark/.test(src), "fake logos are no longer forbidden anywhere");
});

check("Pipeline self-justification no longer reaches the renderer", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  // `commercial_reasoning` is built by prefixing emotional_goal verbatim, so
  // emitting both printed the same sentence twice in one section.
  assert.ok(!/`- Why this works: \$\{enh\.commercial_reasoning\}`/.test(src), "the duplicate reasoning line survives");
  assert.ok(!/`- Visual hierarchy: \$\{enh\.visual_hierarchy\}`/.test(src), "the weaker hierarchy copy survives");
  assert.ok(/incorporating domain expertise/.test(src), "the retrieval-meta strip was removed");
});

check("The brain is asked why the visual exists before how it looks", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "llm", "marketing-brain.service.ts"),
    "utf-8"
  );
  assert.ok(/WHY THIS VISUAL NEEDS TO EXIST/.test(src), "the why-before-how instruction is absent");
  assert.ok(/communication_objective/.test(src), "the image's own objective is never asked for");
  assert.ok(/INDUSTRIES DIFFER IN WHAT THEY HAVE TO EARN/.test(src), "industry reasoning is absent");
  // And it must stay a judgement, not a lookup table.
  assert.ok(
    !/luxury\s*(?:=>|->|:)\s*exclusivity/i.test(src),
    "industry reasoning was written as a lookup table"
  );
  assert.ok(/it is a judgement about the\s+brief, not a lookup/.test(src), "the anti-template caveat is missing");
});

// ── Creative judgment: exploration, reasoned decisions, adaptive attention ──

check("Typography is decided by strategy when the strategy reasoned about it", () => {
  // The last dimension still arriving as a bare parameter. Measured on a real
  // poster, six of seven art-direction lines carried a reason and typography read
  // "reserve clean typography area only for post-production text placement".
  const out = ArtDirectionResolverService.resolve({
    lockedIntent: {
      subject: [], environment: [], mood: [], style: [],
      camera_requirements: [], lighting_requirements: [],
      non_negotiable_constraints: [], important_user_requirements: [],
    } as any,
    marketingStrategy: {
      creative_angle: "a", commercial_goal: "b", target_customer_psychology: "c", prompt_guidance: "d",
      visual_translation: {
        typography_intent: "the words should feel spoken rather than set, because the brand talks to people",
        subject_representation: "x", atmosphere: "y", lighting_character: "z",
        material_treatment: "m", composition_principle: "c", colour_direction: "col",
      },
    } as any,
    knowledgeDirection: { typography_strategy: "reserve clean typography area only" } as any,
  } as any);
  assert.strictEqual(out.fields.typography!.source, "STRATEGY", "typography still falls to the knowledge default");
  assert.ok(/spoken rather than set/.test(out.fields.typography!.value), out.fields.typography!.value);
});

check("Attention shifts with the campaign, and 'none' leaves the format alone", () => {
  const base = CommercialLayoutService.plan({ assetType: "poster", aspectRatio: "4:5", copyItems: ["Buy now"] });
  const none = CommercialLayoutService.plan({ assetType: "poster", aspectRatio: "4:5", copyItems: ["Buy now"], attentionShift: "none" });
  const cta = CommercialLayoutService.plan({ assetType: "poster", aspectRatio: "4:5", copyItems: ["Buy now"], attentionShift: "cta" });

  const weight = (p: any, el: string) => p.visual_priority.find((x: any) => x.element === el)?.importance;
  assert.deepStrictEqual(
    none.visual_priority.map((p: any) => p.importance),
    base.visual_priority.map((p: any) => p.importance),
    "'none' changed the format's own allocation"
  );
  assert.ok(weight(cta, "cta")! > weight(base, "cta")!, "a conversion campaign did not raise the CTA");
});

check("A shift modulates the format rather than replacing it", () => {
  // The guard against this becoming a template: a poster with a raised CTA is
  // still recognisably a poster, and the product does not stop being the hero.
  const poster = CommercialLayoutService.plan({ assetType: "poster", aspectRatio: "4:5", copyItems: ["Buy"], attentionShift: "cta" });
  const thumb = CommercialLayoutService.plan({ assetType: "ugc_thumbnail", aspectRatio: "4:5", copyItems: ["Buy"], attentionShift: "cta" });
  // Compared against banner, not thumbnail: poster and thumbnail legitimately
  // share an eye flow ("center out product first"), which is a known gap in the
  // format specs and not something this shift caused.
  const banner = CommercialLayoutService.plan({ assetType: "banner", aspectRatio: "4:5", copyItems: ["Buy"], attentionShift: "cta" });
  assert.notStrictEqual(poster.eye_flow, banner.eye_flow, "the shift flattened two formats into one");
  assert.notDeepStrictEqual(
    poster.zones.map((z: any) => z.role),
    thumb.zones.map((z: any) => z.role),
    "the shift overrode the format's zones"
  );
  const product = poster.visual_priority.find((p: any) => p.element === "product")!;
  assert.ok(product.importance >= 70, `the product stopped being the hero: ${product.importance}`);
});

check("A raised element is not still described as subordinate", () => {
  // The number moved and the role string did not, so the prompt stated a weight
  // and contradicted it in the same line.
  const cta = CommercialLayoutService.plan({ assetType: "poster", aspectRatio: "4:5", copyItems: ["Buy"], attentionShift: "cta" });
  const role = cta.visual_priority.find((p: any) => p.element === "cta")!.role;
  assert.ok(!/present but subordinate/i.test(role), `raised element still called subordinate: ${role}`);
  assert.ok(/real work to do/.test(role), role);
});

check("The brain explores alternatives and critiques itself before answering", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "llm", "marketing-brain.service.ts"),
    "utf-8"
  );
  assert.ok(/CONSIDER SEVERAL DIRECTIONS BEFORE YOU COMMIT/.test(src), "no exploration step");
  assert.ok(/They must differ\s+in WHAT HAPPENS in the frame/.test(src), "alternatives may differ only in styling");
  assert.ok(/BEFORE YOU ANSWER, CHECK YOUR OWN WORK/.test(src), "no self-critique step");
  assert.ok(/Would a creative director sign this off/.test(src), "the director test is missing");
  assert.ok(/EVERY CHOICE MUST BE INTENTIONAL/.test(src), "no anti-generic check");
  assert.ok(/A BRAND IS A BEHAVIOUR, NOT A LOGO/.test(src), "no brand personality reasoning");
  // The anti-generic check must not become a banned-elements list.
  assert.ok(/Nothing here is banned/.test(src), "the anti-generic check bans elements instead of asking why");
});

check("Exploration reaches the prompt as a verdict, not as three pitches", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  assert.ok(/THE ROUTE TAKEN/.test(src), "the chosen route never reaches the renderer");
  assert.ok(/HOW THIS BRAND BEHAVES/.test(src), "brand personality never reaches the renderer");
  assert.ok(/HOW THE FRAME SHOULD BE READ/.test(src), "the reading order never reaches the renderer");
  const brain = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "llm", "marketing-brain.service.ts"),
    "utf-8"
  );
  // Budget discipline: the alternatives are reasoned about and thrown away.
  assert.ok(/Report only the route you took/.test(brain), "the rejected directions may reach the prompt");
  assert.ok(/AT MOST 140 CHARACTERS/.test(brain), "the new fields have no length contract");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
