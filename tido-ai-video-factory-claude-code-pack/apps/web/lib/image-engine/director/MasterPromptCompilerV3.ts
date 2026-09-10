import { CommercialIntent, ConceptStructuringLayer } from "./ConceptStructuringLayer";
import { SynthesizedCopy } from "./CommercialCopySynthesizer";
import { ExecutionProfile } from "./CommercialExecutionProfile";
import {
  AssembledPrompt,
  AssemblySection,
  CreativeTerritoryV2,
  CreativeUnderstanding,
  DirectorBrief,
  FormatPlan,
  ProductIdentityLockV2,
  V3_BUDGET,
  VisualDirection,
} from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 6 — Master Prompt Compiler V3.
 *
 * The difference from V2
 * ---------------------
 * V2 built the whole prompt and then cut it down. That order is why the budget
 * work in the previous phase was so involved: by the time anything measured the
 * length, twenty thousand characters of prose existed and the only question left
 * was what to delete. Deleting is a worse operation than not writing — a section
 * removed by a regex leaves the sentences around it referring to something that
 * is no longer there.
 *
 * V3 assembles instead. Sections are built as a priority-tagged list, then
 * emitted in priority order until the budget is spent. Nothing is generated that
 * cannot be afforded, and nothing is cut mid-sentence, because the unit of
 * inclusion is a whole section.
 *
 *   P0  product identity, camera, lighting, composition
 *   P1  creative direction, format, typography
 *   P2  knowledge explanation, reasoning
 *
 * Budget (V3.1): 20,000 hard, 17,000 soft warning, 14,000-18,000 target. The
 * earlier 16,000 hard limit was wrong — it was squeezing the knowledge tier for
 * headroom the provider never needed, and a commercial poster carries P0 content
 * a product shot does not: an offer, a discount, a headline, a CTA and the rules
 * for placing them.
 *
 * What P0 means here
 * -----------------
 * P0 is emitted before the budget is consulted at all. If P0 alone exceeded the
 * hard limit the result would be reported `OVER_HARD_LIMIT` rather than trimmed,
 * for the same reason as in V2: an oversized prompt is a problem, an oversized
 * prompt missing its product identity is a reprint. In practice P0 runs to about
 * three thousand characters, so this is a guard rather than a live constraint.
 */

export class MasterPromptCompilerV3 {
  public static assemble(input: {
    brief: DirectorBrief;
    understanding: CreativeUnderstanding;
    territory: CreativeTerritoryV2;
    visual: VisualDirection;
    formatPlan: FormatPlan;
    identity: ProductIdentityLockV2;
    /** Compressed knowledge instructions, where any were retrieved. */
    knowledge?: string[];
    /** Phase 4.1.5. Controls the user set or the concept stated. */
    visualControls?: import("./visual-controls.types").ResolvedVisualControls;
    /** Phase 4.1.1. What the concept actually demanded. */
    intent?: CommercialIntent;
    copy?: SynthesizedCopy;
    execution?: ExecutionProfile;
  }): AssembledPrompt {
    const { brief, understanding, territory, visual, formatPlan, identity, intent, copy, execution } = input;
    const visualControls = input.visualControls;
    const sections: AssemblySection[] = [];
    const promotional = Boolean(execution?.promotional);

    // ── P0 ─────────────────────────────────────────────────────────────
    sections.push({
      id: "product_identity",
      priority: "P0",
      heading: "[SUBJECT — PRODUCT IDENTITY]",
      body: identity.lock_statement,
    });

    // Reference relationship. P0, and it was missing from the first version of
    // this assembler — comparing V3's sections against V2's showed V3 had dropped
    // the rules governing how a reference image is to be read. Without them a
    // renderer treats the reference as a canvas to composite rather than as
    // evidence about a physical object, which is the single most damaging thing
    // it can get wrong on a reference-driven brief.
    sections.push({
      id: "reference_relationship",
      priority: "P0",
      heading: "[REFERENCE RELATIONSHIP]",
      body: [
        "Reference images are evidence of PRODUCT IDENTITY. They are not source canvases and not the composition to be reproduced.",
        "Do not composite, trace or preserve reference pixels as a visual layer. Re-render the product from scratch, faithful to the identity the reference evidences.",
        "The reference's own camera angle, crop, background, lighting, exposure, white balance and depth of field are NOT protected identity — they are the previous photographer's choices and are replaced by the direction below.",
        "Where the reference and this direction disagree about how the product is photographed, this direction wins. Where they disagree about what the product IS, the reference wins.",
      ].join("\n"),
    });

    sections.push({
      id: "camera",
      priority: "P0",
      heading: "[CAMERA]",
      body: [
        `Lens: ${visual.camera.lens}`,
        `Angle: ${visual.camera.angle}`,
        `Framing: ${visual.camera.framing}`,
        `Distance: ${visual.camera.distance}`,
      ].join("\n"),
    });

    sections.push({
      id: "lighting",
      priority: "P0",
      heading: "[LIGHTING]",
      body: [
        `Source: ${visual.lighting.source}`,
        `Direction: ${visual.lighting.direction}`,
        `Quality: ${visual.lighting.quality}`,
        `Contrast: ${visual.lighting.contrast}`,
      ].join("\n"),
    });

    sections.push({
      id: "composition",
      priority: "P0",
      heading: "[COMPOSITION]",
      body: [
        promotional
          ? `Promotional composition: ${execution!.composition}`
          : `Hero: ${visual.composition.hero_object}`,
        promotional
          ? `Reading order: ${execution!.hierarchy.join(" → ")}`
          : `Supporting elements: ${visual.composition.supporting_elements}`,
        promotional
          ? `Product role: ${visual.composition.hero_object}`
          : `Negative space: ${visual.composition.negative_space}`,
        promotional
          ? `Text areas: ${execution!.text_zones}`
          : `Text area: ${visual.composition.text_area}`,
        `Safe margin: keep all meaningful content at least ${formatPlan.safe_margin_percent}% in from every edge.`,
      ].join("\n"),
    });

    // Hard constraints are P0 by definition: they are the client speaking.
    if (brief.hard_constraints?.length) {
      sections.push({
        id: "hard_constraints",
        priority: "P0",
        heading: "[CLIENT REQUIREMENTS — EXECUTE EXACTLY]",
        body: brief.hard_constraints.map((c) => `- ${c}`).join("\n"),
      });
    }

    if (brief.copy?.length) {
      sections.push({
        id: "copy",
        priority: "P0",
        heading: "[EXACT COPY — REPRODUCE VERBATIM]",
        body: brief.copy.map((c) => `- "${c}"`).join("\n"),
      });
    }

    // Product preservation under design stress. Adding promotional graphics is
    // exactly the situation in which a renderer starts "improving" a pack to fit
    // the layout, so the lock is restated against that specific pressure.
    if (promotional) {
      sections.push({
        id: "identity_under_stress",
        priority: "P0",
        heading: "[PRODUCT PRESERVATION UNDER PROMOTIONAL DESIGN]",
        body: [
          "Sale text, badges, graphic accents and promotional layout are added AROUND the product. None of them changes the product.",
          "Held fixed while the design is applied: exact shape, exact packaging proportions, exact label placement, exact brand name and its spelling, exact product colour, exact material appearance.",
          "Do not restyle the label to match the promotional palette. Do not recolour the pack to harmonise with the design. Do not simplify, flatten or redraw the packaging so it sits better in the layout. Do not add a promotional sticker, burst or seal onto the product's own surface.",
          "If a promotional element and the product compete for the same space, move the element. The product does not move, resize disproportionately, or change.",
        ].join("\n"),
      });
    }

    sections.push({
      id: "negative_constraints",
      priority: "P0",
      heading: "[NEGATIVE CONSTRAINTS]",
      body: [
        "- No distortion of the product's geometry or proportions.",
        "- No redesign, restyle or improvement of the product, its packaging or its branding.",
        "- No invented label text, logo, certification mark or packaging detail.",
        "- No fabricated product variants and no substituted stand-in for the referenced item.",
        "- No text rendered outside the reserved areas named above.",
      ].join("\n"),
    });

    // ── Commercial execution (Phase 4.1.1) ─────────────────────────────
    // P0. The concept's own requirements — asset type, offer, discount, CTA —
    // were previously read for mood and discarded, so a "sale 50% with CTA"
    // brief produced a clean product shot with none of those words anywhere in
    // the prompt.
    if (intent && (intent.promotional || intent.text_required)) {
      sections.push({
        id: "commercial_intent",
        priority: "P0",
        heading: "[COMMERCIAL INTENT — THIS IS THE JOB]",
        body: [
          `This is a ${formatPlan.format.replace(/_/g, " ")} whose purpose is ${intent.commercial_goal}.`,
          intent.offer_type !== "none" ? `Offer type: ${intent.offer_type}.` : "",
          intent.discount ? `Discount to communicate: ${intent.discount}. Reproduce this figure exactly as written.` : "",
          execution?.first_glance || "",
          "This is a promotional execution, not a product presentation. The product is present as evidence for the offer; it is not the message.",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    // Text rendering enforcement. The old pipeline reserved empty zones and told
    // the renderer "no text is rendered in this pass" — which is why the user
    // asked for a CTA and received a picture with no words in it.
    if (intent?.text_required && copy?.items.length) {
      const lines = copy.items.map((item) => {
        const label =
          item.role === "offer_badge"
            ? "DISCOUNT"
            : item.role === "cta"
              ? "CALL TO ACTION"
              : item.role.toUpperCase();
        return `- ${label}: "${item.text}" — must be rendered, spelled exactly as written, and legible.`;
      });
      sections.push({
        id: "text_rendering",
        priority: "P0",
        heading: "[TEXT RENDERING — REQUIRED, NOT OPTIONAL]",
        body: [
          "This image MUST contain visible, readable, correctly spelled text. An image without this text does not satisfy the brief.",
          ...lines,
          "",
          `Text hierarchy: ${execution?.typography || visual.typography.style}`,
          `Text placement: ${execution?.text_zones || formatPlan.text_zones}`,
          "Every line above is rendered as real typography in the image. Do not leave the reserved areas empty. Do not substitute lorem ipsum, placeholder marks, or decorative shapes standing in for words.",
          "Text sits on a background with enough contrast to be read without an outline or a drop shadow.",
        ].join("\n"),
      });
    }

    // Client visual direction. P0, because a control the user set is the client
    // speaking and outranks everything the director decided.
    //
    // Emitted only when something actually binds. The camera, lighting and
    // composition sections above already carry the resolved values, so this block
    // exists to mark them as client instructions rather than to restate them —
    // and on a fully automatic run it adds nothing at all.
    if (visualControls?.explicit.length) {
      sections.push({
        id: "client_visual_direction",
        priority: "P0",
        heading: "[CLIENT VISUAL DIRECTION — EXECUTE AS SPECIFIED]",
        body: [
          "The following were chosen by the client and are not open to interpretation. Where any other instruction in this prompt implies something different, these win.",
          ...visualControls.explicit
            .filter((c) => c.instruction)
            .map((c) => `- ${c.label}: ${c.instruction}`),
        ].join("\n"),
      });
    }

    // ── P1 ─────────────────────────────────────────────────────────────
    sections.push({
      id: "creative_direction",
      priority: "P1",
      heading: "[CREATIVE DIRECTION]",
      body: [
        `Territory: ${territory.name}`,
        `Idea: ${territory.big_idea}`,
        `Emotional direction: ${territory.emotional_direction}`,
        `Visual metaphor: ${territory.visual_metaphor}`,
        `What the viewer should feel: ${understanding.human_emotion}`,
      ].join("\n"),
    });

    sections.push({
      id: "format",
      priority: "P1",
      heading: "[FORMAT]",
      body: [
        `${formatPlan.format.replace(/_/g, " ")} at ${formatPlan.aspect_ratio}.`,
        `How it is viewed: ${formatPlan.viewing_model}`,
        `Composition requirement: ${formatPlan.composition}`,
        `Reading order: ${formatPlan.hierarchy.join(" → ")}`,
      ].join("\n"),
    });

    sections.push({
      id: "typography",
      priority: "P1",
      heading: "[TYPOGRAPHY]",
      body: [
        `Hierarchy: ${visual.typography.hierarchy}`,
        `Placement: ${visual.typography.placement}`,
        `Style: ${visual.typography.style}`,
      ].join("\n"),
    });

    sections.push({
      id: "colour",
      priority: "P1",
      heading: "[COLOUR]",
      body: `Palette: ${visual.color.palette}\nMood: ${visual.color.mood}`,
    });

    sections.push({
      id: "material_realism",
      priority: "P1",
      heading: "[MATERIAL REALISM]",
      body: [
        "Surfaces respond to the described light physically: speculars where the material is smooth, diffuse falloff where it is not.",
        "Contact shadows where objects meet surfaces. No floating subjects.",
        "Perspective, scale and foreshortening internally consistent across the whole frame.",
      ].join("\n"),
    });

    // ── P2 ─────────────────────────────────────────────────────────────
    if (input.knowledge?.length) {
      sections.push({
        id: "knowledge",
        priority: "P2",
        heading: "[SUPPORTING CRAFT NOTES]",
        body: input.knowledge.map((k) => `- ${k}`).join("\n"),
      });
    }

    sections.push({
      id: "reasoning",
      priority: "P2",
      heading: "[WHY THIS DIRECTION]",
      body: Object.entries(visual.rationale)
        .map(([dimension, why]) => `- ${dimension}: ${why}`)
        .join("\n"),
    });

    return this.emit(sections, brief, formatPlan);
  }

  /**
   * Emits sections in priority order until the budget is spent.
   *
   * A section is whole or absent. There is no partial inclusion, because half a
   * lighting instruction is worse than none — it reads as a complete instruction
   * that happens to be wrong.
   */
  private static emit(
    sections: AssemblySection[],
    brief: DirectorBrief,
    formatPlan: FormatPlan
  ): AssembledPrompt {
    const header = [
      `Commercial ${formatPlan.format.replace(/_/g, " ")} image for ${brief.brand} — ${brief.product}.`,
      `Aspect ratio ${formatPlan.aspect_ratio}. Audience: ${brief.audience}.`,
    ].join("\n");

    const included: string[] = [];
    const omitted: AssembledPrompt["omitted"] = [];
    const parts: string[] = [header];
    let used = header.length;

    for (const tier of ["P0", "P1", "P2"] as const) {
      for (const section of sections.filter((s) => s.priority === tier)) {
        const rendered = `\n\n${section.heading}\n${section.body}`;
        // P0 is emitted unconditionally. Everything else has to fit.
        if (tier !== "P0" && used + rendered.length > V3_BUDGET.hard_limit) {
          omitted.push({ id: section.id, priority: tier, chars: rendered.length });
          continue;
        }
        parts.push(rendered);
        used += rendered.length;
        included.push(section.id);
      }
    }

    const prompt = parts.join("").trim();
    const chars = prompt.length;
    const budget_status: AssembledPrompt["budget_status"] =
      chars > V3_BUDGET.hard_limit
        ? "OVER_HARD_LIMIT"
        : chars > V3_BUDGET.soft_warning
          ? "SOFT_WARNING"
          : chars > V3_BUDGET.target_max
            ? "OVER_TARGET"
            : chars < V3_BUDGET.target_min
              ? "UNDER_TARGET"
              : "IN_TARGET";

    console.log("[MASTER_PROMPT_V3]", {
      chars,
      budget_status,
      included: included.length,
      omitted: omitted.length,
      target: `${V3_BUDGET.target_min}-${V3_BUDGET.target_max}`,
      hard_limit: V3_BUDGET.hard_limit,
    });

    return { prompt, chars, included, omitted, budget_status };
  }
}
