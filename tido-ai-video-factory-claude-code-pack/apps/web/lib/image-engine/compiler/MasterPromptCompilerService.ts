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
import { ArtDirectionResolverService } from "../service/ArtDirectionResolverService";
import { CommercialLayoutService } from "../service/CommercialLayoutService";
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

    // Camera, lighting, composition and colour are decided in exactly one place:
    // ArtDirectionResolverService, further down in step 6.5. The ad-hoc suppression
    // that used to live here — only active when an inspiration image happened to be
    // analysed — is now the general rule for every request. Sections below state
    // WHAT the client wants and WHAT the product is; they no longer state HOW to
    // shoot it.

    // A. USER_BRIEF & CREATIVE INTERPRETATION DIRECTIVES
    let userBriefText = input.brief && input.brief.trim()
      ? input.brief.trim()
      : "No specific creative brief provided. Focus on presenting the product authentically and appealingly for commercial advertising.";

    if (input.creativeInterpretation) {
      const ci = input.creativeInterpretation;
      const locked = ci.locked_intent;
      const enh = ci.ai_enhancement;

      // CREATIVE INTENT states WHAT the client asked for. It no longer states HOW to
      // shoot it: camera, lighting and composition are resolved once, by
      // ArtDirectionResolverService, and printed once, in the ART DIRECTION section.
      // This block used to emit its own camera and lighting orders that sat above
      // the art direction and silently outranked it.
      const interpLines: string[] = [
        `LOCKED CLIENT INTENT — PRESERVE STRICTLY:`,
        `- Subject: ${locked.subject.join(", ")}`,
        ...(locked.environment.length ? [`- Environment: ${locked.environment.join(", ")}`] : []),
        ...(locked.mood.length ? [`- Mood: ${locked.mood.join(", ")}`] : []),
        ...(locked.style?.length ? [`- Visual style: ${locked.style.join(", ")}`] : []),
        ...(locked.emotional_goal ? [`- Emotional goal: ${locked.emotional_goal}`] : []),
        ...locked.non_negotiable_constraints.map((c) => `- Non-negotiable: ${c}`),
        ``,
        `COMMERCIAL FRAMING:`,
        `- Objective: ${enh.creative_objective}`,
        `- Visual hierarchy: ${enh.visual_hierarchy}`,
        `- Why this works: ${enh.commercial_reasoning}`,
      ];

      // Explicit client directives are repeated here as intent (not as execution)
      // so they survive even if a later section is trimmed under budget pressure.
      const explicitAsks = [
        ...(locked.camera_requirements || []).map((c) => `camera: ${c}`),
        ...(locked.lighting_requirements || []).map((c) => `lighting: ${c}`),
        ...(locked.composition_requirements || []).map((c) => `composition: ${c}`),
        ...(locked.material_requirements || []).map((c) => `material: ${c}`),
      ];
      if (explicitAsks.length > 0) {
        interpLines.push(
          ``,
          `EXPLICIT CLIENT DIRECTIVES — these are requirements, not suggestions. Execute them exactly; never substitute a house default:`,
          ...explicitAsks.map((a) => `- ${a}`)
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

    // OUTPUT CONTEXT is now metadata only. Every camera, lighting and composition
    // line that used to live here has moved into the single resolved ART DIRECTION
    // section — this block was one of the four competing authorities.
    const outputContextText = `INTENDED USE CASE: ${useCaseText}\nTARGET ASPECT RATIO: ${aspectRatioText}\nAll styling decisions for this output are stated once, in the ART DIRECTION and COMMERCIAL LAYOUT sections. Apply no additional house defaults.`;
    provenance.output_context = { source: "user", useCase: useCaseText, aspectRatio: aspectRatioText };

    // F.2 CAMPAIGN STRATEGY — commercial reasoning that used to be discarded.
    const strategy = input.marketingStrategy;
    const mc = input.marketingContext;
    // The chain matters more than any single line: a model told only "luxury
    // skincare" renders the category, while a model told what the buyer actually
    // wants and what that should feel like has something to make decisions with.
    const strategyLines: string[] = [];
    if (mc?.industry || mc?.objective || mc?.target_channel) {
      strategyLines.push(
        `BUSINESS GOAL: ${[
          mc.objective ? `${mc.objective}` : "",
          mc.industry ? `in ${mc.industry}` : "",
          mc.target_channel ? `for ${mc.target_channel}` : "",
        ].filter(Boolean).join(" ")}`
      );
    } else if (strategy?.commercial_goal) {
      strategyLines.push(`BUSINESS GOAL: ${strategy.commercial_goal}`);
    }
    if (strategy?.consumer_insight) strategyLines.push(`CONSUMER INSIGHT: ${strategy.consumer_insight}`);
    if (strategy?.target_customer_psychology) {
      strategyLines.push(`WHO THIS IS FOR: ${strategy.target_customer_psychology}`);
    } else if (mc?.target_audience) {
      strategyLines.push(`WHO THIS IS FOR: ${mc.target_audience}`);
    }
    if (strategy?.emotional_response) strategyLines.push(`EMOTIONAL RESPONSE TO CREATE: ${strategy.emotional_response}`);
    if (strategy?.creative_message) strategyLines.push(`CREATIVE MESSAGE: ${strategy.creative_message}`);
    else if (strategy?.creative_angle) strategyLines.push(`CREATIVE ANGLE: ${strategy.creative_angle}`);

    const vt = strategy?.visual_translation;
    if (vt) {
      const vtLines = [
        vt.subject_representation ? `- Subject treatment: ${vt.subject_representation}` : "",
        vt.atmosphere ? `- Atmosphere: ${vt.atmosphere}` : "",
        vt.lighting_character ? `- Light should feel: ${vt.lighting_character}` : "",
        vt.material_treatment ? `- Materials should read: ${vt.material_treatment}` : "",
        vt.composition_principle ? `- Organising principle: ${vt.composition_principle}` : "",
        vt.colour_direction ? `- Colour signals: ${vt.colour_direction}` : "",
      ].filter(Boolean);
      if (vtLines.length > 0) {
        strategyLines.push("VISUAL TRANSLATION OF THAT MESSAGE:", ...vtLines);
      }
    } else if (strategy?.prompt_guidance) {
      strategyLines.push(`VISUAL DIRECTION: ${strategy.prompt_guidance}`);
    }

    const campaignStrategyText = strategyLines.length > 0
      ? `${strategyLines.join("\n")}\n\nThis is the persuasive job the image has to do, and the reasoning behind it. Serve the message, not the product category — a literal depiction of the category is a failure even when it is well lit. The exact camera, lighting and layout that deliver this are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; where those conflict with this section, they win, and an explicit client directive beats both.`
      : "No campaign strategy supplied. Serve the creative intent directly.";
    provenance.campaign_strategy = {
      source: strategy ? "marketing_brain" : "none",
      angle: strategy?.creative_angle,
      has_insight: Boolean(strategy?.consumer_insight),
      has_visual_translation: Boolean(vt),
    };

    // G. RELEVANT_KNOWLEDGE
    //
    // Knowledge is the largest and the only naturally divisible section, so it is
    // the one that gets budgeted. Everything else in the prompt is either a client
    // requirement, an identity lock or a single resolved decision — none of those
    // can be partially kept, and sacrificing a 500-character strategy section to
    // relieve overage caused by a 10,000-character knowledge dump helps nobody.
    //
    // Blocks are emitted in retrieval-rank order and the lowest-ranked specialist
    // blocks are dropped first, which is exactly the ordering the retrieval layer
    // already computed. Universal core blocks are never dropped here.
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

    const renderKnowledge = (
      specialistLimit: number,
      universalLimit: number = universalContentBlocks.length
    ): { text: string; droppedIds: string[] } => {
      const lines: string[] = [
        "NOTICE: Retrieved professional knowledge provides supportive physical principles. Non-exhaustive; does not restrict valid creative solutions.\n",
      ];
      universalTokens = 0;
      specialistTokens = 0;
      const droppedIds: string[] = [];

      const keptUniversal = universalContentBlocks.slice(0, Math.max(0, universalLimit));
      universalContentBlocks
        .slice(Math.max(0, universalLimit))
        .forEach((b) => droppedIds.push(b.entry.id));

      if (keptUniversal.length > 0) {
        lines.push("### UNIVERSAL PROFESSIONAL KNOWLEDGE");
        keptUniversal.forEach(({ entry, content }) => {
          const cleaned = compactBlockContent(content);
          lines.push(`\n#### [${entry.id}] ${entry.title}\n${cleaned}`);
          universalTokens += KnowledgeBudgetManager.estimateTokens(cleaned);
        });
      }

      const ranked = [...specialistContentBlocks].sort(
        (a, b) => (b.entry.final_score || 0) - (a.entry.final_score || 0)
      );
      const kept = ranked.slice(0, Math.max(0, specialistLimit));
      ranked.slice(Math.max(0, specialistLimit)).forEach((b) => droppedIds.push(b.entry.id));

      if (kept.length > 0) {
        lines.push("\n### SPECIALIST PROFESSIONAL KNOWLEDGE");
        kept.forEach(({ entry, content }) => {
          const cleaned = compactBlockContent(content);
          lines.push(`\n#### [${entry.id}] ${entry.title}\n${cleaned}`);
          specialistTokens += KnowledgeBudgetManager.estimateTokens(cleaned);
        });
      }

      return { text: lines.join("\n"), droppedIds };
    };

    let knowledgeRender = renderKnowledge(specialistContentBlocks.length);
    let relevantKnowledgeText = knowledgeRender.text;
    provenance.relevant_knowledge = {
      universal_ids: universalBlockEntries.map((b) => b.id),
      specialist_ids: specialistBlockEntries.map((b) => b.id),
    };

    // 6.5 Resolve the ONE art direction, and the commercial layout for this format.
    //
    // Ordering matters: the knowledge layer's creative direction has to exist
    // before the resolver runs, because it is one of the five candidate tiers.
    // It used to be appended after substitution, which is why its hardcoded
    // "eye-level 50mm commercial hero" line competed with everything else.
    const creativeKnowledgeService = new CreativeKnowledgeService();
    const creativeRes = creativeKnowledgeService.resolveCreativeDirection({
      useCase: input.useCase,
      brief: input.brief,
      routingResult: input.routingResult,
      knowledgePackage: input.knowledgePackage,
    });

    const artDirection = ArtDirectionResolverService.resolve({
      lockedIntent: input.creativeInterpretation?.locked_intent || {
        subject: [],
        environment: [],
        mood: [],
        style: [],
        camera_requirements: [],
        lighting_requirements: [],
        non_negotiable_constraints: [],
        important_user_requirements: [],
      },
      inspirationStyleManifest: input.inspirationStyleManifest,
      marketingStrategy: input.marketingStrategy,
      knowledgeDirection: creativeRes.creativeDirection,
      assetDefaults: input.creativeInterpretation?.execution_directives,
      assetType: input.useCase,
      aspectRatio: input.aspectRatio,
    });
    provenance.art_direction = {
      resolved_from: artDirection.provenance,
      // Scoring detail, so a surprising decision can be explained rather than guessed at.
      decisions: Object.entries(artDirection.fields).map(([dim, f]) => ({
        dimension: dim,
        source: f!.source,
        confidence: f!.confidence,
        specificity: f!.specificity,
        score: f!.score,
        client_locked: f!.source === "USER" && f!.specificity === "HIGH",
        qualifiers: f!.qualifiers,
      })),
      suppressed: artDirection.suppressed.map((s) => `${s.dimension}<-${s.source} (${s.reason})`),
    };

    const layoutPlan = CommercialLayoutService.plan({
      assetType: input.useCase,
      aspectRatio: input.aspectRatio,
      copyItems: input.copyItems,
      hasLogoAsset: input.hasLogoAsset ?? ((input.routingResult.reference_manifest?.detected_logos_count || 0) > 0),
      objective: input.marketingContext?.objective,
      targetChannel: input.marketingContext?.target_channel,
    });
    provenance.commercial_layout = {
      format: layoutPlan.format,
      zones: layoutPlan.zones.map((z) => z.role),
      visual_priority: layoutPlan.visual_priority.map((p) => `${p.element}:${p.importance}`),
      eye_flow: layoutPlan.eye_flow,
      negative_space_strategy: layoutPlan.negative_space_strategy,
      renders_copy: layoutPlan.rendersCopy,
    };

    // Identity, logo and typography guidance from the knowledge layer are kept.
    // Its composition and cinematic-style lines are dropped unconditionally — the
    // resolver already consumed them as tier-4 candidates and printed whatever won.
    const creativeGuidanceText = creativeRes.compactGuidanceText
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("3. COMMERCIAL COMPOSITION:") && !t.startsWith("5. CINEMATIC STYLE:");
      })
      .join("\n");

    // 6.9 Trailing blocks.
    //
    // Built BEFORE assembly so their real size is known. They used to be appended
    // after the knowledge-fit loop had already run against a fixed 2,500-character
    // guess, so a large inspiration subject-lock block pushed the finished prompt
    // past the ceiling and the budget reducer then deleted the campaign strategy to
    // claw it back. Measuring instead of guessing removes that whole failure.
    const appendedBlocks: string[] = [];

    // 9.5 Creative Quality & Anti-Text Regression Constraints
    const creativeConstraintService = new CreativeConstraintService();
    const creativeConstraints = creativeConstraintService.resolveConstraints({
      copyItems: input.copyItems,
      productCount: input.productCount,
    });
    appendedBlocks.push(creativeConstraintService.getPromptDirective(creativeConstraints));

    // 9.6 Inspiration Reference Rules
    //
    // Style no longer lives here. Camera, lighting, composition and colour read from
    // an inspiration image are resolved at tier 2 by ArtDirectionResolverService and
    // printed once, in ART DIRECTION, together with the full shot sheet. What remains
    // is the part only this block can say: which attached image is the product, and
    // the anti-merge rules that stop a second bottle appearing in frame.
    const hasInspiration = Boolean(
      input.hasInspirationReference ||
      (Array.isArray(input.inspirationReferenceRules) && input.inspirationReferenceRules.length > 0) ||
      (input.routingResult?.asset_roles && input.routingResult.asset_roles.some((ar) => (ar.role as string) === "STYLE" || (ar.role as string) === "INSPIRATION_REFERENCE"))
    );

    if (hasInspiration) {
      const extraRules = input.inspirationReferenceRules?.map((r) => `- ${r}`).join("\n") || "";

      const productRefIds = (input.routingResult?.products || []).flatMap((p) => p.reference_ids || []);
      const inspirationRefIds = (input.routingResult?.asset_roles || [])
        .filter((ar) => (ar.role as string) === "INSPIRATION_REFERENCE" || (ar.role as string) === "STYLE")
        .map((ar) => ar.reference_id);
      const productRefLabel = productRefIds.length ? productRefIds.join(", ") : "REF_01";
      const inspirationRefLabel = inspirationRefIds.length ? inspirationRefIds.join(", ") : "REF_02";
      const productUnitCount = (input.routingResult?.products || []).length || 1;
      const withheld = input.inspirationImageWithheld;

      const inspirationBlock = [
        "[INSPIRATION REFERENCE — SUBJECT LOCK]",
        withheld
          ? "A reference photograph was analysed by an art director and is NOT attached. Its photographic treatment is written out in full in the ART DIRECTION section above; reproduce that treatment."
          : `The inspiration image (${inspirationRefLabel}) is attached as a lighting and composition reference ONLY. Its photographic treatment is stated in the ART DIRECTION section above.`,
        "",
        `ONLY ONE SUBJECT EXISTS: the product in the attached product photograph (IMAGE 1 / ${productRefLabel}).`,
        `- The finished image must contain EXACTLY ${productUnitCount} product unit(s), every one of them that product.`,
        "- Preserve its exact shape, cap, label artwork, typography, brand name and proportions. It is the sole source of truth for product identity.",
        "- Do NOT invent, add or imagine a second product, bottle, jar, tube, can or package. This is not a duo, set, bundle or comparison shot.",
        withheld
          ? "- The analysed reference showed a DIFFERENT product. That product does not exist here. Reproduce its lighting, colour, staging and mood only, never its packaging, label or brand."
          : "- The product depicted inside the inspiration image MUST NOT appear in the output: not in the foreground, not beside the product, not in the background, and not reflected in any surface.",
        `- Any brand name, logo, wordmark or label belonging to the inspiration image's product is FORBIDDEN. Only branding from ${productRefLabel} may appear.`,
        "- Do NOT render any reference identifier, slot label, caption or watermark such as REF_01 or IMAGE 1 anywhere in the picture.",
        "- Do NOT invent an environment from the product's name, ingredients or origin story. The scene is defined in ART DIRECTION and nowhere else.",
        extraRules,
      ].filter(Boolean).join("\n");

      appendedBlocks.push(inspirationBlock);
    }


    // 7. Substitute Placeholders in Template
    const substitute = (knowledgeText: string): string => {
      let out = templateVal.templateContent;
      out = out.replace("{{USER_BRIEF}}", userBriefText);
      out = out.replace("{{CAMPAIGN_STRATEGY}}", campaignStrategyText);
      out = out.replace("{{PRODUCT_INSTANCE_REQUIREMENTS}}", `${productInstanceRequirementsText}\n\n${creativeGuidanceText}`);
      out = out.replace("{{USER_HARD_CONSTRAINTS}}", userHardConstraintsText);
      out = out.replace("{{TYPOGRAPHY_AND_READABLE_COPY}}", typographyAndReadableCopyText);
      out = out.replace("{{BRAND_KNOWLEDGE}}", brandKnowledgeText);
      out = out.replace("{{ART_DIRECTION}}", artDirection.promptBlock);
      out = out.replace("{{COMMERCIAL_LAYOUT}}", layoutPlan.promptBlock);
      out = out.replace("{{OUTPUT_CONTEXT}}", outputContextText);
      out = out.replace("{{RELEVANT_KNOWLEDGE}}", knowledgeText);
      return appendedBlocks.length > 0 ? `${out}\n\n${appendedBlocks.join("\n\n")}` : out;
    };

    let compiledPrompt = substitute(relevantKnowledgeText);

    // Fit knowledge to the budget before anything else is considered for removal.
    //
    // The whole prompt is now measured, trailing blocks included, so this loop knows
    // the true size. Knowledge is the only naturally divisible section: everything
    // else is a client requirement, an identity lock or a single resolved decision,
    // none of which can be partially kept. Specialist blocks go first, lowest
    // retrieval rank first, and only then universal core blocks — never below a
    // floor of two, because the universal set is what keeps a render physically
    // coherent.
    const knowledgeFitCeiling = PromptBudgetManagerService.EMERGENCY_TARGET;
    const droppedKnowledgeIds: string[] = [];
    let specialistLimit = specialistContentBlocks.length;
    let universalLimit = universalContentBlocks.length;
    const UNIVERSAL_FLOOR = 2;

    while (compiledPrompt.length > knowledgeFitCeiling && specialistLimit > 0) {
      specialistLimit--;
      knowledgeRender = renderKnowledge(specialistLimit, universalLimit);
      relevantKnowledgeText = knowledgeRender.text;
      compiledPrompt = substitute(relevantKnowledgeText);
    }

    while (compiledPrompt.length > knowledgeFitCeiling && universalLimit > UNIVERSAL_FLOOR) {
      universalLimit--;
      knowledgeRender = renderKnowledge(specialistLimit, universalLimit);
      relevantKnowledgeText = knowledgeRender.text;
      compiledPrompt = substitute(relevantKnowledgeText);
    }

    if (knowledgeRender.droppedIds.length > 0) {
      droppedKnowledgeIds.push(...knowledgeRender.droppedIds);
      warnings.push("KNOWLEDGE_TRIMMED_FOR_BUDGET");
      console.warn("[MASTER_PROMPT_COMPILER][KNOWLEDGE_TRIMMED]", {
        message: "Prompt budget required dropping the lowest-ranked knowledge blocks.",
        dropped: knowledgeRender.droppedIds,
        kept_specialist_blocks: specialistLimit,
        kept_universal_blocks: universalLimit,
      });
    }
    provenance.relevant_knowledge = {
      ...(provenance.relevant_knowledge as Record<string, unknown>),
      specialist_ids_rendered: specialistBlockEntries
        .map((b) => b.id)
        .filter((id) => !droppedKnowledgeIds.includes(id)),
      dropped_for_budget: droppedKnowledgeIds,
    };

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

    // 10. Provider Prompt Optimization & Phase 2.5.4 Mandatory Prompt Budget Manager System
    const optimizationRes = ProviderPromptOptimizer.optimize(compiledPrompt);
    compiledPrompt = optimizationRes.optimizedPrompt;

    const budgetManager = new PromptBudgetManagerService();
    const productCount = input.productCount || (input.routingResult.products ? input.routingResult.products.length : 1);
    const mode = input.routingResult.reference_manifest?.product_manifest?.compression_mode || (productCount > 10 ? "CATALOG" : productCount >= 2 ? "MEDIUM" : "HIGH");

    const budgetRes = budgetManager.enforceBudget(compiledPrompt, productCount, mode);
    compiledPrompt = budgetRes.final_prompt;

    // Truncation is never silent. Anything the reducer dropped is recorded on the
    // compiled package and travels out through the API response, so an operator can
    // see that a render shipped without, say, its professional knowledge.
    provenance.budget = {
      before_chars: budgetRes.before,
      after_chars: budgetRes.after,
      duplicate_lines_removed: budgetRes.duplicate_lines_removed,
      sections_removed: budgetRes.removals,
      sections_kept: budgetRes.sections_kept,
      hard_truncated: budgetRes.truncated,
    };
    if (budgetRes.removals.length > 0 || budgetRes.truncated) {
      warnings.push("PROMPT_SECTIONS_REMOVED");
    }

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
