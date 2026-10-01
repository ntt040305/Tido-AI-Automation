import fs from "fs";
import path from "path";
import { toCreativeDecision, applyCreativeDecision } from "../lib/image-engine/evolution/experiment/CreativeDecision";
import { MasterPromptCompilerService } from "../lib/image-engine/compiler/MasterPromptCompilerService";
import { NanoBananaPromptComposer } from "../lib/image-engine/evolution/experiment/NanoBananaPromptComposer";
import { ProfessionalCreativeBrain } from "../lib/image-engine/evolution/experiment/ProfessionalCreativeBrain";
import { buildCompositionPlan, renderCompositionPlan } from "../lib/image-engine/evolution/experiment/CompositionPlan";
import { buildGeometry } from "../lib/image-engine/evolution/experiment/LayoutGeometry";
import { PromptBudgetManagerService } from "../lib/image-engine/compiler/PromptBudgetManagerService";

// Load healthy judgment and brain strategy
const judgment = JSON.parse(fs.readFileSync("scratch/healthy_judgment.json", "utf8"));
const brainStrategy = JSON.parse(fs.readFileSync("scratch/healthy_brain_strategy.json", "utf8"));

const rawRequest = {
  requestId: "audit_trace_healthy",
  concept: "Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform, warm morning Mediterranean daylight, soft green botanical accents, elegant editorial skincare aesthetic",
  contentMessage: "Barrier Calm Serum. Botanical recovery for sensitive skin.",
  useCase: "Poster",
  aspectRatio: "1:1",
  brandName: "AURA BOTANICA",
  industry: "skincare",
  marketingContext: {
    industry: "skincare",
    target_audience: "Discerning consumers seeking natural clinical dermatological care",
    objective: "Establish clinical credibility and organic luxury desire",
  },
  images: [
    {
      reference_id: "REF_01",
      product_id: "PRODUCT_01",
      role: "PRODUCT",
      mimeType: "image/png",
      filename: "centella_serum.png",
      buffer: Buffer.from("fake_buffer"),
    },
  ],
};

async function main() {
  // 1. toCreativeDecision
  const decision = toCreativeDecision(judgment);
  if (!decision) {
    console.error("Failed to map decision");
    return;
  }
  console.log("=== CREATIVE DECISION MAPPED ===");
  console.log({
    selected_direction: decision.selected_direction,
    scene_definition: decision.scene_definition,
    camera_decision: decision.camera_decision,
    lighting_decision: decision.lighting_decision,
    composition_decision: decision.composition_decision,
    typography_decision: decision.typography_decision,
  });

  // 2. Controlled mode: applyCreativeDecision mutates request
  const controlled = true;
  const effectiveRequest = applyCreativeDecision(rawRequest as any, decision, false);
  console.log("\n=== EFFECTIVE REQUEST AFTER CD MUTATION ===");
  console.log("Original Concept:", rawRequest.concept);
  console.log("Effective Concept (mutated by CD):", effectiveRequest.concept);
  console.log("Hard Requirements added by CD:", effectiveRequest.hardRequirements);

  // 3. Compile Master Prompt via MasterPromptCompilerService
  const compiler = new MasterPromptCompilerService();
  const compilerInput = {
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 },
    ],
    brief: `CREATIVE CONCEPT: ${effectiveRequest.concept}\nVISUAL STYLE: commercial\n\nCOMMERCIAL MARKETING CONTEXT:\n- Industry Domain: skincare\n- Target Audience: Discerning consumers seeking natural clinical dermatological care\n\nATTACHED REFERENCE ROLES (ORDER MATCHES MULTIPART IMAGES):\n- Image 1 (REF_01): PRODUCT_01 identity reference\n\nCONTENT MESSAGE — TEXT THAT MUST APPEAR IN THE IMAGE:\n- Main message: Barrier Calm Serum. Botanical recovery for sensitive skin.\n- Purpose: Brand communication\n- Visual requirement: render this text legibly and make it noticeable at a glance. The exact wording above is authorized copy and must be reproduced verbatim; do not paraphrase, translate or invent additional text.`,
    productCount: 1,
    copyItems: [
      { text: "Barrier Calm Serum. Botanical recovery for sensitive skin.", type: "headline" },
    ],
    brandName: "AURA BOTANICA",
    hardRequirements: effectiveRequest.hardRequirements || [],
    useCase: "Poster",
    aspectRatio: "1:1",
    routingResult: {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: false,
      products: [
        {
          product_id: "PRODUCT_01",
          reference_ids: ["REF_01"],
          reference_relationship_confidence: 1.0,
          summary: "Centella Serum Bottle",
          categories: [{ value: "skincare", confidence: 1.0, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
          industry_domains: [{ value: "skincare", confidence: 1.0, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
          likely_functions: [{ value: "calming", confidence: 1.0, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
          materials: [{ value: "Glass", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          contents: [{ value: "Serum", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          surface_properties: [{ value: "Frosted", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          geometry_traits: [{ value: "Dropper bottle", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          packaging_types: [{ value: "Dropper bottle", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          branding_features: [{ value: "AURA BOTANICA", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "" }],
          visual_challenges: [],
          unknowns: [],
          retrieval_queries: [],
        },
      ],
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 1.0 }],
      global_retrieval_queries: [],
    } as any,
    strategy: brainStrategy,
  };

  const compileResult = await compiler.compile(compilerInput);
  console.log("compileResult success:", compileResult.success);
  if (!compileResult.success) {
    console.log("compileResult error:", (compileResult as any).error);
  }
  const masterPrompt = compileResult.package?.compiled_prompt || "";
  console.log("\n=== MASTER PROMPT COMPILED ===");
  console.log("Master Prompt Chars:", masterPrompt.length);
  fs.writeFileSync("scratch/healthy_master_prompt.txt", masterPrompt, "utf8");

  // 4. NanoBananaPromptComposer.compose
  const composed = NanoBananaPromptComposer.compose(
    masterPrompt,
    judgment,
    controlled,
    undefined,
    undefined,
    false,
    undefined,
    false
  );
  console.log("Composed Prompt Chars:", composed.length);

  // 5. WrapProvider / Blueprint synthesis
  const geometry = buildGeometry({
    ratio: "1:1",
    copyRoles: ["HEADLINE", "CTA"],
    productCount: 1,
    compositionHint: judgment.reasoning?.composition?.choice,
  });

  const compPlan = buildCompositionPlan({
    geometry,
    copyLines: 2,
    copy: [
      { role: "headline", text: "Barrier Calm Serum" },
      { role: "cta", text: "Botanical recovery for sensitive skin." },
    ],
    ratio: "1:1",
  });

  const bp = ProfessionalCreativeBrain.assemble({
    productCount: 1,
    decision,
    judgment,
    strategy: brainStrategy,
  });

  const BLUEPRINT_ALLOWANCE = 4500;
  const blueprintText = ProfessionalCreativeBrain.render(bp, {
    maxChars: BLUEPRINT_ALLOWANCE,
    omitOwnedElsewhere: Boolean(compPlan),
  });

  const compSection = renderCompositionPlan(compPlan);

  const finalPrompt = [
    composed,
    blueprintText,
    compSection,
    "BRAND TYPOGRAPHY: use clean, confident letterforms appropriate for skincare.",
  ].filter(Boolean).join("\n\n");

  console.log("\n=== FINAL PROVIDER PROMPT GENERATED ===");
  console.log("Final Prompt Chars:", finalPrompt.length);
  fs.writeFileSync("scratch/healthy_final_provider_prompt.txt", finalPrompt, "utf8");
  console.log("Saved scratch/healthy_final_provider_prompt.txt successfully!");
}

main().catch(console.error);
