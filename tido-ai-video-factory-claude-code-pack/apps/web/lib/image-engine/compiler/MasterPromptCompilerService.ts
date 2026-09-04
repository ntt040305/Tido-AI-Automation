import crypto from "crypto";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeRepository } from "../repository/KnowledgeRepository";
import { LocalKnowledgeRepository } from "../repository/LocalKnowledgeRepository";
import { KnowledgeBudgetManager } from "../retrieval/KnowledgeBudgetManager";
import {
  CompiledGenerationPackageV1,
  CompiledReferenceMapping,
  CompilerError,
  CompilerResult,
  CompilerWarningCode,
  CopyItemInput,
  MasterPromptCompilerInput,
  ProductReferenceInput,
  SelectedBlockEntry,
} from "../types";
import { ExactCopyIntegrityValidator } from "./ExactCopyIntegrityValidator";
import { InputFingerprint } from "./InputFingerprint";
import { MasterPromptTemplateValidator } from "./MasterPromptTemplateValidator";
import { PromptBudgetValidator } from "./PromptBudgetValidator";
import { ProviderPromptOptimizer } from "./ProviderPromptOptimizer";
import { ProductIdentityResolver } from "./ProductIdentityResolver";
import { PromptCompressionService } from "./PromptCompressionService";
import { PromptBudgetManagerService } from "../service/PromptBudgetManagerService";
import { CreativeKnowledgeService } from "../service/CreativeKnowledgeService";
import { CreativeConstraintService } from "../service/CreativeConstraintService";
import { RenderReadinessValidator } from "../validation/RenderReadinessValidator";

export class MasterPromptCompilerService {
  private repository: KnowledgeRepository;

  constructor(repository?: KnowledgeRepository) {
    this.repository = repository || new LocalKnowledgeRepository();
  }

  public async compile(input: MasterPromptCompilerInput): Promise<CompilerResult> {
    const startTime = Date.now();
    const warnings: CompilerWarningCode[] = [];
    const provenance: Record<string, any> = {};

    // 1. Validate Input Structure & RenderReadiness
    const readiness = RenderReadinessValidator.validate(input);
    if (!readiness.isReady || !readiness.resolvedIdentityPackage) {
      return {
        success: false,
        error: {
          code: "INVALID_COMPILER_INPUT",
          message: `RenderReadiness validation failed: ${readiness.errors?.join("; ") || "Unknown error"}`,
        },
      };
    }
    const identityPackage = readiness.resolvedIdentityPackage;

    if (input.routingResult.routing_version !== "1.0") {
      return {
        success: false,
        error: {
          code: "ROUTING_VERSION_MISMATCH",
          message: `Unsupported routing version '${input.routingResult.routing_version}'. Expected '1.0'.`,
        },
      };
    }

    if (input.knowledgePackage.package_version !== "1.0") {
      return {
        success: false,
        error: {
          code: "KNOWLEDGE_PACKAGE_MISMATCH",
          message: `Unsupported Knowledge Package version '${input.knowledgePackage.package_version}'. Expected '1.0'.`,
        },
      };
    }

    if (input.knowledgePackage.routing_version !== input.routingResult.routing_version) {
      return {
        success: false,
        error: {
          code: "KNOWLEDGE_PACKAGE_MISMATCH",
          message: `Knowledge Package routing version (${input.knowledgePackage.routing_version}) does not match RoutingResult version (${input.routingResult.routing_version}).`,
        },
      };
    }

    // 2. Load and Validate Master Prompt V2 Template
    const templateVal = MasterPromptTemplateValidator.loadAndValidateTemplate();
    if (!templateVal.isValid || !templateVal.templateContent) {
      return {
        success: false,
        error: templateVal.error || {
          code: "TEMPLATE_INVALID",
          message: "Master Prompt template validation failed.",
        },
      };
    }

    // 3. Resolve and Verify Knowledge Blocks Server-Side
    const universalBlockEntries = input.knowledgePackage.universal_blocks || [];
    const specialistBlockEntries = [...(input.knowledgePackage.selected_blocks || [])];

    // Ensure Specialist Foundation Knowledge block is included for the current useCase
    if (input.useCase && typeof input.useCase === "string") {
      const uc = input.useCase.trim().toLowerCase();
      let foundationId = "";
      if (uc === "poster") foundationId = "specialist.poster_foundation";
      else if (uc === "social_ad") foundationId = "specialist.social_ad_foundation";
      else if (uc === "product_hero") foundationId = "specialist.product_hero_foundation";
      else if (uc === "banner" || uc === "website_banner") foundationId = "specialist.website_banner_foundation";
      else if (uc === "ugc_thumbnail" || uc === "thumbnail_ugc") foundationId = "specialist.ugc_thumbnail_foundation";

      if (foundationId) {
        const alreadySelected = specialistBlockEntries.some((b) => b.id === foundationId);
        if (!alreadySelected) {
          const fBlock = await this.repository.getKnowledgeBlock(foundationId);
          if (fBlock && fBlock.metadata.status === "ACTIVE") {
            specialistBlockEntries.unshift({
              id: fBlock.metadata.id,
              version: fBlock.metadata.version,
              title: fBlock.metadata.title,
              knowledge_type: fBlock.metadata.knowledge_type,
              selection_tier: "PRIMARY",
              final_score: 1.0,
              scores: {
                metadata: 1.0,
                semantic: 0.0,
                signal_confidence: 1.0,
                information_value: 1.0,
                priority: fBlock.metadata.priority || 100,
                query_importance: 1.0,
                redundancy_penalty: 0.0,
              },
              matched_signals: [`useCase:${input.useCase}`],
              selection_reasons: [`DETERMINISTIC_${foundationId.toUpperCase()}_ROUTING`],
              estimated_tokens: KnowledgeBudgetManager.estimateTokens(fBlock.content),
            });
          }
        }
      }
    }

    if (input.routingResult.requires_universal_core && universalBlockEntries.length === 0) {
      return {
        success: false,
        error: {
          code: "UNIVERSAL_CORE_MISSING",
          message: "Routing requires Universal Core, but no Universal blocks were provided in Knowledge Package.",
        },
      };
    }

    const knowledgeVersions: Record<string, string> = {};
    const universalContentBlocks: { entry: SelectedBlockEntry; content: string }[] = [];
    const specialistContentBlocks: { entry: SelectedBlockEntry; content: string }[] = [];

    // Verify Universal blocks
    for (const entry of universalBlockEntries) {
      const block = await this.repository.getKnowledgeBlock(entry.id);
      if (!block) {
        return {
          success: false,
          error: {
            code: "KNOWLEDGE_BLOCK_NOT_FOUND",
            message: `Universal Knowledge Block '${entry.id}' not found in repository.`,
          },
        };
      }
      if (block.metadata.status !== "ACTIVE") {
        return {
          success: false,
          error: {
            code: "KNOWLEDGE_BLOCK_NOT_ACTIVE",
            message: `Universal Knowledge Block '${entry.id}' has status '${block.metadata.status}'. Production compilation requires ACTIVE status.`,
          },
        };
      }
      knowledgeVersions[entry.id] = block.metadata.version;
      universalContentBlocks.push({ entry, content: block.content });
    }

    // Verify Specialist blocks
    for (const entry of specialistBlockEntries) {
      const block = await this.repository.getKnowledgeBlock(entry.id);
      if (!block) {
        return {
          success: false,
          error: {
            code: "KNOWLEDGE_BLOCK_NOT_FOUND",
            message: `Specialist Knowledge Block '${entry.id}' not found in repository.`,
          },
        };
      }
      if (block.metadata.status !== "ACTIVE") {
        return {
          success: false,
          error: {
            code: "KNOWLEDGE_BLOCK_NOT_ACTIVE",
            message: `Specialist Knowledge Block '${entry.id}' has status '${block.metadata.status}'. Production compilation requires ACTIVE status.`,
          },
        };
      }
      knowledgeVersions[entry.id] = block.metadata.version;
      specialistContentBlocks.push({ entry, content: block.content });
    }

    if (specialistBlockEntries.length === 0) {
      warnings.push("NO_SPECIALIST_KNOWLEDGE");
      if (input.routingResult.routing_mode === "OPEN_WORLD") {
        warnings.push("OPEN_WORLD_REASONING_ONLY");
      }
    }

    // 4. Product Identity Resolution & Reference Mapping (Authoritative)
    const compiledReferences = identityPackage.referenceMappings;
    provenance.references = compiledReferences;

    // 5. Product Instance & Quantity Semantics Check
    const resolvedGroups = identityPackage.groups;
    const routedProductCount = identityPackage.distinctProductCount;
    const requestedProductCount = input.productCount ?? (routedProductCount > 0 ? routedProductCount : 1);

    if (routedProductCount > 1 && requestedProductCount < routedProductCount) {
      return {
        success: false,
        error: {
          code: "PRODUCT_INSTANCE_CONFLICT",
          message: `Conflict: Routing identifies ${routedProductCount} distinct product identities (${resolvedGroups.map((p) => p.product_id).join(", ")}), but requested total product count is ${requestedProductCount}. Each routed product identity requires at least one instance.`,
        },
      };
    }

    if (routedProductCount > 1 && requestedProductCount > routedProductCount && requestedProductCount % routedProductCount !== 0) {
      warnings.push("PRODUCT_INSTANCE_AMBIGUITY");
    }

    // 6. Build Dynamic Placeholders

    // When a shot sheet was genuinely read from the user's inspiration image, it becomes
    // the SINGLE source of truth for camera, lighting, composition and colour.
    //
    // Three other layers otherwise emit their own camera orders — the creative
    // interpretation art direction, the strategy blueprint, and the creative knowledge
    // guidance. All three default to "eye-level 50mm commercial hero", all three sit
    // earlier in the prompt than the art direction, and together they simply outvote it.
    // That is why renders kept their own camera angle no matter what the reference showed.
    const inspirationStyleAuthority = input.inspirationStyleManifest?.derived_from_image === true;

    // A. USER_BRIEF & CREATIVE INTERPRETATION DIRECTIVES
    let userBriefText = input.brief && input.brief.trim()
      ? input.brief.trim()
      : "No specific creative brief provided. Focus on presenting the product authentically and appealingly for commercial advertising.";

    if (input.creativeInterpretation) {
      const ci = input.creativeInterpretation;
      const locked = ci.locked_intent;
      const enh = ci.ai_enhancement;

      const interpLines: string[] = [
        `\n[CREATIVE INTERPRETATION REASONING DIRECTIVES]`,
        `ORIGINAL CONCEPT: "${ci.original_concept}"`,
        `ASSET TYPE TARGET: ${ci.asset_type.toUpperCase()}`,
        `LOCKED USER INTENT (PRESERVE STRICTLY):`,
        `- Subject: ${locked.subject.join(", ")}`,
        `- Environment: ${locked.environment.join(", ")}`,
        `- Mood: ${locked.mood.join(", ")}`,
        ...(locked.camera_requirements?.length ? [`- Explicit Camera Directives: ${locked.camera_requirements.join("; ")}`] : []),
        ...(locked.lighting_requirements?.length ? [`- Explicit Lighting Directives: ${locked.lighting_requirements.join("; ")}`] : []),
        ...locked.non_negotiable_constraints.map((c) => `- Non-negotiable Constraint: ${c}`),
        `AI COMMERCIAL ENHANCEMENT:`,
        `- Objective: ${enh.creative_objective}`,
        `- Composition Decision: ${enh.composition_decision}`,
        `- Camera Improvement: ${enh.camera_improvement}`,
        `- Lighting Improvement: ${enh.lighting_improvement}`,
        `- Visual Hierarchy: ${enh.visual_hierarchy}`,
        `- Commercial Reasoning: ${enh.commercial_reasoning}`,
      ];

      if (ci.execution_directives?.cinematic_art_direction) {
        const cad = ci.execution_directives.cinematic_art_direction;
        if (cad.user_photographer_lock) {
          interpLines.push(`LOCKED USER PHOTOGRAPHER COMPLIANCE: ${cad.user_photographer_lock}`);
        }
        interpLines.push(`CINEMATIC ART DIRECTION & ARTISTIC PERSPECTIVE:`);
        if (inspirationStyleAuthority) {
          // Camera and lighting are owned by the analyzed shot sheet. Emitting a second,
          // conflicting set of orders here is what overrode the reference.
          interpLines.push(
            `- Camera & Lighting Art Direction: DEFER ENTIRELY to the [ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT] block below. Do not apply any default hero angle, lens or lighting setup.`
          );
        } else {
          interpLines.push(
            `- Camera Art Direction: ${cad.cinematic_camera_direction}`,
            `- Lighting Art Direction: ${cad.photographic_lighting_design}`
          );
        }
        interpLines.push(
          `- Visual Storytelling: ${cad.visual_storytelling_composition}`,
          `- Focal Emphasis: ${cad.subject_focal_emphasis}`,
          `- Typography Clearance: ${cad.typography_clearance_art_direction}`
        );
      }

      userBriefText = `${userBriefText}\n\n${interpLines.join("\n")}`;
    }

    provenance.user_brief = { source: "user_and_creative_interpretation", text: userBriefText };

    // B. PRODUCT_INSTANCE_REQUIREMENTS
    const instanceLines: string[] = [];

    // CLONE SAFETY GUARD: Emit same-product clone semantics ONLY when distinctProductCount === 1 AND same-identity merge is proven!
    if (routedProductCount === 1) {
      const prod = resolvedGroups[0];
      const refs = prod ? prod.reference_ids.join(", ") : "REF_01";
      if (requestedProductCount === 1) {
        instanceLines.push(`- The final image MUST contain exactly 1 hero product instance (${prod ? prod.product_id : "PRODUCT_01"}).`);
      } else if (identityPackage.isSameIdentityMergeAllowed) {
        instanceLines.push(`- The final image MUST contain exactly ${requestedProductCount} product instances of the SAME product identity (${prod ? prod.product_id : "PRODUCT_01"}).`);
      } else {
        instanceLines.push(`- The final image MUST contain exactly ${requestedProductCount} product instance(s) (${prod ? prod.product_id : "PRODUCT_01"}).`);
      }
      const isMultiRef = prod && prod.reference_ids.length > 1;
      instanceLines.push(`- PRODUCT IDENTITY SOURCE: Reference image(s) [${refs}].${isMultiRef ? " All references provide complementary evidence for this SINGLE product identity." : ""}`);
    } else if (routedProductCount > 10) {
      instanceLines.push(`- The final image MUST contain exactly ${requestedProductCount} product instances across ${routedProductCount} distinct product identities (See PRODUCT PLANNING MANIFEST for per-product locks).`);
      instanceLines.push(`- DISTINCT PRODUCT IDENTITY ISOLATION: Preserve each product's reference-supported identity. Do NOT clone or merge distinct identities.`);
    } else {
      instanceLines.push(`- The final image MUST contain exactly ${requestedProductCount} product instances across ${routedProductCount} distinct product identities:`);
      resolvedGroups.forEach((prod) => {
        instanceLines.push(`  * ${prod.product_id}: Bound strictly to reference image(s) [${prod.reference_ids.join(", ")}]. ${prod.summary ? `(${prod.summary})` : ""}`);
      });
      instanceLines.push(`- DISTINCT PRODUCT IDENTITY ISOLATION: Each listed PRODUCT_xx is a separate physical identity. Preserve each product's reference-supported characteristics and distinct differences. Do NOT clone one product identity to satisfy another, do NOT average identities into a hybrid, and do NOT transfer product-specific features across distinct identities.`);
    }

    // Phase 2.4 Explicit Reference Identity Lock Block
    instanceLines.push(`\n[REFERENCE IDENTITY LOCK]`);
    instanceLines.push(`The uploaded reference assets are commercial identity assets.`);
    instanceLines.push(`Preserve:`);
    instanceLines.push(`- exact product appearance`);
    instanceLines.push(`- exact shape`);
    instanceLines.push(`- exact packaging`);
    instanceLines.push(`- exact logo`);
    instanceLines.push(`Allowed:`);
    instanceLines.push(`- new environment`);
    instanceLines.push(`- new lighting`);
    instanceLines.push(`- cinematic camera`);
    instanceLines.push(`- premium composition`);
    instanceLines.push(`Forbidden:`);
    instanceLines.push(`- redesign`);
    instanceLines.push(`- replacement`);
    instanceLines.push(`- invented packaging`);
    instanceLines.push(`- fake logo\n`);

    // Inject Phase 2.2 & 2.4 Reference Manifest Identity Lock Rules
    const refManifest = input.routingResult.reference_manifest;
    if (refManifest) {
      instanceLines.push(`- REFERENCE MANIFEST RELATIONSHIP TYPE: [${refManifest.relationship_type.toUpperCase()}]`);
      instanceLines.push(`- REFERENCE MANIFEST METRICS: ${refManifest.total_references} Reference Image(s), ${refManifest.detected_products_count} Product(s), ${refManifest.detected_logos_count} Logo(s).`);

      if (refManifest.identity_control_metadata) {
        instanceLines.push(`- ${refManifest.identity_control_metadata.compact_directive}`);
      }

      if (refManifest.product_manifest) {
        const pm = refManifest.product_manifest;
        instanceLines.push(`- PRODUCT PLANNING MANIFEST [${pm.compression_mode || "ADAPTIVE"}] (Target Count: ${pm.validation.target_count_requested}, Detected: ${pm.validation.detected_product_count}):`);
        pm.compact_identity_locks.forEach((lock) => {
          instanceLines.push(`  * ${lock}`);
        });
      } else {
        if (refManifest.product_identity_locks && refManifest.product_identity_locks.length > 0) {
          instanceLines.push(`- PRODUCT IDENTITY LOCKS:`);
          refManifest.product_identity_locks.forEach((lock) => {
            instanceLines.push(`  * Product ID [${lock.product_id}] (${lock.canonical_name}): Preserve [${lock.preserve_aspects.join(", ")}]. Key Features: ${lock.key_features.join(", ")}.`);
          });
        }
      }

      if (refManifest.logo_locks && refManifest.logo_locks.length > 0) {
        instanceLines.push(`- LOGO PRESERVATION LOCKS:`);
        refManifest.logo_locks.forEach((logo) => {
          instanceLines.push(`  * Logo Reference [${logo.reference_id}] for Brand [${logo.brand_name}]: ${logo.placement_rule}`);
        });
      }

      // Phase 3.4: Isolated [REFERENCE ADAPTATION RULES] block (Capped <= 500 chars)
      if (refManifest.adaptive_constraints?.requires_adaptation && refManifest.adaptive_constraints.compact_adaptation_directive) {
        instanceLines.push(`\n${refManifest.adaptive_constraints.compact_adaptation_directive}\n`);
      }
    }

    const singleRefProducts = resolvedGroups.filter((p) => p.reference_ids.length === 1);
    if (singleRefProducts.length > 0) {
      instanceLines.push(`- SINGLE-REFERENCE POLICY: Product(s) [${singleRefProducts.map((p) => p.product_id).join(", ")}] have only 1 reference image. Unseen surfaces must be reconstructed conservatively without inventing unverified logos, text, or structural controls.`);
    }

    // Check for high-importance unknowns
    const highImportanceUnknowns: string[] = [];
    (input.routingResult.products || []).forEach((prod) => {
      (prod.unknowns || []).forEach((u) => {
        if (u.importance === "HIGH") {
          highImportanceUnknowns.push(`${prod.product_id}: ${u.subject} (${u.reason})`);
        }
      });
    });

    if (highImportanceUnknowns.length > 0) {
      warnings.push("ROUTER_HAS_HIGH_IMPORTANCE_UNKNOWNS");
      instanceLines.push(`- UNCERTAINTY CAUTION: The following product features are unestablished in references. Avoid inventing unverified branding or structural details:`);
      highImportanceUnknowns.forEach((unk) => instanceLines.push(`  * ${unk}`));
    }

    const productInstanceRequirementsText = instanceLines.join("\n");
    provenance.product_instance_requirements = { source: "compiler_routing_fusion", text: productInstanceRequirementsText };

    // C. USER_HARD_CONSTRAINTS
    const hardReqs = [...(input.hardRequirements || [])];
    if (input.creativeInterpretation?.execution_directives?.negative_composition_constraints) {
      hardReqs.push(...input.creativeInterpretation.execution_directives.negative_composition_constraints);
    }
    const userHardConstraintsText = hardReqs.length > 0
      ? hardReqs.map((req, i) => `${i + 1}. ${req.trim()}`).join("\n")
      : "None specified.";
    provenance.user_hard_constraints = { source: "user_and_execution_directives", items: hardReqs };

    // D. TYPOGRAPHY & READABLE COPY
    const copyItems = input.copyItems || [];
    let typographyAndReadableCopyText = "";

    if (copyItems.length > 0) {
      const lines: string[] = [
        "Integrate the authorized copy using appropriate visual hierarchy (primary emphasis > secondary subtitle > product identity/offer > action). Preserve exact spelling, capitalization, punctuation, numbers, and accents. Only the quoted strings below may appear as readable typography in the rendered visual; all other prompt text consists of non-visible generation instructions:\n",
      ];

      copyItems.forEach((item) => {
        const text = typeof item === "string" ? item : item.text;
        if (text && text.trim()) {
          lines.push(`"${text.trim()}"`);
        }
      });

      typographyAndReadableCopyText = lines.join("\n");
    } else {
      warnings.push("NO_EXACT_COPY");
      typographyAndReadableCopyText = "No readable typography authorized. Reserve clean typography area only. Do NOT render words, letters, fake brand names, prices, or decorative text into image pixels.";
    }

    provenance.exact_copy = { source: "user.copyItems", items: copyItems };
    provenance.final_visible_copy = { source: "user.copyItems", items: copyItems };

    // E. BRAND_KNOWLEDGE
    let brandKnowledgeText = "";
    const brandName = (input.brandName || "").trim();
    const brandInfo = (input.brandInfo || "").trim();

    if (brandName || brandInfo) {
      const brandLines: string[] = [];
      if (brandName) brandLines.push(`BRAND NAME: ${brandName}`);
      if (brandInfo) brandLines.push(`USER-PROVIDED BRAND CONTEXT: ${brandInfo}`);
      brandLines.push("Note: The above brand context is user-provided background. Preserve brand identity and visual harmony.");
      brandKnowledgeText = brandLines.join("\n");
    } else {
      warnings.push("NO_BRAND_CONTEXT");
      brandKnowledgeText = "No specific brand background guidelines provided.";
    }

    provenance.brand_knowledge = { source: "user.brand", brandName, brandInfo };

    // F. OUTPUT_CONTEXT
    const useCaseText = input.useCase && input.useCase.trim() ? input.useCase.trim() : "Standard Commercial Advertising Visual";
    const aspectRatioText = input.aspectRatio && input.aspectRatio.trim() ? input.aspectRatio.trim() : "Unspecified";

    let strategyBlueprint = "";

    if (input.creativeInterpretation?.execution_directives) {
      const exec = input.creativeInterpretation.execution_directives;
      const cad = exec.cinematic_art_direction;
      const negList = exec.negative_composition_constraints.map((c) => `- ${c}`).join("\n");
      const userLockBlock = cad?.user_photographer_lock
        ? `\n- STRICT USER COMPLIANCE: ${cad.user_photographer_lock}`
        : "";

      // With an analyzed shot sheet in play, every camera/lighting/composition line here
      // would compete with it. Only the non-visual constraints are kept.
      const cameraBlock = inspirationStyleAuthority
        ? `- CAMERA, LIGHTING & COMPOSITION: GOVERNED EXCLUSIVELY by the [ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT] block below. Ignore any default commercial hero angle, lens choice, shot distance or lighting rig; use the analyzed values instead.`
        : `- CINEMATIC CAMERA DIRECTION: ${cad?.cinematic_camera_direction || exec.camera_execution}
- PHOTOGRAPHIC LIGHTING DESIGN: ${cad?.photographic_lighting_design || exec.lighting_execution}
- VISUAL STORYTELLING COMPOSITION: ${cad?.visual_storytelling_composition || exec.composition_layout}
- SUBJECT FOCAL EMPHASIS: ${cad?.subject_focal_emphasis || exec.subject_scale_ratio}
- TECHNICAL SPECS & DISTANCE: ${exec.camera_execution} (${exec.shot_distance}, ${exec.depth_of_field})`;

      strategyBlueprint = `
[CINEMATIC ART DIRECTION & COMMERCIAL PHOTOGRAPHY]${userLockBlock}
${cameraBlock}
- TYPOGRAPHY CLEARANCE ART DIRECTION: ${cad?.typography_clearance_art_direction || exec.text_clearance}
- NEGATIVE COMPOSITION CONSTRAINTS (STRICT EXCLUSIONS):
${negList}`;
    } else {
      // Fallback Strategy Blueprint without hardcoded pedestal assumptions
      strategyBlueprint = `
[CREATIVE TYPE STRATEGY: ${useCaseText.toUpperCase()}]
- VISUAL LAYOUT: Commercial presentation tailored for ${useCaseText} in ${aspectRatioText} aspect ratio.
- CAMERA & ANGLE: Eye-level to slight low hero perspective with subject in clear focus.
- LIGHTING DESIGN: 3-point softbox studio illumination featuring clean specular highlights.
- SAFE ZONES: Reserve clean surrounding area for commercial branding and copy clearance.`;
    }

    const outputContextText = `INTENDED USE CASE: ${useCaseText}\nTARGET ASPECT RATIO: ${aspectRatioText}\n${strategyBlueprint}`;
    provenance.output_context = { source: "user", useCase: useCaseText, aspectRatio: aspectRatioText };

    // G. RELEVANT_KNOWLEDGE
    const knowledgeLines: string[] = [
      "NOTICE: Retrieved professional knowledge provides supportive physical principles. Non-exhaustive; does not restrict valid creative solutions.\n",
    ];

    let universalTokens = 0;
    let specialistTokens = 0;

    const compactBlockContent = (content: string): string => {
      return content
        .replace(/^#\s+[^\n]+\n+/m, "")
        .replace(/^##\s+(\d+\.\s*)?/gm, "**")
        .replace(/(\*\*[^\n\**]+\*\*)\n+/g, "$1: ")
        .replace(/\n{2,}/g, "\n")
        .trim();
    };

    if (universalContentBlocks.length > 0) {
      knowledgeLines.push("### UNIVERSAL PROFESSIONAL KNOWLEDGE");
      universalContentBlocks.forEach(({ entry, content }) => {
        const cleaned = compactBlockContent(content);
        knowledgeLines.push(`\n#### [${entry.id}] ${entry.title}\n${cleaned}`);
        universalTokens += KnowledgeBudgetManager.estimateTokens(cleaned);
      });
    }

    if (specialistContentBlocks.length > 0) {
      knowledgeLines.push("\n### SPECIALIST PROFESSIONAL KNOWLEDGE");
      specialistContentBlocks.forEach(({ entry, content }) => {
        const cleaned = compactBlockContent(content);
        knowledgeLines.push(`\n#### [${entry.id}] ${entry.title}\n${cleaned}`);
        specialistTokens += KnowledgeBudgetManager.estimateTokens(cleaned);
      });
    }

    const relevantKnowledgeText = knowledgeLines.join("\n");
    provenance.relevant_knowledge = {
      universal_ids: universalBlockEntries.map((b) => b.id),
      specialist_ids: specialistBlockEntries.map((b) => b.id),
    };

    // 7. Substitute Placeholders in Template
    let compiledPrompt = templateVal.templateContent;
    compiledPrompt = compiledPrompt.replace("{{USER_BRIEF}}", userBriefText);
    compiledPrompt = compiledPrompt.replace("{{PRODUCT_INSTANCE_REQUIREMENTS}}", productInstanceRequirementsText);
    compiledPrompt = compiledPrompt.replace("{{USER_HARD_CONSTRAINTS}}", userHardConstraintsText);
    compiledPrompt = compiledPrompt.replace("{{TYPOGRAPHY_AND_READABLE_COPY}}", typographyAndReadableCopyText);
    compiledPrompt = compiledPrompt.replace("{{BRAND_KNOWLEDGE}}", brandKnowledgeText);
    compiledPrompt = compiledPrompt.replace("{{OUTPUT_CONTEXT}}", outputContextText);
    compiledPrompt = compiledPrompt.replace("{{RELEVANT_KNOWLEDGE}}", relevantKnowledgeText);

    // 8. Template Validation & Placeholders Check
    const unresolved = MasterPromptTemplateValidator.findUnresolvedPlaceholders(compiledPrompt);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: {
          code: "UNRESOLVED_PLACEHOLDER",
          message: `Compiled Master Prompt contains unresolved placeholders: ${unresolved.join(", ")}`,
        },
      };
    }

    // 9. Exact Copy Integrity Verification
    const copyIntegrity = ExactCopyIntegrityValidator.validate(input.copyItems, compiledPrompt);
    if (!copyIntegrity.isValid) {
      return {
        success: false,
        error: {
          code: "EXACT_COPY_INTEGRITY_FAILED",
          message: `Exact Copy integrity validation failed. Missing items in compiled prompt: ${copyIntegrity.missingItems.join("; ")}`,
        },
      };
    }

    // 9.5 Phase 2.6 Intermediate Creative Knowledge Intelligence Layer
    const creativeKnowledgeService = new CreativeKnowledgeService();
    const creativeRes = creativeKnowledgeService.resolveCreativeDirection({
      useCase: input.useCase,
      brief: input.brief,
      routingResult: input.routingResult,
      knowledgePackage: input.knowledgePackage,
    });
    // This layer hard-codes "Eye-level commercial hero angle (50mm lens)" and a default
    // lighting/colour recipe. Those lines are stripped when the analyzed shot sheet owns
    // the look; the product identity, logo and typography lines are always kept.
    let creativeGuidanceText = creativeRes.compactGuidanceText;
    if (inspirationStyleAuthority) {
      creativeGuidanceText = creativeGuidanceText
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          return !t.startsWith("3. COMMERCIAL COMPOSITION:") && !t.startsWith("5. CINEMATIC STYLE:");
        })
        .join("\n");
    }
    compiledPrompt += `\n\n${creativeGuidanceText}`;

    // 9.6 Creative Quality & Anti-Text Regression Constraints
    const creativeConstraintService = new CreativeConstraintService();
    const creativeConstraints = creativeConstraintService.resolveConstraints({
      copyItems: input.copyItems,
      productCount: input.productCount,
    });
    compiledPrompt += `\n\n${creativeConstraintService.getPromptDirective(creativeConstraints)}`;

    // 9.7 Inspiration Reference Guidance Block (Phase 3.6 Additive Layer)
    const hasInspiration = Boolean(
      input.hasInspirationReference ||
      (Array.isArray(input.inspirationReferenceRules) && input.inspirationReferenceRules.length > 0) ||
      (input.routingResult?.asset_roles && input.routingResult.asset_roles.some((ar) => (ar.role as string) === "STYLE" || (ar.role as string) === "INSPIRATION_REFERENCE"))
    );

    if (hasInspiration) {
      const extraRules = input.inspirationReferenceRules?.map((r) => `- ${r}`).join("\n") || "";
      const manifest = input.inspirationStyleManifest;

      // Only inject an explicit style directive when it was actually read from the
      // inspiration image. A text-inferred manifest describes generic studio styling
      // and competes with the real attached reference, which is what produced the
      // "inspiration ignored, generic commercial photo" outcome.
      // Emit every dimension the analysis actually returned, grouped the way a
      // photographer reads a shot sheet. Missing fields are dropped rather than printed
      // as empty headings, so a partial analysis degrades to the summary lines.
      // Vision models happily return a paragraph per field. Each line is capped so a
      // verbose analysis cannot inflate the prompt past the provider limit, and the
      // whole block is capped again below.
      const MAX_STYLE_LINE_CHARS = 220;
      const MAX_STYLE_BLOCK_CHARS = 2600;
      const styleLine = (label: string, value?: string) => {
        if (!value || !value.trim()) return "";
        const clean = value.trim().replace(/\s+/g, " ");
        const body = clean.length > MAX_STYLE_LINE_CHARS
          ? `${clean.slice(0, MAX_STYLE_LINE_CHARS - 1).trimEnd()}…`
          : clean;
        return `${label}: ${body}`;
      };

      let styleDirectiveBlock = "";
      if (manifest && manifest.derived_from_image === true) {
        const groups: { heading: string; lines: string[] }[] = [
          {
            heading: "CAMERA",
            lines: [
              styleLine("  Angle", manifest.cameraAngle),
              styleLine("  Lens & Perspective", manifest.focalLength),
              styleLine("  Distance & Framing", manifest.cameraDistance),
              styleLine("  Depth of Field", manifest.depthOfField),
              styleLine("  Summary", manifest.camera),
            ],
          },
          {
            heading: "LIGHTING",
            lines: [
              styleLine("  Key Light", manifest.keyLight),
              styleLine("  Fill & Shadow", manifest.fillAndShadow),
              styleLine("  Rim & Speculars", manifest.rimAndHighlights),
              styleLine("  Colour Temperature", manifest.lightColorTemperature),
              styleLine("  Summary", manifest.lighting),
            ],
          },
          {
            heading: "COMPOSITION",
            lines: [
              styleLine("  Subject Placement", manifest.subjectPlacement),
              styleLine("  Depth Layering", manifest.depthLayering),
              styleLine("  Negative Space", manifest.negativeSpace),
              styleLine("  Summary", manifest.composition),
            ],
          },
          {
            heading: "COLOUR",
            lines: [
              styleLine("  Palette", manifest.colorPalette),
              styleLine("  Grading", manifest.colorGrading),
              styleLine("  Summary", manifest.colorMood),
            ],
          },
          {
            heading: "SET, PROPS & EFFECTS",
            lines: [
              styleLine("  Prop Styling", manifest.propStyling),
              styleLine("  Surface & Set", manifest.surfaceAndSet),
              styleLine("  Background", manifest.backgroundTreatment),
              styleLine("  Motion & Effects", manifest.motionAndEffects),
              styleLine("  Summary", manifest.environment),
            ],
          },
          {
            heading: "FINISHING",
            lines: [
              styleLine("  Post Character", manifest.finishing),
              styleLine("  Atmosphere", manifest.visualMood),
            ],
          },
        ];

        const rendered: string[] = ["[INSPIRED VISUAL STYLE DIRECTIVE]"];
        const overall = styleLine("Overall Look", manifest.photographicStyle || manifest.visualMood);
        if (overall) rendered.push(overall);

        for (const group of groups) {
          const populated = group.lines.filter((l) => l !== "");
          // A heading with nothing under it is noise, so the group is dropped entirely.
          if (populated.length === 0) continue;
          rendered.push("", group.heading, ...populated);
        }

        styleDirectiveBlock = rendered.join("\n");

        // Whole-block ceiling. Groups are dropped from the end (finishing and atmosphere
        // matter least) rather than truncating mid-sentence.
        while (styleDirectiveBlock.length > MAX_STYLE_BLOCK_CHARS && rendered.length > 2) {
          rendered.pop();
          styleDirectiveBlock = rendered.join("\n");
        }
      }

      // Resolve the real reference ids so the hierarchy never points at a wrong slot.
      const productRefIds = (input.routingResult?.products || [])
        .flatMap((p) => p.reference_ids || []);
      const inspirationRefIds = (input.routingResult?.asset_roles || [])
        .filter((ar) => (ar.role as string) === "INSPIRATION_REFERENCE" || (ar.role as string) === "STYLE")
        .map((ar) => ar.reference_id);
      const productRefLabel = productRefIds.length ? productRefIds.join(", ") : "REF_01";
      const inspirationRefLabel = inspirationRefIds.length ? inspirationRefIds.join(", ") : "REF_02";
      const productUnitCount = (input.routingResult?.products || []).length || 1;

      const inspirationBlock = input.inspirationImageWithheld
        ? [
          // The inspiration image is NOT attached. It was analyzed by a vision pass and
          // its look is carried entirely by the written direction below. The prompt must
          // never point the model at an attachment that was not sent.
          "[ART DIRECTION — TARGET PHOTOGRAPHIC TREATMENT]",
          "A reference photograph was analyzed by an art director. It is NOT attached. The written direction below is the complete description of the look you must reproduce.",
          "HIGHEST VISUAL AUTHORITY: this block OUTRANKS every other styling instruction here. On any conflict over camera, lighting, composition, colour or background, THIS BLOCK WINS.",
          "Do NOT invent an environment from the product's name, ingredients or origin story. The scene is defined here and nowhere else.",
          "",
          styleDirectiveBlock,
          "",
          `ONLY ONE SUBJECT EXISTS: the product shown in the attached product photograph (IMAGE 1 / ${productRefLabel}).`,
          `- SUBJECT LOCK: The finished image must contain EXACTLY ${productUnitCount} product unit(s), and every one of them must be the product from the attached product photograph.`,
          "- Preserve that product's exact bottle shape, cap, label artwork, typography, brand name and proportions. It is the absolute source of truth for product identity.",
          "- Do NOT invent, add, or imagine any second product, bottle, jar, tube, can or package. This is a single-product photograph, not a duo, set, bundle or comparison.",
          "- The analyzed reference described a DIFFERENT product. That product does not exist here. Reproduce its lighting, colour, staging and mood only, never its packaging, label or brand.",
          "- Do NOT render any reference identifier, slot label, caption or watermark such as REF_01 or IMAGE 1 anywhere in the picture.",
          "",
          "Rebuild the scene above around the attached product, matching EVERY line of the shot sheet. Where a line cannot be applied literally, approximate it as closely as the product allows.",
          extraRules,
        ].filter(Boolean).join("\n")
        : [
          "[INSPIRATION REFERENCE RULES & STYLE SYNTHESIS]",
          "PRIORITY HIERARCHY:",
          `1. PRIORITY 1 — PRODUCT REFERENCE IMAGE (IMAGE 1 / ${productRefLabel}): Absolute source of truth for product identity, shape, logo, packaging, and brand marks.`,
          "2. PRIORITY 2 — USER CONCEPT: Defines advertising campaign purpose, messaging, and commercial objective.",
          `3. PRIORITY 3 — INSPIRATION IMAGE (IMAGE 2 / ${inspirationRefLabel}): Visual style guidance only (composition, camera, lighting, atmosphere, color palette).`,
          "",
          styleDirectiveBlock,
          "",
          "THE INSPIRATION IMAGE IS A LIGHTING AND COMPOSITION REFERENCE, NOT A SUBJECT.",
          `- The inspiration image (${inspirationRefLabel}) is NOT part of the subject matter. Treat it as a photograph whose lighting setup, lens choice, camera angle, staging and post-processing you are reproducing.`,
          `- SUBJECT LOCK: The finished image must contain EXACTLY ${productUnitCount} product unit(s), and every one of them must be the product from ${productRefLabel}.`,
          `- The product, package, can, bottle, container or item depicted inside the inspiration image MUST NOT appear in the output, not in the foreground, not beside the product, not in the background, and not reflected in any surface.`,
          "- Do NOT place the product next to, paired with, or grouped with any product taken from the inspiration image. This is NOT a duo, bundle, comparison, side-by-side or combination shot unless the User Concept explicitly asks for one.",
          `- Any brand name, logo, wordmark, flavour text or label that belongs to the inspiration image's product is FORBIDDEN in the output. Only branding from ${productRefLabel} may appear.`,
          "- Do NOT render any reference identifier, slot label, caption or watermark such as REF_01 or REF_02 anywhere in the picture.",
          "",
          "- ADAPT ONLY: composition, camera angle, lighting, atmosphere, color mood, and visual style.",
          "- DO NOT ADAPT OR MODIFY: product identity, logo, packaging, brand name, or physical product structure.",
          "- DO NOT copy logos, foreign brand text, or unrelated objects from the inspiration reference image.",
          extraRules,
        ].filter(Boolean).join("\n");

      compiledPrompt += `\n\n${inspirationBlock}`;
    }

    // 10. Provider Prompt Optimization & Phase 2.5.4 Mandatory Prompt Budget Manager System
    const optimizationRes = ProviderPromptOptimizer.optimize(compiledPrompt);
    compiledPrompt = optimizationRes.optimizedPrompt;

    const budgetManager = new PromptBudgetManagerService();
    const productCount = input.productCount || (input.routingResult.products ? input.routingResult.products.length : 1);
    const mode = input.routingResult.reference_manifest?.product_manifest?.compression_mode || (productCount > 10 ? "CATALOG" : productCount >= 2 ? "MEDIUM" : "HIGH");

    const budgetRes = budgetManager.enforceBudget(compiledPrompt, productCount, mode);
    compiledPrompt = budgetRes.final_prompt;

    const totalPromptTokens = KnowledgeBudgetManager.estimateTokens(compiledPrompt);
    if (totalPromptTokens > 3500) {
      warnings.push("PROMPT_TOKEN_BUDGET_HIGH");
    }

    const durationMs = Date.now() - startTime;
    const fingerprint = InputFingerprint.compute(input);
    const compiledPromptHash = crypto.createHash("sha256").update(compiledPrompt).digest("hex").slice(0, 16);

    const compiledPackage: CompiledGenerationPackageV1 = {
      package_version: "1.0",
      template: {
        id: templateVal.templateId,
        version: templateVal.templateVersion,
        hash: templateVal.templateHash,
      },
      routing: {
        version: input.routingResult.routing_version,
        mode: input.routingResult.routing_mode,
      },
      knowledge: {
        universal_block_ids: universalBlockEntries.map((b) => b.id),
        specialist_block_ids: specialistBlockEntries.map((b) => b.id),
        knowledge_versions: knowledgeVersions,
      },
      references: compiledReferences,
      output_config: {
        use_case: input.useCase,
        aspect_ratio: input.aspectRatio,
      },
      compiled_prompt: compiledPrompt,
      compiler_warnings: warnings,
      stats: {
        prompt_characters: compiledPrompt.length,
        estimated_prompt_tokens: totalPromptTokens,
        universal_knowledge_tokens: universalTokens,
        specialist_knowledge_tokens: specialistTokens,
        compile_duration_ms: durationMs,
      },
      provenance,
      input_fingerprint: fingerprint,
      compiled_prompt_hash: compiledPromptHash,
    };

    return {
      success: true,
      package: compiledPackage,
    };
  }
}
