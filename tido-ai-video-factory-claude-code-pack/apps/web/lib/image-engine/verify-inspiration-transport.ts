/**
 * TIDO PICTURE ENGINE — INSPIRATION TRANSPORT VERIFICATION
 *
 * Proves the inspiration reference survives every hop that previously dropped it:
 *   1. Adapter honors an explicit INSPIRATION_REFERENCE role over the PRODUCT fallback.
 *   2. Adapter honors it over a WRONG LLM router classification.
 *   3. generationReferences preserves INSPIRATION_REFERENCE (no collapse to SUPPORT).
 *   4. The model-visible brief emits an inspiration role line.
 *   5. The provider resolves it to a style label, not PRODUCT_IDENTITY.
 *
 * Run: npx tsx lib/image-engine/verify-inspiration-transport.ts
 */
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { PromptBudgetManagerService } from "./service/PromptBudgetManagerService";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import { RoutingResultSchema, SimpleInputRequestV1 } from "./types";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const productBuffer = Buffer.alloc(2048, 1);
const inspirationBuffer = Buffer.alloc(4096, 2);

/** Mirrors what the route now produces from multipart FormData. */
const request: SimpleInputRequestV1 = {
  concept: "Coca Cola can, premium cold beverage advertisement",
  useCase: "Poster",
  aspectRatio: "4:5",
  brandName: "Coca Cola",
  images: [
    {
      reference_id: "REF_01",
      buffer: productBuffer,
      mimeType: "image/png",
      filename: "coca-cola-can.png",
    },
    {
      reference_id: "REF_02_INSPIRATION",
      buffer: inspirationBuffer,
      mimeType: "image/png",
      filename: "sprite-luxury-ad.png",
      role: "INSPIRATION_REFERENCE",
    },
  ],
};

/**
 * Routing result that misclassifies BOTH images as product identity.
 * This is the exact condition that silently destroyed style transfer before.
 */
const hostileRouting: RoutingResultSchema = {
  routing_version: "1.0",
  routing_mode: "SINGLE_PRODUCT" as any,
  routing_summary: "Beverage can",
  global_retrieval_queries: [],
  requires_universal_core: false,
  products: [
    {
      product_id: "PRODUCT_01",
      reference_ids: ["REF_01", "REF_02_INSPIRATION"],
      reference_relationship_confidence: 0.9,
      summary: "Beverage can",
      categories: [],
      industry_domains: [],
      likely_functions: [],
      materials: [],
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
  asset_roles: [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
    { reference_id: "REF_02_INSPIRATION", role: "PRODUCT", confidence: 0.85 },
  ],
} as any;

console.log("========================================================");
console.log("INSPIRATION TRANSPORT VERIFICATION");
console.log("========================================================\n");

console.log("[1] Adapter role resolution (vs. hostile PRODUCT misclassification)");
const adapted = SimpleInputAdapterService.adapt(request, hostileRouting);

check("adapter returns READY", adapted.status === "READY", `got ${adapted.status}`);
check(
  "inspiration is NOT treated as a product candidate",
  !adapted.productCandidates.some((p) => p.reference_id === "REF_02_INSPIRATION"),
  `productCandidates=${adapted.productCandidates.map((p) => p.reference_id).join(",")}`
);
check(
  "real product IS still a product candidate",
  adapted.productCandidates.some((p) => p.reference_id === "REF_01")
);
check(
  "inspiration lands in supportReferences",
  adapted.supportReferences.some((s) => s.reference_id === "REF_02_INSPIRATION"),
  `supportReferences=${adapted.supportReferences.map((s) => s.reference_id).join(",")}`
);

console.log("\n[2] Role preservation into generation references");
const inspirationRef = adapted.generationReferences.find(
  (r) => r.reference_id === "REF_02_INSPIRATION"
);
check("inspiration reaches generationReferences", Boolean(inspirationRef));
check(
  "role is INSPIRATION_REFERENCE (not collapsed to SUPPORT_REFERENCE)",
  (inspirationRef?.role as string) === "INSPIRATION_REFERENCE",
  `got ${inspirationRef?.role}`
);
check(
  "product reference keeps PRODUCT role",
  adapted.generationReferences.find((r) => r.reference_id === "REF_01")?.role === "PRODUCT"
);

console.log("\n[3] Model-visible brief carries an inspiration directive");
const briefText = (adapted.compilerInput as any)?.generationIntentBriefText
  || (adapted.compilerInput as any)?.compilerBrief
  || JSON.stringify(adapted.compilerInput || {});
check(
  "brief mentions INSPIRATION REFERENCE",
  briefText.includes("INSPIRATION REFERENCE"),
  "role map line missing"
);
check(
  "brief forbids copying inspiration product identity",
  /Do NOT copy its product/i.test(briefText)
);

console.log("\n[2b] Inspiration must NOT be bound into product identity");
const productRefIdSets = (adapted.resolvedRoutingResult.products || []).map((p) => p.reference_ids);
check(
  "no product owns the inspiration reference",
  !JSON.stringify(productRefIdSets).includes("INSPIRATION"),
  `products[].reference_ids=${JSON.stringify(productRefIdSets)}`
);
check(
  "resolved product count stays 1 (not merged into 2)",
  adapted.resolvedProductCount === 1,
  `got ${adapted.resolvedProductCount}`
);
check(
  "resolvedRoutingResult.asset_roles reflects corrected roles",
  (adapted.resolvedRoutingResult.asset_roles || []).some(
    (a) => a.reference_id === "REF_02_INSPIRATION" && (a.role as string) === "INSPIRATION_REFERENCE"
  )
);

console.log("\n[2c] Router fallback ids must not create a phantom product");
/**
 * When the Gemini router is unreachable, KnowledgeRouterService rebuilds asset roles
 * positionally as REF_01, REF_02, ... A decorated inspiration id (REF_02_INSPIRATION)
 * did not match those, so the positional REF_02 survived as an extra PRODUCT and the
 * pipeline reported 2 products for a 2-image request.
 */
const fallbackRouting: RoutingResultSchema = {
  ...hostileRouting,
  products: [
    {
      ...(hostileRouting.products as any)[0],
      reference_ids: ["REF_01", "REF_02"],
    },
  ],
  asset_roles: [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 },
    { reference_id: "REF_02", role: "PRODUCT", confidence: 0.9 },
  ],
} as any;

const positionalRequest: SimpleInputRequestV1 = {
  ...request,
  images: [
    { reference_id: "REF_01", buffer: productBuffer, mimeType: "image/png", filename: "coke.png" },
    {
      reference_id: "REF_02",
      buffer: inspirationBuffer,
      mimeType: "image/png",
      filename: "sprite.png",
      role: "INSPIRATION_REFERENCE",
    },
  ],
};

const fallbackAdapted = SimpleInputAdapterService.adapt(positionalRequest, fallbackRouting);
check(
  "no phantom third reference is invented",
  fallbackAdapted.generationReferences.length === 2,
  `generationReferences=${fallbackAdapted.generationReferences.map((r) => `${r.reference_id}:${r.role}`).join(",")}`
);
check(
  "product count is 1, not 2",
  fallbackAdapted.resolvedProductCount === 1,
  `got ${fallbackAdapted.resolvedProductCount}`
);
check(
  "REF_02 is inspiration, not a second product",
  fallbackAdapted.generationReferences.find((r) => r.reference_id === "REF_02")?.role ===
    ("INSPIRATION_REFERENCE" as any),
  `got ${fallbackAdapted.generationReferences.find((r) => r.reference_id === "REF_02")?.role}`
);

console.log("\n[3b] Compiler receives the inspiration flag");
check(
  "compilerInput.hasInspirationReference is true",
  (adapted.compilerInput as any)?.hasInspirationReference === true,
  `got ${(adapted.compilerInput as any)?.hasInspirationReference}`
);

console.log("\n[4] Provider label resolution");
function resolveProviderLabel(ref: ProviderReferenceImage): string {
  const isSupport =
    ref.role === "SUPPORT_REFERENCE" ||
    (ref.role as string) === "INSPIRATION_REFERENCE" ||
    ref.reference_id?.includes("INSPIRATION") ||
    ref.reference_id?.includes("STYLE");
  if (isSupport) return "INSPIRATION_REFERENCE";
  if (ref.role === "LOGO") return "LOGO";
  return "PRODUCT_IDENTITY";
}

check(
  "inspiration resolves to style label at provider",
  resolveProviderLabel({
    reference_id: "REF_02_INSPIRATION",
    role: "INSPIRATION_REFERENCE",
    mimeType: "image/png",
    buffer: inspirationBuffer,
  }) === "INSPIRATION_REFERENCE"
);
check(
  "product resolves to PRODUCT_IDENTITY at provider",
  resolveProviderLabel({
    reference_id: "REF_01",
    role: "PRODUCT",
    product_id: "PRODUCT_01",
    mimeType: "image/png",
    buffer: productBuffer,
  }) === "PRODUCT_IDENTITY"
);

console.log("\n[5] Regression guard: no explicit role still behaves as before");
const legacyRequest: SimpleInputRequestV1 = {
  ...request,
  images: [{ reference_id: "REF_01", buffer: productBuffer, mimeType: "image/png", filename: "p.png" }],
};
const legacyAdapted = SimpleInputAdapterService.adapt(legacyRequest, {
  ...hostileRouting,
  products: [{ ...(hostileRouting.products as any)[0], reference_ids: ["REF_01"] }],
  asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
} as any);
check("legacy single-product flow unchanged", legacyAdapted.status === "READY");
check(
  "legacy product keeps PRODUCT role",
  legacyAdapted.generationReferences[0]?.role === "PRODUCT"
);

(async () => {
  console.log("\n[6] Compiled prompt forbids rendering the inspiration's own product");
  const compiler = new MasterPromptCompilerService();
  const res = await compiler.compile({
    brief: "Coca Cola can premium cold beverage poster",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "Coca Cola",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    hasInspirationReference: true,
    inspirationReferenceRules: ["Inspiration is a Sprite premium ice advertisement, dark dramatic lighting."],
  } as any);

  const prompt = res.package?.compiled_prompt || "";
  check("prompt compiled", Boolean(prompt), res.error?.message);
  check(
    "survives compression: inspiration block present",
    prompt.includes("[INSPIRATION REFERENCE RULES"),
    "block stripped by optimizer/budget"
  );
  check("subject lock present", prompt.includes("SUBJECT LOCK"));
  check("locks product count to exactly 1", /EXACTLY 1 product unit/.test(prompt));
  check(
    "forbids inspiration product appearing",
    /MUST NOT appear in the output/.test(prompt)
  );
  check("forbids duo/side-by-side pairing", /NOT a duo, bundle, comparison, side-by-side/.test(prompt));
  check(
    "points at the real inspiration reference id",
    prompt.includes("REF_02_INSPIRATION"),
    "hardcoded REF_02 instead of actual id"
  );
  check(
    "points at the real product reference id",
    /PRODUCT REFERENCE IMAGE \(IMAGE 1 \/ REF_01\)/.test(prompt)
  );
  check(
    "no fabricated style directive when manifest is not image-derived",
    !prompt.includes("[INSPIRED VISUAL STYLE DIRECTIVE]"),
    "text-inferred style block leaked into prompt"
  );

  console.log("\n[7] Analyze-first mode: inspiration image withheld from the generator");
  const visionManifest: any = {
    composition: "Hero bottle centred, citrus halves clustered low, leaves suspended mid-air.",
    camera: "Slightly below eye level, 85mm, shallow depth of field.",
    lighting: "Warm key from upper right, strong speculars on glass, soft falloff.",
    colorMood: "Saturated orange-to-yellow gradient, high warmth, punchy contrast.",
    environment: "Seamless orange gradient backdrop, glossy wet surface with splash.",
    visualMood: "Energetic premium skincare advertising.",
    derived_from_image: true,
  };

  const withheldRes = await compiler.compile({
    brief: "SKIN1004 Centella ampoule poster",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "SKIN1004",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    hasInspirationReference: true,
    inspirationStyleManifest: visionManifest,
    inspirationImageWithheld: true,
  } as any);

  const withheldPrompt = withheldRes.package?.compiled_prompt || "";
  check("withheld-mode prompt compiled", Boolean(withheldPrompt));
  check(
    "art direction block replaces the attachment hierarchy",
    withheldPrompt.includes("[ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT]")
  );
  check(
    "never points the model at a non-existent IMAGE 2",
    !withheldPrompt.includes("IMAGE 2"),
    "prompt still refers to an attachment that was not sent"
  );
  check(
    "carries the analyzed style verbally",
    withheldPrompt.includes("Seamless orange gradient backdrop") &&
    withheldPrompt.includes("Warm key from upper right"),
    "style manifest was not injected"
  );
  check("forbids inventing a second product", /Do NOT invent, add, or imagine any second product/.test(withheldPrompt));
  check("still locks the subject count", /EXACTLY 1 product unit/.test(withheldPrompt));
  check(
    "forbids drawing reference labels into the picture",
    /Do NOT render any reference identifier/.test(withheldPrompt),
    "REF_01/REF_02 captions can be rendered into the image"
  );

  console.log("\n[8] Fallback: vision unavailable keeps the old attach-the-image behaviour");
  const fallbackRes = await compiler.compile({
    brief: "SKIN1004 Centella ampoule poster",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    hasInspirationReference: true,
    inspirationImageWithheld: false,
  } as any);
  const fallbackPrompt = fallbackRes.package?.compiled_prompt || "";
  check(
    "fallback keeps the attachment hierarchy",
    fallbackPrompt.includes("[INSPIRATION REFERENCE RULES")
  );
  check("fallback still forbids the inspiration product", /MUST NOT appear in the output/.test(fallbackPrompt));

  console.log("\n[8b] Deep shot-sheet analysis reaches the prompt in full");
  const deepManifest: any = {
    ...visionManifest,
    cameraAngle: "Just below the bottle mid-line, level tilt.",
    focalLength: "85mm equivalent, mild compression.",
    cameraDistance: "Bottle occupies about 60% of frame height.",
    depthOfField: "f/5.6 feel, props softening from mid-frame back.",
    keyLight: "Key from upper right at 2 o'clock, 45 degrees elevation.",
    fillAndShadow: "Fill ratio about 1:3, shadows falling lower-left.",
    rimAndHighlights: "Bright vertical rim on the left glass edge.",
    lightColorTemperature: "Warm, around 3200K, no cool gel.",
    subjectPlacement: "Dead centre, base sitting on the waterline.",
    depthLayering: "Citrus foreground, whole fruit midground, gradient backdrop.",
    negativeSpace: "Upper third kept clear for a headline.",
    colorPalette: "Amber #E8802A, sunlit yellow #F5C24B, grapefruit pink #E7565B.",
    colorGrading: "High saturation, punchy contrast, slightly crushed blacks.",
    propStyling: "Six to eight citrus pieces arranged in a low arc.",
    surfaceAndSet: "Glossy wet acrylic with a shallow liquid film.",
    backgroundTreatment: "Radial orange-to-amber gradient, vignetted corners.",
    motionAndEffects: "Suspended leaves mid-air, droplet spray, splash crown.",
    finishing: "High micro-contrast, subtle bloom on speculars.",
    photographicStyle: "Contemporary premium beauty advertising.",
  };

  const deepRes = await compiler.compile({
    brief: "SKIN1004 Centella ampoule poster",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "SKIN1004",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    hasInspirationReference: true,
    inspirationStyleManifest: deepManifest,
    inspirationImageWithheld: true,
  } as any);
  const deepPrompt = deepRes.package?.compiled_prompt || "";

  for (const heading of ["CAMERA", "LIGHTING", "COMPOSITION", "COLOUR", "SET, PROPS & EFFECTS", "FINISHING"]) {
    check(`shot sheet section present: ${heading}`, deepPrompt.includes(heading));
  }
  for (const detail of [
    "45 degrees elevation",
    "Fill ratio about 1:3",
    "3200K",
    "Upper third kept clear",
    "#E8802A",
    "low arc",
    "vignetted corners",
    "droplet spray",
  ]) {
    check(`carries specific detail: ${detail}`, deepPrompt.includes(detail));
  }
  check(
    "deep prompt still fits the hard budget",
    deepPrompt.length <= 20000,
    `${deepPrompt.length} chars`
  );

  console.log("\n[8c] Partial analysis degrades without printing empty headings");
  const sparseRes = await compiler.compile({
    brief: "SKIN1004 Centella ampoule poster",
    useCase: "Poster",
    aspectRatio: "1:1",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    hasInspirationReference: true,
    inspirationStyleManifest: visionManifest,
    inspirationImageWithheld: true,
  } as any);
  const sparsePrompt = sparseRes.package?.compiled_prompt || "";
  check("summary lines still emitted", sparsePrompt.includes("Warm key from upper right"));
  check(
    "no empty label left dangling",
    !/:\s*(\n|$)/.test(sparsePrompt.slice(sparsePrompt.indexOf("[INSPIRED VISUAL STYLE DIRECTIVE]"))),
    "a heading was printed with no value"
  );

  console.log("\n[8d] Competing camera orders must yield to the analyzed shot sheet");
  /**
   * Three layers emit their own camera/lighting orders and all three default to
   * "eye-level 50mm commercial hero". They sit earlier in the prompt than the art
   * direction and used to outvote it, which is why renders kept their own angle no
   * matter what the reference photograph showed.
   */
  const creativeInterpretation: any = {
    original_concept: "SKIN1004 Centella ampoule poster",
    asset_type: "poster",
    locked_intent: {
      subject: ["Centella ampoule"],
      environment: ["commercial background"],
      mood: ["premium"],
      camera_requirements: [],
      lighting_requirements: [],
      non_negotiable_constraints: [],
    },
    ai_enhancement: {
      creative_objective: "premium skincare hero",
      visual_hierarchy: "product first",
      commercial_reasoning: "brand trust",
    },
    execution_directives: {
      camera_execution: "Eye-level 50mm prime hero framing",
      lighting_execution: "Three-point softbox studio lighting",
      composition_layout: "Centred balanced hero",
      subject_scale_ratio: "Product fills 55% of frame",
      text_clearance: "Upper third reserved",
      shot_distance: "Medium",
      depth_of_field: "f/8",
      negative_composition_constraints: ["No clutter"],
      cinematic_art_direction: {
        cinematic_camera_direction:
          "Position camera at eye-level with a 50mm prime lens, framing the product with balanced spatial proportions.",
        photographic_lighting_design:
          "Deploy 3-point studio lighting with key softbox illumination from camera-left 45 degrees.",
        visual_storytelling_composition: "Hero centred narrative",
        subject_focal_emphasis: "Label sharp",
        typography_clearance_art_direction: "Upper third clear",
      },
    },
  };

  const conflictBase = {
    brief: "SKIN1004 Centella ampoule poster",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "SKIN1004",
    routingResult: adapted.resolvedRoutingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      universal_blocks: [],
      specialist_blocks: [],
      recipe_blocks: [],
    } as any,
    creativeInterpretation,
  };

  const governedRes = await compiler.compile({
    ...conflictBase,
    hasInspirationReference: true,
    inspirationStyleManifest: deepManifest,
    inspirationImageWithheld: true,
  } as any);
  const governedPrompt = governedRes.package?.compiled_prompt || "";

  check(
    "default eye-level hero angle removed",
    !governedPrompt.includes("Eye-level commercial hero angle"),
    "creative knowledge camera line still competing"
  );
  check(
    "default 50mm prime order removed",
    !governedPrompt.includes("50mm prime lens"),
    "cinematic art direction camera line still competing"
  );
  check(
    "default 3-point softbox order removed",
    !governedPrompt.includes("Deploy 3-point studio lighting"),
    "lighting design line still competing"
  );
  check(
    "layers explicitly defer to the art direction",
    governedPrompt.includes("DEFER ENTIRELY") || governedPrompt.includes("GOVERNED EXCLUSIVELY"),
    "no deferral marker emitted"
  );
  check(
    "analyzed camera angle survives",
    governedPrompt.includes("Just below the bottle mid-line"),
    "shot sheet angle missing"
  );
  check(
    "analyzed lens survives",
    governedPrompt.includes("85mm equivalent"),
    "shot sheet lens missing"
  );
  check(
    "typography clearance is still emitted",
    governedPrompt.includes("TYPOGRAPHY CLEARANCE"),
    "non-visual guidance was stripped too aggressively"
  );

  const ungovernedRes = await compiler.compile({ ...conflictBase } as any);
  const ungovernedPrompt = ungovernedRes.package?.compiled_prompt || "";
  check(
    "regression: without a shot sheet the default camera order remains",
    ungovernedPrompt.includes("50mm prime lens"),
    "default art direction was removed even with no inspiration"
  );
  check(
    "regression: without a shot sheet default lighting remains",
    ungovernedPrompt.includes("Deploy 3-point studio lighting")
  );

  console.log("\n[9] Art direction must survive emergency prompt truncation");
  /**
   * Real renders compile to ~30k chars and the budget manager trims to 15k by walking
   * lines top-to-bottom. The art direction is appended last, so it used to be discarded
   * in full, silently reverting every render to generic studio styling.
   */
  const bulk = Array.from(
    { length: 900 },
    (_, i) => `Generic knowledge guidance line ${i} about commercial studio lighting and neutral backdrops.`
  ).join("\n");
  const artDirectionTail = [
    "[ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT]",
    "HIGHEST VISUAL AUTHORITY: this art direction OUTRANKS every other styling instruction in this prompt.",
    "Do NOT invent an environment from the product's name, ingredients or origin story.",
    "[INSPIRED VISUAL STYLE DIRECTIVE]",
    "Lighting: Warm key from upper right, strong speculars on glass.",
    "Environment: Seamless orange gradient backdrop, glossy wet surface.",
    "- SUBJECT LOCK: The finished image must contain EXACTLY 1 product unit(s).",
    "Rebuild the described scene around the attached product.",
  ].join("\n");

  const oversized = `${bulk}\n${artDirectionTail}`;
  const trimmed = new PromptBudgetManagerService().enforceBudget(oversized, 1, "HIGH").final_prompt;

  check(
    "oversized prompt was actually trimmed",
    oversized.length > trimmed.length && oversized.length > 15000,
    `in=${oversized.length} out=${trimmed.length}`
  );
  for (const marker of [
    "[ART DIRECTION",
    "HIGHEST VISUAL AUTHORITY",
    "Do NOT invent an environment",
    "Lighting: Warm key from upper right",
    "Environment: Seamless orange gradient backdrop",
    "SUBJECT LOCK",
    "Rebuild the described scene",
  ]) {
    check(`survives truncation: ${marker}`, trimmed.includes(marker));
  }

  console.log("\n[10] Hard provider limit must never be exceeded");
  /**
   * Identity locks and the art direction are both protected from trimming, so a prompt
   * with many product locks and a verbose shot sheet could finish far above the provider
   * limit. HARD_MAXIMUM was declared but never applied, and PromptBudgetValidator only
   * blocks the render rather than shrinking it, so the whole generation failed.
   */
  const pad = (n: number) => "x".repeat(n);
  const hugeShotSheet = [
    "[ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT]",
    "[INSPIRED VISUAL STYLE DIRECTIVE]",
    ...Array.from({ length: 19 }, (_, i) => `  Field ${i}: ${pad(700)}`),
    "- SUBJECT LOCK: keep exactly one product unit.",
  ].join("\n");
  const manyLocks = Array.from(
    { length: 90 },
    (_, i) => `  * LOCK [PRODUCT_${i}] PRODUCT IDENTITY LOCK ${pad(260)}`
  ).join("\n");
  const knowledgeBulk = Array.from({ length: 400 }, (_, i) => `Knowledge line ${i} ${pad(60)}`).join("\n");

  const oversizedExtreme = [knowledgeBulk, manyLocks, hugeShotSheet].join("\n");
  const enforced = new PromptBudgetManagerService().enforceBudget(oversizedExtreme, 1, "HIGH").final_prompt;

  check(
    "input really was oversized",
    oversizedExtreme.length > 40000,
    `${oversizedExtreme.length} chars`
  );
  check(
    "output never exceeds the 20000 hard limit",
    enforced.length <= 20000,
    `${enforced.length} chars`
  );
  check(
    "product identity locks survive the hard cut",
    enforced.includes("PRODUCT IDENTITY LOCK"),
    "identity was sacrificed"
  );
  check(
    "art direction still present after the hard cut",
    enforced.includes("[ART DIRECTION"),
    "style intent was sacrificed before generic knowledge"
  );

  console.log("\n[10b] Verbose vision output is capped at the compiler");
  const verboseManifest: any = { ...deepManifest };
  for (const key of Object.keys(verboseManifest)) {
    if (typeof verboseManifest[key] === "string") verboseManifest[key] = pad(1500);
  }
  verboseManifest.derived_from_image = true;

  const cappedRes = await compiler.compile({
    ...conflictBase,
    hasInspirationReference: true,
    inspirationStyleManifest: verboseManifest,
    inspirationImageWithheld: true,
  } as any);
  const cappedPrompt = cappedRes.package?.compiled_prompt || "";
  check(
    "verbose analysis still fits the hard limit",
    cappedPrompt.length <= 20000,
    `${cappedPrompt.length} chars`
  );
  check(
    "no single style line runs past its cap",
    !/: x{400,}/.test(cappedPrompt),
    "an uncapped style line leaked through"
  );

  console.log("\n========================================================");
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log("========================================================");
  process.exit(failed > 0 ? 1 : 0);
})();
