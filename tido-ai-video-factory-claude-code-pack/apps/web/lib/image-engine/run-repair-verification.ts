/**
 * Creative validation harness.
 *
 * Runs five realistic commercial briefs through interpretation → strategy →
 * art-direction resolution → layout → compilation, prints the six-part report for
 * each, and asserts the invariants the repair exists to guarantee:
 *
 *   - explicit client instructions survive and are never contradicted
 *   - a vague client word does NOT outrank reasoned professional direction,
 *     but is still carried into the prompt as a tone note
 *   - marketing reasoning reaches the visuals, not just the metadata
 *   - a reference image overrides strategy and knowledge, but not the client
 *   - retrieved knowledge is present at render time
 *   - art direction is stated exactly once
 *
 * Build:  npx tsc -p tsconfig.verify.json
 * Run:    node .verify-build/apps/web/lib/image-engine/run-repair-verification.js
 * Flags:  WRITE_SAMPLES=1  writes each compiled prompt to data/samples/
 *         DUMP_SECTIONS=1  prints per-section character counts
 */
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { CreativeInterpretationService } from "./service/CreativeInterpretationService";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { CommercialLayoutService } from "./service/CommercialLayoutService";
import { MarketingBrainStrategy } from "./llm/prompt-strategy.schema";
import {
  InspirationStyleManifest,
  KnowledgePackageV1,
  MasterPromptCompilerInput,
  RoutingResultSchema,
  SelectedBlockEntry,
  StructuredInputIntentV1,
} from "./types";

let failures = 0;
let passes = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passes++;
    console.log(`     ✓ ${message}`);
  } else {
    failures++;
    console.error(`     ✗ ${message}`);
    process.exitCode = 1;
  }
}

function rule(char = "─", width = 78) {
  console.log(char.repeat(width));
}

function heading(title: string) {
  console.log("");
  rule("═");
  console.log(title);
  rule("═");
}

function part(n: number, title: string) {
  console.log(`\n  ${n}. ${title}`);
  console.log(`  ${"-".repeat(72)}`);
}

// ── Shared fixtures ─────────────────────────────────────────────────────
const universal = (id: string, title: string): SelectedBlockEntry => ({
  id,
  version: "1.0.1",
  title,
  knowledge_type: "UNIVERSAL",
  selection_tier: "UNIVERSAL",
  final_score: 1,
  scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 },
  matched_signals: [],
  selection_reasons: [],
  estimated_tokens: 240,
});

const knowledgePackage: KnowledgePackageV1 = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: [
    universal("universal.commercial_visual_hierarchy", "Visual Hierarchy"),
    universal("universal.camera_perspective_coherence", "Perspective Coherence"),
    universal("universal.lighting_material_readability", "Lighting & Material Readability"),
    universal("universal.typography_graphic_integration", "Typography Integration"),
    universal("universal.physical_scene_coherence", "Physical Scene Coherence"),
  ],
  selected_blocks: [
    {
      id: "material.glass",
      version: "1.0.0",
      title: "Glass Optics",
      knowledge_type: "MATERIAL",
      selection_tier: "PRIMARY",
      final_score: 0.88,
      scores: { metadata: 0.9, semantic: 0.85, signal_confidence: 0.9, information_value: 0.9, priority: 0.8, query_importance: 0.9, redundancy_penalty: 0 },
      matched_signals: ["materials:Glass"],
      selection_reasons: ["Strong metadata match"],
      estimated_tokens: 210,
    },
  ],
  rejected_candidates: [],
  warnings: [],
  stats: { repository_blocks: 16, metadata_candidates: 3, semantic_candidates: 3, fused_candidates: 3, selected_blocks: 6, estimated_tokens: 1400, duration_ms: 10 },
};

function routing(summary: string, intent: Partial<StructuredInputIntentV1>): RoutingResultSchema {
  return {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.96,
        summary,
        categories: [{ value: "Consumer product", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Reference photo" }],
        industry_domains: [],
        likely_functions: [],
        materials: [{ value: "Glass", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Transparent surface" }],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
    routing_summary: summary,
    structured_input_intent: {
      core_creative_intent: intent.core_creative_intent || summary,
      global_visual_language: intent.global_visual_language || "photographic",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [],
      ...intent,
    } as StructuredInputIntentV1,
  } as RoutingResultSchema;
}

// ── Cases ───────────────────────────────────────────────────────────────
interface Case {
  name: string;
  userInput: string;
  useCase: string;
  aspectRatio: string;
  brandName: string;
  copyItems: { text: string; type: any }[];
  marketingContext: { industry?: string; objective?: string; target_channel?: string; target_audience?: string };
  routerIntent: Partial<StructuredInputIntentV1>;
  strategy: MarketingBrainStrategy;
  inspiration?: InspirationStyleManifest;
  hasLogo?: boolean;
  mustContain: string[];
  mustNotContain: string[];
  /** Dimensions the client stated concretely; must resolve to USER and be locked. */
  expectClientLocked?: string[];
  /** Dimensions the client only gestured at; must NOT be locked, but must survive as a qualifier. */
  expectQualifierOnly?: { dimension: string; word: string }[];
  /** Dimensions a reference image must own. */
  expectReferenceOwned?: string[];
  /** Dimensions the strategy should win when nobody more authoritative spoke. */
  expectStrategyOwned?: string[];
  /** Dimensions the client stated, but not in executable detail — USER still owns them. */
  expectClientOwned?: string[];
}

const cases: Case[] = [
  {
    name: "CASE 1 — Luxury skincare poster (Vietnamese brief, explicit top-down camera + vague 'premium')",
    userInput:
      "Làm visual cho sản phẩm skincare này với góc top view hơi nghiêng, chai đặt giữa mặt nước trong, ánh sáng phản chiếu đẹp. Nhìn phải thật premium.",
    useCase: "poster",
    aspectRatio: "4:5",
    brandName: "Centella",
    copyItems: [{ text: "DƯỠNG ẨM CHUYÊN SÂU", type: "headline" }],
    marketingContext: { industry: "beauty_skincare", objective: "conversion", target_channel: "social_media" },
    routerIntent: {
      core_creative_intent: "Premium skincare serum bottle photographed from above on still clear water",
      scene_environment: "shallow still clear water surface",
      mood_emotion: "premium",
      camera_requests: "slightly tilted top-down view looking straight down at the bottle",
      lighting_requests: "soft reflective light producing clean reflections on the water surface",
      material_or_visual_effect_requests: "glass refraction and water reflections",
    },
    strategy: {
      creative_angle: "Hydration you can see before you feel it.",
      consumer_insight:
        "Skincare buyers distrust claims but trust evidence — they are looking for proof of purity, not another promise of it.",
      emotional_response: "calm, clean, reassured",
      creative_message: "This is clarity you can look straight into.",
      visual_translation: {
        subject_representation: "The bottle alone, unhandled, treated as a specimen rather than a lifestyle prop",
        atmosphere: "still, cool and clinical without feeling cold",
        lighting_character: "soft, even light that keeps water surface tension readable",
        material_treatment: "glass and water rendered with honest refraction, no plastic sheen",
        composition_principle: "one object, centred, surrounded by quiet",
        colour_direction: "cool neutrals with a single green cue for the botanical claim",
      },
      commercial_goal: "Conversion",
      target_customer_psychology: "Ingredient-literate buyers who read labels before they read headlines.",
      composition_strategy: "Single centred hero with generous surrounding calm.",
      prompt_guidance: "Still water, honest glass, quiet frame.",
    },
    mustContain: ["top-down", "water"],
    mustNotContain: ["low to the ground looking up", "15° hero elevation", "Commercial Product", "Shop Now"],
    expectClientLocked: ["camera", "lighting"],
    expectQualifierOnly: [{ dimension: "atmosphere", word: "premium" }],
  },
  {
    name: "CASE 2 — Fashion social advertisement (mobile-first, explicit backlight)",
    userInput:
      "Quảng cáo áo khoác denim cho Gen Z, chụp ngoài phố lúc hoàng hôn, ánh sáng ngược ấm từ phía sau, năng lượng trẻ trung, khung dọc cho feed.",
    useCase: "social_ad",
    aspectRatio: "9:16",
    brandName: "NOMAD",
    copyItems: [{ text: "MỚI RA MẮT", type: "headline" }],
    marketingContext: { industry: "fashion_apparel", objective: "awareness", target_channel: "tiktok" },
    routerIntent: {
      core_creative_intent: "Denim jacket streetwear advertisement shot on a city street at sunset",
      scene_environment: "city street at golden hour",
      mood_emotion: "youthful, energetic",
      camera_requests: "vertical framing for mobile feed, subject full-body",
      lighting_requests: "warm backlight from the setting sun directly behind the subject",
      global_visual_language: "editorial",
    },
    strategy: {
      creative_angle: "The jacket you leave the house in, not the one you photograph.",
      consumer_insight:
        "Gen Z buys clothing as social proof of a life already being lived; a studio product shot reads as a brand talking about itself.",
      emotional_response: "belonging, momentum, ease",
      creative_message: "This is what tonight looks like.",
      visual_translation: {
        subject_representation: "A person mid-movement in real street context, not posed against a backdrop",
        atmosphere: "warm, unhurried end of day",
        lighting_character: "sun behind the subject creating a rim and lifted haze, shadows open not crushed",
        material_treatment: "denim texture and stitching legible even in backlight",
        composition_principle: "subject off-centre with the street receding, room above for the hook",
        colour_direction: "warm amber highlights against cool street shadow",
      },
      commercial_goal: "Awareness",
      target_customer_psychology: "Gen Z buyers who screenshot rather than click.",
      composition_strategy: "Off-centre subject, upper third reserved.",
      prompt_guidance: "Real street, low sun behind, movement.",
    },
    mustContain: ["backlight", "sunset"],
    mustNotContain: ["Commercial Product", "3-point commercial studio lighting"],
    expectClientLocked: ["lighting"],
    expectStrategyOwned: ["colour"],
  },
  {
    name: "CASE 3 — Premium technology product hero (no camera stated — strategy and knowledge must lead)",
    userInput: "Ảnh sản phẩm cao cấp cho tai nghe không dây, nền tối, tôn chất liệu nhôm phay và da.",
    useCase: "product_hero",
    aspectRatio: "1:1",
    brandName: "AURA",
    copyItems: [],
    marketingContext: { industry: "electronics_tech", objective: "branding", target_channel: "website" },
    routerIntent: {
      core_creative_intent: "Premium wireless headphones product photograph on a dark background",
      scene_environment: "dark seamless background",
      mood_emotion: "premium",
      material_or_visual_effect_requests: "brushed aluminium and leather",
      global_visual_language: "photographic",
    },
    strategy: {
      creative_angle: "Engineering you can feel before you hear it.",
      consumer_insight:
        "At this price the decision is made by the hand, not the ear — buyers are checking whether the object deserves to be owned.",
      emotional_response: "precision, restraint, permanence",
      creative_message: "Every surface was decided by someone.",
      visual_translation: {
        subject_representation: "The object isolated and still, close enough to read machining marks",
        atmosphere: "quiet, museum-like restraint",
        lighting_character: "controlled gradient light that travels along an edge to describe form",
        material_treatment: "anodised aluminium grain and leather pore both legible, no blown highlights",
        composition_principle: "single object, generous even emptiness, no props",
        colour_direction: "near-monochrome with one warm metal accent",
      },
      commercial_goal: "Branding",
      target_customer_psychology: "Considered buyers who research before purchase.",
      composition_strategy: "Centred isolation.",
      prompt_guidance: "Isolated object, edge-defining light, dark ground.",
    },
    mustContain: ["dark"],
    mustNotContain: ["Commercial Product", "Special Edition"],
    expectQualifierOnly: [{ dimension: "atmosphere", word: "premium" }],
    // The client named the materials ("nhôm phay và da"), so USER correctly owns
    // that dimension. Colour was never mentioned, so strategy should lead it.
    expectClientOwned: ["materials"],
    expectStrategyOwned: ["colour"],
  },
  {
    name: "CASE 4 — Food commercial banner (reference image supplied — must override strategy and knowledge)",
    userInput: "Banner web cho món phở, dùng ảnh tham khảo này làm phong cách.",
    useCase: "banner",
    aspectRatio: "16:9",
    brandName: "Phở Hà",
    copyItems: [{ text: "MỞ CỬA 6:00", type: "headline" }, { text: "Đặt bàn", type: "cta" }],
    marketingContext: { industry: "food_beverage", objective: "promotion", target_channel: "website" },
    routerIntent: {
      core_creative_intent: "Vietnamese pho bowl web banner styled after a supplied reference photograph",
      mood_emotion: "warm, appetising",
      global_visual_language: "photographic",
    },
    strategy: {
      creative_angle: "The bowl that starts the day.",
      consumer_insight: "People choose a pho shop by how the steam looks, not by the menu.",
      emotional_response: "warmth, appetite, morning ritual",
      creative_message: "Breakfast worth getting up for.",
      visual_translation: {
        subject_representation: "A single bowl mid-service, steam still rising",
        atmosphere: "early morning warmth",
        lighting_character: "soft window light from the side",
        material_treatment: "broth clarity and herb freshness legible",
        composition_principle: "bowl left, breathing room right for the message",
        colour_direction: "warm broth amber against cool morning grey",
      },
      commercial_goal: "Promotion",
      target_customer_psychology: "Local commuters deciding in under a second.",
      composition_strategy: "Left-weighted bowl.",
      prompt_guidance: "Steam, warmth, morning light.",
    },
    inspiration: {
      composition: "Bowl placed low-right with steam filling the upper left third",
      camera: "Low three-quarter angle just above the rim",
      lighting: "Hard side window light raking across the steam",
      colorMood: "Warm amber against deep charcoal",
      environment: "Dark wooden table with scattered herbs",
      visualMood: "Intimate, appetising, slightly moody",
      analyzed_at: new Date().toISOString(),
      source_hash: "testhash",
      derived_from_image: true,
      cameraAngle: "low three-quarter, roughly 20 degrees above the bowl rim",
      focalLength: "50mm, mild compression, natural perspective",
      keyLight: "hard window light from camera-left at 9 o'clock, raking",
      fillAndShadow: "minimal fill, deep shadow on the right, high contrast",
      subjectPlacement: "bowl occupies the lower right third, steam rises through the upper left",
      colorPalette: "amber broth, charcoal table, green herb accents",
      surfaceAndSet: "dark oiled wood, scattered coriander and chilli",
      backgroundTreatment: "unlit falloff to near black behind the bowl",
    },
    hasLogo: true,
    mustContain: ["three-quarter", "camera-left"],
    mustNotContain: ["Commercial Product", "Shop Now"],
    expectReferenceOwned: ["camera", "lighting", "composition", "colour"],
  },
  {
    name: "CASE 5 — Real estate social advertisement (no reference, no explicit camera, generic 'modern' only)",
    userInput: "Quảng cáo căn hộ cao cấp view sông, phong cách modern, đăng Facebook.",
    useCase: "social_ad",
    aspectRatio: "1:1",
    brandName: "Riverside",
    copyItems: [{ text: "Nhận bảng giá", type: "cta" }],
    marketingContext: { industry: "real_estate", objective: "conversion", target_channel: "facebook", target_audience: "Young families upgrading from a first apartment" },
    routerIntent: {
      core_creative_intent: "Premium riverside apartment advertisement",
      scene_environment: "apartment interior with river view",
      mood_emotion: "modern",
      global_visual_language: "photographic",
    },
    strategy: {
      creative_angle: "The view is the floor plan.",
      consumer_insight:
        "Upgrading families are not buying square metres, they are buying the feeling of having arrived somewhere they can stay.",
      emotional_response: "settled, spacious, aspirational but attainable",
      creative_message: "Room to stop moving.",
      visual_translation: {
        subject_representation: "The interior shown from where a resident would actually stand, not an estate-agent wide angle",
        atmosphere: "late afternoon calm, lived-in rather than staged",
        lighting_character: "daylight from the window doing all the work, interior lights off",
        material_treatment: "matte surfaces and textile softness over glossy showroom finish",
        composition_principle: "the window opening as the brightest area, drawing the eye outward",
        colour_direction: "warm neutrals inside against the cooler river light outside",
      },
      commercial_goal: "Conversion",
      target_customer_psychology: "Young families upgrading from a first apartment.",
      composition_strategy: "Window-led depth.",
      prompt_guidance: "Daylight interior, river beyond, calm.",
    },
    mustContain: ["window"],
    mustNotContain: ["Commercial Product", "Special Edition"],
    expectQualifierOnly: [{ dimension: "atmosphere", word: "modern" }],
    expectStrategyOwned: ["lighting", "composition", "colour"],
  },
];

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  TIDO IMAGE ENGINE — CREATIVE VALIDATION (5 COMMERCIAL CASES)            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");

  const compiler = new MasterPromptCompilerService();
  const summary: Record<string, any>[] = [];

  for (const c of cases) {
    heading(c.name);

    const routingResult = routing(c.routerIntent.core_creative_intent || c.userInput, c.routerIntent);

    // ── 1. USER INPUT ──
    part(1, "USER INPUT");
    console.log(`     brief   : ${c.userInput}`);
    console.log(`     format  : ${c.useCase} @ ${c.aspectRatio}   brand: ${c.brandName}`);
    console.log(`     copy    : ${c.copyItems.map((i) => `"${i.text}"`).join(", ") || "(none authorised)"}`);
    console.log(`     context : ${JSON.stringify(c.marketingContext)}`);

    // ── 2. STRUCTURED INTERPRETATION ──
    const interpretation = await CreativeInterpretationService.interpretAsync(
      {
        concept: c.userInput,
        assetType: c.useCase as any,
        productCount: 1,
        aspectRatio: c.aspectRatio,
        referenceAnalysis: routingResult,
        productIdentity: routingResult.products?.[0],
        retrievedKnowledge: ["Commercial Visual Hierarchy"],
        brandContext: { brandName: c.brandName },
      },
      { routerIntent: routingResult.structured_input_intent, llmProvider: { isConfigured: () => false } as any }
    );
    const li = interpretation.locked_intent;

    part(2, "STRUCTURED INTERPRETATION");
    console.log(`     source      : ${interpretation.interpretation_source}`);
    console.log(`     subject     : ${li.subject.join(", ")}`);
    console.log(`     environment : ${li.environment.join(", ") || "(unstated — left empty)"}`);
    console.log(`     mood        : ${li.mood.join(", ") || "(unstated)"}`);
    console.log(`     camera      : ${JSON.stringify(li.camera_requirements)}`);
    console.log(`     lighting    : ${JSON.stringify(li.lighting_requirements)}`);
    console.log(`     materials   : ${JSON.stringify(li.material_requirements || [])}`);
    assert(li.subject.join("").length < 160, "Subject is a noun phrase, not the whole brief");

    // ── 3. MARKETING REASONING ──
    part(3, "MARKETING REASONING");
    console.log(`     insight  : ${c.strategy.consumer_insight}`);
    console.log(`     emotion  : ${c.strategy.emotional_response}`);
    console.log(`     message  : ${c.strategy.creative_message}`);
    console.log(`     visual   : ${c.strategy.visual_translation?.composition_principle}`);

    // ── 4. RESOLVED ART DIRECTION ──
    const resolved = ArtDirectionResolverService.resolve({
      lockedIntent: li,
      inspirationStyleManifest: c.inspiration,
      marketingStrategy: c.strategy,
      assetDefaults: interpretation.execution_directives,
      assetType: c.useCase,
      aspectRatio: c.aspectRatio,
    });

    part(4, "RESOLVED ART DIRECTION");
    for (const [dim, f] of Object.entries(resolved.fields)) {
      const lock = f!.source === "USER" && f!.specificity === "HIGH" ? " [LOCKED]" : "";
      const qual = f!.qualifiers?.length ? `  ← client tone: ${f!.qualifiers.join("; ")}` : "";
      console.log(
        `     ${dim.padEnd(12)} ${f!.source.padEnd(14)} conf ${f!.confidence.toFixed(2)}  ${f!.specificity.padEnd(6)} score ${f!.score.toFixed(3)}${lock}`
      );
      console.log(`     ${" ".repeat(12)} → ${f!.value.slice(0, 110)}${f!.value.length > 110 ? "…" : ""}${qual}`);
    }

    const layout = CommercialLayoutService.plan({
      assetType: c.useCase,
      aspectRatio: c.aspectRatio,
      copyItems: c.copyItems,
      hasLogoAsset: Boolean(c.hasLogo),
      objective: c.marketingContext.objective,
      targetChannel: c.marketingContext.target_channel,
    });
    console.log(`     eye flow     : ${layout.eye_flow}`);
    console.log(`     attention    : ${layout.visual_priority.map((p) => `${p.element}=${p.importance}`).join(", ")}`);

    // ── 5. FINAL PROMPT STRUCTURE ──
    const input: MasterPromptCompilerInput = {
      productReferences: [{ reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 }],
      brief: c.userInput,
      productCount: 1,
      copyItems: c.copyItems,
      brandName: c.brandName,
      hardRequirements: [],
      useCase: c.useCase,
      aspectRatio: c.aspectRatio,
      routingResult,
      knowledgePackage,
      creativeInterpretation: interpretation,
      marketingStrategy: c.strategy,
      marketingContext: c.marketingContext,
      inspirationStyleManifest: c.inspiration,
      hasInspirationReference: Boolean(c.inspiration),
      inspirationImageWithheld: Boolean(c.inspiration),
      hasLogoAsset: Boolean(c.hasLogo),
    };

    const res = await compiler.compile(input);
    assert(res.success, "Compilation succeeded");
    if (!res.success || !res.package) continue;

    const prompt = res.package.compiled_prompt;
    const lower = prompt.toLowerCase();
    const budget = (res.package.provenance as any)?.budget;

    part(5, "FINAL PROMPT STRUCTURE");
    const sections = prompt.split("\n").filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, ""));
    console.log(`     ${sections.join(" → ")}`);
    console.log(`     length: ${prompt.length} chars`);

    if (process.env.WRITE_SAMPLES === "1") {
      const fs = await import("fs");
      const path = await import("path");
      const dir = path.resolve(process.cwd(), "data/samples");
      fs.mkdirSync(dir, { recursive: true });
      const slug = c.name.split("—")[0].trim().toLowerCase().replace(/\s+/g, "_");
      fs.writeFileSync(path.join(dir, `${slug}.md`), prompt, "utf-8");
      console.log(`     sample: data/samples/${slug}.md`);
    }

    if (process.env.DUMP_SECTIONS === "1") {
      const sizes: Record<string, number> = {};
      let cur = "PREAMBLE";
      for (const line of prompt.split("\n")) {
        const h = line.match(/^##\s+(.+?)\s*$/) || line.match(/^\[([A-Z0-9 &—,'\-]+)\]\s*$/);
        if (h) cur = h[1];
        sizes[cur] = (sizes[cur] || 0) + line.length + 1;
      }
      console.log("     section sizes:", Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 5));
    }

    // ── 6. DIAGNOSTICS ──
    part(6, "DIAGNOSTICS");
    console.log(`     interpretation source : ${interpretation.interpretation_source}`);
    console.log(`     art direction         : ${JSON.stringify(resolved.provenance)}`);
    console.log(`     client locks          : ${Object.entries(resolved.fields).filter(([, f]) => f!.source === "USER" && f!.specificity === "HIGH").map(([d]) => d).join(", ") || "(none)"}`);
    console.log(`     candidates considered : ${resolved.candidates.length}, suppressed ${resolved.suppressed.length}`);
    console.log(`     knowledge blocks      : ${res.package.knowledge.universal_block_ids.length} universal + ${res.package.knowledge.specialist_block_ids.length} specialist`);
    console.log(`     duplicate lines cut   : ${budget?.duplicate_lines_removed ?? 0}`);
    console.log(`     sections removed      : ${JSON.stringify((budget?.sections_removed || []).map((r: any) => r.section))}`);
    console.log(`     warnings              : ${JSON.stringify(res.package.compiler_warnings)}`);

    console.log("\n     CHECKS");

    // Did user intent survive?
    for (const phrase of c.mustContain) {
      assert(lower.includes(phrase.toLowerCase()), `User intent survived: "${phrase}" present`);
    }
    for (const phrase of c.mustNotContain) {
      assert(!lower.includes(phrase.toLowerCase()), `No contradiction/placeholder: "${phrase}" absent`);
    }

    // Explicit client instructions are locked and marked.
    for (const dim of c.expectClientLocked || []) {
      const f = resolved.fields[dim as keyof typeof resolved.fields];
      assert(
        Boolean(f && f.source === "USER" && f.specificity === "HIGH"),
        `Explicit client ${dim} is locked (got ${f?.source}/${f?.specificity})`
      );
    }

    // A vague word must NOT outrank reasoning — but must still reach the prompt.
    for (const q of c.expectQualifierOnly || []) {
      const f = resolved.fields[q.dimension as keyof typeof resolved.fields];
      assert(
        Boolean(f && !(f.source === "USER" && f.specificity === "HIGH")),
        `Vague client word "${q.word}" did not hard-lock ${q.dimension}`
      );
      const carried =
        f?.value.toLowerCase().includes(q.word.toLowerCase()) ||
        (f?.qualifiers || []).some((x) => x.toLowerCase().includes(q.word.toLowerCase()));
      assert(Boolean(carried), `Vague client word "${q.word}" still reached the prompt as intent`);
    }

    // A reference image outranks strategy and knowledge.
    for (const dim of c.expectReferenceOwned || []) {
      const f = resolved.fields[dim as keyof typeof resolved.fields];
      assert(f?.source === "REFERENCE", `Reference image owns ${dim} (got ${f?.source})`);
    }

    for (const dim of c.expectClientOwned || []) {
      const f = resolved.fields[dim as keyof typeof resolved.fields];
      assert(f?.source === "USER", `Client statement owns ${dim} (got ${f?.source})`);
    }

    // Marketing reasoning influences visuals where nobody more authoritative spoke.
    for (const dim of c.expectStrategyOwned || []) {
      const f = resolved.fields[dim as keyof typeof resolved.fields];
      assert(f?.source === "STRATEGY", `Marketing strategy drives ${dim} (got ${f?.source})`);
    }

    // Marketing reasoning is visible in the prompt, not just in metadata.
    assert(prompt.includes("## CAMPAIGN STRATEGY"), "Campaign strategy section present");
    assert(
      Boolean(c.strategy.consumer_insight && prompt.includes(c.strategy.consumer_insight)),
      "Consumer insight reached the prompt"
    );
    assert(
      Boolean(c.strategy.creative_message && prompt.includes(c.strategy.creative_message)),
      "Creative message reached the prompt"
    );
    assert(prompt.includes("VISUAL TRANSLATION OF THAT MESSAGE:"), "Visual translation reached the prompt");

    // Knowledge, structure and non-contradiction.
    assert(prompt.includes("universal.commercial_visual_hierarchy"), "Retrieved knowledge present at render time");
    assert(prompt.includes("## PROFESSIONAL KNOWLEDGE"), "Professional knowledge section present");
    assert(prompt.includes("## TYPOGRAPHY & READABLE COPY"), "Typography section present");
    assert(prompt.includes("## CONFLICT PRIORITY"), "Conflict priority present");
    assert(prompt.includes("## FINAL OUTPUT"), "Final output instruction present");
    const artBlocks = (prompt.match(/\[RESOLVED ART DIRECTION\]/g) || []).length;
    assert(artBlocks === 1, `Art direction stated exactly once (found ${artBlocks})`);
    assert(!prompt.includes("[CINEMATIC ART DIRECTION & COMMERCIAL PHOTOGRAPHY]"), "No competing cinematic block");

    // Layout intelligence.
    assert(prompt.includes("ATTENTION BUDGET"), "Attention budget reached the prompt");
    assert(prompt.includes("EYE FLOW:"), "Eye flow reached the prompt");
    assert(prompt.includes("NEGATIVE SPACE STRATEGY:"), "Negative space strategy reached the prompt");
    const productPriority = layout.visual_priority.find((p) => p.element === "product");
    assert(Boolean(productPriority), "Product carries an explicit attention weight");
    if (c.copyItems.length > 0) {
      assert(prompt.includes(c.copyItems[0].text), "Authorized copy present verbatim");
      assert(!prompt.includes("Do NOT render words, letters"), "No simultaneous authorize-and-forbid on text");
    }

    // Budget.
    assert(budget?.hard_truncated !== true, "Prompt not hard-truncated");
    assert((budget?.sections_removed || []).length === 0, "No prompt section had to be dropped");

    summary.push({
      case: c.name.split("—")[0].trim(),
      chars: prompt.length,
      camera: resolved.fields.camera?.source,
      lighting: resolved.fields.lighting?.source,
      colour: resolved.fields.colour?.source,
      locks: Object.entries(resolved.fields).filter(([, f]) => f!.source === "USER" && f!.specificity === "HIGH").length,
      eye_flow: layout.eye_flow,
      dropped: (budget?.sections_removed || []).length,
    });
  }

  heading("SUMMARY");
  console.table(summary);
  console.log(`\n${passes} passed, ${failures} failed\n`);
}

run().catch((err) => {
  console.error("Harness crashed:", err);
  process.exitCode = 1;
});
