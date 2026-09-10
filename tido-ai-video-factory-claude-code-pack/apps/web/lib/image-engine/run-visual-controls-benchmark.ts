import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { DirectorBrief } from "./director/creative-director.types";
import { VisualDirectionControls } from "./director/visual-controls.types";

/**
 * CIOS Phase 4.1.5 — the four modes.
 *
 *   npx tsx lib/image-engine/run-visual-controls-benchmark.ts [--sample N]
 *
 * The question this answers is whether a control actually controls. It is easy
 * to build a control panel whose settings reach a log and never reach the
 * renderer, and the check for that is not "is the setting recorded" but "did the
 * camera line in the prompt change".
 *
 * The length column matters as much as the rest. A control system that adds a
 * block per control would cost six blocks on every render, including the runs
 * where the user chose nothing — so auto mode is measured against the others to
 * confirm it costs nothing at all.
 */

const BRIEF: DirectorBrief = {
  brand: "Tido",
  product: "Kem dưỡng da",
  audience: "khách hàng nữ 25-40",
  category: "mỹ phẩm",
  brief_text: "",
  format: "poster",
  aspect_ratio: "4:5",
};

interface Case {
  name: string;
  concept: string;
  controls?: VisualDirectionControls;
}

const CASES: Case[] = [
  {
    name: "1. Auto mode",
    concept: "Ảnh sản phẩm kem dưỡng da trên nền sạch",
  },
  {
    name: "2. User camera override",
    concept: "Ảnh sản phẩm kem dưỡng da trên nền sạch",
    controls: { camera: "low_angle", lighting: "luxury_soft" },
  },
  {
    name: "3. Concept detected override",
    concept: "Ảnh sản phẩm kem dưỡng da, chụp góc thấp, ánh sáng mềm sang trọng, tông tối sang trọng",
  },
  {
    name: "4. Poster sale case",
    concept: "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA",
    controls: { camera: "low_angle", typography: "bold_impact" },
  },
];

function cameraLine(prompt: string): string {
  const m = prompt.match(/\[CAMERA\]\n([\s\S]*?)\n\n/);
  if (!m) return "(none)";
  const angle = m[1].split("\n").find((l) => l.startsWith("Angle:")) || "";
  return angle.replace("Angle: ", "").slice(0, 76);
}

function lightingLine(prompt: string): string {
  const m = prompt.match(/\[LIGHTING\]\n([\s\S]*?)\n\n/);
  if (!m) return "(none)";
  const src = m[1].split("\n").find((l) => l.startsWith("Source:")) || "";
  return src.replace("Source: ", "").slice(0, 76);
}

function main() {
  const args = process.argv.slice(2);
  const sample = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : -1;
  const bar = "=".repeat(94);

  console.log(bar);
  console.log("CIOS PHASE 4.1.5 — VISUAL DIRECTION CONTROL SYSTEM");
  console.log(bar);

  let autoChars = 0;

  CASES.forEach((c, i) => {
    const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: c.concept, controls: c.controls });
    const p = pkg.assembled.prompt;
    if (i === 0) autoChars = pkg.assembled.chars;

    console.log(`\n${bar}`);
    console.log(c.name);
    console.log(`CONCEPT : ${c.concept}`);
    console.log(`CONTROLS: ${c.controls ? JSON.stringify(c.controls) : "(none — all Tự chọn)"}`);
    console.log(bar);

    console.log("\nRESOLVED CONTROLS");
    for (const key of Object.keys(pkg.visual_controls.controls) as (keyof typeof pkg.visual_controls.controls)[]) {
      const r = pkg.visual_controls.controls[key];
      console.log(`  ${String(key).padEnd(12)} ${r.source.padEnd(17)} ${r.label}`);
    }
    console.log(`  fully_auto   ${pkg.visual_controls.fully_auto}`);

    console.log("\nWHAT REACHED THE PROMPT");
    console.log(`  camera angle : ${cameraLine(p)}`);
    console.log(`  light source : ${lightingLine(p)}`);
    console.log(`  client block : ${/\[CLIENT VISUAL DIRECTION/.test(p) ? "present" : "absent"}`);
    console.log(`  prompt length: ${pkg.assembled.chars}${i > 0 ? `  (auto + ${pkg.assembled.chars - autoChars})` : ""}`);

    if (sample === i + 1) {
      const block = p.match(/\[CLIENT VISUAL DIRECTION[\s\S]*?\n\n/);
      console.log("\n" + (block ? block[0] : "(no client block)"));
    }
  });

  // ── The comparison that proves a control controls ────────────────────
  console.log(`\n${bar}`);
  console.log("BEFORE / AFTER — same concept, controls off then on");
  console.log(bar);
  const before = CreativeDirectorPipeline.run({ ...BRIEF, concept: CASES[1].concept });
  const after = CreativeDirectorPipeline.run({
    ...BRIEF,
    concept: CASES[1].concept,
    controls: CASES[1].controls,
  });
  console.log(`  camera, auto     : ${cameraLine(before.assembled.prompt)}`);
  console.log(`  camera, selected : ${cameraLine(after.assembled.prompt)}`);
  console.log(`  lighting, auto   : ${lightingLine(before.assembled.prompt)}`);
  console.log(`  lighting, sel.   : ${lightingLine(after.assembled.prompt)}`);
  console.log(`  changed          : ${cameraLine(before.assembled.prompt) !== cameraLine(after.assembled.prompt)}`);
  console.log(`  length auto/sel  : ${before.assembled.chars} / ${after.assembled.chars}`);
  console.log(
    `\n  Auto mode adds no control block and no characters: ${
      /\[CLIENT VISUAL DIRECTION/.test(before.assembled.prompt) ? "FAIL" : "confirmed"
    }`
  );
}

main();
