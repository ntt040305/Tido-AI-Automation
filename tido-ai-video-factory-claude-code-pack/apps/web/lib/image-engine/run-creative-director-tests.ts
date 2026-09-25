/**
 * Phase 4 — Creative Director platform. Offline: no model, no database.
 *
 * The live half is `lib/persistence/verify-creative-director.ts`.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  evaluateDirections,
  applyEvaluation,
  renderRouteEvidence,
  routeConfidence,
  MIN_EVIDENCE_RUNS,
  OVERRIDE_MARGIN,
} = require("./evolution/experiment/DirectionEvaluator");
const { resolveSelectedDirection } = require("./evolution/experiment/CreativeDirectionResolver");
const { toCreativeDecision } = require("./evolution/experiment/CreativeDecision");
const { learnFromRejection, learnFromSignal } = require("./evolution/experiment/UserKitLearning");
const { emptyKit, preferenceDecisions } = require("./evolution/experiment/UserKit");
const { correctionNeededMs, visionReserveMs, withinMs } = require("./evolution/VisionReviewLayer");
const { conceptRows } = require("../persistence/record-creative-memory");
const { reviewRows, decisionRows } = require("../persistence/record-generation");
const { routeEvidenceFrom } = require("../persistence/recall-memory");
const { patternQualifies, patternConfidence, MIN_PATTERN_SUPPORT } = require("@tido/shared");

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

const verdict = (stance: string, because = "", evidence = "quoted from the brief") => ({ stance, because, evidence });
const assess = (s: Partial<Record<string, string>>) => ({
  product: verdict(s.product || "supports", "the stoneware reads as handmade", "unglazed stoneware"),
  audience: verdict(s.audience || "supports", "office workers want calm"),
  objective: verdict(s.objective || "supports", "promotion needs the offer read"),
  brand: verdict(s.brand || "neutral", "no brand history given"),
  channel: verdict(s.channel || "supports", "square feed post"),
  feasibility: verdict(s.feasibility || "supports", "one product, one surface"),
});

const EDITORIAL = "editorial advertising — a photograph with a point of view";
const ICONIC = "iconic product composition — the object itself is the idea";
const METAPHOR = "conceptual metaphor — the idea is carried by an image";

function judgment(overrides: Record<string, unknown> = {}) {
  return {
    directions: [],
    selected: "",
    selection_reason: "",
    reasoning: {
      camera: { choice: "waist-high 50mm", reason: "editorial" },
      lighting: { choice: "window light from the left", reason: "morning" },
      composition: { choice: "product lower third, desk context", reason: "story" },
      typography: { choice: "serif headline top left", reason: "magazine" },
      colour: { choice: "warm neutrals", reason: "calm" },
    },
    strategy: {
      routes_offered: [EDITORIAL, ICONIC, METAPHOR],
      routes_developed: [EDITORIAL, ICONIC, METAPHOR],
      selected: EDITORIAL,
      selection_reason: "the audience reads magazines, not catalogues",
      runner_up: ICONIC,
      why_not_runner_up: "the label alone would carry the frame",
      candidates: [
        {
          route: EDITORIAL, core_idea: "a desk at 7am", visual_language: "window light, shallow depth",
          composition: "product lower third, desk context", typography: "serif headline top left",
          lighting: "soft window light from the left", why_this_route: "fits calm",
          assessment: assess({}),
        },
        {
          route: ICONIC, core_idea: "the bottle alone, monumental", visual_language: "hard key light, seamless",
          composition: "bottle centred, low angle, fills two thirds", typography: "bold sans across the base",
          lighting: "hard key from above, rim light", why_this_route: "distinctive glass",
          assessment: assess({ brand: "supports" }),
        },
        {
          route: METAPHOR, core_idea: "a sunrise inside the bottle", visual_language: "surreal",
          composition: "", typography: "", lighting: "",
          why_this_route: "memorable", assessment: assess({ feasibility: "works_against", product: "neutral" }),
        },
      ],
    },
    ...overrides,
  };
}

async function main() {
  // ── 4.1 ──────────────────────────────────────────────────────────────────
  console.log("\n4.1 — creative directions are complete concepts");

  await check("the director's contract asks every candidate for composition, typography and lighting", () => {
    const src = read("lib/image-engine/evolution/experiment/CreativeDirectorV1.ts");
    const contract = src.slice(src.indexOf('"candidates": ['), src.indexOf('"selected": "<the route you chose'));
    for (const f of ["core_idea", "visual_language", "composition", "typography", "lighting", "why_this_route"]) {
      assert.ok(contract.includes(`"${f}"`), `${f} missing from the candidate contract`);
    }
  });

  await check("each concept is stored with title, direction, visual language, craft and reasoning", () => {
    const j = applyEvaluation(judgment(), evaluateDirections(judgment(), {}));
    const result = Object.defineProperty({}, "creativeJudgment", { value: j, enumerable: false });
    const rows = conceptRows(result);
    const ed = rows.find((r: { route: string }) => r.route === EDITORIAL);
    assert.strictEqual(ed.coreIdea, "a desk at 7am");
    assert.strictEqual(ed.visualLanguage, "window light, shallow depth");
    assert.deepStrictEqual(
      [ed.details.composition, ed.details.typography, ed.details.lighting],
      ["product lower third, desk context", "serif headline top left", "soft window light from the left"],
    );
    assert.ok(ed.details.assessment?.product, "the assessment is not stored");
    assert.ok(ed.whyThisRoute, "no reasoning");
  });

  // ── 4.2 ──────────────────────────────────────────────────────────────────
  console.log("\n4.2 — every direction is evaluated");

  await check("every candidate gets a score, strengths, weaknesses and a risk", () => {
    const e = evaluateDirections(judgment(), { productObserved: true });
    assert.strictEqual(e.evaluations.length, 3);
    for (const x of e.evaluations) {
      assert.ok(x.score >= 0 && x.score <= 1, `score ${x.score}`);
      assert.ok(Array.isArray(x.strengths) && Array.isArray(x.weaknesses));
      assert.ok(["low", "medium", "high"].includes(x.risk.level) && x.risk.reason);
    }
    const metaphor = e.evaluations.find((x: { route: string }) => x.route === METAPHOR);
    assert.strictEqual(metaphor.risk.level, "high", "a route that cannot be produced is not high risk");
    assert.ok(metaphor.weaknesses.some((w: string) => w.startsWith("feasibility")));
  });

  await check("the product verdict counts as grounded only when the product was actually observed", () => {
    const seen = evaluateDirections(judgment(), { productObserved: true }).evaluations[0];
    const unseen = evaluateDirections(judgment(), { productObserved: false }).evaluations[0];
    assert.strictEqual(seen.signals.product_grounded, true);
    assert.strictEqual(unseen.signals.product_grounded, false);
  });

  await check("history below the threshold moves nothing", () => {
    const base = evaluateDirections(judgment(), {}).evaluations[0].score;
    const thin = evaluateDirections(judgment(), {
      evidence: [{ route: EDITORIAL, runs: MIN_EVIDENCE_RUNS - 1, kept: 0, rejected: 2, problems: 9 }],
    }).evaluations[0];
    assert.strictEqual(thin.score, base, "two renders changed a score");
    assert.strictEqual(thin.signals.route_confidence, null);
    assert.strictEqual(routeConfidence({ route: "x", runs: 2, kept: 2, rejected: 0, problems: 0 }), null);
  });

  await check("history above the threshold moves the score both ways, with its reason", () => {
    const base = evaluateDirections(judgment(), {}).evaluations[0].score;
    const kept = evaluateDirections(judgment(), { evidence: [{ route: EDITORIAL, runs: 4, kept: 4, rejected: 0, problems: 4 }] }).evaluations[0];
    const lost = evaluateDirections(judgment(), { evidence: [{ route: EDITORIAL, runs: 4, kept: 0, rejected: 4, problems: 4 }] }).evaluations[0];
    assert.ok(kept.score > base && lost.score < base, `${lost.score} < ${base} < ${kept.score}`);
    assert.ok(kept.strengths.some((s: string) => /kept in 4 of 4/.test(s)));
    assert.ok(lost.weaknesses.some((s: string) => /rejected in 4 of 4/.test(s)));
  });

  await check("vision history is read: a route that keeps producing problems is marked down", () => {
    const clean = evaluateDirections(judgment(), { evidence: [{ route: EDITORIAL, runs: 3, kept: 1, rejected: 1, problems: 3 }] }).evaluations[0];
    const noisy = evaluateDirections(judgment(), { evidence: [{ route: EDITORIAL, runs: 3, kept: 1, rejected: 1, problems: 24 }] }).evaluations[0];
    assert.ok(noisy.score < clean.score);
    assert.ok(noisy.weaknesses.some((w: string) => /vision problems/.test(w)));
  });

  await check("evidence recorded under the glossed and bare route name is one route", () => {
    const e = evaluateDirections(judgment(), {
      evidence: [
        { route: EDITORIAL, runs: 2, kept: 0, rejected: 2, problems: 0 },
        { route: "editorial advertising", runs: 2, kept: 0, rejected: 2, problems: 0 },
      ],
    }).evaluations[0];
    assert.strictEqual(e.signals.runs, 4);
  });

  // ── 4.3 ──────────────────────────────────────────────────────────────────
  console.log("\n4.3 — selection");

  await check("with no history the director's choice always stands, and the reason says why", () => {
    const e = evaluateDirections(judgment(), {});
    assert.strictEqual(e.source, "director");
    assert.strictEqual(e.selected, EDITORIAL);
    assert.ok(/magazines/.test(e.reasoning), "the director's own reason is not in the explanation");
  });

  const against = { route: EDITORIAL, runs: 4, kept: 0, rejected: 4, problems: 4, preference: "avoid" };

  await check("memory overrules only on thresholded negative evidence, with a margin, to a renderable route", () => {
    const e = evaluateDirections(judgment(), { evidence: [against] });
    assert.strictEqual(e.source, "memory_override");
    assert.strictEqual(e.selected, ICONIC, "the unrenderable metaphor route must never be switched to");
    assert.ok(/set aside/.test(e.set_aside_reason) && /rejected in 4 of 4/.test(e.set_aside_reason));
    const pick = e.evaluations.find((x: { route: string }) => x.route === EDITORIAL);
    const alt = e.evaluations.find((x: { route: string }) => x.route === ICONIC);
    assert.ok(alt.score - pick.score >= OVERRIDE_MARGIN);
  });

  await check("no override without a margin, even against the evidence", () => {
    const j = judgment();
    // Make the alternative weak enough that it no longer clears the margin.
    j.strategy.candidates[1].assessment = assess({ product: "works_against", audience: "neutral", objective: "neutral" });
    const e = evaluateDirections(j, { evidence: [against] });
    assert.strictEqual(e.source, "director");
  });

  await check("an override is coherent all the way to the render decision", () => {
    const j = applyEvaluation(judgment(), evaluateDirections(judgment(), { evidence: [against] }));
    assert.strictEqual(j.strategy.selected, ICONIC);
    assert.strictEqual(j.strategy.runner_up, EDITORIAL);
    assert.ok(/set aside/.test(j.strategy.why_not_runner_up));
    const resolved = resolveSelectedDirection(j);
    assert.strictEqual(resolved.name, ICONIC);
    const decision = toCreativeDecision(j);
    assert.strictEqual(decision.scene_definition, "the bottle alone, monumental");
    assert.strictEqual(decision.lighting_decision, "hard key from above, rim light");
    assert.strictEqual(decision.composition_decision, "bottle centred, low angle, fills two thirds");
    assert.strictEqual(decision.typography_decision, "bold sans across the base");
    assert.strictEqual(decision.camera_decision, "", "the set-aside route's camera leaked into the new scene");
  });

  await check("the stored record says what was chosen, what was set aside and why", () => {
    const j = applyEvaluation(judgment(), evaluateDirections(judgment(), { evidence: [against] }));
    const rows = conceptRows(Object.defineProperty({}, "creativeJudgment", { value: j, enumerable: false }));
    const chosen = rows.find((r: { selected: boolean }) => r.selected);
    const setAside = rows.find((r: { route: string }) => r.route === EDITORIAL);
    assert.strictEqual(chosen.route, ICONIC);
    assert.ok(/selected over the director's first choice/.test(chosen.whyThisRoute));
    assert.strictEqual(chosen.evaluation.selection.source, "memory_override");
    assert.ok(/magazines/.test(chosen.evaluation.selection.director_reason), "the director's own reason was lost");
    assert.ok(/set aside/.test(setAside.rejectedReason));
    assert.ok(rows.every((r: { score: number | null; origin: string }) => r.origin !== "authored" || typeof r.score === "number"));
  });

  await check("the director reads route history before choosing, framed as evidence", () => {
    const text = renderRouteEvidence([EDITORIAL, ICONIC], [
      { route: EDITORIAL, runs: 4, kept: 3, rejected: 0, problems: 6 },
      { route: ICONIC, runs: 1, kept: 0, rejected: 0, problems: 0, preference: "avoid" },
    ]);
    assert.ok(/evidence, not instructions/.test(text));
    assert.ok(/editorial advertising: made 4 times, kept 3, rejected 0/.test(text));
    assert.ok(/iconic product composition: made 1 time\(s\) — too few renders to judge; this person has repeatedly turned it down/.test(text));
    assert.strictEqual(renderRouteEvidence([METAPHOR], [{ route: EDITORIAL, runs: 4, kept: 0, rejected: 0, problems: 0 }]), undefined);
  });

  // ── 4.4 ──────────────────────────────────────────────────────────────────
  console.log("\n4.4 — the director guides generation");

  await check("both director paths evaluate before anything renders", () => {
    const src = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    const concurrent = src.slice(src.indexOf("if (!controlled) {"), src.indexOf("await new CreativeDirectorV1().judge(brief, judgmentFlags)"));
    assert.ok(/\.then\(\(raw\) => direct\(raw\)\)/.test(concurrent), "the concurrent path is not evaluated");
    assert.ok(/direct\(await new CreativeDirectorV1\(\)\.judge\(brief, judgmentFlags\), Date\.now\(\) - judgeStart\)/.test(src), "the controlled path is not evaluated");
    assert.ok(src.indexOf("routeEvidence = renderRouteEvidence(routes, decision.routeEvidence)") < src.indexOf("await new CreativeDirectorV1().judge"));
  });

  await check("the route carries route evidence to the engine as numbers", () => {
    const route = read("app/api/image/generate-simple/route.ts");
    assert.ok(/routeEvidence,\s*\n\s*\/\/ The same deadline/.test(route) || /routeEvidence,/.test(route));
    const router = read("lib/image-engine/evolution/PipelineRouter.ts");
    assert.ok(/routeEvidence\?: RouteEvidence\[\]/.test(router));
  });

  // ── 4.5 ──────────────────────────────────────────────────────────────────
  console.log("\n4.5 — vision feedback refines the chosen direction");

  await check("the correction pass reuses the chosen direction instead of choosing again", () => {
    const router = read("lib/image-engine/evolution/PipelineRouter.ts");
    assert.ok(/pinnedJudgment: \(\(result as unknown as Record<string, unknown>\)\.creativeJudgment/.test(router));
    const src = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    assert.ok(/decision\.pinnedJudgment\s*\?\s*Promise\.resolve\(decision\.pinnedJudgment\)/.test(src), "concurrent path re-judges");
    assert.ok(/const judgment = decision\.pinnedJudgment\s*\?\s*decision\.pinnedJudgment/.test(src), "control path re-judges");
  });

  await check("the second render is estimated without the director call it no longer makes", () => {
    const full = correctionNeededMs({ firstRenderMs: 80_000, deadlineAt: 0 }, 20_000);
    const pinned = correctionNeededMs({ firstRenderMs: 80_000, deadlineAt: 0, directorMs: 30_000 }, 20_000);
    assert.strictEqual(full - pinned, 30_000 * 1.25);
    assert.strictEqual(visionReserveMs(20_000), 30_000);
    assert.strictEqual(visionReserveMs(5_000), 20_000, "the reserve fell below its floor");
    assert.strictEqual(visionReserveMs(90_000), 60_000, "the reserve exceeded the analyzer's own timeout");
  });

  await check("a second render that would outrun the deadline is abandoned, not awaited", async () => {
    const slow = new Promise((r) => setTimeout(() => r("late"), 200));
    assert.strictEqual(await withinMs(slow, 20), null);
    assert.strictEqual(await withinMs(Promise.resolve("ok"), 50), "ok");
    assert.strictEqual(await withinMs(Promise.reject(new Error("x")), 50), null, "a rejection escaped");
  });

  const analysis = (n: number) => ({ analyzed_image: true, issues: Array.from({ length: n }, () => ({ what: "x" })), typography_problems: [], layout_problems: [], product_accuracy: [] });
  const traced = (versions: object[], selected: number) =>
    Object.defineProperty(
      { success: true, imageUrl: "/b", designDecisions: { typography_decisions: [{ role: "headline", decision: "raise", applied: true, decision_confidence: "high" }], layout_decisions: [] } },
      "visionTrace",
      { value: { versions, instruction: "CORRECTIONS: raise the headline", selected, comparison: { recommendation: "second", improved: ["headline"] } }, enumerable: false },
    );

  await check("the iteration is recorded: why it happened, what changed, what improved", () => {
    const rows = reviewRows(traced([
      { version: 1, imageUrl: "/a", prompt: "P1", analysis: analysis(4) },
      { version: 2, imageUrl: "/b", prompt: "P2", analysis: analysis(1) },
    ], 2));
    const v2 = rows.find((r: { version: number }) => r.version === 2);
    assert.deepStrictEqual(v2.findings.iteration.why, { v1_problems: 4, v2_problems: 1 });
    assert.ok(/raise the headline/.test(v2.findings.iteration.what_changed));
    assert.deepStrictEqual(v2.findings.iteration.what_improved.improved, ["headline"]);
    assert.strictEqual(v2.findings.iteration.served, "v2");
  });

  await check("a design decision is 'applied' only when a corrected render exists", () => {
    const none = decisionRows(traced([{ version: 1, imageUrl: "/a", prompt: "P1", analysis: analysis(4) }], 1));
    const done = decisionRows(traced([
      { version: 1, imageUrl: "/a", prompt: "P1", analysis: analysis(4) },
      { version: 2, imageUrl: "/b", prompt: "P2", analysis: analysis(1) },
    ], 2));
    assert.strictEqual(none[0].applied, false);
    assert.strictEqual(done[0].applied, true);
  });

  // ── 4.6 ──────────────────────────────────────────────────────────────────
  console.log("\n4.6 — learning from both directions, never from one event");

  await check("one rejection teaches nothing yet; three of the same route become 'avoid'", () => {
    let kit = emptyKit("u");
    const intel = { selected_direction: EDITORIAL };
    kit = learnFromRejection(kit, intel).kit;
    assert.strictEqual(preferenceDecisions(kit).length, 0, "a single rejection became a preference");
    kit = learnFromRejection(learnFromRejection(kit, intel).kit, intel).kit;
    const d = preferenceDecisions(kit);
    assert.deepStrictEqual(d.map((x: { negative: boolean; decision: { value: string } }) => [x.negative, x.decision.value]), [[true, "Avoid: editorial advertising"]]);
  });

  await check("a regenerate never counts as approval", () => {
    const r = learnFromSignal(emptyKit("u"), { kind: "repeat_edit", generation_id: "g", at: "", intelligence: { selected_direction: EDITORIAL } });
    assert.strictEqual(r.learned, 0);
    const src = read("lib/user-kit/kit-memory.ts");
    const fn = src.slice(src.indexOf("export async function recordApproval"));
    assert.ok(fn.indexOf("NEGATIVE_KINDS as readonly string[]).includes(kind)") < fn.indexOf("markRunApproved("), "negative kinds reach the approval path first");
    assert.ok(/markRunRejected\(actor, runUuid\(generationId\)\)/.test(fn));
  });

  await check("rejections withhold a pattern only past the threshold", () => {
    const p = { support_count: 4, approved_count: 1, problem_count: 0 };
    assert.strictEqual(patternQualifies({ ...p, rejected_count: MIN_PATTERN_SUPPORT - 1 }), true);
    assert.strictEqual(patternQualifies({ ...p, rejected_count: MIN_PATTERN_SUPPORT }), false);
    assert.strictEqual(patternConfidence({ support_count: 2, approved_count: 2 }), null);
    assert.strictEqual(patternConfidence({ support_count: 4, approved_count: 3, rejected_count: 1 }), 0.5);
  });

  await check("route evidence joins pattern history with thresholded preferences", () => {
    let kit = emptyKit("u");
    for (let i = 0; i < 3; i++) kit = learnFromRejection(kit, { selected_direction: ICONIC }).kit;
    const ev = routeEvidenceFrom(
      [{ dimension: "direction", value: EDITORIAL, support_count: 5, approved_count: 2, rejected_count: 1, problem_count: 7 }],
      kit,
    );
    const ed = ev.find((e: { route: string }) => e.route === EDITORIAL);
    const ic = ev.find((e: { route: string }) => /iconic/.test(e.route));
    assert.deepStrictEqual([ed.runs, ed.kept, ed.rejected, ed.problems], [5, 2, 1, 7]);
    assert.strictEqual(ic.preference, "avoid");
  });

  await check("the UI emits approve, reject and regenerate signals", () => {
    const c = read("features/picture-engine/containers/RenderCanvasContainer.tsx");
    assert.ok(/recordApprovalSignal\(kind, id\)/.test(c) && /handleVerdict\("reject"\)/.test(c) && /handleVerdict\("approve"\)/.test(c));
    assert.ok(/recordApprovalSignal\("repeat_edit", previous\)/.test(c));
    assert.ok(/!kept\[previous\] && !feedback\[previous\]/.test(c), "a regenerate after keeping would count as a rejection");
  });

  // ── Typography constraint ────────────────────────────────────────────────
  console.log("\nTypography constraint — exactly the user's text, or none");

  const {
    resolveTextRequirement, textDirective, checkRenderedText, NO_TEXT_TYPOGRAPHY,
  } = require("./compiler/ExactCopyIntegrityValidator");
  const { enforceTextRequirement, textRequirementBrief } = require("./evolution/experiment/CreativeDirectorV1");
  const { VisionAnalyzerService } = require("./evolution/experiment/VisionAnalyzerService");

  const SUMMER = resolveTextRequirement({ contentMessage: "Summer Sale 50%" });
  const MULTI = resolveTextRequirement({ contentMessage: "Cà phê sáng Origin Blend\n  Giảm 20% tuần này  \n\nĐặt ngay tại tido.vn" });
  const NONE = resolveTextRequirement({ contentMessage: "   \n  " });

  await check("case 1: one line becomes the exact requirement", () => {
    assert.deepStrictEqual(SUMMER, { mode: "exact", lines: ["Summer Sale 50%"] });
  });

  await check("case 2: every line is kept, in order, character for character", () => {
    assert.deepStrictEqual(MULTI.lines, ["Cà phê sáng Origin Blend", "Giảm 20% tuần này", "Đặt ngay tại tido.vn"]);
    const merged = resolveTextRequirement({ contentMessage: "A", copyItems: ["B", { text: "A" }] });
    assert.deepStrictEqual(merged.lines, ["A", "B"], "explicit copy is authorized, duplicates are not repeated");
  });

  await check("case 3: nothing typed means no text", () => {
    assert.deepStrictEqual(NONE, { mode: "none", lines: [] });
    assert.strictEqual(resolveTextRequirement({}).mode, "none");
  });

  await check("the render prompt ends with the exact instruction for each case", () => {
    const exact = textDirective(MULTI);
    assert.ok(/use exactly the provided text/i.test(exact));
    for (const l of MULTI.lines) assert.ok(exact.includes(`"${l}"`), `line missing: ${l}`);
    assert.ok(/do not rewrite, replace, shorten, summarize, translate or extend/.test(exact));
    const none = textDirective(NONE);
    assert.ok(/Do not add any typography or text\./.test(none));
    assert.ok(/printed on the uploaded product itself/.test(none), "no product-label exception");
  });

  await check("the stable compiler states the same two instructions", () => {
    const src = read("lib/image-engine/compiler/MasterPromptCompilerService.ts");
    assert.ok(/"Use exactly the provided text\. The strings below are the only words/.test(src));
    assert.ok(/"Do not add any typography or text\. No copy is authorized/.test(src));
  });

  await check("the experiment prompt appends the directive last, after the blueprint", () => {
    const src = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    // Phase 5.6 resolves the directive first, because in Editable mode it is a
    // thunk carrying the typography plan, which does not exist until the
    // execution block has run. The property is unchanged: it goes last.
    assert.ok(/const directive = typeof textDirectiveText === "function"/.test(src), "the directive is not resolved");
    assert.ok(/const finalPrompt = directive \? `\$\{withBlueprint\}/.test(src));
    // Phase 5.5 named the expression `finalDirective` rather than repeating it
    // at both call sites, so this counts the two PATHS that pass it -- which is
    // the property that matters -- and that the directive is what it holds.
    assert.ok(/textDirective\(textRequirement\)\].filter\(Boolean\)/.test(src), "the final directive no longer carries the text requirement");
    assert.strictEqual((src.match(/^\s+finalDirective,$/gm) || []).length, 2, "a director path skips the directive");
    assert.ok(/copyItems: textRequirement\.lines/.test(src), "the blueprint plans type for unauthorized copy");
    assert.ok(/brief = \{ \.\.\.brief, textRequirement \}/.test(src), "the director's brief lacks the requirement");
  });

  await check("only typed text becomes copy: concept extraction is not rendered, and no-upload renders carry the field", () => {
    const adapter = read("lib/image-engine/service/SimpleInputAdapterService.ts");
    assert.ok(/const copyItems: CopyItemInput\[\] = \[\];/.test(adapter), "extracted concept copy still becomes copy");
    const api = read("features/picture-engine/services/picture-engine.api.ts");
    const json = api.slice(api.indexOf("body: JSON.stringify({"));
    assert.ok(/contentMessage: brief\.content_message\.trim\(\)/.test(json.slice(0, 600)), "the JSON path drops the field");
  });

  await check("the director is told the requirement in its brief", () => {
    assert.ok(/exactly these lines, verbatim, and no other words/.test(textRequirementBrief(SUMMER)));
    assert.ok(textRequirementBrief(SUMMER).includes('"Summer Sale 50%"'));
    const none = textRequirementBrief(NONE);
    assert.ok(/TEXT: NONE/.test(none) && none.includes(NO_TEXT_TYPOGRAPHY));
    const src = read("lib/image-engine/evolution/experiment/CreativeDirectorV1.ts");
    assert.ok(/flags\.copyRoles && brief\.textRequirement\?\.mode !== "none"/.test(src), "copy roles requested for an image with no text");
  });

  const inventive = () => ({
    ...judgment(),
    copy_roles: [{ text: "Wake up calm", role: "HEADLINE", reason: "invented" }, { text: "Summer Sale 50%", role: "HEADLINE", reason: "supplied" }],
    strategy: {
      ...judgment().strategy,
      candidates: judgment().strategy.candidates.map((c: Record<string, unknown>, i: number) =>
        i === 0
          ? { ...c, core_idea: 'A desk at 7am. The headline "Wake up calm" sits above the bottle.', typography: 'serif headline "Wake up calm" top left' }
          : c,
      ),
    },
  });

  await check("no text: the director's invented words and type plans are removed", () => {
    const { judgment: j, removed } = enforceTextRequirement(inventive(), NONE);
    assert.deepStrictEqual(j.copy_roles, []);
    assert.strictEqual(j.reasoning.typography.choice, NO_TEXT_TYPOGRAPHY);
    for (const c of j.strategy.candidates) assert.strictEqual(c.typography, NO_TEXT_TYPOGRAPHY);
    assert.strictEqual(j.strategy.candidates[0].core_idea, "A desk at 7am.", "the invented headline sentence survived");
    assert.ok(removed.length > 0, "the violation was not recorded");
    const decision = toCreativeDecision(j);
    assert.strictEqual(decision.typography_decision, NO_TEXT_TYPOGRAPHY);
  });

  await check("exact text: only the supplied line survives; invented copy is removed", () => {
    const { judgment: j } = enforceTextRequirement(inventive(), SUMMER);
    assert.deepStrictEqual(j.copy_roles.map((r: { text: string }) => r.text), ["Summer Sale 50%"]);
    assert.ok(!JSON.stringify(j.strategy.candidates).includes("Wake up calm"));
    assert.ok(!/Wake up calm/.test(String(j.strategy.candidates[0].typography || "")), "invented copy left in the typography plan");
    assert.ok(!/Wake up calm/.test(j.strategy.candidates[0].core_idea), "invented copy left in the idea");
  });

  await check("evaluation marks down a route that invents text, and records compliance", () => {
    const e = evaluateDirections(inventive(), { textRequirement: NONE });
    const bad = e.evaluations.find((x: { route: string }) => x.route === EDITORIAL);
    const good = e.evaluations.find((x: { route: string }) => x.route === METAPHOR);
    assert.strictEqual(bad.signals.typography_compliant, false);
    assert.strictEqual(bad.risk.level, "high");
    assert.ok(bad.weaknesses.some((w: string) => /typography: adds text to an image that must carry none/.test(w)));
    assert.strictEqual(good.signals.typography_compliant, true, "a route with no type plan is compliant");
    const plain = evaluateDirections(inventive(), {}).evaluations.find((x: { route: string }) => x.route === EDITORIAL);
    assert.ok(Math.abs(plain.score - bad.score - 0.15) < 1e-9, `penalty was ${plain.score - bad.score}, expected 0.15`);
  });

  await check("vision check: exact text passes, even set across two lines", () => {
    assert.strictEqual(checkRenderedText([{ text: "Summer Sale 50%" }], SUMMER).compliant, true);
    assert.strictEqual(checkRenderedText([{ text: "Summer Sale" }, { text: "50%" }], SUMMER).compliant, true);
  });

  await check("vision check: missing, incorrect and extra text are each reported", () => {
    const missing = checkRenderedText([], SUMMER);
    assert.deepStrictEqual(missing.missing, ["Summer Sale 50%"]);
    const wrong = checkRenderedText([{ text: "Summer Sal 50%" }], SUMMER);
    assert.deepStrictEqual(wrong.incorrect, [{ expected: "Summer Sale 50%", rendered: "Summer Sal 50%" }]);
    assert.strictEqual(wrong.compliant, false);
    const number = checkRenderedText([{ text: "Summer Sale 30%" }], SUMMER);
    assert.strictEqual(number.compliant, false, "a changed number was accepted");
    const accents = checkRenderedText([{ text: "Ca phe sang Origin Blend" }, { text: "Giảm 20% tuần này" }, { text: "Đặt ngay tại tido.vn" }], MULTI);
    assert.strictEqual(accents.incorrect.length, 1, "a dropped accent was accepted");
    const extra = checkRenderedText([{ text: "Summer Sale 50%" }, { text: "Limited time only" }], SUMMER);
    assert.deepStrictEqual(extra.unwanted, ["Limited time only"]);
  });

  await check("vision check: all-caps is a typographic treatment, reported but not a violation", () => {
    // Exactly what the live case-1 render did: the words split and set in capitals.
    const caps = checkRenderedText([{ text: "SUMMER SALE" }, { text: "50%" }], SUMMER);
    assert.strictEqual(caps.compliant, true);
    assert.deepStrictEqual(caps.case_styled, [{ expected: "Summer Sale 50%", rendered: "SUMMER SALE 50%" }]);
    // Capitals keep Vietnamese accents; losing them is still wrong.
    const viOk = checkRenderedText([{ text: "MUA 2 TẶNG 1" }], resolveTextRequirement({ contentMessage: "Mua 2 tặng 1" }));
    assert.strictEqual(viOk.compliant, true);
    const viBad = checkRenderedText([{ text: "MUA 2 TANG 1" }], resolveTextRequirement({ contentMessage: "Mua 2 tặng 1" }));
    assert.strictEqual(viBad.compliant, false, "capitals without the accent were accepted");
  });

  await check("vision check: no text means any generated text is unwanted -- the product's own label is not", () => {
    const clean = checkRenderedText([{ text: "COLD BREW COFFEE", on_product: true }], NONE);
    assert.strictEqual(clean.compliant, true, "the product label was treated as generated text");
    const dirty = checkRenderedText([{ text: "COLD BREW COFFEE", on_product: true }, { text: "Wake up calm", on_product: false }], NONE);
    assert.deepStrictEqual(dirty.unwanted, ["Wake up calm"]);
  });

  await check("vision review reports text violations as typography problems, computed not asked", async () => {
    const provider = (reply: object) => ({ name: "t", async analyzeImage() { return JSON.stringify(reply); } });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
    const none = await new VisionAnalyzerService(provider({ visible_text: [{ text: "Wake up calm", on_product: false }] }))
      .analyze({ image: png, textRequirement: NONE });
    assert.deepStrictEqual(none.text_check.unwanted, ["Wake up calm"]);
    assert.ok(none.typography_problems.some((p: { what: string }) => /unwanted generated text/.test(p.what)));
    const exact = await new VisionAnalyzerService(provider({ visible_text: [{ text: "Summer Sale 50%", on_product: false }] }))
      .analyze({ image: png, textRequirement: SUMMER });
    assert.strictEqual(exact.text_check.compliant, true);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
