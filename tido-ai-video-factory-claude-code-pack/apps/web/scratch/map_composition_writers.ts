import fs from "fs";

const prompt = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");

interface CompositionInfluence {
  offset: number;
  section: string;
  instruction: string;
  sourceModule: string;
  staticDynamic: string;
  authorityTier: string;
}

const influences: CompositionInfluence[] = [];

function findAndAdd(section: string, snippet: string, source: string, sd: string, tier: string) {
  const idx = prompt.indexOf(snippet);
  if (idx !== -1) {
    influences.push({
      offset: idx,
      section,
      instruction: snippet,
      sourceModule: source,
      staticDynamic: sd,
      authorityTier: tier,
    });
  } else {
    console.error("Snippet not found:", snippet);
  }
}

// 1. CREATIVE INTENT
findAndAdd("CREATIVE INTENT", "Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform, warm morning Mediterranean daylight, soft green botanical accents, elegant editorial skincare aesthetic", "CreativeDirectorV1 (applyCreativeDecision)", "Dynamic", "Tier 6 (Brief) / Mutated Concept");

// 2. USER HARD REQUIREMENTS
findAndAdd("USER HARD REQUIREMENTS", "Reference Identity Lock: Uploaded product reference identity takes strict priority over concept conflicts.", "MasterPromptCompilerService", "Static", "Tier 4 (Hard Requirements)");
findAndAdd("USER HARD REQUIREMENTS", "1. This image answers a specific brief: Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform", "CreativeDirectorV1 / MasterPromptCompiler", "Dynamic", "Tier 4 (Hard Requirements)");

// 3. ART DIRECTION
findAndAdd("ART DIRECTION", "CAMERA ANGLE: Eye-level (0° tilt) — standard commercial baseline.", "ArtDirectionService / MasterPromptCompiler", "Dynamic", "Tier 7 (Art Direction)");
findAndAdd("ART DIRECTION", "FRAMING: Medium shot — clear subject with surrounding context.", "ArtDirectionService / MasterPromptCompiler", "Dynamic", "Tier 7 (Art Direction)");
findAndAdd("ART DIRECTION", "FOCAL LENGTH: 50mm — natural human perspective, zero geometric distortion.", "ArtDirectionService / MasterPromptCompiler", "Dynamic", "Tier 7 (Art Direction)");

// 4. COMMERCIAL LAYOUT
findAndAdd("COMMERCIAL LAYOUT", "EYE FLOW: center out product first.", "CommercialLayoutService", "Static", "Tier 7 (Commercial Layout)");
findAndAdd("COMMERCIAL LAYOUT", "NEGATIVE SPACE STRATEGY: Reserve a calm, tonally even band above the product for the headline, and keep the area immediately around the product silhouette free of props or highlights so its edge stays crisp.", "CommercialLayoutService", "Static", "Tier 7 (Commercial Layout)");
findAndAdd("COMMERCIAL LAYOUT", "- HEADLINE: x 6%, y 7%, w 88%, h 18%, center-aligned.", "CommercialLayoutService", "Static", "Tier 7 (Commercial Layout)");
findAndAdd("COMMERCIAL LAYOUT", "- PRODUCT_FOCAL: x 12%, y 27%, w 76%, h 52%, center-aligned.", "CommercialLayoutService", "Static", "Tier 7 (Commercial Layout)");
findAndAdd("COMMERCIAL LAYOUT", "- CTA: x 6%, y 81%, w 88%, h 9%, center-aligned.", "CommercialLayoutService", "Static", "Tier 7 (Commercial Layout)");

// 5. FINAL OUTPUT / CONSTRAINTS
findAndAdd("FINAL OUTPUT & CONSTRAINTS", "- COMMERCIAL PRIORITY: product > material > lighting > composition", "MasterPromptCompilerService", "Static", "Tier 1-4 Constraints");
findAndAdd("FINAL OUTPUT & CONSTRAINTS", "Reserve clean, uncluttered negative space for post-production typography layout.", "MasterPromptCompilerService", "Static", "Tier 1-4 Constraints");

// 6. CREATIVE BLUEPRINT
findAndAdd("CREATIVE BLUEPRINT", "camera: Eye-level (0° tilt) — standard commercial baseline. / Medium shot — clear subject with surrounding context. / 50mm — natural human perspective, zero geometric distortion.", "ProfessionalCreativeBrain", "Dynamic", "Outside Numbered Hierarchy (Appended)");
findAndAdd("CREATIVE BLUEPRINT", "lighting: Soft diffuse directional Mediterranean daylight with warm morning raking side-light casting delicate shadows.", "ProfessionalCreativeBrain", "Dynamic", "Outside Numbered Hierarchy (Appended)");

// 7. THE COMPOSITION
findAndAdd("THE COMPOSITION", "Decided before this render, and the only account of the frame: every line below was reasoned from the brief", "CompositionPlan (renderCompositionPlan)", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");
findAndAdd("THE COMPOSITION", "- the product's role: hero — large — unmistakably the subject", "CompositionPlan (renderCompositionPlan)", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");
findAndAdd("THE COMPOSITION", "- where the product sits: centre of the frame, about 60% by 60%", "CompositionPlan (renderCompositionPlan)", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");
findAndAdd("THE COMPOSITION", "- where the words go: upper centre of the frame", "CompositionPlan (renderCompositionPlan)", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");
findAndAdd("THE COMPOSITION", "- keep clear: the upper centre of the frame, about 80% by 15%, stays free of detail", "CompositionPlan (renderCompositionPlan)", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");

// 8. TYPOGRAPHY ART DIRECTION
findAndAdd("TYPOGRAPHY ART DIRECTION", "Spatial Anchoring: Anchored strictly within the quiet communication zone at 10% across, 6% down (80% width x 15% height of canvas), flush-left.", "TypographyDesignContractService", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");
findAndAdd("TYPOGRAPHY ART DIRECTION", "Product Clearance: Minimum 8% canvas margin separation from all product silhouettes, bottle caps, necks, and reflections. Typography must NEVER touch, overlap, crowd, or occlude the product.", "TypographyDesignContractService", "Dynamic", "Outside Numbered Hierarchy (Appended / Tail)");

// 9. TEXT IN THE IMAGE (FINAL DIRECTIVE)
findAndAdd("FINAL DIRECTIVE", "Earlier sections of this prompt describe how the same lines are set and where they sit; they are describing these lines, not additional ones.", "ExperimentPipeline", "Static", "Outside Numbered Hierarchy (Appended / Tail)");

influences.sort((a, b) => a.offset - b.offset);

console.log("\n| Prompt Offset | Section | Exact Instruction | Source Module | Static/Dynamic | Authority Tier |");
console.log("|---|---|---|---|---|---|");
for (const inf of influences) {
  const shortInst = inf.instruction.length > 70 ? inf.instruction.slice(0, 67) + "..." : inf.instruction;
  console.log(`| ${inf.offset} | ${inf.section} | "${shortInst}" | ${inf.sourceModule} | ${inf.staticDynamic} | ${inf.authorityTier} |`);
}
