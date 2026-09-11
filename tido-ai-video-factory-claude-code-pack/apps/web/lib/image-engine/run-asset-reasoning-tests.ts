import assert from "assert";
import fs from "fs";
import path from "path";
import { CommercialLayoutService } from "./service/CommercialLayoutService";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";

/**
 * Asset type as a reasoning context.
 *
 * Two properties carry this phase, and they pull against each other:
 *
 *   1. The asset type must actually reach the renderer. Measured before this
 *      work, 42.5% of the prompt was byte-identical across all five asset types
 *      and the strategy section varied no more between formats than between two
 *      runs of one format.
 *
 *   2. It must NOT arrive as a template. A format that always produces the same
 *      layout is a formula with extra steps, and the tests below check for
 *      positional language precisely because that is how the previous knowledge
 *      blocks failed — "anchor the product on the right 40%" is a recipe, and a
 *      recipe renders the same picture every time the format is chosen.
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

const FORMATS = ["poster", "banner", "social_ad", "product_hero", "ugc_thumbnail"];

console.log("\nAsset-aware creative reasoning\n");

// ── Design considerations reach the compiler ──────────────────────────────

check("Every asset type carries its own design considerations", () => {
  const seen = new Map<string, string>();
  for (const f of FORMATS) {
    const got = CommercialLayoutService.designConsiderations(f);
    assert.ok(got, `${f} has no considerations`);
    assert.ok(got!.considerations.length > 80, `${f} considerations are too thin`);
    for (const [other, text] of seen) {
      assert.notStrictEqual(
        got!.considerations,
        text,
        `${f} and ${other} share one set of considerations`
      );
    }
    seen.set(f, got!.considerations);
  }
});

check("An unknown asset type declines rather than defaulting to poster", () => {
  // Returning poster for anything unrecognised is how every unhandled path in
  // this engine ends up looking like a poster. A layer that cannot answer says so.
  assert.strictEqual(CommercialLayoutService.designConsiderations("mystery_format"), null);
  assert.strictEqual(CommercialLayoutService.designConsiderations(""), null);
  assert.strictEqual(CommercialLayoutService.designConsiderations(undefined), null);
});

check("Aliases resolve to the same considerations as their canonical id", () => {
  assert.strictEqual(
    CommercialLayoutService.designConsiderations("website_banner")!.considerations,
    CommercialLayoutService.designConsiderations("banner")!.considerations
  );
  assert.strictEqual(
    CommercialLayoutService.designConsiderations("Product Hero")!.considerations,
    CommercialLayoutService.designConsiderations("product_hero")!.considerations
  );
});

// ── Context, not template ─────────────────────────────────────────────────

check("Considerations never prescribe a position or a percentage", () => {
  // The failure mode this phase exists to prevent. Geometry belongs in the
  // reserved zones, which are computed per render; stated again as prose it
  // becomes a formula the model applies whatever the campaign.
  const POSITIONAL =
    /\b(?:top|bottom|left|right|centre|center|upper|lower)\s+(?:third|half|quarter|\d+%)|\b\d+\s?%|\b\d+\s?mm\b|\bfocal length\b/i;
  for (const f of FORMATS) {
    const text = CommercialLayoutService.designConsiderations(f)!.considerations;
    assert.ok(!POSITIONAL.test(text), `${f} prescribes geometry: "${text}"`);
  }
});

check("Foundation knowledge teaches principles, not layouts", () => {
  const K = path.join(process.cwd(), "data", "knowledge", "specialist");
  const RECIPE =
    /\b\d+\s?%|\b\d+\s?mm\b|\bfocal length\b|\b3-point\b|\bsoftbox\b|\bpedestal\b|\b45°/i;
  for (const dir of [
    "website_banner_foundation",
    "social_ad_foundation",
    "product_hero_foundation",
    "ugc_thumbnail_foundation",
  ]) {
    const file = path.join(K, dir, "knowledge.md");
    assert.ok(fs.existsSync(file), `${dir} has no knowledge.md`);
    const text = fs.readFileSync(file, "utf-8");
    const hit = text.split("\n").find((l) => RECIPE.test(l));
    assert.ok(!hit, `${dir} still prescribes a recipe: "${(hit || "").trim()}"`);
    assert.ok(text.length > 700, `${dir} is too thin to carry design reasoning`);
  }
});

// ── The reasoning survives compression ────────────────────────────────────

check("The compressor keeps design reasoning, not only physical rules", () => {
  // It used to classify a bullet as worth keeping only if it named a physical or
  // photographic property, so rewriting the foundation blocks as design
  // principles cut the banner block from seven bullets to two — it kept the two
  // sentences containing the word "type" and dropped why a banner is hard.
  const block = [
    "# BANNER",
    "",
    "## 1. ATTENTION",
    "- A banner sits inside a page the viewer came to for something else.",
    "- One idea delivered beats three offered.",
  ].join("\n");
  const out = KnowledgeBlockCompressor.compress(block).text;
  assert.ok(/came to for something else/.test(out), `the reasoning was dropped: ${out}`);
  assert.ok(/One idea delivered/.test(out), `the principle was dropped: ${out}`);
});

check("ASSET CONTEXT survives an oversized prompt", () => {
  const filler = "## BRAND KNOWLEDGE\n" + "Tido Skin was founded in 2014. ".repeat(900);
  const prompt = [
    "## CAMPAIGN STRATEGY",
    "ASSET CONTEXT — BANNER:",
    "- What this format asks of the design: a message that resolves faster than the intention to scroll past it.",
    "- Why this format serves this campaign: the launch must be legible before the eye moves on.",
    "THE SCENE — WHAT THE IMAGE ACTUALLY SHOWS:",
    "- What is happening: a hand rests beside the bottle on pale stone.",
    filler,
  ].join("\n");
  assert.ok(prompt.length > ProviderPromptOptimizer.HARD_LIMIT, "fixture is not over the limit");
  const t = ProviderPromptOptimizer.optimize(prompt).optimizedPrompt;
  assert.ok(/ASSET CONTEXT — BANNER/.test(t), "the asset context was dropped");
  assert.ok(/What this format asks of the design/.test(t), "the considerations were dropped");
  assert.ok(/Why this format serves this campaign/.test(t), "the asset reasoning was dropped");
  assert.ok(/What is happening/.test(t), "the scene was dropped");
  assert.ok(!/founded in 2014/.test(t), "the filler survived instead");
});

check("The Creative Brain is told what the format means, not just its name", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "llm", "marketing-brain.service.ts"),
    "utf-8"
  );
  // The defect this phase fixed: the format arrived as one line of metadata and
  // nothing in the instruction told the model what to do with it.
  assert.ok(/REASONING CONTEXT, NOT A TEMPLATE/.test(src), "the framing instruction is absent");
  assert.ok(/HOW THIS FORMAT IS ENCOUNTERED/.test(src), "the per-format context never reaches the brief");
  assert.ok(/asset_reasoning/.test(src), "the brain is not asked to explain the format choice");
  for (const f of FORMATS) {
    assert.ok(
      new RegExp(`\\b${f}:`).test(src),
      `${f} has no reasoning context in the brain`
    );
  }
});

check("The compiler's knowledge budget matches the one actually enforced", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  // They disagreed by 2,000 characters: knowledge was trimmed to fit 22,000 and
  // then deleted wholesale by a stage enforcing 20,000.
  assert.ok(
    /Math\.min\(\s*PromptBudgetManagerService\.EMERGENCY_TARGET,\s*ProviderPromptOptimizer\.HARD_LIMIT\s*\)/.test(
      src.replace(/\s+/g, " ")
    ) || /knowledgeFitCeiling = Math\.min/.test(src),
    "the knowledge-fit ceiling is not bounded by the enforced hard limit"
  );
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
