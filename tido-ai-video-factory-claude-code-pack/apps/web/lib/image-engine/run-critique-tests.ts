import assert from "assert";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CandidatePopulationBuilder } from "./reasoning/CandidatePopulationBuilder";
import { CreativeSelfCritique, CRITIQUE_ISSUE_LIMIT } from "./reasoning/CreativeSelfCritique";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { LLMCreativeCriticProvider } from "./reasoning/LLMCreativeCriticProvider";
import { LLMProviderService } from "./llm/llm-provider.service";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.7 — self-critique and LLM status.
 *
 * Two lines are held here and they are the ones most likely to be lost quietly:
 * the critique must never become a score, and nothing may report rule-based
 * output as model output. The second has already gone wrong once in this
 * codebase — a constructor logged status "CONNECTED" for every phase in which
 * the gateway was down — so it is tested rather than trusted.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  const done = () => {
    passed++;
    console.log(`  ✓ ${name}`);
  };
  const fail = (err: any) => {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  };
  try {
    const r = fn();
    if (r instanceof Promise) return r.then(done, fail);
    done();
  } catch (err: any) {
    fail(err);
  }
  return Promise.resolve();
}

const { cases } = loadConceptBenchmark();

function inputFor(index: number) {
  const c = cases[index];
  const brief = c.brief;
  const insight = HumanInsightGenerator.generate({
    challenge: c.creative_challenge || "",
    audience: brief.audience || "",
    product: brief.product || "",
    category: c.industry,
    objective: brief.objective,
    objectiveKind: brief.objective,
    brand: brief.brand,
    market: "vn",
  });
  const terms = HumanTensionAnalyzer.terms({
    challenge: c.creative_challenge || "",
    audience: brief.audience || "",
    product: brief.product || "",
    category: c.industry,
    objective: brief.objective,
  });
  return {
    insight,
    terms,
    contradiction: InsightContradictionEngine.evaluate(insight),
    brandDNA: BrandDNAOwnership.resolve({ brand: brief.brand, product: brief.product, category: c.industry, tone: brief.tone }),
    brief: {
      brand: brief.brand || "",
      product: brief.product || "",
      audience: brief.audience || "",
      category: c.industry || "",
      objective: brief.objective,
      challenge: c.creative_challenge || "",
      key_phrase: terms.key,
    },
  };
}

async function main() {
  console.log("\nCIOS Phase 4.0.7 — self-critique and LLM status\n");

  // ── The five questions ───────────────────────────────────────────────

  await check("A restatement of the truth is caught", () => {
    const truth = "People will forgo something they want rather than be seen wanting it.";
    const r = CreativeSelfCritique.review("People give up what they want rather than be seen wanting it.", {
      human_truth: truth,
    });
    assert.ok(r.issues.includes("restates_truth"), `issues: ${r.issues.join(",")}`);
  });

  await check("A category claim any competitor could make is caught", () => {
    const r = CreativeSelfCritique.review("The leading skincare brand you can trust for everyone.");
    assert.ok(r.issues.includes("generic_category_claim"), `issues: ${r.issues.join(",")}`);
  });

  await check("An abstraction with nobody in it is caught", () => {
    const r = CreativeSelfCritique.review("Beauty should be about confidence and authentic self expression.");
    assert.ok(r.issues.includes("no_human_moment"), `issues: ${r.issues.join(",")}`);
  });

  await check("A sentence carrying nothing from the brief is caught", () => {
    const r = CreativeSelfCritique.review("Women keep one bottle in the drawer rather than admit the cost.", {
      anchors: ["time the visit for when the place is empty"],
    });
    assert.ok(r.issues.includes("not_brand_owned"), `issues: ${r.issues.join(",")}`);
  });

  await check("A sentence carrying the brief's own behaviour is not", () => {
    const r = CreativeSelfCritique.review("Women reject correction language rather than admit the face is a defect.", {
      anchors: ["reject correction language"],
    });
    assert.ok(!r.issues.includes("not_brand_owned"), `issues: ${r.issues.join(",")}`);
  });

  await check("A pleasant sentence with nothing at odds is caught", () => {
    const r = CreativeSelfCritique.review("Women in the kitchen this morning with a bottle and a mirror.");
    assert.ok(r.issues.includes("no_tension"), `issues: ${r.issues.join(",")}`);
  });

  await check("A real idea passes all five", () => {
    const r = CreativeSelfCritique.review(
      "Women keep one bottle in the drawer rather than admit what the last one cost.",
      { human_truth: "People will forgo something they want rather than be seen wanting it.", anchors: ["one bottle drawer"] }
    );
    assert.strictEqual(r.issues.length, 0, `issues: ${r.issues.join(",")} — ${r.reasoning}`);
    assert.strictEqual(r.keep, true);
  });

  await check("The keep decision is exactly the issue limit, not a score", () => {
    const r = CreativeSelfCritique.review("Beauty should be about confidence.");
    assert.strictEqual(r.keep, r.issues.length <= CRITIQUE_ISSUE_LIMIT);
    // There is no number on the result. A score here would become a ranking
    // input the moment anyone reached for it.
    assert.ok(
      !Object.values(r).some((v) => typeof v === "number"),
      `a number appeared on a critique result: ${JSON.stringify(r)}`
    );
  });

  // ── Where it sits in the pipeline ────────────────────────────────────

  await check("Critique runs before the diversity guard, and the guard refills after it", () => {
    const withC = CandidatePopulationBuilder.buildSync(inputFor(0), { critique: true });
    const withoutC = CandidatePopulationBuilder.buildSync(inputFor(0), { critique: false });
    assert.ok(withC.critique.reviewed > 0, "nothing was reviewed");
    // The guard runs after the cull, so a culled pool is refilled rather than
    // left short. That is the whole reason for the ordering.
    assert.ok(
      withC.candidates.length >= Math.min(withoutC.candidates.length, 12) - 4,
      `critique left the pool at ${withC.candidates.length} against ${withoutC.candidates.length}`
    );
  });

  await check("Nothing the critique kept carries more issues than the limit", () => {
    const input = inputFor(1);
    const result = CandidatePopulationBuilder.buildSync(input, { critique: true });
    const anchors = [
      input.insight.dynamic_tension?.observable_behavior || "",
      input.brief.key_phrase || "",
      input.brief.product || "",
    ].filter(Boolean);
    for (const c of result.candidates) {
      const v = CreativeSelfCritique.review(c.idea, { human_truth: input.insight.human_truth, anchors });
      assert.ok(v.issues.length <= CRITIQUE_ISSUE_LIMIT, `${v.issues.join(",")} — ${c.idea}`);
    }
  });

  await check("No critique verdict reaches a ranked idea", () => {
    const run = runTasteBenchmark(cases.slice(0, 3), { useTasteMemory: false });
    for (const ranking of run.rankings) {
      for (const idea of ranking.ranked) {
        assert.ok(
          !Object.keys(idea).some((k) => /critique|issue|keep/i.test(k)),
          `a critique field reached a ranked idea: ${Object.keys(idea).join(",")}`
        );
        assert.ok(
          !Object.keys(idea.dimensions).some((k) => /critique/i.test(k)),
          "a critique dimension reached the ranking"
        );
      }
    }
  });

  // ── LLM status ───────────────────────────────────────────────────────

  await check("The provider no longer claims CONNECTED before making a request", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("lib/image-engine/llm/llm-provider.service.ts", "utf-8")
    );
    // Comments stripped first: the constructor carries a comment explaining what
    // the old line did, and matching that would fail the test on its own fix.
    const ctor = src
      .slice(src.indexOf("constructor("), src.indexOf("public getModelName"))
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join(" ");
    assert.ok(
      !/status:\s*"CONNECTED"/.test(ctor),
      "the constructor still reports CONNECTED without probing"
    );
    assert.ok(/status:\s*"CONFIGURED"/.test(ctor), "the constructor reports no status at all");
  });

  await check("probe() reports LLM_ACTIVE or LLM_FALLBACK_MODE, and never throws", async () => {
    const status = await new LLMProviderService().probe(4000);
    assert.ok(
      status.status === "LLM_ACTIVE" || status.status === "LLM_FALLBACK_MODE",
      `unexpected status: ${status.status}`
    );
    assert.strictEqual(status.reachable, status.status === "LLM_ACTIVE");
    assert.ok(status.detail.length > 0, "no reason given");
  });

  await check("An unreachable critic returns rule verdicts marked as not model-reviewed", async () => {
    const critic = new LLMCreativeCriticProvider(new LLMProviderService(), 3000);
    const ideas = [
      "Women keep one bottle in the drawer rather than admit what the last one cost.",
      "Beauty should be about confidence.",
    ];
    const out = await critic.review(ideas, { human_truth: "People forgo what they want rather than be seen wanting it." });
    assert.strictEqual(out.length, ideas.length);
    const status = await new LLMProviderService().probe(4000);
    if (!status.reachable) {
      // The rule verdict stands, and it must say so. Reporting these as model
      // reviews is the failure this whole task exists to prevent.
      assert.ok(out.every((r) => r.llm_reached === false), "a fallback verdict claimed a model answered");
    }
    assert.ok(out.every((r) => typeof r.keep === "boolean"), "a verdict had no decision on it");
  });

  await check("A fallback run reports zero model reviews", () => {
    const result = CandidatePopulationBuilder.buildSync(inputFor(0), { critique: true });
    // The sync path has no critic at all, so this must be zero rather than
    // inheriting a count from somewhere.
    assert.strictEqual(result.critique.llm_reviewed, 0);
  });

  console.log("\n" + "=".repeat(74));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(74));
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main();
