import fs from "fs";
import path from "path";
import { toCreativeDecision, applyCreativeDecision } from "./evolution/experiment/CreativeDecision";
import { resolveSelectedDirection } from "./evolution/experiment/CreativeDirectionResolver";
import { buildLayoutContext, renderLayoutContext } from "./evolution/experiment/LayoutContextBridge";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import type { CreativeJudgment } from "./evolution/experiment/CreativeDirectorV1";

/**
 * Phase 0.4 Task 1 — where creative information is generated, lost and transformed.
 *
 *   npx tsx lib/image-engine/run-phase0-transmission-audit.ts
 *
 * Offline, deterministic, no model, no render, no cost.
 *
 * Why a script rather than a document
 * ----------------------------------
 * A written audit is true on the day it is written. This one re-derives itself
 * from the code every time it runs, so a field that stops travelling shows up as
 * a changed table rather than as a stale paragraph nobody re-checks. The last
 * transmission defect in this codebase survived three phases of documents that
 * each described the intended behaviour correctly.
 *
 * The method
 * ----------
 * One set of creative values, expressed twice: once as an explored direction and
 * once as a strategy candidate. Identical content, different branch. Anything
 * that reaches the prompt on one side and not the other is a transmission gap,
 * and the table says exactly which stage dropped it.
 *
 * This traces the CONTROL-MODE path, because that is the path where the decision
 * rewrites the request and the gaps have historically lived. The uncontrolled
 * path appends the whole judgment as a block and is checked separately at the
 * bottom.
 */

// ── one set of values, expressed on both branches ─────────────────────────

const V = {
  name: "process evidence — a photograph that proves the claim",
  core_idea: "chai đặt trên mặt gỗ của quầy pha, vài hạt rang rải quanh chân chai",
  visual_language: "ánh sáng xiên từ một phía, nhãn nửa trong bóng, mặt gỗ mòn sát ống kính",
  why: "khách quen đã tin quán; thứ họ chưa thấy là quy trình",
  selection_reason: "vì lời hứa về nguồn gốc phải kiểm chứng được bằng mắt",
  runner_up: "product-as-hero trên nền vô trùng",
  why_not: "nó lặp lại đúng thứ kệ hàng đã nói",
  emotional_objective: "tin tưởng điềm đạm",
  audience_reaction: "muốn thử vì thấy thật",
};

const REASONING = {
  camera: { choice: "85mm, ngang tầm ngực", reason: "sản phẩm đọc đúng tỉ lệ của nó" },
  lighting: { choice: "một nguồn chính, một tấm hắt", reason: "chất liệu quan trọng hơn không khí" },
  composition: { choice: "chai lệch trái một phần ba", reason: "mắt có một chỗ để dừng" },
  typography: { choice: "không vẽ chữ", reason: "chữ được ghép sau" },
  colour: { choice: "bảng màu của chính sản phẩm dẫn", reason: "nhận diện trước trang trí" },
};

const SHARED = {
  reasoning: REASONING,
  brand: {
    personality: "điềm đạm, thủ công",
    positioning: "quán cà phê khu phố, không phải chuỗi",
    emotional_territory: "quán quen của khu phố",
    audience_perception: "nơi người ta biết tên mình",
    inferred: "từ giọng điệu của brief",
  },
  consumer: {
    viewer: "khách quen buổi sáng",
    first_feeling: "nhận ra chỗ quen",
    trust_driver: "thấy hạt thật và mặt gỗ thật",
    desire_driver: "hơi lạnh đọng trên vỏ chai",
    intended_action: "ghé mua trước 9h",
    attention: { first_second: "sản phẩm", then: "mặt gỗ", finally: "vùng chữ" },
  },
  semantics: [
    { element: "hạt rang rải quanh chân chai", meaning: "nguồn gốc kiểm chứng được" },
    { element: "mặt gỗ mòn", meaning: "quán đã ở đây lâu" },
  ],
  generic_check: {
    flagged: ["nền studio mặc định của ngành"],
    justification: "thay bằng một mặt bàn thật của quán",
    revised: true,
  },
};

const EXPLORATION = {
  directions: [
    {
      name: V.name,
      core_idea: V.core_idea,
      visual_language: V.visual_language,
      why_it_fits: V.why,
      emotional_objective: V.emotional_objective,
      audience_reaction: V.audience_reaction,
    },
  ],
  selected: V.name,
  selection_reason: V.selection_reason,
  rejected_reason: V.why_not,
  ...SHARED,
} as unknown as CreativeJudgment;

const STRATEGY = {
  directions: [],
  selected: "",
  selection_reason: "",
  strategy: {
    candidates: [
      {
        route: V.name,
        core_idea: V.core_idea,
        visual_language: V.visual_language,
        why_this_route: V.why,
        emotional_objective: V.emotional_objective,
        audience_reaction: V.audience_reaction,
        assessment: {},
      },
    ],
    selected: V.name,
    selection_reason: V.selection_reason,
    runner_up: V.runner_up,
    why_not_runner_up: V.why_not,
    routes_offered: [V.name, V.runner_up, "quiet product portrait"],
    routes_developed: [V.name, V.runner_up],
  },
  ...SHARED,
} as unknown as CreativeJudgment;

// ── the payload we care about, and how to find it at each stage ───────────

type Probe = { label: string; value: string };

/** The creative execution payload, named once so every stage is asked the same questions. */
const PAYLOAD: Probe[] = [
  { label: "direction name", value: V.name },
  { label: "scene (what happens)", value: V.core_idea },
  { label: "visual language (how rendered)", value: V.visual_language },
  { label: "why this direction", value: V.why },
  { label: "selection reason", value: V.selection_reason },
  { label: "rejected / tradeoff", value: V.why_not },
  { label: "camera", value: REASONING.camera.choice },
  { label: "lighting", value: REASONING.lighting.choice },
  { label: "composition", value: REASONING.composition.choice },
  { label: "typography", value: REASONING.typography.choice },
  { label: "emotional objective", value: V.emotional_objective },
  { label: "audience reaction", value: V.audience_reaction },
  { label: "brand territory", value: SHARED.brand.emotional_territory },
  { label: "intended action", value: SHARED.consumer.intended_action },
  { label: "element semantics", value: SHARED.semantics[0].element },
  { label: "anti-generic justification", value: SHARED.generic_check.justification },
];

const COMPILED = [
  "## ROLE",
  "Make one photograph.",
  "",
  "## CREATIVE INTENT",
  "__CONCEPT__",
  "",
  "## USER HARD REQUIREMENTS",
  "__HARD__",
  "",
  "## COMMERCIAL LAYOUT",
  "- Top 12% reserved for the logo.",
  "",
  "## FINAL OUTPUT",
  "Return one photograph.",
].join("\n");

/** Walks one branch through every stage and records where each value survives. */
function trace(j: CreativeJudgment, bridgeOn: boolean, layoutOn = true) {
  const stages: { stage: string; text: string }[] = [];

  stages.push({ stage: "1 director (judgment)", text: JSON.stringify(j) });

  const resolved = resolveSelectedDirection(j);
  stages.push({ stage: "2 resolver", text: JSON.stringify(resolved) });

  const decision = toCreativeDecision(j);
  stages.push({ stage: "3 CreativeDecision", text: JSON.stringify(decision) });

  const req = applyCreativeDecision(
    { concept: "brief", useCase: "poster", aspectRatio: "1:1", hardRequirements: [] } as any,
    decision!,
    false
  );
  stages.push({ stage: "4 rewritten request", text: [req.concept, ...(req.hardRequirements || [])].join("\n") });

  const layout = layoutOn
    ? renderLayoutContext(buildLayoutContext({ judgment: j, productCount: 1 }))
    : "";
  stages.push({ stage: "5 LayoutContextBridge", text: layout });

  const compiled = COMPILED.replace("__CONCEPT__", req.concept).replace(
    "__HARD__",
    (req.hardRequirements || []).map((h: string) => `- ${h}`).join("\n")
  );
  const prompt = NanoBananaPromptComposer.compose(
    compiled,
    j,
    true, // control mode
    undefined,
    layout || undefined,
    false,
    undefined,
    bridgeOn
  );
  stages.push({ stage: "6 final provider prompt", text: prompt });

  return { stages, prompt, decision, resolved };
}

const L = (s = "") => console.log(s);
const bar = "=".repeat(78);
const out: string[] = [];
const say = (s = "") => {
  out.push(s);
  L(s);
};

say(bar);
say("Phase 0.4 Task 1 — transmission audit of the CreativeDecision flow");
say(bar);
say("  One set of creative values, expressed on both branches. Identical content.");
say("  Anything present on one side and absent on the other is a transmission gap.");
say("  Control mode, bridge ON. Offline, deterministic, no model, no render.");
say("");

const expl = trace(EXPLORATION, true);
const strat = trace(STRATEGY, true);

const STAGES = expl.stages.map((s) => s.stage);

for (const stage of STAGES) {
  const e = expl.stages.find((s) => s.stage === stage)!.text;
  const s = strat.stages.find((x) => x.stage === stage)!.text;
  const rows = PAYLOAD.map((p) => ({
    label: p.label,
    e: e.includes(p.value),
    s: s.includes(p.value),
  }));
  const gaps = rows.filter((r) => r.e !== r.s);
  say("-".repeat(78));
  say(`${stage}     ${gaps.length ? `${gaps.length} BRANCH GAP(S)` : "branches agree"}`);
  say("-".repeat(78));
  say(`  ${"payload field".padEnd(34)}${"exploration".padEnd(14)}strategy`);
  for (const r of rows) {
    const mark = (b: boolean) => (b ? "yes" : "NO ");
    say(`  ${r.label.padEnd(34)}${mark(r.e).padEnd(14)}${mark(r.s)}${r.e !== r.s ? "   <-- GAP" : ""}`);
  }
  say("");
}

// ── what neither branch carries ───────────────────────────────────────────

say("-".repeat(78));
say("DROPPED ON BOTH BRANCHES (not a gap — a ceiling)");
say("-".repeat(78));
const finalE = expl.stages[expl.stages.length - 1].text;
const finalS = strat.stages[strat.stages.length - 1].text;
const droppedBoth = PAYLOAD.filter((p) => !finalE.includes(p.value) && !finalS.includes(p.value));
if (droppedBoth.length) {
  for (const p of droppedBoth) say(`  ${p.label}`);
  say("");
  say("  These reach the judgment and never reach the renderer on EITHER branch.");
  say("  Equivalent, and equivalently absent. Fixing them is a scope decision, not");
  say("  a transmission repair — which is why they are listed rather than changed.");
} else {
  say("  none — every tracked field reaches the prompt on at least one branch");
}
say("");

// ── the same comparison with the layout bridge OFF ────────────────────────
//
// This is the configuration that matters, and the one the first pass of this
// audit missed. `layout_context_bridge_v1` is an independent flag; with it off
// there is no LAYOUT CONTEXT block, and anything that reached the prompt ONLY
// through that block stops reaching it. Equivalence that depends on a second,
// unrelated flag being on is not equivalence.

say("-".repeat(78));
say("SAME COMPARISON, LAYOUT CONTEXT BRIDGE OFF");
say("-".repeat(78));
const explNoLayout = trace(EXPLORATION, true, false);
const stratNoLayout = trace(STRATEGY, true, false);
const eNL = explNoLayout.prompt;
const sNL = stratNoLayout.prompt;
const noLayoutGaps = PAYLOAD.filter((p) => eNL.includes(p.value) !== sNL.includes(p.value));
say(`  ${"payload field".padEnd(34)}${"exploration".padEnd(14)}strategy`);
for (const p of PAYLOAD) {
  const e = eNL.includes(p.value);
  const s = sNL.includes(p.value);
  say(`  ${p.label.padEnd(34)}${(e ? "yes" : "NO ").padEnd(14)}${s ? "yes" : "NO "}${e !== s ? "   <-- GAP" : ""}`);
}
say("");
if (noLayoutGaps.length) {
  say(`  ${noLayoutGaps.length} gap(s) appear when the layout bridge is off.`);
  say("  Meaning: the branches are only equivalent because LAYOUT CONTEXT happens to");
  say("  carry what CreativeDecision does not. That is compensation by an unrelated");
  say("  flag, not equivalence.");
} else {
  say("  No gaps. Equivalence does not depend on the layout bridge.");
}
say("");

// ── uncontrolled path, for contrast ───────────────────────────────────────

say("-".repeat(78));
say("UNCONTROLLED PATH (the whole judgment is appended as a block)");
say("-".repeat(78));
for (const [name, j] of [["exploration", EXPLORATION], ["strategy", STRATEGY]] as const) {
  const p = NanoBananaPromptComposer.compose(COMPILED, j, false, undefined, undefined, false, undefined, false);
  const missing = PAYLOAD.filter((x) => !p.includes(x.value)).map((x) => x.label);
  say(`  ${name.padEnd(14)}${PAYLOAD.length - missing.length}/${PAYLOAD.length} fields present${missing.length ? `   missing: ${missing.join(", ")}` : ""}`);
}
say("");

// ── verdict ───────────────────────────────────────────────────────────────

const finalGaps = PAYLOAD.filter((p) => finalE.includes(p.value) !== finalS.includes(p.value));
const allGaps = [...finalGaps, ...noLayoutGaps.filter((g) => !finalGaps.includes(g))];
say(bar);
if (allGaps.length) {
  say(`VERDICT: ${allGaps.length} branch gap(s)`);
  for (const g of finalGaps) say(`  - ${g.label}   (layout bridge ON)`);
  for (const g of noLayoutGaps.filter((x) => !finalGaps.includes(x))) {
    say(`  - ${g.label}   (only when the layout bridge is OFF)`);
  }
} else {
  say("VERDICT: no branch gaps at the provider prompt, with or without the layout bridge.");
  say("Both branches deliver the same creative execution payload.");
}
say(bar);

const file = path.join(process.cwd(), "data", "benchmarks", "phase0-transmission-audit.txt");
try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join("\n") + "\n", "utf-8");
  L(`audit written: ${file}`);
} catch (err: any) {
  L(`audit NOT written: ${err?.message || err}`);
}

process.exit(allGaps.length ? 1 : 0);
