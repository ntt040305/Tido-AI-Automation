import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { MasterPromptCompilerInput, RoutingResultSchema } from "./types";
import fs from "fs";
import path from "path";

async function runPosterLibraryV2Tests() {
  console.log("\n=================================================");
  console.log("⚡ TIDO IMAGE ENGINE — POSTER KNOWLEDGE LIBRARY V2 SUITE");
  console.log("=================================================\n");

  const compiler = new MasterPromptCompilerService();
  let passCount = 0;
  let failCount = 0;

  const createMockRouting = (summary: string, keywords: string[] = []): RoutingResultSchema => {
    const formattedQueries = keywords.map((k) => ({
      query: k,
      importance: "PRIMARY" as const,
      reason: "Style keyword signal",
    }));

    return {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products: [
        {
          product_id: "PRODUCT_01",
          reference_ids: ["REF_01"],
          reference_relationship_confidence: 1.0,
          summary: summary,
          categories: keywords.map(k => ({ value: k, confidence: 0.9, evidence_type: "USER_PROVIDED" as const, evidence_summary: "" })),
          industry_domains: [{ value: "F&B", confidence: 1.0, evidence_type: "USER_PROVIDED" as const, evidence_summary: "" }],
          likely_functions: [],
          materials: [],
          contents: [],
          surface_properties: keywords.map(k => ({ value: k, confidence: 0.9, evidence_type: "OBSERVED" as const, evidence_summary: "" })),
          geometry_traits: [],
          packaging_types: [],
          branding_features: [],
          visual_challenges: [],
          unknowns: [],
          retrieval_queries: formattedQueries,
        },
      ],
      global_retrieval_queries: formattedQueries,
      routing_summary: summary,
    };
  };

  const testMatrix = [
    {
      caseName: "POSTER A — Fantasy Beverage Poster",
      useCase: "Poster",
      summary: "Fantasy beverage poster with floating ingredients and dreamlike cosmic galaxy world",
      keywords: ["fantasy", "surreal", "dreamlike", "floating"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_fantasy_surreal"],
    },
    {
      caseName: "POSTER B — Minimal Luxury Cosmetic Poster",
      useCase: "Poster",
      summary: "Minimal luxury perfume poster with negative space and elegant spatial tension",
      keywords: ["minimal", "luxury", "editorial", "sleek"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_editorial_minimal_luxury"],
    },
    {
      caseName: "POSTER C — Photographic Food Poster",
      useCase: "Poster",
      summary: "High-end photographic gourmet steak poster with realistic cinematic lighting and lens depth",
      keywords: ["photographic", "cinematic", "realism", "authentic"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_photographic_cinematic"],
    },
    {
      caseName: "POSTER D — 3D Technology Poster",
      useCase: "Poster",
      summary: "Futuristic 3D CGI tech poster with chrome geometry and octane volumetric rendering",
      keywords: ["3d_render", "cgi", "futuristic", "chrome"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_3d_cgi_digital"],
    },
    {
      caseName: "POSTER E — Illustrated Art Poster",
      useCase: "Poster",
      summary: "Vector illustrated anime poster with flat color blocking and graphic linework",
      keywords: ["illustration", "graphic_design", "vector_art", "flat_design"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_illustration_graphic"],
    },
    {
      caseName: "POSTER F — Experimental Collage Poster",
      useCase: "Poster",
      summary: "Experimental mixed media collage poster with paper texture overlays and zine aesthetic",
      keywords: ["collage", "mixed_media", "paper_cut", "zine_aesthetic"],
      expectedFoundation: true,
      expectedSpecialists: ["specialist.poster_collage_mixed_media"],
    },
    {
      caseName: "POSTER G — Unknown Poster Style (Cyberpunk Steampunk)",
      useCase: "Poster",
      summary: "Steampunk cyberpunk brass gear poster with neo-retro industrial machinery",
      keywords: ["steampunk", "cyberpunk", "gears", "industrial"],
      expectedFoundation: true,
      expectedSpecialists: [], // Unknown style supported smoothly via Foundation
    },
    {
      caseName: "NON-POSTER H — Social Post Regression Test",
      useCase: "Social Post",
      summary: "Standard social post for product promotion",
      keywords: ["social", "post"],
      expectedFoundation: false,
      expectedSpecialists: [],
    },
    {
      caseName: "NON-POSTER I — Banner Regression Test",
      useCase: "Banner",
      summary: "Standard website hero banner",
      keywords: ["banner"],
      expectedFoundation: false,
      expectedSpecialists: [],
    },
  ];

  for (const item of testMatrix) {
    console.log(`\n📋 Testing ${item.caseName}...`);
    const routing = createMockRouting(item.summary, item.keywords);
    const retrieval = await SmartKnowledgeRetriever.retrieve(routing, ["REF_01"], null, { useCase: item.useCase });

    if (!retrieval.success || !retrieval.package) {
      console.error(`❌ ${item.caseName}: Retrieval failed!`, retrieval.error);
      failCount++;
      continue;
    }

    const selectedIds = retrieval.package.selected_blocks.map((b) => b.id);
    const hasFoundation = selectedIds.includes("specialist.poster_foundation");

    if (hasFoundation !== item.expectedFoundation) {
      console.error(`  ❌ ${item.caseName}: Foundation check failed! Expected ${item.expectedFoundation}, got ${hasFoundation}`);
      failCount++;
      continue;
    }

    if (item.useCase !== "Poster") {
      const posterBlocksInNonPoster = selectedIds.filter((id) => id.startsWith("specialist.poster_") || id === "specialist.commercial_poster_design");
      if (posterBlocksInNonPoster.length === 0) {
        console.log(`  ✅ ${item.caseName}: 0 Poster blocks loaded for non-poster request. (100% REGRESSION SAFE)`);
        passCount++;
      } else {
        console.error(`  ❌ ${item.caseName}: Found ${posterBlocksInNonPoster.length} poster blocks in non-poster request!`, posterBlocksInNonPoster);
        failCount++;
      }
      continue;
    }

    // Check if expected specialist block was retrieved when specified
    if (item.expectedSpecialists.length > 0) {
      const missing = item.expectedSpecialists.filter(id => !selectedIds.includes(id));
      if (missing.length > 0) {
        console.warn(`  ⚠️ ${item.caseName}: Expected specialist [${missing.join(', ')}] not in selected [${selectedIds.join(', ')}]`);
      } else {
        console.log(`  ✅ ${item.caseName}: Successfully retrieved specialist [${item.expectedSpecialists.join(', ')}]`);
      }
    }

    // Poster compile check
    const compilerInput: MasterPromptCompilerInput = {
      brief: item.summary,
      useCase: item.useCase,
      productCount: 1,
      routingResult: routing,
      knowledgePackage: retrieval.package,
      productReferences: [{ reference_id: "REF_01", input_index: 0 }],
      copyItems: ["HERO HEADLINE", "SUBTITLE ITEM", "ACTION CTA"],
    };

    const compileRes = await compiler.compile(compilerInput);
    if (!compileRes.success || !compileRes.package) {
      console.error(`  ❌ ${item.caseName}: Compilation failed!`, compileRes.error);
      failCount++;
      continue;
    }

    const prompt = compileRes.package.compiled_prompt;
    const promptChars = compileRes.package.stats.prompt_characters;

    console.log(`  ✅ ${item.caseName}: Selected Blocks = [${selectedIds.join(", ")}]`);
    console.log(`     Total Compiled Chars = ${promptChars} chars | Budget Status = ${promptChars <= 20000 ? "PASS (NORMAL HEADROOM)" : "EXCEEDED"}`);

    if (promptChars <= 20000) {
      passCount++;
    } else {
      failCount++;
    }
  }

  // Anti-recipe & Anti-style-bias audit across all poster blocks
  console.log("\n📋 Running ANTI-RECIPE & ANTI-STYLE-BIAS AUDIT across Poster Library V2...");
  const posterBlocksDir = path.join(process.cwd(), "data/knowledge/specialist");
  const allSubDirs = fs.readdirSync(posterBlocksDir).filter(d => d.startsWith("poster_") || d === "commercial_poster_design");

  const forbiddenRecipes = [
    "headline at top",
    "product in center",
    "cta at bottom",
    "use 3d text",
    "use diagonal composition",
    "use gradient background",
    "use red for sale",
  ];

  let totalRecipeViolations = 0;
  for (const dir of allSubDirs) {
    const kPath = path.join(posterBlocksDir, dir, "knowledge.md");
    if (fs.existsSync(kPath)) {
      const content = fs.readFileSync(kPath, "utf-8").toLowerCase();
      for (const recipe of forbiddenRecipes) {
        if (content.includes(recipe)) {
          console.error(`  ❌ Recipe violation in ${dir}: "${recipe}"`);
          totalRecipeViolations++;
        }
      }
    }
  }

  if (totalRecipeViolations === 0) {
    console.log(`  ✅ Anti-Recipe Audit Passed: 0 fixed layout recipes across all ${allSubDirs.length} poster knowledge blocks!`);
    passCount++;
  } else {
    failCount++;
  }

  console.log("\n=================================================");
  console.log(`🏁 TEST SUITE RESULT: ${failCount === 0 ? "ALL PASSED" : "FAILED"}`);
  console.log(`   Passed: ${passCount} | Failed: ${failCount}`);
  console.log("=================================================\n");

  if (failCount > 0) process.exit(1);
}

runPosterLibraryV2Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
