import fs from "fs";
import path from "path";

const promptPath = path.join(process.cwd(), "scratch/healthy_final_provider_prompt.txt");
const prompt = fs.readFileSync(promptPath, "utf8");

console.log("Total length:", prompt.length);

// Let's identify the exact sections in the prompt:
// 1. Preamble (from 0 to first '## ')
// 2. Each '## ' section
// 3. Appended sections after '## FINAL OUTPUT':
//    - Creative Blueprint
//    - THE COMPOSITION
//    - TYPOGRAPHY ART DIRECTION
//    - final Directive

const parts = prompt.split(/(?=\n## )/);
console.log("Pre-blueprint sections count:", parts.length);

// Let's find exactly where the main markers are:
const markers = [
  { name: "PREAMBLE & TITLE", pattern: "<!-- ID: master_prompt_v2" },
  { name: "ROLE", pattern: "## ROLE" },
  { name: "CREATIVE INTENT", pattern: "## CREATIVE INTENT" },
  { name: "CAMPAIGN STRATEGY", pattern: "## CAMPAIGN STRATEGY" },
  { name: "PRODUCT INSTANCE REQUIREMENTS", pattern: "## PRODUCT INSTANCE REQUIREMENTS" },
  { name: "REFERENCE SEMANTICS", pattern: "## REFERENCE SEMANTICS" },
  { name: "USER HARD REQUIREMENTS", pattern: "## USER HARD REQUIREMENTS" },
  { name: "ART DIRECTION", pattern: "## ART DIRECTION" },
  { name: "COMMERCIAL LAYOUT", pattern: "## COMMERCIAL LAYOUT" },
  { name: "TYPOGRAPHY & READABLE COPY", pattern: "## TYPOGRAPHY & READABLE COPY" },
  { name: "CREATIVE EXECUTION", pattern: "## CREATIVE EXECUTION" },
  { name: "CONFLICT PRIORITY", pattern: "## CONFLICT PRIORITY" },
  { name: "FINAL OUTPUT", pattern: "## FINAL OUTPUT" },
  { name: "CREATIVE BLUEPRINT", pattern: "CREATIVE BLUEPRINT\n" },
  { name: "THE COMPOSITION", pattern: "THE COMPOSITION\n" },
  { name: "TYPOGRAPHY ART DIRECTION", pattern: "TYPOGRAPHY ART DIRECTION\n" },
  { name: "FINAL DIRECTIVE (EXACT TEXT)", pattern: "\n\nUse exactly the provided text." }
];

const foundMarkers: { name: string; offset: number }[] = [];
for (const m of markers) {
  const idx = prompt.indexOf(m.pattern);
  if (idx !== -1) {
    foundMarkers.push({ name: m.name, offset: idx });
  } else {
    console.log("MISSING:", m.name, JSON.stringify(m.pattern));
  }
}

foundMarkers.sort((a, b) => a.offset - b.offset);

console.log("\n=================== SECTION BOUNDARIES ===================");
for (let i = 0; i < foundMarkers.length; i++) {
  const cur = foundMarkers[i];
  const next = foundMarkers[i + 1];
  const start = cur.offset;
  const end = next ? next.offset : prompt.length;
  const chars = end - start;
  console.log(
    `[${String(i + 1).padStart(2, "0")}] Start: ${String(start).padStart(5)} | End: ${String(end).padStart(5)} | Chars: ${String(chars).padStart(5)} | ${cur.name}`
  );
}
console.log(`Total accounted: ${prompt.length}`);
