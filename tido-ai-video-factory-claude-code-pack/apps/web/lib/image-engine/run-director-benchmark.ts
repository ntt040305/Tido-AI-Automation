import fs from "fs";
import path from "path";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";
import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { CreativeFormatPlanner } from "./director/CreativeFormatPlanner";
import { DirectorBrief, V3_BUDGET } from "./director/creative-director.types";

/**
 * CIOS Phase 4.1 Task 7 — the five cases.
 *
 *   npx tsx lib/image-engine/run-director-benchmark.ts [--sample N]
 *
 * What is and is not being measured
 * --------------------------------
 * Everything below is a property of the *prompt*, checked mechanically: whether
 * a camera decision is present and specific, whether the identity lock names the
 * protected attributes, whether the format's own composition requirement made it
 * into the text, whether the length is inside the V3 budget.
 *
 * None of it is a measure of the rendered image. The stated problem is "final
 * visual output quality is around 3/10", and that is a judgement about pictures.
 * No number here can settle it, because no image is produced in this run — the
 * provider is not called. What this benchmark can honestly establish is whether
 * the decisions that were previously absent are now present and specific, which
 * is a precondition for better output and not a demonstration of it.
 */

const CASES: { name: string; brief: DirectorBrief }[] = [
  {
    name: "1. Simple product image",
    brief: {
      brand: "Numi",
      product: "Cold brew coffee bottle",
      audience: "office workers aged 25-40 who buy coffee on the way to work",
      category: "ready to drink coffee",
      objective: "drive trial",
      brief_text: "A clean product shot of the bottle that makes it look worth the price.",
      format: "product_hero" as never,
      copy: [],
      reference_attributes: {
        shape: "tall cylindrical glass bottle with a short tapered neck",
        color: "deep amber liquid in clear glass",
        logo_position: "centred on the front label at mid-body height",
        material: "clear glass with a matte paper label",
        texture: "condensation on the upper third of the glass",
        unique_features: ["embossed base ring", "matte black screw cap"],
      },
    },
  },
  {
    name: "2. Poster design",
    brief: {
      brand: "Tho",
      product: "Fermented rice cream",
      audience: "affluent women aged 35-55",
      category: "skincare",
      objective: "reposition as premium heritage craft",
      brief_text:
        "Mature buyers reject correction language because it frames the face they have now as a defect. We make it by hand in small batches, but the category is crowded and everything looks the same.",
      format: "poster",
      aspect_ratio: "4:5",
      copy: ["Made slowly. On purpose."],
      hard_constraints: ["Do not use the word anti-ageing anywhere in the image"],
    },
  },
  {
    name: "3. Banner design",
    brief: {
      brand: "Ghi",
      product: "Team notes and search",
      audience: "product teams at companies of 50-500 people",
      category: "productivity software",
      objective: "drive sign-ups",
      brief_text: "Nine tools open and nobody can find anything. Show that the searching stops.",
      format: "banner",
      aspect_ratio: "16:9",
      copy: ["Find it in one place", "Start free"],
    },
  },
  {
    name: "4. Social advertisement",
    brief: {
      brand: "Sao",
      product: "Daily face fluid for men",
      audience: "men aged 22-35 new to skincare",
      category: "mens grooming",
      objective: "engagement and social sharing",
      brief_text:
        "He would use the product and will not be seen choosing it, so the barrier is the aisle rather than the routine.",
      format: "social_ad",
      aspect_ratio: "9:16",
      copy: ["No one has to know"],
    },
  },
  {
    name: "5. Luxury commercial image",
    brief: {
      brand: "Aera",
      product: "Retinal night serum",
      audience: "women aged 30-50 with high disposable income",
      category: "luxury skincare",
      objective: "justify a premium price",
      brief_text:
        "She can afford the product and still feels that spending this much on her own face is indefensible to anyone who asks. The glass bottle is heavy and beautifully made.",
      format: "landing_hero",
      aspect_ratio: "16:9",
      copy: ["Worth explaining to no one"],
      reference_attributes: {
        shape: "squat heavy glass bottle with a broad shoulder",
        material: "frosted glass with a weighted metal cap",
      },
    },
  },
];

/** Mechanical checks over the assembled prompt. */
const CHECKS: { name: string; test: (prompt: string, brief: DirectorBrief) => boolean }[] = [
  {
    name: "concept accuracy",
    test: (p) => /\[CREATIVE DIRECTION\]/.test(p) && /Territory:/.test(p) && /Visual metaphor:/.test(p),
  },
  {
    name: "product preservation",
    test: (p) =>
      /PRODUCT IDENTITY LOCK/.test(p) &&
      /never redesign/i.test(p) &&
      /No invented label text/i.test(p),
  },
  {
    name: "format correctness",
    test: (p) => /\[FORMAT\]/.test(p) && /How it is viewed:/.test(p) && /Reading order:/.test(p),
  },
  {
    name: "camera quality",
    // Specific, not merely present: a lens value and an angle, not "good camera work".
    test: (p) => /\[CAMERA\]/.test(p) && /Lens: .*mm equivalent/.test(p) && /Angle: \w/.test(p),
  },
  {
    name: "lighting quality",
    test: (p) =>
      /\[LIGHTING\]/.test(p) && /Source: \w/.test(p) && /Direction: \w/.test(p) && /Contrast: \w/.test(p),
  },
  {
    name: "typography placement",
    test: (p) => /\[TYPOGRAPHY\]/.test(p) && /Placement: \w/.test(p),
  },
];

/**
 * The universal knowledge blocks, compressed the way the V2 compressor compresses
 * them, as the P2 craft notes the assembler expects.
 *
 * Loaded from the real corpus rather than invented, because the point of
 * measuring prompt length is to measure the length of a prompt the system would
 * actually send. A benchmark that omits the knowledge tier reports a prompt
 * around 4,800 characters and a production prompt is not that.
 */
function universalCraftNotes(): string[] {
  const dir = "data/knowledge/universal";
  if (!fs.existsSync(dir)) return [];
  const notes: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry, "knowledge.md");
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf-8");
    // The same normalisation the compiler applies before compression: drop the
    // document title, turn `## Heading` into the `**Heading` shape the compressor
    // parses, and collapse blank lines.
    const compacted = raw
      .replace(/^#\s+[^\r\n]+\r?\n+/m, "")
      .replace(/^##\s+(\d+\.\s*)?/gm, "**")
      .replace(/(\*\*[^\r\n*]+\*\*)\r?\n+/g, "$1: ")
      .replace(/(\r?\n){2,}/g, "\n")
      .trim();
    const compressed = KnowledgeBlockCompressor.compress(compacted).text;
    for (const line of compressed.split(/\r?\n/)) {
      if (line.trim()) notes.push(line.trim());
    }
  }
  return notes;
}

const CRAFT_NOTES = universalCraftNotes();

function main() {
  const args = process.argv.slice(2);
  const sampleIndex = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : -1;
  const bar = "=".repeat(92);

  console.log(bar);
  console.log("CIOS PHASE 4.1 — CREATIVE DIRECTOR ENGINE BENCHMARK");
  console.log(bar);
  console.log(`Budget: target ${V3_BUDGET.target_min}-${V3_BUDGET.target_max}, hard limit ${V3_BUDGET.hard_limit}.`);
  console.log("Measured on the assembled prompt. No image is rendered in this run.\n");

  const header = `${"case".padEnd(30)}${"chars".padStart(7)}${"budget".padStart(14)}  checks`;
  console.log(header);
  console.log("-".repeat(92));

  let totalChars = 0;
  let allPassed = 0;
  const perCheck: Record<string, number> = {};

  CASES.forEach((c, i) => {
    const pkg = CreativeDirectorPipeline.run(c.brief, CRAFT_NOTES);
    const prompt = pkg.assembled.prompt;
    totalChars += pkg.assembled.chars;

    const results = CHECKS.map((check) => ({ name: check.name, ok: check.test(prompt, c.brief) }));
    for (const r of results) if (r.ok) perCheck[r.name] = (perCheck[r.name] || 0) + 1;
    const passed = results.filter((r) => r.ok).length;
    if (passed === CHECKS.length) allPassed++;

    console.log(
      `${c.name.padEnd(30)}${String(pkg.assembled.chars).padStart(7)}` +
        `${pkg.assembled.budget_status.padStart(14)}  ${passed}/${CHECKS.length}` +
        (passed < CHECKS.length ? `  MISSING: ${results.filter((r) => !r.ok).map((r) => r.name).join(", ")}` : "")
    );

    if (sampleIndex === i + 1) {
      console.log("\n" + "-".repeat(92));
      console.log(`FULL ASSEMBLED PROMPT — ${c.name}`);
      console.log("-".repeat(92));
      console.log(prompt);
      console.log("-".repeat(92) + "\n");
    }
  });

  console.log("-".repeat(92));
  console.log(`${"mean prompt length".padEnd(30)}${String(Math.round(totalChars / CASES.length)).padStart(7)}`);
  console.log(`${"cases passing every check".padEnd(30)}${String(allPassed).padStart(7)} of ${CASES.length}`);

  console.log("\nPER-CHECK RESULTS");
  for (const check of CHECKS) {
    const n = perCheck[check.name] || 0;
    console.log(`  ${check.name.padEnd(24)} ${n}/${CASES.length}`);
  }

  // ── Territory and format coverage ───────────────────────────────────
  console.log("\nCREATIVE DECISIONS PER CASE");
  CASES.forEach((c) => {
    const pkg = CreativeDirectorPipeline.run(c.brief, CRAFT_NOTES);
    console.log(
      `  ${c.name.padEnd(30)} territories=${pkg.territories.length}  chosen="${pkg.chosen_territory.name}"  ` +
        `format=${pkg.format_plan.format}  identity_evidence=${pkg.identity.evidence}  ` +
        `grounding=${pkg.understanding.grounding}`
    );
  });

  console.log("\nFORMAT COVERAGE");
  const formats = CreativeFormatPlanner.all();
  for (const f of formats) {
    const plan = CreativeFormatPlanner.plan(f);
    const distinct = plan.camera.length > 40 && plan.composition.length > 40;
    console.log(`  ${f.padEnd(16)} ${distinct ? "specified" : "THIN"}  ratio=${plan.aspect_ratio}`);
  }

  console.log("\n" + bar);
  console.log("WHAT THIS DOES NOT MEASURE");
  console.log(bar);
  console.log("  No image was rendered. Every figure above is a property of the prompt text.");
  console.log("  These checks establish that camera, lighting, composition and identity decisions");
  console.log("  are present and specific where they were previously absent or defaulted. Whether");
  console.log("  that raises rendered output above 3/10 requires rendering, and is not shown here.");
}

main();
