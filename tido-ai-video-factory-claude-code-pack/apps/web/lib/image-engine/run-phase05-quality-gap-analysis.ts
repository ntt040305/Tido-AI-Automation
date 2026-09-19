import fs from "fs";
import path from "path";

/**
 * Phase 0.5 — why a correctly transmitted decision still produces average images.
 *
 *   npx tsx lib/image-engine/run-phase05-quality-gap-analysis.ts
 *
 * Reads the twelve REAL master prompts persisted by the Phase 0.4 render run
 * (data/generated/image-renders/phase0-*), so every number here describes a
 * prompt that actually produced an image. Nothing is rendered, nothing is called.
 *
 * The question this answers
 * -------------------------
 * Phase 0.4 proved the decision reaches the prompt: `composer_used_direction`
 * was true on all twelve renders and `appearance_lines` was 2 on all twelve.
 * The pictures were still average. So the defect is no longer transmission, and
 * the two remaining candidates are:
 *
 *   (a) the prompt carries the decision but drowns it in instruction, or
 *   (b) the decision itself is average.
 *
 * This measures (a). It cannot measure (b) — that is read off the director's own
 * `tradeoff_accepted` field in the run logs, and reported separately.
 */

const RENDER_DIR = path.join(process.cwd(), "data", "generated", "image-renders");

/**
 * Sections that tell the renderer WHAT to do, versus sections that tell it WHY.
 *
 * The split is by what the section's sentences DO, not by whether they sound
 * creative. "Reserve the top 12%" is an instruction wherever it appears;
 * "the brand is a neighbourhood shop, not a chain" is a reason wherever it does.
 */
const WHAT_SECTIONS = [
  "PRODUCT IDENTITY",
  "PRODUCT INSTANCE REQUIREMENTS",
  "REFERENCE SEMANTICS",
  "USER HARD REQUIREMENTS",
  "COMMERCIAL LAYOUT",
  "TYPOGRAPHY & READABLE COPY",
  "CONFLICT PRIORITY",
  "FINAL OUTPUT",
  "ROLE",
  "OUTPUT CONTEXT",
];

const WHY_SECTIONS = [
  "CAMPAIGN STRATEGY",
  "CREATIVE EXECUTION",
  "BRAND POSITIONING — WHAT THIS BRAND IS",
  "AUDIENCE — WHAT HAPPENS IN THE VIEWER'S HEAD",
  "WHY THESE ELEMENTS — WHAT EACH ONE COMMUNICATES",
  "WHY THIS IS NOT THE CATEGORY DEFAULT",
  "VISUAL DECISIONS — EACH WITH ITS REASON",
  "LAYOUT CONTEXT",
];

/** CREATIVE INTENT and ART DIRECTION are mixed and are split line by line. */
const MIXED_SECTIONS = ["CREATIVE INTENT", "ART DIRECTION"];

/** A line that gives a reason rather than an order. */
const REASON_MARKERS =
  /(because|why |so that|in order to|which means|rather than|instead of|the reason|vì |bởi |nên |thay vì)/i;

/** The four things a creative brief is supposed to contain, and their markers. */
const DEPTH_MARKERS: { label: string; re: RegExp }[] = [
  { label: "big idea (a named thought, not a subject)", re: /BIG IDEA|CORE IDEA|THE IDEA:|CHOSEN DIRECTION:|answers the brief as:|creative direction chosen/i },
  { label: "creative tension (two things in conflict)", re: /tension|contradiction|but |yet |despite|even though|conflict between/i },
  { label: "emotional hook (a feeling to produce)", re: /FIRST FEELING|emotional territory|should feel|EMOTIONAL|feeling/i },
  { label: "visual metaphor (one thing standing for another)", re: /metaphor|stands for|as if|like a |symbol|represents/i },
];

function sections(text: string): { name: string; body: string; chars: number }[] {
  const out: { name: string; body: string; chars: number }[] = [];
  const parts = text.split(/\n(?=##\s)/);
  for (const p of parts) {
    const first = p.split("\n")[0] || "";
    if (!first.startsWith("##")) continue;
    const name = first.replace(/^#+\s*/, "").trim().toUpperCase();
    out.push({ name, body: p, chars: p.length });
  }
  return out;
}

function classify(text: string) {
  let what = 0;
  let why = 0;
  let mixedWhat = 0;
  let mixedWhy = 0;
  for (const s of sections(text)) {
    const isWhat = WHAT_SECTIONS.some((w) => s.name.startsWith(w));
    const isWhy = WHY_SECTIONS.some((w) => s.name.startsWith(w));
    const isMixed = MIXED_SECTIONS.some((w) => s.name.startsWith(w));
    if (isMixed) {
      for (const line of s.body.split("\n")) {
        if (!line.trim()) continue;
        if (REASON_MARKERS.test(line)) mixedWhy += line.length;
        else mixedWhat += line.length;
      }
    } else if (isWhy) why += s.chars;
    else if (isWhat) what += s.chars;
    else what += s.chars; // unknown sections are instructions until shown otherwise
  }
  return { what: what + mixedWhat, why: why + mixedWhy };
}

// ── read the twelve real prompts ──────────────────────────────────────────

type Row = {
  scenario: string;
  arm: string;
  chars: number;
  what: number;
  why: number;
  whyPct: number;
  depth: boolean[];
};

const rows: Row[] = [];
if (!fs.existsSync(RENDER_DIR)) {
  console.log(`no render directory at ${RENDER_DIR}. Run run-phase0-render-benchmark.ts --live first.`);
  process.exit(1);
}

for (const dir of fs.readdirSync(RENDER_DIR).filter((d) => d.startsWith("phase0-")).sort()) {
  const file = path.join(RENDER_DIR, dir, "master_prompt.md");
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf-8");
  const m = dir.match(/^phase0-(.+)-(OFF|ON)$/);
  if (!m) continue;
  const { what, why } = classify(text);
  rows.push({
    scenario: m[1],
    arm: m[2],
    chars: text.length,
    what,
    why,
    whyPct: Math.round((why / (what + why)) * 1000) / 10,
    depth: DEPTH_MARKERS.map((d) => d.re.test(text)),
  });
}

const L = (s = "") => console.log(s);
const bar = "=".repeat(78);

L(bar);
L("Phase 0.5 — Creative Quality Gap Analysis");
L(bar);
L(`  ${rows.length} real prompts, each of which produced an image.`);
L("  Offline. Nothing rendered, nothing called.");
L("");

L("-".repeat(78));
L("WHY vs WHAT — how much of the prompt is reasoning");
L("-".repeat(78));
L(`  ${"scenario".padEnd(18)}${"arm".padEnd(6)}${"total".padEnd(9)}${"WHAT".padEnd(9)}${"WHY".padEnd(9)}WHY %`);
for (const r of rows) {
  L(`  ${r.scenario.padEnd(18)}${r.arm.padEnd(6)}${String(r.chars).padEnd(9)}${String(r.what).padEnd(9)}${String(r.why).padEnd(9)}${r.whyPct}%`);
}
const meanWhy = Math.round((rows.reduce((a, r) => a + r.whyPct, 0) / rows.length) * 10) / 10;
L("");
L(`  mean WHY share: ${meanWhy}%`);
L("");

L("-".repeat(78));
L("CREATIVE DEPTH — is there an idea in the prompt, or only a specification?");
L("-".repeat(78));
L(`  ${"scenario".padEnd(18)}${"arm".padEnd(6)}${DEPTH_MARKERS.map((d) => d.label.split(" ")[0].padEnd(11)).join("")}`);
for (const r of rows) {
  L(`  ${r.scenario.padEnd(18)}${r.arm.padEnd(6)}${r.depth.map((b) => (b ? "yes" : "NO ").padEnd(11)).join("")}`);
}
L("");
for (const [i, d] of DEPTH_MARKERS.entries()) {
  const n = rows.filter((r) => r.depth[i]).length;
  L(`  ${d.label.padEnd(50)}${n}/${rows.length}`);
}
L("");

L("-".repeat(78));
L("BY CATEGORY — WHY share and prompt size");
L("-".repeat(78));
const byCat = new Map<string, Row[]>();
for (const r of rows) {
  const k = r.scenario;
  byCat.set(k, [...(byCat.get(k) || []), r]);
}
L(`  ${"category".padEnd(20)}${"mean chars".padEnd(13)}${"mean WHY %".padEnd(13)}depth markers`);
for (const [k, rs] of byCat) {
  const chars = Math.round(rs.reduce((a, r) => a + r.chars, 0) / rs.length);
  const why = Math.round((rs.reduce((a, r) => a + r.whyPct, 0) / rs.length) * 10) / 10;
  const depth = Math.round((rs.reduce((a, r) => a + r.depth.filter(Boolean).length, 0) / rs.length) * 10) / 10;
  L(`  ${k.padEnd(20)}${String(chars).padEnd(13)}${String(why + "%").padEnd(13)}${depth}/4`);
}
L("");
L(bar);
