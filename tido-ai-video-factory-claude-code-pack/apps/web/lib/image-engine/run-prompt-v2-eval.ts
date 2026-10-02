/**
 * v1 against v2 on 24 briefs. Mock by default: no API call, no cost.
 *
 *   npx tsx lib/image-engine/run-prompt-v2-eval.ts
 *   npx tsx lib/image-engine/run-prompt-v2-eval.ts --label-text=off
 *   npx tsx lib/image-engine/run-prompt-v2-eval.ts --case=centella_pair_poster_1x1_326chars --show
 *
 * WHAT THE MOCK NUMBER MEANS, AND WHAT IT DOES NOT
 * -----------------------------------------------
 * The mock model is a template that obeys the v2 rules. So a mock run measures the
 * HARNESS -- the playbooks, the linter, the copy policy, the fallback -- and proves
 * the rules are satisfiable. It says nothing about whether a real model writes a
 * better brief, and it must never be quoted as if it did. For that, see
 * `run-prompt-v2-eval-live.ts`, which costs money and asks first.
 *
 * Latency and cost are reported as estimates with their basis stated, because an
 * estimate labelled as a measurement is worse than no number.
 */
import fs from "fs";
import path from "path";

import { EVAL_CASES, type EvalCase } from "./prompt-v2/eval/cases";
import { buildV2Prompt, type V2BuildResult } from "./prompt-v2/build";
import { playbookFor, renderPlaybook } from "./prompt-v2/playbooks";
import { lintMasterPrompt } from "./prompt-v2/linter";
import { ratioSentence } from "./prompt-v2/director";
import { buildV1Prompt } from "./run-prompt-engine-golden-tests";
import type { GoldenFixture } from "./prompt-v2/golden-fixtures";
import { resolveTextRequirement } from "./compiler/ExactCopyIntegrityValidator";

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const SHOW = args.includes("--show");
const LABEL_TEXT = (arg("label-text") || "on") !== "off";
const ONLY = arg("case");
const OUT = path.join(__dirname, "prompt-v2", "eval", "out");

/**
 * The mock creative director: a template that follows the v2 rules.
 *
 * It exists to exercise the harness, not to stand in for judgement. It writes no
 * idea worth the name and says so: `big_idea` is derived from the concept, which is
 * exactly the move the audit criticised in v1. The point is that the plumbing --
 * budgets, quoting, the ratio sentence, the fallback -- holds.
 */
function mockDirector(c: EvalCase): string {
  const pb = playbookFor(c.assetType, c.aspectRatio);
  const lines = resolveTextRequirement({ contentMessage: c.contentMessage }).lines;
  const budget = pb.copy_budget.max_strings;
  const used = lines.slice(0, budget).map((l) => (l.split(/\s+/).length > pb.copy_budget.headline_max_words ? l.split(/\s+/).slice(0, pb.copy_budget.headline_max_words).join(" ") : l));
  const products = c.products.map((p, i) => ({
    ref_index: i + 1,
    look: p.description,
    ...(LABEL_TEXT && p.labelText ? { label_text: p.labelText } : {}),
  }));

  const productSentence = products.length
    ? products
        .map((p) => `The ${p.look} stands exactly as in attached photo ${p.ref_index}, its label unchanged and no words added to it that are not already there`)
        .join(". ") + "."
    : "There is no product in this frame; the scene carries the idea on its own.";

  const copyPara = used.length
    ? used
        .map((t, i) => {
          const role = i === 0 ? "the largest text in the frame" : i === used.length - 1 && used.length > 1 ? "a short action line, smallest of all" : "a supporting line, smaller and lighter";
          return `The line "${t}" is set as ${role}, in a quiet modern sans, dark warm grey, sitting in the open area rather than over the product.`;
        })
        .join(" ")
    : "No words appear anywhere in the frame.";

  const prose = [
    `This is a ${pb.id} at ${c.aspectRatio} for ${c.brand}${c.productLine ? `, from its ${c.productLine} line` : ""}.`,
    productSentence,
    `The scene: ${c.concept} The staging is plain and the surface it stands on is ordinary, so nothing competes with the subject.`,
    `Light comes from one side and a little behind, so the subject throws a long shadow that softens as it travels, and the surface brightens toward the light and darkens away from it. The air is still.`,
    `Composition: ${pb.layout}. ${pb.subject}.`,
    copyPara,
    `The mood is calm and matter of fact. Surfaces read as real: glass has weight, paper has grain, metal takes light along one edge rather than glowing.`,
    `No other text. No extra logos or brand marks. No people. ${ratioSentence(c.aspectRatio)}`,
  ].join("\n\n");

  // Padded to the word budget the way a real reply would be, by describing more of
  // the scene rather than by repeating anything.
  const words = prose.split(/\s+/).length;
  const filler =
    words < 210
      ? "\n\nNearer the edge of the frame the surface falls into shade and the detail gives way, which keeps the eye where it belongs. Reflections stay small and stay where a real reflection would fall. Nothing in the frame is tilted, nothing is cropped by an edge, and no element overlaps another except where one object genuinely stands in front of the next."
      : "";

  return JSON.stringify({
    asset_analysis: `A ${pb.id} at ${c.aspectRatio}. ${pb.job}.`,
    products,
    big_idea: `${c.concept.split(/[.,]/)[0]} — stated as one picture rather than as a list of features.`,
    hierarchy: [products.length ? "the product" : "the scene", used[0] ? "the headline" : "the empty space", used[1] ? "the supporting line" : "the surface detail"],
    layout: pb.layout,
    copy: used.map((t, i) => ({ role: i === 0 ? "headline" : i === used.length - 1 ? "cta" : "subline", text: t, position: "in the open area" })),
    warnings: lines.length > budget ? [`${lines.length} strings supplied, ${budget} used: the rest would not read at this size`] : [],
    master_prompt: prose + filler,
  });
}

function asFixture(c: EvalCase): GoldenFixture {
  return {
    id: c.id,
    assetType: c.assetType,
    aspectRatio: c.aspectRatio,
    concept: c.concept,
    contentMessage: c.contentMessage,
    brandName: c.brand,
    productLine: c.productLine,
    products: c.products.map((p, i) => ({ ref: i + 1, description: p.description, labelText: p.labelText })),
  };
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

async function main(): Promise<void> {
  const cases = ONLY ? EVAL_CASES.filter((c) => c.id === ONLY) : EVAL_CASES;
  if (!cases.length) {
    console.error(`no case named ${ONLY}. Available:\n  ${EVAL_CASES.map((c) => c.id).join("\n  ")}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  console.log(`\nv1 vs v2 — ${cases.length} brief(s), MOCK model, label_text=${LABEL_TEXT ? "on" : "off"}`);
  console.log("The mock measures the harness, not the model. It cannot say v2 writes better briefs.\n");
  console.log(
    pad("case", 34) + pad("v1 words", 9) + pad("v2 words", 9) + pad("v1 lint", 9) + pad("v2 lint", 9) + pad("policy", 8) + "calls",
  );
  console.log("-".repeat(96));

  let v1Pass = 0;
  let v2Pass = 0;
  let v1Words = 0;
  let v2Words = 0;
  let calls = 0;
  let adapted = 0;
  const v2Codes = new Map<string, number>();
  const v1Codes = new Map<string, number>();
  let startedAt = Date.now();

  for (const c of cases) {
    const pb = playbookFor(c.assetType, c.aspectRatio);
    const copy = resolveTextRequirement({ contentMessage: c.contentMessage }).lines;

    const v1 = buildV1Prompt(asFixture(c));
    const v1Lint = lintMasterPrompt(v1, { copy, aspectRatio: c.aspectRatio, playbook: pb });

    const v2: V2BuildResult = await buildV2Prompt(
      {
        assetType: c.assetType,
        aspectRatio: c.aspectRatio,
        concept: c.concept,
        brand: c.brand,
        productLine: c.productLine,
        copy,
        products: c.products.map((p, i) => ({ ref_index: i + 1, description: p.description })),
        includeLabelText: LABEL_TEXT,
        notes: c.notes,
      },
      { chat: async () => mockDirector(c) },
    );

    const v2Prompt = v2.prompt || "";
    v1Words += words(v1);
    v2Words += words(v2Prompt);
    if (v1Lint.ok) v1Pass++;
    if (v2.ok) v2Pass++;
    calls += v2.llmCalls;
    if (v2.copyPolicy === "adapt") adapted++;
    for (const e of v1Lint.errors) v1Codes.set(e.code, (v1Codes.get(e.code) ?? 0) + 1);
    for (const e of v2.lint?.errors || []) v2Codes.set(e.code, (v2Codes.get(e.code) ?? 0) + 1);

    console.log(
      pad(c.id, 34) +
        pad(String(words(v1)), 9) +
        pad(String(words(v2Prompt)), 9) +
        pad(v1Lint.ok ? "pass" : `${v1Lint.errors.length} err`, 9) +
        pad(v2.ok ? "pass" : `${(v2.lint?.errors || []).length} err`, 9) +
        pad(v2.copyPolicy, 8) +
        String(v2.llmCalls),
    );

    fs.writeFileSync(path.join(OUT, `${c.id}.v1.txt`), v1, "utf8");
    fs.writeFileSync(path.join(OUT, `${c.id}.v2.txt`), v2Prompt || `(fell back: ${v2.reason})`, "utf8");
    if (SHOW && cases.length === 1) {
      console.log(`\n--- PLAYBOOK ---\n${renderPlaybook(pb)}`);
      console.log(`\n--- V2 PROMPT (${words(v2Prompt)} words) ---\n${v2Prompt || v2.reason}`);
      console.log(`\n--- V2 WARNINGS ---\n${v2.warnings.join("\n") || "(none)"}`);
    }
  }

  const n = cases.length;
  const elapsed = Date.now() - startedAt;
  console.log("-".repeat(96));
  console.log(
    pad("MEAN / TOTAL", 34) +
      pad(String(Math.round(v1Words / n)), 9) +
      pad(String(Math.round(v2Words / n)), 9) +
      pad(`${v1Pass}/${n}`, 9) +
      pad(`${v2Pass}/${n}`, 9) +
      pad(`${adapted} adapt`, 8) +
      String(calls),
  );

  console.log("\nLINT FAILURES BY CODE");
  const allCodes = [...new Set([...v1Codes.keys(), ...v2Codes.keys()])].sort();
  console.log(`  ${pad("code", 24)} v1    v2`);
  for (const code of allCodes) console.log(`  ${pad(code, 24)} ${pad(String(v1Codes.get(code) ?? 0), 6)}${v2Codes.get(code) ?? 0}`);

  console.log("\nCOST AND LATENCY");
  console.log(`  v2 model calls this run      ${calls} (mock, so free)`);
  console.log(`  v2 calls per job             ${(calls / n).toFixed(2)}`);
  console.log(`  v1 model calls per job       4-5 on the image path (Marketing Brain, director, blueprint, vision review), measured at 4.9 on the 12-case benchmark`);
  console.log(`  harness wall clock           ${elapsed}ms for ${n} briefs, no network`);
  console.log(`  ESTIMATE ONLY: a real v2 call is one request of roughly 1,500 prompt tokens plus the product images, and 600-900 completion tokens.`);
  console.log(`                 Multiply by your own per-token price; this script does not guess it.`);
  console.log(`\nPrompts written to ${OUT}`);
  console.log(`Run \`--case=<id> --show\` to read one, and \`--label-text=off\` for the A/B.\n`);
}

void main();
