import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { MasterPromptCompilerInput, RoutingResultSchema } from "./types";
import fs from "fs";
import path from "path";

async function testWorstCases() {
  const compiler = new MasterPromptCompilerService();

  const createRouting = (summary: string, keywords: string[], extraProducts = 0): RoutingResultSchema => {
    const formattedQueries = keywords.map((k) => ({
      query: k,
      importance: "PRIMARY" as const,
      reason: "Worst case test query",
    }));

    const products = [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 1.0,
        summary: "Primary test product",
        categories: keywords.map(k => ({ value: k, confidence: 0.95, evidence_type: "USER_PROVIDED" as const, evidence_summary: "" })),
        industry_domains: [{ value: "Luxury Cosmetics & F&B", confidence: 1.0, evidence_type: "USER_PROVIDED" as const, evidence_summary: "" }],
        likely_functions: [],
        materials: [{ value: "glass", confidence: 0.9, evidence_type: "OBSERVED" as const, evidence_summary: "" }],
        contents: [],
        surface_properties: keywords.map(k => ({ value: k, confidence: 0.95, evidence_type: "OBSERVED" as const, evidence_summary: "" })),
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: formattedQueries,
      },
    ];

    for (let i = 2; i <= 1 + extraProducts; i++) {
      products.push({
        product_id: `PRODUCT_0${i}`,
        reference_ids: [`REF_0${i}`],
        reference_relationship_confidence: 1.0,
        summary: `Extra product ${i}`,
        categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
      });
    }

    return {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products,
      global_retrieval_queries: formattedQueries,
      routing_summary: summary,
    };
  };

  const cases = [
    // False Positive Tests
    {
      name: "FP-A. Minimal poster with cinematic lighting",
      summary: "Minimal poster with cinematic lighting and deep spatial focus",
      keywords: ["minimal", "cinematic"],
      extraProducts: 0,
      brief: "Minimal poster with cinematic lighting.",
      brandName: "Lumière",
      brandInfo: "Minimalist studio brand",
      copyItems: ["LUMIÈRE 2026"],
    },
    {
      name: "FP-B. Luxury chocolate sale poster",
      summary: "Luxury chocolate promotional sale poster with special discount",
      keywords: ["luxury", "chocolate", "sale", "promotional"],
      extraProducts: 0,
      brief: "Luxury chocolate sale poster featuring 50% discount.",
      brandName: "Cacao Royale",
      brandInfo: "Premium Belgian chocolate brand",
      copyItems: ["SPECIAL SALE 50% OFF"],
    },
    {
      name: "FP-C. Photographic poster with 3D headline",
      summary: "Photographic portrait poster with high-impact 3D headline typography",
      keywords: ["photographic", "3d"],
      extraProducts: 0,
      brief: "Photographic poster with 3D headline.",
      brandName: "Studio One",
      brandInfo: "Photography agency",
      copyItems: ["3D HEADLINE TITLE"],
    },
    {
      name: "FP-D. Fantasy surreal beverage poster",
      summary: "Fantasy surreal beverage poster with floating liquid cosmos",
      keywords: ["fantasy", "surreal"],
      extraProducts: 0,
      brief: "Fantasy surreal beverage poster.",
      brandName: "Cosmo Brew",
      brandInfo: "Craft beverage brand",
      copyItems: ["COSMO BREW"],
    },

    // Hybrid Style Tests
    {
      name: "H-A. Fantasy surreal 3D CGI beverage universe poster",
      summary: "Fantasy surreal 3D CGI beverage universe poster with floating digital elements",
      keywords: ["fantasy", "surreal", "3d_render", "cgi"],
      extraProducts: 0,
      brief: "Fantasy surreal 3D CGI beverage universe poster.",
      brandName: "Nebula Drink",
      brandInfo: "Cosmic drinks brand",
      copyItems: ["NEBULA 2026"],
    },
    {
      name: "H-B. Editorial photographic perfume poster",
      summary: "Editorial photographic perfume poster with realistic studio lighting",
      keywords: ["editorial", "minimal", "photographic", "cinematic"],
      extraProducts: 0,
      brief: "Editorial photographic perfume poster.",
      brandName: "Maison De Parfum",
      brandInfo: "French luxury perfume house",
      copyItems: ["MAISON DE PARFUM"],
    },
    {
      name: "H-C. Experimental collage pop poster",
      summary: "Experimental collage pop poster with mixed media graphics",
      keywords: ["collage", "mixed_media", "maximalist", "pop_poster"],
      extraProducts: 0,
      brief: "Experimental collage pop poster.",
      brandName: "PopZine",
      brandInfo: "Streetwear art brand",
      copyItems: ["POPZINE ISSUE 1"],
    },

    // Four Worst Cases
    {
      name: "A. Fantasy + Cinematic + 3D + Promotional Sale",
      summary: "Promotional sale poster with fantasy floating cosmic liquid, cinematic realistic lighting, 3D CGI chrome rendering",
      keywords: ["fantasy", "surreal", "cinematic", "photographic", "3d_render", "cgi", "sale", "promotional"],
      extraProducts: 0,
      brief: "Ultra high end promotional sale poster featuring fantasy liquid floating in 3d space with cinematic realism.",
      brandName: "Aura Premium",
      brandInfo: "Luxury artisanal brand",
      copyItems: ["MEGA SALE 50% OFF", "LIMITED EDITION AURA BOTTLE", "SHOP NOW AT AURA.COM"],
    },
    {
      name: "B. Minimal + Luxury + Photographic",
      summary: "Minimal luxury photographic perfume poster with negative space and spatial tension",
      keywords: ["minimal", "luxury", "editorial", "photographic", "cinematic"],
      extraProducts: 0,
      brief: "Minimal editorial luxury perfume poster with extreme quiet spatial tension and studio lighting.",
      brandName: "L'Élixir",
      brandInfo: "High-end French perfumery",
      copyItems: ["L'ÉLIXIR DE PARFUM", "EAU DE PARFUM 100ML"],
    },
    {
      name: "C. Collage + Experimental + Commercial",
      summary: "Experimental mixed media collage poster with pop art zine aesthetic and promotional discount campaign",
      keywords: ["collage", "mixed_media", "maximalist", "pop_poster", "sale", "promotional"],
      extraProducts: 0,
      brief: "Experimental maximalist pop collage poster for urban street campaign.",
      brandName: "StreetVibe",
      brandInfo: "Urban fashion and lifestyle brand",
      copyItems: ["NEW DROP 2026", "STREETVIBE X ARTIST", "GET YOURS TODAY"],
    },
    {
      name: "D. Very Long User Brief + Brand Context + 3 Products",
      summary: "Comprehensive commercial promotional campaign poster for multi-product luxury beverage collection featuring fantasy floating elements, 3D render accents, and cinematic photographic realism.",
      keywords: ["fantasy", "cinematic", "3d_render", "sale", "promotional", "minimal", "luxury"],
      extraProducts: 2,
      brief: "We are launching our revolutionary 2026 Summer Luxury Beverage Trio featuring triple-distilled botanical extracts. The poster must dramatically feature all three distinct bottles (Matcha Gold, Rose Quartz, and Charcoal Velvet). The composition requires a harmonious balance of fantasy floating botanical particles, volumetric 3D CGI light rays, photographic realism in texture rendering, and an unmistakable premium luxury editorial aesthetic. Ensure every bottle identity is strictly preserved without cross-contamination. Header text must command attention while allowing negative space for high-end luxury positioning.",
      brandName: "Botanica Royale Global Limited",
      brandInfo: "Botanica Royale is an award-winning luxury organic beverage manufacturer operating across Europe, Asia, and North America. Renowned for sustainable glass packaging, hand-harvested ingredients, and uncompromising visual aesthetics.",
      copyItems: [
        { text: "BOTANICA ROYALE SUMMER COLLECTION 2026", type: "headline" },
        { text: "Experience the pinnacle of organic botanical distillation", type: "subheadline" },
        { text: "Matcha Gold • Rose Quartz • Charcoal Velvet", type: "product_name" },
        { text: "SPECIAL LAUNCH PRICE 149.00 USD PER SET", type: "price" },
        { text: "ORDER NOW ON BOTANICAROYALE.COM / LIMITED STOCK AVAILABLE", type: "cta" },
      ],
      hardRequirements: [
        "Must feature all 3 products prominently with distinct identity isolation",
        "Must use premium gold and deep emerald color harmony",
        "Zero distortion of reference logos or product labeling",
      ],
    },
    {
      name: "E. Unknown Style Test (Bioluminescent Brutalist Dreamcore Poster)",
      summary: "bioluminescent brutalist dreamcore poster",
      keywords: ["bioluminescent", "brutalist", "dreamcore"],
      extraProducts: 0,
      brief: "A bioluminescent brutalist dreamcore poster featuring a futuristic glowing product.",
      brandName: "NeoCore",
      brandInfo: "Experimental biotech aesthetic brand",
      copyItems: ["DREAMCORE 2026"],
    },
  ];

  for (const c of cases) {
    console.log(`\n========================================`);
    console.log(`Testing Fixture ${c.name}`);
    console.log(`========================================`);

    const routing = createRouting(c.summary, c.keywords, c.extraProducts);
    const retrieval = await SmartKnowledgeRetriever.retrieve(
      routing,
      ["REF_01", "REF_02", "REF_03"].slice(0, 1 + c.extraProducts),
      null,
      {
        useCase: "Poster",
        brief: c.brief,
        brandName: c.brandName,
        brandInfo: c.brandInfo,
        copyItems: c.copyItems,
        hardRequirements: c.hardRequirements,
      }
    );

    if (!retrieval.success || !retrieval.package) {
      console.error("Retrieval failed:", retrieval.error);
      continue;
    }

    const selectedIds = retrieval.package.selected_blocks.map((b) => b.id);
    const posterBlocks = selectedIds.filter(
      (id) => id.startsWith("specialist.poster_") || id === "specialist.commercial_poster_design"
    );

    const compilerInput: MasterPromptCompilerInput = {
      brief: c.brief,
      useCase: "Poster",
      productCount: 1 + c.extraProducts,
      brandName: c.brandName,
      brandInfo: c.brandInfo,
      copyItems: c.copyItems as any,
      hardRequirements: c.hardRequirements,
      routingResult: routing,
      knowledgePackage: retrieval.package,
      productReferences: Array.from({ length: 1 + c.extraProducts }, (_, i) => ({ reference_id: `REF_0${i + 1}`, input_index: i })),
    };

    const compileRes = await compiler.compile(compilerInput);
    if (!compileRes.success || !compileRes.package) {
      console.error("Compilation failed:", compileRes.error);
      continue;
    }

    const promptChars = compileRes.package.stats.prompt_characters;
    const estimatedTokens = compileRes.package.stats.estimated_prompt_tokens;

    const universalIds = retrieval.package.universal_blocks.map((b) => b.id);

    let posterKnowledgeChars = 0;
    const repoDir = path.join(process.cwd(), "data/knowledge");
    for (const bId of posterBlocks) {
      const parts = bId.split(".");
      const subFolder = parts[0] === "specialist" ? "specialist" : parts[0];
      const folderName = parts.slice(1).join("_");
      const kPath = path.join(repoDir, subFolder, folderName, "knowledge.md");
      if (fs.existsSync(kPath)) {
        posterKnowledgeChars += fs.readFileSync(kPath, "utf-8").length;
      }
    }

    console.log(`Selected Universal Blocks (${universalIds.length}):`, universalIds);
    console.log(`Selected Specialist Blocks (${selectedIds.length}):`, selectedIds);
    console.log(`Selected Poster Blocks specifically (${posterBlocks.length}):`, posterBlocks);
    console.log(`Poster Knowledge Chars: ${posterKnowledgeChars} chars`);
    console.log(`Total Compiled Prompt Chars: ${promptChars}`);
    console.log(`Total Estimated Tokens: ${estimatedTokens}`);
    console.log(`Prompt Budget Status: ${promptChars <= 20000 ? "PASS (UNDER 20K CEILING)" : "EXCEEDED"}`);
  }

  // Non-Poster Outputs Regression Test
  console.log(`\n========================================`);
  console.log(`Testing Non-Poster Outputs Regression`);
  console.log(`========================================`);
  const nonPosterUseCases = ["Social Post", "Banner", "Menu", "E-commerce", "Thumbnail", "Khác"];
  for (const uc of nonPosterUseCases) {
    const routing = createRouting(`Test generation for ${uc}`, ["commercial", "beverage"], 0);
    const retrieval = await SmartKnowledgeRetriever.retrieve(routing, ["REF_01"], null, { useCase: uc });
    if (retrieval.success && retrieval.package) {
      const selectedIds = retrieval.package.selected_blocks.map((b) => b.id);
      const posterBlocks = selectedIds.filter(
        (id) => id.startsWith("specialist.poster_") || id === "specialist.commercial_poster_design"
      );
      console.log(`UseCase '${uc}': Selected Poster Blocks = ${posterBlocks.length} (${posterBlocks.join(", ") || "NONE"}) -> ${posterBlocks.length === 0 ? "PASSED REGRESSION" : "FAILED"}`);
    }
  }
}

testWorstCases().catch(console.error);
