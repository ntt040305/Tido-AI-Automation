import fs from "fs";
import path from "path";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";
import { ConceptStructuringLayer } from "./director/ConceptStructuringLayer";
import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { DirectorBrief, V3_BUDGET } from "./director/creative-director.types";

/**
 * CIOS Phase 4.1.1 Task 7 — the real failing cases.
 *
 *   npx tsx lib/image-engine/run-commercial-execution-benchmark.ts [--sample N]
 *
 * Case 1 is the production failure verbatim. Before this phase it produced a
 * clean product shot: no sale message, no CTA, no promotional hierarchy, and the
 * strings "50%" and "CTA" appeared nowhere in the compiled prompt.
 *
 * What can and cannot be shown here
 * --------------------------------
 * Every check below reads the assembled prompt. It can prove that the offer, the
 * discount, the synthesized copy and the text-rendering requirement are present
 * and explicit. It cannot prove the renderer draws them — that needs a render,
 * and the provider is not called in this run. The distinction matters because
 * the original failure had two halves: the prompt did not ask for the text, and
 * the model did not draw it. This fixes the first half and can only report on it.
 */

const CASES: { name: string; concept: string; brief: DirectorBrief }[] = [
  {
    name: "1. Poster (production failure)",
    concept: "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA",
    brief: {
      brand: "Tido",
      product: "Kem dưỡng da",
      audience: "khách hàng nữ 25-40",
      category: "mỹ phẩm",
      brief_text: "",
      format: "poster",
      aspect_ratio: "4:5",
      reference_attributes: {
        shape: "hũ tròn thấp, nắp vặn",
        color: "hũ thuỷ tinh trắng đục, nhãn vàng nhạt",
        logo_position: "chính giữa nhãn trước",
        material: "thuỷ tinh mờ, nhãn giấy",
      },
    },
  },
  {
    name: "2. Banner",
    concept: "Tạo banner website ưu đãi khai trương, có headline và nút CTA",
    brief: {
      brand: "Nhà Hàng Sen",
      product: "Set khai trương",
      audience: "cư dân quanh khu vực",
      category: "nhà hàng",
      brief_text: "",
      format: "banner",
      aspect_ratio: "16:9",
    },
  },
  {
    name: "3. Social ad",
    concept: "Tạo social ad giảm giá có hook mạnh, CTA rõ",
    brief: {
      brand: "Sao",
      product: "Sữa rửa mặt cho nam",
      audience: "nam 22-35",
      category: "chăm sóc da nam",
      brief_text: "",
      format: "social_ad",
      aspect_ratio: "9:16",
    },
  },
  {
    name: "4. Thumbnail",
    concept: "Tạo thumbnail nổi bật, text ngắn, dễ đọc",
    brief: {
      brand: "Ghi",
      product: "Khoá học online",
      audience: "sinh viên",
      category: "giáo dục",
      brief_text: "",
      format: "thumbnail",
      aspect_ratio: "1:1",
    },
  },
];

function universalCraftNotes(): string[] {
  const dir = "data/knowledge/universal";
  if (!fs.existsSync(dir)) return [];
  const notes: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry, "knowledge.md");
    if (!fs.existsSync(file)) continue;
    const compacted = fs
      .readFileSync(file, "utf-8")
      .replace(/^#\s+[^\r\n]+\r?\n+/m, "")
      .replace(/^##\s+(\d+\.\s*)?/gm, "**")
      .replace(/(\*\*[^\r\n*]+\*\*)\r?\n+/g, "$1: ")
      .replace(/(\r?\n){2,}/g, "\n")
      .trim();
    for (const line of KnowledgeBlockCompressor.compress(compacted).text.split(/\r?\n/)) {
      if (line.trim()) notes.push(line.trim());
    }
  }
  return notes;
}

const CRAFT_NOTES = universalCraftNotes();

function main() {
  const args = process.argv.slice(2);
  const sample = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : -1;
  const bar = "=".repeat(94);

  console.log(bar);
  console.log("CIOS PHASE 4.1.1 — CONCEPT TO COMMERCIAL EXECUTION");
  console.log(bar);
  console.log(
    `Budget V3.1: target ${V3_BUDGET.target_min}-${V3_BUDGET.target_max}, ` +
      `soft warning ${V3_BUDGET.soft_warning}, hard limit ${V3_BUDGET.hard_limit}.\n`
  );

  let allOk = true;

  CASES.forEach((c, i) => {
    const pkg = CreativeDirectorPipeline.run({ ...c.brief, concept: c.concept }, CRAFT_NOTES);
    const p = pkg.assembled.prompt;
    const intent = pkg.intent;

    console.log(bar);
    console.log(`${c.name}`);
    console.log(`CONCEPT: ${c.concept}`);
    console.log(bar);

    console.log("\nPARSED INTENT");
    console.log(`  asset_type       : ${intent.asset_type}`);
    console.log(`  offer_type       : ${intent.offer_type}`);
    console.log(`  discount         : ${intent.discount ?? "—"}`);
    console.log(`  cta_required     : ${intent.cta_required}`);
    console.log(`  text_required    : ${intent.text_required}`);
    console.log(`  commercial_goal  : ${intent.commercial_goal}`);
    console.log(`  tone             : ${intent.tone ?? "—"}`);
    console.log(`  evidence         : ${intent.evidence.join(" | ") || "—"}`);

    console.log("\nGENERATED COPY");
    if (!pkg.copy.items.length) console.log("  (none — the concept required no text)");
    for (const item of pkg.copy.items) {
      console.log(`  ${item.role.padEnd(12)} "${item.text}"  ${item.supplied ? "(user)" : "(synthesized)"}`);
    }
    console.log(`  language         : ${pkg.copy.language}`);

    console.log("\nFORMAT PLAN");
    console.log(`  format           : ${pkg.format_plan.format} at ${pkg.format_plan.aspect_ratio}`);
    console.log(`  execution mode   : ${pkg.execution.mode}`);
    console.log(`  hierarchy        : ${pkg.execution.hierarchy.join(" → ")}`);

    // ── The checks that matter ────────────────────────────────────────
    const textRendered =
      /\[TEXT RENDERING — REQUIRED, NOT OPTIONAL\]/.test(p) &&
      pkg.copy.items.every((item) => p.includes(item.text)) &&
      !/no text is rendered in this pass/i.test(p);
    const discountPresent = intent.discount ? p.includes(intent.discount) : true;
    const ctaPresent = intent.cta_required
      ? pkg.copy.items.some((it) => it.role === "cta" && p.includes(it.text))
      : true;
    const identityPreserved =
      /PRODUCT IDENTITY LOCK/.test(p) &&
      /never redesign/i.test(p) &&
      (!pkg.execution.promotional || /PRODUCT PRESERVATION UNDER PROMOTIONAL DESIGN/.test(p));
    const promoHierarchy = intent.promotional ? /Promotional composition:/.test(p) : true;

    console.log("\nRESULT");
    const row = (label: string, ok: boolean, detail = "") =>
      console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(6)} ${label.padEnd(34)} ${detail}`);
    row("text rendering demanded", textRendered);
    row("discount in prompt", discountPresent, intent.discount ? `"${intent.discount}"` : "n/a");
    row("CTA in prompt", ctaPresent);
    row("promotional hierarchy", promoHierarchy);
    row("product identity preserved", identityPreserved);
    console.log(`  ${"".padEnd(6)} ${"prompt length".padEnd(34)} ${pkg.assembled.chars} (${pkg.assembled.budget_status})`);

    if (!(textRendered && discountPresent && ctaPresent && promoHierarchy && identityPreserved)) allOk = false;

    if (sample === i + 1) {
      console.log("\n" + "-".repeat(94));
      console.log(p);
      console.log("-".repeat(94));
    }
    console.log("");
  });

  console.log(bar);
  console.log(allOk ? "ALL CASES PASS" : "SOME CASES FAIL");
  console.log(bar);
  console.log("These checks read the assembled prompt. They show the prompt now demands the offer,");
  console.log("the discount, the copy and visible text. Whether the image model actually renders");
  console.log("legible text is a property of the renderer and is not measured here.");

  // ── Before/after on the exact production concept ────────────────────
  const failing = CASES[0];
  const before = ConceptStructuringLayer.parse("");
  console.log("\n" + bar);
  console.log("BEFORE / AFTER — the production concept");
  console.log(bar);
  console.log(`  before: concept parsed for mood only; offer=${before.offer_type}, discount=${before.discount},`);
  console.log(`          cta_required=${before.cta_required}, text_required=${before.text_required}`);
  const after = ConceptStructuringLayer.parse(failing.concept);
  console.log(`  after : offer=${after.offer_type}, discount=${after.discount}, cta_required=${after.cta_required},`);
  console.log(`          text_required=${after.text_required}, goal=${after.commercial_goal}`);
}

main();
