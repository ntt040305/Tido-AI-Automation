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
import { KnowledgeBlockCompressor } from "./KnowledgeBlockCompressor";
import { ProviderPromptOptimizer } from "./ProviderPromptOptimizer";
import { ProductIdentityResolver } from "./ProductIdentityResolver";
import { PromptCompressionService } from "./PromptCompressionService";
import { PromptBudgetManagerService } from "../service/PromptBudgetManagerService";
import { CreativeKnowledgeService } from "../service/CreativeKnowledgeService";
import { CreativeConstraintService } from "../service/CreativeConstraintService";
import { ArtDirectionResolverService, isClientLockedDimension } from "../service/ArtDirectionResolverService";
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
        // The objective, without the part that describes our own retrieval.
        //
        // It arrived as "...raise its commercial impact for poster (editorial
        // story) incorporating domain expertise: [Poster Communication & Spatial
        // Foundation]" — the trailing clause names the knowledge blocks we
        // happened to select. That is a fact about this pipeline, not an
        // instruction about the picture, and the renderer cannot act on it.
        `- Objective: ${String(enh.creative_objective || "").replace(/\s*incorporating domain expertise:.*$/i, ".").trim()}`,
      ];

      // `- Visual hierarchy:` and `- Why this works:` are deliberately not emitted.
      //
      // Visual hierarchy here read "Primary anchor: subject (55%). Remaining 45%
      // is supporting space and atmosphere" while COMMERCIAL LAYOUT states the
      // same hierarchy per element with real attention weights — the weaker of
      // two copies.
      //
      // `commercial_reasoning` is built by prefixing `lockedIntent.emotional_goal`
      // verbatim and appending "The subject stays the hero; framing and light are
      // tuned for '<asset>' delivery". The first half duplicates the Emotional
      // goal line four lines above it, character for character, and the second
      // half is the pipeline agreeing with itself. Measured on a serum launch the
      // pair cost 351 characters of a prompt that had none to spare.

      // Explicit client directives are repeated here as intent (not as execution)
      // so they survive even if a later section is trimmed under budget pressure.
      //
      // Phase 0.4-A. Each line is filed under whoever actually decided it.
      // `lockedIntent` mixes two things the client cannot tell apart: what they
      // typed, and what `CreativeInterpretationService` inferred from one
      // sentence of brief. With authority on, the inferred lines are the
      // director's and are labelled as the director's; the client's locks keep
      // the language they have always had. The same predicate the resolver uses
      // decides which is which, so the prompt and the tier ladder cannot drift.
      const authorityOpts = {
        creativeDirectorAuthority: input.creativeDirectorAuthority,
        userLockedDimensions: input.userLockedDimensions,
      };
      const askLines: { dimension: string; line: string }[] = [
        ...(locked.camera_requirements || []).map((c) => ({ dimension: "camera", line: `camera: ${c}` })),
        ...(locked.lighting_requirements || []).map((c) => ({ dimension: "lighting", line: `lighting: ${c}` })),
        ...(locked.composition_requirements || []).map((c) => ({ dimension: "composition", line: `composition: ${c}` })),
        ...(locked.material_requirements || []).map((c) => ({ dimension: "materials", line: `material: ${c}` })),
      ];
      const clientAsks = askLines.filter((a) => isClientLockedDimension(a.dimension, authorityOpts));
      const directorAsks = askLines.filter((a) => !isClientLockedDimension(a.dimension, authorityOpts));

      if (clientAsks.length > 0) {
        interpLines.push(
          ``,
          `EXPLICIT CLIENT DIRECTIVES — these are requirements, not suggestions. Execute them exactly; never substitute a house default:`,
          ...clientAsks.map((a) => `- ${a.line}`)
        );
      }
      if (directorAsks.length > 0) {
        // Deliberately weaker language than the client block. These are the art
        // director's calls for this brief: binding on the render, but a reader
        // is told they came from the director, and serving the idea is allowed
        // to beat executing the letter. Claiming otherwise is the laundering
        // this split exists to end.
        interpLines.push(
          ``,
          `ART DIRECTOR'S DECISIONS — chosen for this brief, not dictated by the client. Execute them as written unless doing so would break the idea they serve:`,
          ...directorAsks.map((a) => `- ${a.line}`)
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

    // Phase 2.4 identity lock, reduced to what is not already stated.
    //
    // This was nineteen lines listing Preserve / Allowed / Forbidden. The
    // REFERENCE SEMANTICS section states the same separation unconditionally and
    // in better prose — what the product IS versus how it is PHOTOGRAPHED — so
    // all but two of these concepts appeared in the same prompt twice. The two
    // that did not are the ones kept here.
    instanceLines.push(
      `\n[REFERENCE IDENTITY LOCK] References are identity evidence: never redesign or replace the product, never invent packaging it does not have, and never generate a logo or brand mark that is not in the reference.\n`
    );

    // Inject Phase 2.2 & 2.4 Reference Manifest Identity Lock Rules
    const refManifest = input.routingResult.reference_manifest;
    if (refManifest) {
      // Relationship type and reference counts are router bookkeeping. The
      // renderer is holding the images and can count them; what it cannot infer
      // is which product each one binds to, and that is stated below.
      instanceLines.push(`- REFERENCE RELATIONSHIP: ${refManifest.relationship_type.toUpperCase()}`);

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

    // Which products are single-reference, without restating the policy.
    //
    // REFERENCE SEMANTICS carries the rule itself ("with one reference image,
    // unseen surfaces are reconstructed conservatively without inventing
    // unverified logos, text or structural features"). What it cannot know is
    // WHICH products that applies to, which is the only part worth spending
    // characters on here.
    const singleRefProducts = resolvedGroups.filter((p) => p.reference_ids.length === 1);
    if (singleRefProducts.length > 0) {
      instanceLines.push(
        `- SINGLE-REFERENCE PRODUCTS (apply the single reference policy above): ${singleRefProducts.map((p) => p.product_id).join(", ")}.`
      );
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

    // ── Product Identity Protection ───────────────────────────────────────
    //
    // Phase 0.4-B. Unconditional, because the locks above are not: they only
    // appear when a reference manifest happens to carry them, and the failure
    // this prevents happens exactly when it does not.
    //
    // Measured across E2's 24 renders: the product's own label survived intact
    // in five of six scenarios, and was destroyed in 4/4 renders of the hero
    // scenario — the campaign copy was printed ONTO the label in place of the
    // real text, in both arms and both runs. The hero frame is where it fails
    // because it is the frame with nowhere else for copy to go, so the model
    // puts the words on the only surface it has.
    //
    // Four properties, named as properties. Not a house style and not a
    // category rule: a label, a logo, a silhouette and a colour exist for a
    // bottle, a carton, a laptop and a coat alike.
    instanceLines.push(
      `- PRODUCT IDENTITY PROTECTION — the product is photographed, never redesigned:`,
      `  * Label: reproduce every word, mark and proportion exactly as the reference shows. Do not rewrite, retranslate, re-typeset, add to, remove from or leave blank any part of it.`,
      `  * Logo: the reference's mark, letterforms and spacing. Do not restyle it or substitute another.`,
      `  * Packaging shape: the reference's silhouette, proportions, closure and material. Do not slim, round, stretch or resize it.`,
      `  * Product colour: the reference's colours, including the contents seen through the container. Do not re-tint to match the scene.`,
      `  * A blank, partial or illegible label is a failed render, not a clean one.`
    );

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
      // Typography as communication design, not as a fixed hierarchy.
      //
      // This section used to open with one sentence prescribing the same order
      // for every render: "primary emphasis > secondary subtitle > product
      // identity/offer > action". It was byte-identical across all five asset
      // types and every brand, which made it a template rather than a decision —
      // a launch line on a thumbnail and a price on a banner were being given the
      // same treatment because nothing ever asked what the words were for.
      //
      // What replaces it are the questions a designer answers, plus the roles the
      // caller actually supplied. The roles are evidence about what each string
      // DOES; the relative emphasis is left to be decided from them, the brand
      // and the format, all of which are stated elsewhere in this prompt.
      const roleOf = (item: CopyItemInput | string): string => {
        if (typeof item === "string") return "";
        const t = (item.type || "").trim();
        return t && t !== "other" ? t.replace(/_/g, " ") : "";
      };
      const anyRole = copyItems.some((i) => roleOf(i));

      const lines: string[] = [
        "Use exactly the provided text. The strings below are the only words that may appear in the image. Reproduce them exactly \u2014 spelling, capitalization, punctuation, numbers and accents \u2014 and render no others; every other line in this prompt is a non-visible instruction.",
        "",
        "Decide their treatment rather than applying a default. Which string carries the message, and which merely supports it? Does the emphasis come from size, weight, colour, or the space around it? Does the type sit with the image or on top of it? Type that has to fight the picture behind it is placed wrong, not sized wrong. Let the brand and the way this format is read decide how loud it is \u2014 both are stated above.",
        "",
      ];

      copyItems.forEach((item) => {
        const text = typeof item === "string" ? item : item.text;
        if (text && text.trim()) {
          const role = roleOf(item);
          lines.push(role ? `"${text.trim()}"  \u2014 supplied as: ${role}` : `"${text.trim()}"`);
        }
      });

      if (anyRole) {
        lines.push(
          "",
          "The roles above are what the client called each string, not an instruction about size or position."
        );
      }

      // Phase 0.4-B, the second half of Product Identity Protection.
      //
      // The strings above are the campaign's, and the label's words are the
      // product's. Nothing previously said they were different things, so in
      // the hero scenario — the one frame with no free space for copy — the
      // renderer resolved the tension by printing the campaign onto the label,
      // in 4 of 4 renders. This says where the words go.
      lines.push(
        "",
        "These strings are campaign copy. They belong to the layout, not to the product: set them in the frame around it and never on the label, cap, packaging or any other product surface. The words already printed on the product are part of the product — reproduce them exactly and do not replace them with any string above."
      );

      typographyAndReadableCopyText = lines.join("\n");
    } else {
      warnings.push("NO_EXACT_COPY");
      // No copy reached the compiler. That is TWO different situations and this
      // text cannot tell them apart:
      //
      //   1. the brief genuinely has no copy, or
      //   2. hybrid typography stripped it, because the words are composited
      //      afterwards and the frame must leave room for them.
      //
      // It used to close with "compose for a finished image rather than leaving
      // a blank band for type that will not be added", which is right for (1)
      // and directly contradicts (2) -- where the composition section, later in
      // the same prompt, asks for exactly that band. Measured on a live render:
      // both sentences present, and the model resolved the contradiction by
      // painting the copy into the frame itself, on top of the copy that was
      // then composited over it. Every line appeared twice.
      //
      // The clause is gone rather than made conditional: whether a band is
      // reserved is the COMPOSITION's decision and it already states it, so
      // this sentence had no business asserting the opposite from here.
      typographyAndReadableCopyText =
        "Do not add any typography or text. No copy is authorized for this pass, so render no words, letters, invented brand names, prices, labels or decorative lettering anywhere in the frame. The only exception is lettering physically printed on the uploaded product itself: it is part of the product and stays exactly as the product reference shows it.";
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
    // What this image has to achieve, stated before who it is for.
    //
    // The business goal above is the campaign's goal ("ra mạt sản phẩm"); this is
    // the IMAGE's goal, which is a narrower question and the one that decides
    // composition. An image made to be remembered and an image made to be acted
    // on are different pictures, and until now nothing in the prompt separated
    // them.
    if (strategy?.communication_objective) {
      strategyLines.push(`WHAT THIS IMAGE MUST ACHIEVE: ${strategy.communication_objective}`);
    }
    if (strategy?.brand_personality) {
      strategyLines.push(`HOW THIS BRAND BEHAVES: ${strategy.brand_personality}`);
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

    // The campaign DNA is built FROM the visual translation, so on a campaign run
    // the two say the same six things in the same words — mood/atmosphere,
    // colour_logic/colour_direction, lighting_logic/lighting_character and so on.
    // Printing both wasted roughly 900 characters per asset restating the DNA,
    // which is what pushed these prompts over the ceiling and got the whole
    // campaign concept dropped by the reducer.
    const vt = input.campaignDna ? undefined : strategy?.visual_translation;

    // ── What kind of thing this is, before what is in it ─────────────
    //
    // Context, not a template. The considerations name what the format makes
    // hard; they never name a layout, because the COMMERCIAL LAYOUT section
    // below already carries the geometry and saying it twice in prose would turn
    // a way of thinking into a formula. `asset_reasoning` is the strategy
    // layer's answer to why this format suits THIS campaign, which differs
    // between two posters for different clients and is the part no static text
    // can supply.
    //
    // This sits inside CAMPAIGN STRATEGY, which is P0, so it survives every
    // compression path. Measured before it existed, 42.5% of the prompt was
    // byte-identical across all five asset types and the strategy section varied
    // no more between formats than it did between two runs of one format.
    const assetCtx = CommercialLayoutService.designConsiderations(input.useCase);
    const assetLines: string[] = [];
    if (assetCtx) {
      assetLines.push(
        `ASSET CONTEXT — ${assetCtx.format.replace(/_/g, " ").toUpperCase()}:`,
        `- What this format asks of the design: ${assetCtx.considerations}`
      );
    }
    const assetReasoning = String(strategy?.asset_reasoning || "").trim();
    if (assetReasoning) {
      assetLines.push(`- Why this format serves this campaign: ${assetReasoning}`);
    }
    if (assetLines.length > 0) {
      strategyLines.push(...assetLines);
    }

    // ── The scene comes first ──────────────────────────────────────────
    //
    // Nano Banana 2, like every image model, renders what the prompt names. A
    // list of qualities — atmosphere, colour signals, material treatment —
    // produces a well-lit object, which is how "an invitation to experience the
    // cafe" came back as a warm photograph of a cup. What is HAPPENING has to be
    // stated before how it should feel, because the model builds the frame from
    // nouns and verbs and then grades it with the adjectives.
    const sceneLines = [
      vt?.scene_moment ? `- What is happening: ${vt.scene_moment}` : "",
      vt?.human_presence ? `- Who is in frame: ${vt.human_presence}` : "",
    ].filter(Boolean);
    if (sceneLines.length > 0) {
      strategyLines.push("THE SCENE — WHAT THE IMAGE ACTUALLY SHOWS:", ...sceneLines);
    }

    if (vt) {
      const vtLines = [
        vt.subject_representation ? `- Subject treatment: ${vt.subject_representation}` : "",
        vt.camera_intent ? `- Why the camera sits where it does: ${vt.camera_intent}` : "",
        vt.atmosphere ? `- Atmosphere: ${vt.atmosphere}` : "",
        vt.lighting_character ? `- Light should feel: ${vt.lighting_character}` : "",
        vt.material_treatment ? `- Materials should read: ${vt.material_treatment}` : "",
        vt.composition_principle ? `- Organising principle: ${vt.composition_principle}` : "",
        vt.colour_direction ? `- Colour signals: ${vt.colour_direction}` : "",
      ].filter(Boolean);
      if (vtLines.length > 0) {
        strategyLines.push("VISUAL TRANSLATION OF THAT MESSAGE:", ...vtLines);
      }
    }

    // The reading order, and the road not taken.
    //
    // `attention_sequence` is what the viewer should experience — notice,
    // understand, then feel or act. COMMERCIAL LAYOUT allocates attention as
    // numbers per element, which is the same question answered mechanically; the
    // numbers cannot say what the second beat is FOR.
    //
    // `creative_route` is one line naming the direction chosen over the strongest
    // alternative. It is in the prompt because a renderer that knows an image is
    // deliberately quiet will not brighten it back toward the safe version.
    if (strategy?.attention_sequence) {
      strategyLines.push(`HOW THE FRAME SHOULD BE READ: ${strategy.attention_sequence}`);
    }
    if (strategy?.creative_route) {
      strategyLines.push(`THE ROUTE TAKEN: ${strategy.creative_route}`);
    }

    // `prompt_guidance` is included alongside the structured translation, not
    // instead of it.
    //
    // This used to be an `else if`, so on every render where `visual_translation`
    // existed — which is every render where the model answers properly — the
    // guidance was silently discarded. It is the single most concrete sentence
    // the strategy layer produces, the one that reads "a confident woman in her
    // early 40s, mid-conversation, the cup already in her hand". Six fields of
    // adjectives survived and the one sentence containing a person was thrown
    // away.
    //
    // It is skipped when it restates the scene rather than adding to it. Exact
    // equality is too narrow a test for that — a retelling with three words
    // changed passes it — so the test is content-word overlap, at 70% of the
    // guidance's own vocabulary already present in the scene.
    //
    // Measured on the four phase briefs, the overlap runs 0.37 to 0.49: the
    // guidance is a genuinely different condensation of the frame, not a repeat,
    // and this guard fires on none of them. It is a safety net for the case where
    // the strategy layer answers the scene question twice, not a saving to count
    // on.
    const guidance = String(strategy?.prompt_guidance || "").trim();
    const sceneText = `${vt?.scene_moment || ""} ${vt?.human_presence || ""}`.toLowerCase();
    const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
    const gWords = words(guidance);
    const sWords = words(sceneText);
    let shared = 0;
    gWords.forEach((w) => { if (sWords.has(w)) shared++; });
    const restatesScene = gWords.size > 0 && shared / gWords.size >= 0.7;
    if (guidance && !restatesScene) {
      strategyLines.push(`VISUAL DIRECTION: ${guidance}`);
    }

    // Campaign DNA leads the section when this render is one asset of a set: the
    // rules that hold across the whole campaign come before the reasoning behind
    // this particular execution.
    if (input.campaignDna && input.campaignDna.trim()) {
      strategyLines.unshift(input.campaignDna.trim(), "");
    }

    const campaignStrategyText = strategyLines.length > 0
      ? `${strategyLines.join("\n")}\n\nBuild the frame from the scene above first — the place, the people and the moment — then apply the treatment. An image that has the right mood and no situation in it is a product photograph, and a literal depiction of the product category is a failure even when it is well lit. The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; where those conflict with this section, they win, and an explicit client directive beats both.`
      : "No campaign strategy supplied. Serve the creative intent directly.";
    provenance.campaign_strategy = {
      source: strategy ? "marketing_brain" : "none",
      angle: strategy?.creative_angle,
      has_insight: Boolean(strategy?.consumer_insight),
      has_visual_translation: Boolean(vt),
      has_campaign_dna: Boolean(input.campaignDna),
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
      // MASTER_PROMPT_OPTIMIZATION_V2 Task 1: the retrieval notice is gone. It told
      // the image model that the knowledge below was retrieved and non-exhaustive,
      // which is a fact about our pipeline, not an instruction about the picture.
      const lines: string[] = [];
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
          const cleaned = KnowledgeBlockCompressor.compress(compactBlockContent(content)).text;
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
          const cleaned = KnowledgeBlockCompressor.compress(compactBlockContent(content)).text;
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
      // Phase 1.1D. Both absent on every existing caller, so the tiering they
      // get is the tiering they have always got.
      creativeDirectorAuthority: input.creativeDirectorAuthority,
      userLockedDimensions: input.userLockedDimensions,
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
      // The override is a Phase 3.1.6.5 validation seam. Absent — which it is on
      // every production path — this is byte-identical to the previous line.
      knowledgeDirection: (input.knowledgeDirectionOverride as typeof creativeRes.creativeDirection) || creativeRes.creativeDirection,
      assetDefaults: input.creativeInterpretation?.execution_directives,
      assetType: input.useCase,
      aspectRatio: input.aspectRatio,
    });
    provenance.art_direction = {
      resolved_from: artDirection.provenance,
      // Scoring detail, so a surprising decision can be explained rather than guessed at.
      decisions: Object.entries(artDirection.fields).map(([dim, f]) => ({
        dimension: dim,
        // The resolved text itself, not just where it came from. Without it a
        // reviewer can see that the camera was decided by KNOWLEDGE but not what
        // it was decided to be, which is the part that explains a bad render.
        value: f!.value,
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
      // The image's own job, when the strategy layer worked one out, and the
      // campaign's objective otherwise. These differ: a consideration campaign
      // whose brief says "cân nhắc mua hàng" contains the word for "buy" without
      // being a hard sell, and the reasoned objective says so.
      objective: strategy?.communication_objective || input.marketingContext?.objective,
      attentionShift: strategy?.attention_shift,
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

    // Identity and logo guidance from the knowledge layer are kept. Composition,
    // cinematic style and — from Phase 3.1.6.6 — typography are dropped
    // unconditionally: the resolver consumed each of them as a tier-4 candidate
    // and printed whatever won. Leaving a line here after its dimension became
    // resolver-owned is how the same instruction ends up in the prompt twice,
    // once arbitrated and once not.
    const creativeGuidanceText = creativeRes.compactGuidanceText
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return (
          !t.startsWith("3. COMMERCIAL COMPOSITION:") &&
          !t.startsWith("4. TYPOGRAPHY AREA:") &&
          !t.startsWith("5. CINEMATIC STYLE:")
        );
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
    //
    // The ceiling is the one the prompt is actually held to.
    //
    // It used to be PromptBudgetManagerService.EMERGENCY_TARGET, 22,000, while
    // the optimizer downstream enforces 20,000. The two disagreed by 2,000
    // characters and the consequence was total: this loop trimmed knowledge
    // until the prompt fit 22,000, handed on ~21,600, and the optimizer then
    // dropped BRAND KNOWLEDGE, OUTPUT CONTEXT and PROFESSIONAL KNOWLEDGE whole.
    // Measured across ten captured production prompts, knowledge reached the
    // renderer 0 times out of 10. Fitting to the real ceiling costs a block or
    // two here and saves three entire sections there.
    //
    // One-pass moved the ceiling again, and this time upward. The compiled prompt
    // is no longer what gets sent: `OpticalCompiler` sorts it into eight blocks and
    // removes the writers BLOCK 8 supersedes, measured at ~6,900 characters per
    // case across the twelve-case benchmark, then adds ~4,000 for the typography
    // block. A compiled prompt of 27,000 therefore reaches the provider at roughly
    // 24,100 against a 32,000 ceiling. Holding the compiler to 22,000 now trims
    // knowledge to the universal floor to protect a budget nothing is spending.
    //
    // `PROMPT_KNOWLEDGE_FIT_CHARS` overrides it; the cap keeps it under the
    // optimizer's own limit so this loop can never hand on a prompt the optimizer
    // would then dismantle section by section.
    const knowledgeFitCeiling = Math.min(
      Number(process.env.PROMPT_KNOWLEDGE_FIT_CHARS || 27000),
      ProviderPromptOptimizer.HARD_LIMIT
    );
    const droppedKnowledgeIds: string[] = [];
    let specialistLimit = specialistContentBlocks.length;
    let universalLimit = universalContentBlocks.length;
    const UNIVERSAL_FLOOR = 2;

    // The format foundation block is asset reasoning, not a specialist extra.
    //
    // It is the one block routed deterministically from the asset type, and it
    // is the only place the knowledge system says what a banner is as opposed to
    // a poster. `renderKnowledge` ranks by final_score and this block is
    // inserted at 1.0, so it is always the last specialist standing — which
    // means a floor of one is enough to keep it, and keeps nothing else.
    const topSpecialistIsFoundation = [...specialistContentBlocks]
      .sort((a, b) => (b.entry.final_score || 0) - (a.entry.final_score || 0))[0]
      ?.entry.id.endsWith("_foundation") === true;
    const SPECIALIST_FLOOR = topSpecialistIsFoundation ? 1 : 0;

    while (compiledPrompt.length > knowledgeFitCeiling && specialistLimit > SPECIALIST_FLOOR) {
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
