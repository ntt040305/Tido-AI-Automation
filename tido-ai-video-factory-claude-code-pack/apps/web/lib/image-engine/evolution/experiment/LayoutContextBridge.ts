import type { CreativeJudgment } from "./CreativeDirectorV1";
import type { AssetContext } from "./AssetContext";

/**
 * What the layout engine was never told.
 *
 * Phase 5.0 measured `CommercialLayoutService.plan()` against twelve briefs and
 * found the reasoning it produces is good and almost completely unresponsive.
 * One poster answer for five unrelated products. One identical plan for one,
 * two, three and four products. "Build trust" and "create desire" resolving to
 * the same four numbers, to the digit.
 *
 * The cause is not a weak heuristic. `plan()` accepts an asset type, an aspect
 * ratio, a copy list, a logo flag and an objective string, and that is the whole
 * of what it can see. It cannot vary with the product count because it is never
 * given one. It cannot know that three bottles are a range rather than three
 * separate subjects, because nothing in its signature can say so.
 *
 * Meanwhile the Creative Decision Layer has been deciding exactly those things
 * since Phase B and writing them into a section of the prompt that the compiled
 * prompt itself declares subordinate to COMMERCIAL LAYOUT.
 *
 * This bridge carries what was already decided to where layout is described. It
 * decides nothing. Every sentence it emits is a quotation of a decision made
 * somewhere else, and the only judgement in this file is which of those
 * decisions bear on composition.
 *
 * What it is not
 * --------------
 * Not Layout Intelligence. It produces no geometry, no zones, no placement, no
 * hierarchy of its own. It has no schema for a layout and no opinion about one.
 * If the director said nothing about a subject, the bridge says nothing about
 * it — an empty section is the correct output for an empty input, and inventing
 * a plausible filler would be the template problem arriving through the one
 * door this phase was supposed to keep shut.
 */

export interface LayoutContextInput {
  judgment: CreativeJudgment | null;
  /** Distinct products attached, from the pipeline, which is where it is known. */
  productCount: number;
  assetIntent?: AssetContext | null;
}

export interface LayoutContext {
  /** How many products, and what they are to each other. Quoted, never classified. */
  product_structure: string[];
  /** Why this image exists, in the words the strategy layer used. */
  creative_purpose: string[];
  /** Who is looking and what is happening in their head. */
  viewer_state: string[];
  /** Counts only, for telemetry. */
  evidence: {
    product_count: number;
    has_relationship: boolean;
    has_strategy: boolean;
    has_consumer: boolean;
    has_brand: boolean;
    sections: number;
  };
}

const clean = (s?: string): string => String(s || "").replace(/\s+/g, " ").trim();

/**
 * Reads the decisions that bear on composition out of a judgment.
 *
 * Pure, synchronous, no model, no I/O. Returns null when there is nothing to
 * carry, so an absent bridge and a silent bridge are the same thing downstream.
 */
export function buildLayoutContext(input: LayoutContextInput): LayoutContext | null {
  const j = input.judgment;
  const count = Math.max(0, Math.floor(input.productCount || 0));

  const product_structure: string[] = [];
  const creative_purpose: string[] = [];
  const viewer_state: string[] = [];

  // ── product structure ─────────────────────────────────────────────────────
  //
  // The count is a fact the pipeline owns. The relationship is the director's,
  // in the director's own words — `relationship_type` is free text precisely so
  // that no fixed vocabulary of collection / comparison / bundle can grow here.
  // Nothing in this block maps it onto categories, because the moment it did,
  // the category list would be the rule and the reasoning would be decoration.
  if (count > 0) {
    product_structure.push(
      count === 1
        ? "One product. There is no relationship between products to establish here, and none should be implied."
        : `${count} distinct products share this frame.`
    );
  }

  const staging = j?.staging;
  const rel = staging?.relationship;
  if (rel) {
    if (clean(rel.relationship_type)) {
      product_structure.push(`WHAT THEY ARE TO EACH OTHER: ${clean(rel.relationship_type)}`);
    }
    if (clean(rel.strategic_reason)) {
      product_structure.push(`WHY THESE ARE TOGETHER: ${clean(rel.strategic_reason)}`);
    }
    if (clean(rel.visual_implication)) {
      product_structure.push(`WHICH MEANS THE COMPOSITION MUST SHOW: ${clean(rel.visual_implication)}`);
    }
    if (clean(rel.hierarchy_implication)) {
      product_structure.push(`WHICH LEADS: ${clean(rel.hierarchy_implication)}`);
    }
  }
  if (staging) {
    if (clean(staging.grouping)) product_structure.push(`HOW THE GROUP READS: ${clean(staging.grouping)}`);
    if (clean(staging.depth_order)) product_structure.push(`DEPTH: ${clean(staging.depth_order)}`);
  }
  if (count >= 2 && !rel) {
    // Said plainly rather than papered over. A multi-product frame with no
    // relationship decided is a real gap, and the renderer arranging them
    // independently is what that gap looks like in the output.
    product_structure.push(
      "No relationship between these products has been decided. Treat them as one group sharing one scene rather than as separate subjects placed side by side."
    );
  }

  // ── creative purpose ──────────────────────────────────────────────────────
  const st = j?.strategy;
  if (st?.selected) {
    creative_purpose.push(`THE ROUTE THIS IMAGE TAKES: ${clean(st.selected)}`);
    if (clean(st.selection_reason)) {
      creative_purpose.push(`WHY THAT ROUTE FOR THIS BRIEF: ${clean(st.selection_reason)}`);
    }
  } else if (j?.selected) {
    creative_purpose.push(`THE DIRECTION THIS IMAGE TAKES: ${clean(j.selected)}`);
    if (clean(j.selection_reason)) {
      creative_purpose.push(`WHY: ${clean(j.selection_reason)}`);
    }
  }
  if (clean(j?.brand?.emotional_territory)) {
    creative_purpose.push(`EMOTIONAL TERRITORY THIS BRAND CAN CREDIBLY OWN: ${clean(j!.brand!.emotional_territory)}`);
  }
  if (clean(j?.consumer?.intended_action)) {
    creative_purpose.push(`WHAT THE VIEWER SHOULD DO NEXT: ${clean(j!.consumer!.intended_action)}`);
  }

  // ── viewer state ──────────────────────────────────────────────────────────
  const c = j?.consumer;
  if (clean(c?.viewer)) viewer_state.push(`WHO IS LOOKING: ${clean(c!.viewer)}`);
  if (clean(c?.first_feeling)) viewer_state.push(`WHAT THEY FEEL FIRST: ${clean(c!.first_feeling)}`);
  if (clean(c?.trust_driver)) viewer_state.push(`WHAT EARNS THEIR TRUST: ${clean(c!.trust_driver)}`);
  if (clean(c?.desire_driver)) viewer_state.push(`WHAT CREATES WANTING: ${clean(c!.desire_driver)}`);
  if (c?.attention?.first_second) {
    viewer_state.push(
      `THE FIRST SECOND: ${clean(c.attention.first_second)}` +
        (clean(c.attention.then) ? ` THEN: ${clean(c.attention.then)}` : "")
    );
  }
  // The format's own account of how it is encountered. Already computed by
  // AssetIntent, never seen by anything that describes layout.
  if (clean(input.assetIntent?.viewer_behavior)) {
    viewer_state.push(`HOW THIS FORMAT IS ENCOUNTERED: ${clean(input.assetIntent!.viewer_behavior)}`);
  }

  const sections = [product_structure, creative_purpose, viewer_state].filter((s) => s.length).length;
  if (!sections) return null;

  return {
    product_structure,
    creative_purpose,
    viewer_state,
    evidence: {
      product_count: count,
      has_relationship: Boolean(rel),
      has_strategy: Boolean(st?.selected),
      has_consumer: Boolean(c),
      has_brand: Boolean(j?.brand?.emotional_territory),
      sections,
    },
  };
}

/** Hard cap, so a talkative director cannot quietly double the prompt. */
const CONTEXT_BUDGET = 1600;

/**
 * The block as it reaches the prompt, or an empty string.
 *
 * Its last line is the important one. Everything above it is context a renderer
 * should reason from, and without that line a paragraph sitting next to
 * COMMERCIAL LAYOUT reads as a second, competing layout authority — which is
 * the exact failure this phase exists downstream of.
 */
export function renderLayoutContext(ctx: LayoutContext | null): string {
  if (!ctx) return "";
  const lines: string[] = ["## LAYOUT CONTEXT"];

  if (ctx.product_structure.length) lines.push("", "PRODUCT STRUCTURE", ...ctx.product_structure);
  if (ctx.creative_purpose.length) lines.push("", "CREATIVE PURPOSE", ...ctx.creative_purpose);
  if (ctx.viewer_state.length) lines.push("", "VIEWER STATE", ...ctx.viewer_state);

  lines.push(
    "",
    "This section is context, not geometry. The COMMERCIAL LAYOUT section above remains responsible for zones, safe margins and reserved space, and where the two appear to disagree about where something goes, COMMERCIAL LAYOUT is correct. What this section adds is why the image exists and what the products are to each other, so the composition is built from that rather than from the format alone."
  );

  let out = lines.join("\n");
  if (out.length > CONTEXT_BUDGET) {
    // Trimmed from the end, which drops viewer state before product structure.
    // Deliberate: the count and the relationship are facts nothing else in the
    // prompt carries, while the viewer is described in the strategy section too.
    out = `${out.slice(0, CONTEXT_BUDGET).replace(/\s+\S*$/, "")}…`;
  }
  return out;
}

/** Counts only. No brief text, no product names, no viewer description. */
export function layoutContextTelemetry(ctx: LayoutContext | null, chars: number) {
  if (!ctx) return { applied: false };
  return {
    applied: true,
    ...ctx.evidence,
    product_structure_lines: ctx.product_structure.length,
    creative_purpose_lines: ctx.creative_purpose.length,
    viewer_state_lines: ctx.viewer_state.length,
    context_chars: chars,
  };
}
