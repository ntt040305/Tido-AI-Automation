/**
 * Production Data Flow Hardening -- the six defects the 2026-09-24 audit found.
 *
 * Offline: no database, no model. The live half is
 * `lib/persistence/verify-data-flow-hardening.ts`, which drives the same code
 * against the real schema. This half pins the properties that made each defect
 * possible, so a refactor that reintroduces one fails here first.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { carryDesignContext, DESIGN_CONTEXT_KEYS, reviewRender } = require("./evolution/VisionReviewLayer");
const { reviewRows, iterationRows, problemCountOf } = require("../persistence/record-generation");
const { generationIdFromSignal } = require("../user-kit/kit-memory");
const { memoryContextBrief } = require("./evolution/experiment/CreativeDirectorV1");
const { patternSourceText, embedNewPatterns } = require("../persistence/record-creative-memory");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

function hidden<T extends object>(target: T, key: string, value: unknown): T {
  Object.defineProperty(target, key, { value, enumerable: false, configurable: true });
  return target;
}

const ANALYSIS_V1 = {
  analyzed_image: true,
  provider: "llm-gateway",
  image_hash: "aaaa",
  strengths: [],
  issues: [{ what: "a" }, { what: "b" }],
  typography_problems: [{ what: "c" }],
  layout_problems: [],
  product_accuracy: [],
  improvement_actions: [],
};
const ANALYSIS_V2 = { ...ANALYSIS_V1, image_hash: "bbbb", issues: [], typography_problems: [{ what: "c" }] };

async function main() {
  // ── Bug #1: concepts after the run ───────────────────────────────────────
  console.log("\nBug #1 — concepts are written after their run");

  const recordSrc = read("lib/persistence/record-generation.ts");
  const body = recordSrc.slice(recordSrc.indexOf("export async function recordGeneration"));

  await check("the run is inserted before intelligence, concepts and assets", () => {
    const run = body.indexOf("infra.runs.record(");
    const intel = body.indexOf("infra.intelligence.persistSafely(");
    const concepts = body.indexOf("recordCreativeMemory(");
    const assets = body.indexOf("recordAssets(");
    assert.ok(run > 0, "run insert not found");
    assert.ok(run < intel && intel < concepts && concepts < assets, `order ${run} ${intel} ${concepts} ${assets}`);
  });

  await check("concept recording is awaited, not fired ahead of the run", () => {
    assert.ok(!/void\s+recordCreativeMemory\(/.test(body), "recordCreativeMemory is still fire-and-forget");
    assert.ok(/await\s+recordCreativeMemory\(/.test(body), "recordCreativeMemory is not awaited");
  });

  await check("a run that failed for a reason other than 'already recorded' stops the children", () => {
    assert.ok(/startsWith\("\[23505\]"\)/.test(body), "no duplicate-key distinction");
  });

  // ── Bug #2: the download signal ──────────────────────────────────────────
  console.log("\nBug #2 — the download signal carries the generation id");

  await check("the asset form is reduced to the generation id", () => {
    assert.strictEqual(generationIdFromSignal("ast_img_gen_1790182092846_sc5r1"), "gen_1790182092846_sc5r1");
    assert.strictEqual(generationIdFromSignal("ast_img_job_pic_1789382262743"), "job_pic_1789382262743");
  });

  await check("a generation id passes through unchanged", () => {
    assert.strictEqual(generationIdFromSignal("gen_1790182092846_sc5r1"), "gen_1790182092846_sc5r1");
    assert.strictEqual(generationIdFromSignal("  job_pic_1  "), "job_pic_1");
    assert.strictEqual(generationIdFromSignal(undefined), "");
  });

  await check("the download button sends the generation id", () => {
    const src = read("features/picture-engine/containers/RenderCanvasContainer.tsx");
    assert.ok(/const signalId = [^;]*asset\.generation_id \|\| asset\.asset_id/.test(src), "the signal id does not prefer the generation id");
    assert.ok(/recordApprovalSignal\("download", signalId\(currentAsset\)\)/.test(src), "download does not use the signal id");
  });

  await check("the generated asset carries the generation id from the response", () => {
    const src = read("features/picture-engine/services/picture-engine.api.ts");
    assert.ok(/generation_id: String\(data\.generationId\)/.test(src), "generation_id is not set");
  });

  // ── Bug #3: vision context ───────────────────────────────────────────────
  console.log("\nBug #3 — the vision loop keeps the design context");

  await check("every design-context key the pipeline attaches is carried", () => {
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    const attached = [...pipeline.matchAll(/\["(\w+)", (?:blueprint|typography|geometry|composition|assetDna|prompt|strategy|visualDna|judgment)\]/g)].map((m) => m[1]);
    assert.ok(attached.length >= 9, `found ${attached.length} attached keys`);
    for (const k of attached) assert.ok(DESIGN_CONTEXT_KEYS.includes(k), `${k} is attached but not carried`);
  });

  await check("a spread copy regains the hidden context, still hidden", () => {
    const source = hidden(hidden({ success: true, imageUrl: "/a" }, "compiledPrompt", "P1"), "creativeBlueprint", { b: 1 });
    const copy = carryDesignContext({ ...source, visionAnalysis: {} }, source);
    assert.strictEqual(copy.compiledPrompt, "P1");
    assert.deepStrictEqual(copy.creativeBlueprint, { b: 1 });
    assert.ok(!JSON.stringify(copy).includes("P1"), "the context leaked into JSON");
  });

  await check("the served render's own context wins over the fallback", () => {
    const second = hidden({ imageUrl: "/b" }, "compiledPrompt", "P2");
    const first = hidden(hidden({ imageUrl: "/a" }, "compiledPrompt", "P1"), "creativeJudgment", { j: 1 });
    const out = carryDesignContext({ ...second }, second, first);
    assert.strictEqual(out.compiledPrompt, "P2");
    assert.deepStrictEqual(out.creativeJudgment, { j: 1 }, "gaps are not filled from the other render");
  });

  await check("with the loop off the result is returned by identity, context intact", async () => {
    const r = hidden({ success: true, imageUrl: "/a" }, "compiledPrompt", "P1");
    const out = await reviewRender(r, { concept: "x" }, { flags: { features: { vision_iteration_v1: false } } }, async () => r);
    assert.strictEqual(out, r);
  });

  await check("every return branch of the review carries context and a trace", () => {
    const src = read("lib/image-engine/evolution/VisionReviewLayer.ts");
    const fn = src.slice(src.indexOf("export async function reviewRender"));
    assert.strictEqual((fn.match(/carryDesignContext\(/g) || []).length, 3, "a branch returns a bare spread");
    assert.strictEqual((fn.match(/withTrace\(/g) || []).length, 3, "a branch drops the trace");
  });

  const traced = hidden(
    hidden({ success: true, imageUrl: "/b", visionAnalysis: ANALYSIS_V2 }, "compiledPrompt", "P2"),
    "visionTrace",
    {
      versions: [
        { version: 1, imageUrl: "/a", prompt: "P1", analysis: ANALYSIS_V1 },
        { version: 2, imageUrl: "/b", prompt: "P2", analysis: ANALYSIS_V2 },
      ],
      instruction: "EXECUTION CORRECTIONS",
      selected: 2,
    },
  );

  await check("both reviews are recorded, each under its own version", () => {
    const rows = reviewRows(traced);
    assert.deepStrictEqual(rows.map((r: { version: number }) => r.version), [1, 2]);
    assert.deepStrictEqual(rows.map((r: { problem_count: number }) => r.problem_count), [3, 1]);
  });

  await check("each iteration keeps its prompt, the V2 correction and its problem count", () => {
    const rows = iterationRows(traced);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(
      rows.map((r: Record<string, unknown>) => [r.version, r.prompt, r.instruction, r.problem_count, r.selected]),
      [
        [1, "P1", null, 3, false],
        [2, "P2", "EXECUTION CORRECTIONS", 1, true],
      ],
    );
  });

  await check("V1 served after a worse V2 is recorded as V1", () => {
    const keptFirst = hidden({ success: true, imageUrl: "/a", visionAnalysis: ANALYSIS_V1 }, "visionTrace", {
      versions: [
        { version: 1, imageUrl: "/a", prompt: "P1", analysis: ANALYSIS_V1 },
        { version: 2, imageUrl: "/b", prompt: "P2", analysis: ANALYSIS_V2 },
      ],
      instruction: "X",
      selected: 1,
    });
    const selected = iterationRows(keptFirst).filter((r: { selected: boolean }) => r.selected);
    assert.deepStrictEqual(selected.map((r: { version: number }) => r.version), [1]);
  });

  await check("a render with no vision pass still records its prompt", () => {
    const plain = hidden({ success: true, imageUrl: "/a" }, "compiledPrompt", "P1");
    const rows = iterationRows(plain);
    assert.deepStrictEqual(rows.map((r: Record<string, unknown>) => [r.version, r.prompt, r.selected]), [[1, "P1", true]]);
    assert.deepStrictEqual(reviewRows(plain), []);
  });

  await check("problem counting is one definition", () => {
    assert.strictEqual(problemCountOf(ANALYSIS_V1), 3);
    assert.strictEqual(problemCountOf(null), 0);
  });

  // ── Bug #4: memory reaches the director ──────────────────────────────────
  console.log("\nBug #4 — memory reaches the director as context");

  await check("no memory leaves the brief unchanged", () => {
    assert.strictEqual(memoryContextBrief([], []), undefined);
    assert.strictEqual(memoryContextBrief(undefined, undefined), undefined);
  });

  await check("memory is framed as observation that the brief outranks", () => {
    const block = memoryContextBrief(["warm natural light"], ["direction: emotional storytelling (kept in 3 of 5 previous renders)"]);
    assert.ok(/observations, not instructions/.test(block), "not framed as observation");
    assert.ok(/outranks every line below/.test(block), "brief precedence not stated");
    assert.ok(block.indexOf("Standing preferences") < block.indexOf("Observed in this workspace"), "lists merged or reordered");
  });

  await check("the director renders memory last, after everything the brief says", () => {
    const src = read("lib/image-engine/evolution/experiment/CreativeDirectorV1.ts");
    const lines = src.slice(src.indexOf("const briefLines = ["));
    const routes = lines.indexOf("brief.routes?.length");
    const memory = lines.indexOf("brief.memoryContext");
    assert.ok(routes > 0 && memory > routes, "memory is not the last block");
  });

  await check("the pipeline gives memory to the director outside design_production_v1", () => {
    const src = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    const call = src.indexOf("memoryContextBrief(decision.standingPreferences");
    // The statement, not a comment that mentions it.
    const production = src.search(/^\s*if \(productionOn\) \{/m);
    assert.ok(call > 0 && call < production, "memory is still gated on the production flag");
    assert.ok(src.indexOf("judge(brief, judgmentFlags)") > call, "the director is judged before memory is attached");
  });

  await check("memory given to the director is not repeated in the render prompt", () => {
    const src = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    assert.ok(/const prefs = memoryContext \? \[\]/.test(src) && /const recalled = memoryContext \? \[\]/.test(src));
  });

  // ── Bug #5: vector memory ────────────────────────────────────────────────
  console.log("\nBug #5 — vector memory is written and searched");

  await check("new patterns are embedded after they are learned", () => {
    const src = read("lib/persistence/record-creative-memory.ts");
    const fn = src.slice(src.indexOf("export async function recordCreativeMemory"));
    const learn = fn.indexOf("learnPatterns(");
    const embed = fn.indexOf("embedNewPatterns(");
    assert.ok(learn > 0 && embed > learn, "embedding is not wired after learning");
  });

  await check("a pattern's embedded text is dimension and value, auditable", () => {
    assert.strictEqual(patternSourceText({ dimension: "direction", value: "emotional storytelling" }), "direction: emotional storytelling");
  });

  await check("an anonymous render embeds nothing", async () => {
    assert.deepStrictEqual(await embedNewPatterns(null, [{ dimension: "direction", value: "x" }]), { embedded: 0, failed: 0 });
  });

  await check("recall searches similar assets through the existing vector search", () => {
    const src = read("lib/persistence/recall-memory.ts");
    assert.ok(/infra\.assetSemantics\.similar\(/.test(src), "asset similarity is not searched");
    assert.ok(/PROVISIONAL_FACET_FLOOR\.identity/.test(src), "no similarity floor");
    assert.ok(/a ranking not a match/.test(src), "a cosine is presented as a match");
  });

  await check("pattern listings never ship vectors", () => {
    const src = fs.readFileSync(path.join(WEB, "..", "..", "packages", "infrastructure", "src", "supabase", "creative-memory.repository.ts"), "utf-8");
    const cols = (src.match(/const PATTERN_LIST_COLUMNS =\s*"([^"]+)"/) || [])[1] || "";
    assert.ok(cols && !/\bembedding\b/.test(cols.replace("embedding_model", "")), "embedding is in the listing");
    const list = src.slice(src.indexOf("async function listPatterns"), src.indexOf("async function similarPatterns"));
    assert.ok(!/select\("\*"\)/.test(list), "listPatterns still selects *");
  });

  // ── Bug #6: identity ─────────────────────────────────────────────────────
  console.log("\nBug #6 — the verified identity reaches the profile");

  await check("the route hands persistence the whole verified identity", () => {
    const src = read("app/api/image/generate-simple/route.ts");
    assert.ok(/identity: verifiedIdentity/.test(src), "only the UID is passed");
  });

  await check("an unknown field never erases a stored one", () => {
    const src = fs.readFileSync(path.join(WEB, "..", "..", "packages", "infrastructure", "src", "supabase", "identity.repository.ts"), "utf-8");
    const fn = src.slice(src.indexOf("export async function upsertProfile"), src.indexOf("export async function resolveActor"));
    assert.ok(!/update\(\{ email: identity\.email \?\? null/.test(fn), "update still nulls missing fields");
    assert.ok(/identity\.email !== undefined/.test(fn) && /identity\.displayName !== undefined/.test(fn));
  });

  await check("a lost first-sign-in race reads the winner instead of failing", () => {
    const src = fs.readFileSync(path.join(WEB, "..", "..", "packages", "infrastructure", "src", "supabase", "identity.repository.ts"), "utf-8");
    assert.ok(/code === "23505"/.test(src));
  });

  // ── found during the real signed-in validation ───────────────────────────
  console.log("\nFound in the live signed-in run");

  await check("a roleless upload is read as the product, matching the upload route", () => {
    const { VisualDNAAnalyzer } = require("./evolution/experiment/VisualDNAAnalyzer");
    const select = (VisualDNAAnalyzer.prototype as { select: (i: unknown[]) => { branch: string }[] }).select;
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const picked = select.call({}, [{ buffer: png, mimeType: "image/png" }]);
    assert.deepStrictEqual(picked.map((p) => p.branch), ["product"]);
    const inspiration = select.call({}, [{ buffer: png, mimeType: "image/png", role: "INSPIRATION_REFERENCE" }]);
    assert.deepStrictEqual(inspiration.map((p) => p.branch), ["reference"], "explicit roles still decide");
  });

  await check("a glossed route name still teaches its route", () => {
    const { extractPreferences, routeLabel } = require("./evolution/experiment/UserKitLearning");
    assert.strictEqual(routeLabel("editorial advertising — a photograph with a point of view"), "editorial advertising");
    assert.strictEqual(routeLabel("warm natural light"), "warm natural light");
    const out = extractPreferences({ selected_direction: "editorial advertising — a photograph with a point of view" });
    assert.deepStrictEqual(out.preferences.map((p: { value: string }) => p.value), ["editorial advertising"]);
  });

  await check("route-selection candidates are stored with their reasoning", () => {
    const { conceptRows } = require("../persistence/record-creative-memory");
    const result = hidden({ success: true }, "creativeJudgment", {
      directions: [],
      selected: "editorial advertising — a photograph with a point of view",
      strategy: {
        routes_offered: ["editorial advertising — a photograph with a point of view", "iconic product composition — the object itself is the idea", "typographic poster"],
        selected: "editorial advertising — a photograph with a point of view",
        selection_reason: "the audience reads magazines, not catalogues",
        runner_up: "iconic product composition — the object itself is the idea",
        why_not_runner_up: "the label is the only distinctive surface and would carry the whole frame",
        candidates: [
          { route: "editorial advertising — a photograph with a point of view", core_idea: "a desk at 7am", visual_language: "window light", why_this_route: "fits calm" },
          { route: "iconic product composition — the object itself is the idea", core_idea: "the bottle alone", visual_language: "hard light", why_this_route: "distinctive glass" },
        ],
      },
    });
    const rows = conceptRows(result);
    const byRoute = (r: string) => rows.find((c: { route: string }) => c.route.startsWith(r));
    assert.strictEqual(rows.length, 3);
    assert.deepStrictEqual(
      [byRoute("editorial").origin, byRoute("editorial").selected, byRoute("editorial").coreIdea, byRoute("editorial").whyThisRoute],
      ["authored", true, "a desk at 7am", "the audience reads magazines, not catalogues"],
    );
    assert.strictEqual(byRoute("iconic").rejectedReason, "the label is the only distinctive surface and would carry the whole frame");
    assert.strictEqual(byRoute("typographic").origin, "offered");
    assert.strictEqual(rows.filter((c: { selected: boolean }) => c.selected).length, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
