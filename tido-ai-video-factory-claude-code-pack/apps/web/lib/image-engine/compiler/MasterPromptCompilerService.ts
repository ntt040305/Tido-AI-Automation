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
import { ProductIdentityResolver } from "./ProductIdentityResolver";
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

    // Ensure Poster Foundation Knowledge block is included when useCase === "Poster"
    if (input.useCase && typeof input.useCase === "string" && input.useCase.trim().toLowerCase() === "poster") {
      const alreadySelected = specialistBlockEntries.some((b) => b.id === "specialist.poster_foundation");
      if (!alreadySelected) {
        const posterBlock = await this.repository.getKnowledgeBlock("specialist.poster_foundation");
        if (posterBlock && posterBlock.metadata.status === "ACTIVE") {
          specialistBlockEntries.unshift({
            id: posterBlock.metadata.id,
            version: posterBlock.metadata.version,
            title: posterBlock.metadata.title,
            knowledge_type: posterBlock.metadata.knowledge_type,
            selection_tier: "PRIMARY",
            final_score: 1.0,
            scores: {
              metadata: 1.0,
              semantic: 0.0,
              signal_confidence: 1.0,
              information_value: 1.0,
              priority: posterBlock.metadata.priority || 100,
              query_importance: 1.0,
              redundancy_penalty: 0.0,
            },
            matched_signals: ["useCase:Poster"],
            selection_reasons: ["DETERMINISTIC_POSTER_FOUNDATION_ROUTING"],
            estimated_tokens: KnowledgeBudgetManager.estimateTokens(posterBlock.content),
          });
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

    // A. USER_BRIEF
    const userBriefText = input.brief && input.brief.trim()
      ? input.brief.trim()
      : "No specific creative brief provided. Focus on presenting the product authentically and appealingly for commercial advertising.";
    provenance.user_brief = { source: "user", text: userBriefText };

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
    } else {
      instanceLines.push(`- The final image MUST contain exactly ${requestedProductCount} product instances across ${routedProductCount} distinct product identities:`);
      resolvedGroups.forEach((prod) => {
        instanceLines.push(`  * ${prod.product_id}: Bound strictly to reference image(s) [${prod.reference_ids.join(", ")}]. ${prod.summary ? `(${prod.summary})` : ""}`);
      });
      instanceLines.push(`- DISTINCT PRODUCT IDENTITY ISOLATION: Each listed PRODUCT_xx is a separate physical identity. Preserve each product's reference-supported characteristics and distinct differences. Do NOT clone one product identity to satisfy another, do NOT average identities into a hybrid, and do NOT transfer product-specific features across distinct identities.`);
    }

    // Add Single Reference policy & uncertainty cautions
    instanceLines.push(`- REFERENCE FIDELITY & IDENTITY RULE: Reference images define genuine product identity (proportions, materials, labels, colors, structural features). Do NOT alter product geometry or branding unless specified by User Hard Constraints.`);

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
    const hardReqs = input.hardRequirements || [];
    const userHardConstraintsText = hardReqs.length > 0
      ? hardReqs.map((req, i) => `${i + 1}. ${req.trim()}`).join("\n")
      : "None specified.";
    provenance.user_hard_constraints = { source: "user", items: hardReqs };

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
      typographyAndReadableCopyText = "No readable typography authorized. Do NOT render words, letters, fake prices, or decorative copy on the visual canvas.";
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
    const outputContextText = `INTENDED USE CASE: ${useCaseText}\nTARGET ASPECT RATIO: ${aspectRatioText}`;
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

    // 10. Prompt Budget & Stats Calculation
    const budgetResult = PromptBudgetValidator.validate(compiledPrompt, {
      userBrief: input.brief,
      userHardConstraints: input.hardRequirements,
      brandInfo: input.brandInfo,
      copyItems: input.copyItems,
      knowledgeText: relevantKnowledgeText,
      referenceRequirementText: productInstanceRequirementsText,
    });

    if (budgetResult.is_blocked) {
      return {
        success: false,
        error: {
          code: "PROMPT_BUDGET_EXCEEDED",
          message: budgetResult.error || `Compiled prompt length (${compiledPrompt.length} chars) exceeds provider hard limit of ${budgetResult.provider_hard_limit} chars.`,
        },
      };
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
