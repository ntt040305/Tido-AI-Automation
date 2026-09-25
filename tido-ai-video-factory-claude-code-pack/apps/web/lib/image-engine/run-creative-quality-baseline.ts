import fs from "fs";
import path from "path";

/**
 * Phase 5.6.1 — the creative quality baseline.
 *
 *   npx tsx --env-file=.env.local lib/image-engine/run-creative-quality-baseline.ts           (dry run)
 *   npx tsx --env-file=.env.local lib/image-engine/run-creative-quality-baseline.ts --live    (renders)
 *   ... --live --only=beauty_serum_luxury      one brief
 *   ... --score-only=<runId>                   re-score an existing run without rendering
 *
 * Dry by default: a live pass makes twelve real renders against a paid provider.
 * `--live` is the switch that says somebody meant it.
 *
 * WHAT THIS IS FOR
 * ----------------
 * One question, asked before and after the PromptAssembler: did creative quality
 * move? Everything here exists to make that comparison honest --
 *
 *   - the same twelve briefs every time, frozen in the dataset
 *   - the REAL production pipeline, not a test path: the same PipelineRouter a
 *     public request goes through, with the same flags
 *   - MEASURED facts separated from JUDGED opinion, never averaged together
 *   - the run stored whole, so a later run can be diffed against it rather than
 *     compared from memory
 *
 * It does not modify anything. Nothing in `evolution/`, `compiler/` or
 * `service/` is imported except to be called exactly as production calls it.
 */

import sharp from "sharp";
import { BENCHMARK_BRIEFS, QUALITY_DIMENSIONS, type BenchmarkBrief } from "./benchmark/creative-quality-dataset";
import { measureRun, judgeRender, mean, type CaseResult } from "./benchmark/CreativeQualityJudge";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--live");
const ONLY = (argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const SCORE_ONLY = (argv.find((a) => a.startsWith("--score-only=")) || "").split("=")[1] || "";
const NO_JUDGE = argv.includes("--no-judge");

const WEB = process.cwd();
const OUT_ROOT = path.join(WEB, "data", "benchmarks", "creative-quality");

/* eslint-disable @typescript-eslint/no-require-imports */
const { PipelineRouter } = require("./evolution/PipelineRouter");
const { LLMProviderService } = require("./llm/llm-provider.service");

/**
 * Counts model calls for the run, by wrapping the provider for the duration.
 *
 * In the harness only. Production is never patched: this file is not imported
 * by anything that renders, and the original is restored in a finally block.
 */
function countLlmCalls(): { stop: () => number } {
  const proto = LLMProviderService.prototype;
  const original = proto.generateChatCompletion;
  let n = 0;
  proto.generateChatCompletion = function (...args: unknown[]) {
    n++;
    return original.apply(this, args);
  };
  return {
    stop: () => {
      proto.generateChatCompletion = original;
      return n;
    },
  };
}

function loadImage(brief: BenchmarkBrief, which: "productImage" | "logoImage", role: string, index: number) {
  const rel = brief[which];
  if (!rel) return null;
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) {
    console.warn(`  ! ${brief.id}: ${which} missing at ${rel}; continuing without it`);
    return null;
  }
  return {
    reference_id: `REF_${String(index).padStart(2, "0")}`,
    buffer: fs.readFileSync(p),
    mimeType: "image/png",
    filename: path.basename(p),
    role,
  };
}

async function runBrief(brief: BenchmarkBrief, runDir: string): Promise<CaseResult> {
  const images = [
    loadImage(brief, "productImage", "PRODUCT", 1),
    loadImage(brief, "logoImage", "LOGO", 2),
  ].filter(Boolean);

  const request = {
    images,
    concept: brief.concept,
    ...(brief.contentMessage ? { contentMessage: brief.contentMessage } : {}),
    useCase: brief.useCase,
    aspectRatio: brief.aspectRatio,
    ...(brief.brandName ? { brandName: brief.brandName } : {}),
    requestId: `bench-${brief.id}-${Date.now()}`,
  };

  const counter = countLlmCalls();
  const started = Date.now();
  let result: Record<string, any>;
  let llmCalls = 0;
  try {
    // The production entry point, called exactly as the render route calls it.
    result = await PipelineRouter.run(request as never, undefined, { deadlineAt: Date.now() + 280_000 });
  } finally {
    llmCalls = counter.stop();
  }
  const durationMs = Date.now() - started;

  const measured = measureRun(result, durationMs, llmCalls);
  const gen = result.generationId ?? null;

  // The artefacts, copied beside the result so a stored run is self-contained.
  let imagePath: string | null = null;
  if (gen) {
    const src = path.join(WEB, "data", "generated", "image-renders", gen);
    const dst = path.join(runDir, "cases", brief.id);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ["output.png", "output.webp", "master_prompt.md", "metadata.json"]) {
      const from = path.join(src, f);
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(dst, f));
        if (f.startsWith("output")) imagePath = path.join(dst, f);
      }
    }
    // The provider returns webp. The judge sends a PNG data URL, so one is
    // written beside it -- a format conversion, not a change to the render.
    if (imagePath && imagePath.endsWith(".webp")) {
      const png = path.join(dst, "output.png");
      try {
        await sharp(imagePath).png().toFile(png);
        imagePath = png;
      } catch (e) {
        console.warn(`  ! ${brief.id}: could not convert webp to png: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // The reasoning behind the picture, for anyone auditing a score later.
    fs.writeFileSync(
      path.join(dst, "decisions.json"),
      JSON.stringify(
        {
          brief,
          routing: result.routingDecision ?? null,
          judgment: result.creativeJudgment ?? null,
          blueprint: result.creativeBlueprint ?? null,
          typography: result.typographySystem ?? null,
          geometry: result.layoutGeometry ?? null,
          design_document: result.designDocument ?? null,
          vision: result.visionTrace ?? result.visionAnalysis ?? null,
          creative_intelligence: result.creativeIntelligence ?? null,
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  const out: CaseResult = {
    brief_id: brief.id,
    category: brief.category,
    generation_id: gen,
    image_path: imagePath ? path.relative(runDir, imagePath) : null,
    measured,
    judged: null,
  };

  if (!NO_JUDGE && imagePath && imagePath.endsWith(".png")) {
    try {
      out.judged = await judgeRender(imagePath, brief);
    } catch (e) {
      out.judge_error = e instanceof Error ? e.message : String(e);
    }
  } else if (imagePath && !imagePath.endsWith(".png")) {
    out.judge_error = "the render is not a PNG; the judge was not run";
  }
  return out;
}

function report(cases: CaseResult[]): string {
  const L: string[] = [];
  const ok = cases.filter((c) => c.measured.rendered);
  const judged = cases.filter((c) => c.judged?.length);

  const dimMean = (key: string) => mean(judged.map((c) => c.judged!.find((s) => s.key === key)?.score ?? 0));
  const overall = mean(judged.flatMap((c) => c.judged!.map((s) => s.score)));

  L.push("# TIDO CREATIVE QUALITY BASELINE REPORT", "");
  L.push(`Cases: ${cases.length} · rendered: ${ok.length} · scored: ${judged.length}`, "");

  L.push("## Overall score (JUDGED — a model's opinion, uncalibrated)", "");
  L.push(`**${overall ?? "n/a"} / 10** across ${judged.length} images and six dimensions.`, "");
  L.push("| Dimension | Mean |", "|---|---|");
  for (const d of QUALITY_DIMENSIONS) L.push(`| ${d.title} | ${dimMean(d.key) ?? "n/a"} |`);
  L.push("");

  L.push("## Measured facts (computed, not judged)", "");
  const withText = ok.filter((c) => c.measured.text_exact !== null);
  const exact = withText.filter((c) => c.measured.text_exact).length;
  const collisions = ok.filter((c) => (c.measured.type_product_collisions ?? 0) > 0).length;
  const degraded = ok.filter((c) => !c.measured.director_judged).length;
  L.push(`- Renders that succeeded: **${ok.length}/${cases.length}**`);
  L.push(`- Exact text reproduced: **${exact}/${withText.length}** briefs that asked for text`);
  L.push(`- Briefs where type crossed the product: **${collisions}/${ok.length}**`);
  L.push(`- Runs that degraded (no director judgment): **${degraded}/${ok.length}**`);
  L.push(`- Mean prompt size: **${mean(ok.map((c) => c.measured.prompt_chars)) ?? "n/a"}** chars`);
  L.push(`- Mean headroom to the ceiling: **${mean(ok.map((c) => c.measured.prompt_headroom)) ?? "n/a"}** chars`);
  L.push(`- Mean latency: **${Math.round((mean(ok.map((c) => c.measured.duration_ms)) ?? 0) / 1000)}s** · mean model calls: **${mean(ok.map((c) => c.measured.llm_calls)) ?? "n/a"}** · mean image renders: **${mean(ok.map((c) => c.measured.image_renders)) ?? "n/a"}**`);
  L.push("");

  L.push("## Category breakdown (JUDGED)", "");
  L.push("| Category | " + QUALITY_DIMENSIONS.map((d) => d.title.split(" ")[0]).join(" | ") + " | Mean |");
  L.push("|---" .repeat(QUALITY_DIMENSIONS.length + 2) + "|");
  for (const cat of [...new Set(cases.map((c) => c.category))]) {
    const inCat = judged.filter((c) => c.category === cat);
    if (!inCat.length) { L.push(`| ${cat} | ${"n/a | ".repeat(QUALITY_DIMENSIONS.length)}n/a |`); continue; }
    const cells = QUALITY_DIMENSIONS.map((d) => mean(inCat.map((c) => c.judged!.find((s) => s.key === d.key)?.score ?? 0)) ?? 0);
    L.push(`| ${cat} | ${cells.join(" | ")} | ${mean(cells) ?? "n/a"} |`);
  }
  L.push("");

  L.push("## Per case", "");
  L.push("| Brief | Rendered | Text exact | Collisions | Judged mean |", "|---|---|---|---|---|");
  for (const c of cases) {
    const m = c.judged ? mean(c.judged.map((s) => s.score)) : null;
    L.push(
      `| ${c.brief_id} | ${c.measured.rendered ? "yes" : "NO"} | ${c.measured.text_exact === null ? "—" : c.measured.text_exact ? "yes" : "NO"} | ${c.measured.type_product_collisions ?? "—"} | ${m ?? "n/a"} |`,
    );
  }
  L.push("");

  // Weakest dimensions first: the ranking is the point of the whole exercise.
  const ranked = QUALITY_DIMENSIONS.map((d) => ({ d, v: dimMean(d.key) ?? 0 })).sort((a, b) => a.v - b.v);
  L.push("## Weakest dimensions", "");
  for (const { d, v } of ranked.slice(0, 3)) L.push(`- **${d.title} — ${v}**: ${d.question}`);
  L.push("", "## Strongest dimensions", "");
  for (const { d, v } of ranked.slice(-2).reverse()) L.push(`- **${d.title} — ${v}**`);
  L.push("");

  L.push("## What a JUDGED number is worth here", "");
  L.push(
    "These six scores are a vision model's opinion of images produced by a system built from models. " +
      "That bias is real and probably generous, so the number is an INDEX for comparison, not a verdict on quality. " +
      "It answers 'did this change move it', not 'is this good'. Score a blind human review of the same run " +
      "(`human-review-packet.json`) to calibrate it.",
  );
  return L.join("\n");
}

async function main() {
  const briefs = ONLY ? BENCHMARK_BRIEFS.filter((b) => b.id === ONLY) : BENCHMARK_BRIEFS;
  if (!briefs.length) {
    console.error(`No brief matches --only=${ONLY}`);
    process.exit(1);
  }

  if (SCORE_ONLY) {
    const runDir = path.join(OUT_ROOT, SCORE_ONLY);
    const file = path.join(runDir, "baseline.json");
    if (!fs.existsSync(file)) { console.error(`No run at ${file}`); process.exit(1); }
    const stored = JSON.parse(fs.readFileSync(file, "utf-8"));
    for (const c of stored.cases as CaseResult[]) {
      const brief = BENCHMARK_BRIEFS.find((b) => b.id === c.brief_id);
      if (!brief || !c.image_path) continue;
      let img = path.join(runDir, c.image_path);
      if (img.endsWith(".webp")) {
        const png = img.replace(/\.webp$/, ".png");
        if (!fs.existsSync(png)) await sharp(img).png().toFile(png);
        img = png;
      }
      if (!fs.existsSync(img)) continue;
      try {
        c.judged = await judgeRender(img, brief);
        console.log(`  scored ${c.brief_id}: ${mean(c.judged.map((s) => s.score))}`);
      } catch (e) {
        c.judge_error = e instanceof Error ? e.message : String(e);
        console.log(`  ! ${c.brief_id}: ${c.judge_error}`);
      }
    }
    fs.writeFileSync(file, JSON.stringify(stored, null, 2), "utf-8");
    fs.writeFileSync(path.join(runDir, "REPORT.md"), report(stored.cases), "utf-8");
    console.log(`\nRescored. ${path.join(runDir, "REPORT.md")}`);
    return;
  }

  if (!LIVE) {
    console.log("\nDRY RUN — nothing is rendered and nothing is spent.\n");
    console.log(`Briefs: ${briefs.length}`);
    for (const b of briefs) {
      console.log(
        `  ${b.id.padEnd(28)} ${b.category.padEnd(11)} ${b.aspectRatio.padEnd(5)} ${b.contentMessage ? "text" : "no-text"}${b.productImage ? " +product" : ""}${b.logoImage ? " +logo" : ""}`,
      );
    }
    console.log(`\nA live pass renders ${briefs.length} images against the paid provider.`);
    console.log("Re-run with --live when you mean it.\n");
    return;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(OUT_ROOT, runId);
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  console.log(`\nLIVE baseline — ${briefs.length} briefs -> ${runDir}\n`);

  const cases: CaseResult[] = [];
  for (const [i, brief] of briefs.entries()) {
    process.stdout.write(`[${i + 1}/${briefs.length}] ${brief.id} ... `);
    try {
      const c = await runBrief(brief, runDir);
      cases.push(c);
      const m = c.judged ? mean(c.judged.map((s) => s.score)) : null;
      console.log(
        `${c.measured.rendered ? "ok" : "FAILED"} ${Math.round(c.measured.duration_ms / 1000)}s` +
          `${c.measured.text_exact === null ? "" : c.measured.text_exact ? " text:exact" : " text:WRONG"}` +
          `${m === null ? "" : ` judged:${m}`}${c.judge_error ? ` judge_error:${c.judge_error.slice(0, 40)}` : ""}`,
      );
    } catch (e) {
      console.log(`THREW: ${e instanceof Error ? e.message : String(e)}`);
      cases.push({
        brief_id: brief.id, category: brief.category, generation_id: null, image_path: null,
        measured: measureRun({ success: false }, 0, 0), judged: null,
        judge_error: e instanceof Error ? e.message : String(e),
      });
    }
    // Written after every case, so an interrupted pass keeps what it earned.
    fs.writeFileSync(
      path.join(runDir, "baseline.json"),
      JSON.stringify({ run_id: runId, created_at: new Date().toISOString(), dataset_size: BENCHMARK_BRIEFS.length, cases }, null, 2),
      "utf-8",
    );
  }

  // A blind packet: images renamed so a human scoring them cannot see which
  // brief or which system version produced which picture.
  const packet = cases
    .filter((c) => c.image_path)
    .map((c, i) => ({ blind_id: `case_${String(i + 1).padStart(2, "0")}`, brief_id: c.brief_id, image: c.image_path }));
  fs.writeFileSync(
    path.join(runDir, "human-review-packet.json"),
    JSON.stringify({ run_id: runId, dimensions: QUALITY_DIMENSIONS, cases: packet }, null, 2),
    "utf-8",
  );

  fs.writeFileSync(path.join(runDir, "REPORT.md"), report(cases), "utf-8");
  console.log(`\n${report(cases)}\n`);
  console.log(`Stored: ${runDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
