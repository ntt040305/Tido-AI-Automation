import fs from "fs";

const prompt = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");
console.log("Total prompt length:", prompt.length);

interface SectionMarker {
  title: string;
  pattern: string;
  owner: string;
  staticDynamic: "Static" | "Dynamic";
  tier?: string;
}

const markers: SectionMarker[] = [
  { title: "MasterPrompt Header & Preamble", pattern: "<!-- ID: master_prompt_v2", owner: "MasterPromptCompilerService", staticDynamic: "Static" },
  { title: "## ROLE", pattern: "## ROLE", owner: "MasterPromptCompilerService", staticDynamic: "Static" },
  { title: "## CREATIVE INTENT", pattern: "## CREATIVE INTENT", owner: "CreativeDirectorV1 / MarketingBrainService", staticDynamic: "Dynamic" },
  { title: "## CAMPAIGN STRATEGY", pattern: "## CAMPAIGN STRATEGY", owner: "MarketingBrainService", staticDynamic: "Dynamic" },
  { title: "## PRODUCT INSTANCE REQUIREMENTS", pattern: "## PRODUCT INSTANCE REQUIREMENTS", owner: "ReferenceImageProcessorService / MasterPromptCompiler", staticDynamic: "Dynamic" },
  { title: "## REFERENCE SEMANTICS", pattern: "## REFERENCE SEMANTICS", owner: "ReferenceIntelligenceService / MasterPromptCompiler", staticDynamic: "Dynamic" },
  { title: "## USER HARD REQUIREMENTS", pattern: "## USER HARD REQUIREMENTS", owner: "CreativeDirectorV1 / MasterPromptCompiler", staticDynamic: "Dynamic" },
  { title: "## ART DIRECTION", pattern: "## ART DIRECTION", owner: "ArtDirectionService / MasterPromptCompiler", staticDynamic: "Dynamic" },
  { title: "## COMMERCIAL LAYOUT", pattern: "## COMMERCIAL LAYOUT", owner: "CommercialLayoutService", staticDynamic: "Static" },
  { title: "## TYPOGRAPHY & READABLE COPY", pattern: "## TYPOGRAPHY & READABLE COPY", owner: "MasterPromptCompilerService", staticDynamic: "Dynamic" },
  { title: "## CREATIVE EXECUTION", pattern: "## CREATIVE EXECUTION", owner: "MasterPromptCompilerService", staticDynamic: "Static" },
  { title: "## CONFLICT PRIORITY", pattern: "## CONFLICT PRIORITY", owner: "MasterPromptCompilerService", staticDynamic: "Static" },
  { title: "## FINAL OUTPUT & CONSTRAINTS", pattern: "## FINAL OUTPUT", owner: "MasterPromptCompilerService", staticDynamic: "Static" },
  { title: "## BRAND POSITIONING & AUDIENCE", pattern: "## BRAND POSITIONING — WHAT THIS BRAND IS", owner: "NanoBananaPromptComposer (renderJudgment)", staticDynamic: "Dynamic" },
  { title: "CREATIVE BLUEPRINT", pattern: "CREATIVE BLUEPRINT — decided for this brief", owner: "ProfessionalCreativeBrain", staticDynamic: "Dynamic" },
  { title: "THE COMPOSITION", pattern: "THE COMPOSITION\n", owner: "CompositionPlan (renderCompositionPlan)", staticDynamic: "Dynamic" },
  { title: "## TYPOGRAPHY ART DIRECTION", pattern: "## TYPOGRAPHY ART DIRECTION", owner: "TypographyDesignContractService", staticDynamic: "Dynamic" },
  { title: "TEXT IN THE IMAGE (FINAL DIRECTIVE)", pattern: "\n\nTEXT IN THE IMAGE — use exactly the provided text.", owner: "ExperimentPipeline (textDirectiveText)", staticDynamic: "Static" },
];

const offsets: { title: string; start: number; owner: string; staticDynamic: string }[] = [];

for (const m of markers) {
  const idx = prompt.indexOf(m.pattern);
  if (idx === -1) {
    console.error("Marker not found:", m.title, m.pattern);
  } else {
    offsets.push({ title: m.title, start: idx, owner: m.owner, staticDynamic: m.staticDynamic });
  }
}

offsets.sort((a, b) => a.start - b.start);

console.log("\n| Start Offset | End Offset | Chars | Section | Writer / Owner | Static/Dynamic |");
console.log("|---|---|---|---|---|---|");

let totalChars = 0;
for (let i = 0; i < offsets.length; i++) {
  const cur = offsets[i];
  const next = offsets[i + 1];
  const start = cur.start;
  const end = next ? next.start : prompt.length;
  const chars = end - start;
  totalChars += chars;
  console.log(`| ${start} | ${end} | ${chars} | ${cur.title} | ${cur.owner} | ${cur.staticDynamic} |`);
}

console.log("\nTotal Chars Accounted:", totalChars);
console.log("Total Prompt Length:", prompt.length);
console.log("Match:", totalChars === prompt.length);
