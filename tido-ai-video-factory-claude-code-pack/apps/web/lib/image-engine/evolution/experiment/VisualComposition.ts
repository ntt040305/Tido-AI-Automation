import type { CreativeBlueprint, Decision } from "./CreativeBlueprint";
import type { CreativeDecision } from "./CreativeDecision";
import type { VisualDNA } from "./VisualDNAAnalyzer";

/**
 * The Visual Composition Engine — the frame as a stack, not a collage.
 *
 * Eight layers, ordered back to front. Every layer that appears carries a
 * purpose, a relationship to the product, and a reason for its placement; a
 * layer with nothing to say does not appear at all.
 *
 * What it prevents
 * ----------------
 * The "AI collage" failure is not a rendering fault. It is what a frame looks
 * like when its elements were listed rather than related: a product, a
 * background and some decoration, each described on its own terms, with nothing
 * stating how they sit together. A renderer handed that composes it as separate
 * objects, because separate objects is what it was given.
 *
 * So every layer here names its relationship to the hero. A layer that cannot
 * state one is omitted, which is the whole mechanism for preventing decoration
 * added "because it looks good" — the schema has nowhere to put it.
 *
 * Deterministic, pure, no model call. Every layer is read from a decision the
 * blueprint already carries.
 */

export type LayerName =
  | "background"
  | "atmosphere"
  | "hero_product"
  | "supporting_objects"
  | "graphic_elements"
  | "typography"
  | "cta"
  | "finishing";

/** Back to front. The order a renderer builds the frame in. */
export const LAYER_ORDER: readonly LayerName[] = [
  "background",
  "atmosphere",
  "hero_product",
  "supporting_objects",
  "graphic_elements",
  "typography",
  "cta",
  "finishing",
];

export interface CompositionLayer {
  layer: LayerName;
  /** What occupies this layer. */
  content: string;
  /** What it is for. Never "it looks good". */
  purpose: string;
  /** How it relates to the hero product. The anti-collage field. */
  relationship: string;
  /** Why it sits where it sits. */
  placement_reason: string;
  /** Carried from the decision this layer was read from. */
  derived_from: Decision["derived_from"];
}

export interface VisualComposition {
  layers: CompositionLayer[];
  /** Layers with nothing to say, named rather than silently dropped. */
  omitted: LayerName[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

export interface CompositionInput {
  blueprint?: CreativeBlueprint | null;
  decision?: CreativeDecision | null;
  visualDNA?: VisualDNA | null;
}

/**
 * Builds the layer stack. Pure and total.
 *
 * A layer is emitted only when all four of content, purpose, relationship and
 * placement can be filled from something upstream. Three out of four is not
 * enough: a layer with no stated relationship is exactly the element that makes
 * a frame read as a collage.
 */
export function buildComposition(input: CompositionInput): VisualComposition {
  const b = input.blueprint || null;
  const d = input.decision || null;
  const observed = input.visualDNA?.observed?.product || null;
  const layers: CompositionLayer[] = [];

  const push = (
    layer: LayerName,
    content: string,
    purpose: string,
    relationship: string,
    placement_reason: string,
    derived_from: Decision["derived_from"]
  ) => {
    if (!clean(content) || !clean(purpose) || !clean(relationship) || !clean(placement_reason)) return;
    layers.push({
      layer,
      content: clean(content),
      purpose: clean(purpose),
      relationship: clean(relationship),
      placement_reason: clean(placement_reason),
      derived_from,
    });
  };

  const env = b?.visual_world?.environment_logic || null;
  push(
    "background",
    env?.value || clean(d?.scene_definition),
    "Places the product somewhere real rather than on a backdrop.",
    "The product stands in it, not in front of it.",
    env?.because || "the director's definition of the scene",
    env?.derived_from || "director"
  );

  const atmosphere = b?.visual_world?.atmosphere || null;
  push(
    "atmosphere",
    atmosphere?.value || "",
    "Sets what the frame feels like before anything is read.",
    "It is the light and air the product sits in, and comes from the same source.",
    atmosphere?.because || "",
    atmosphere?.derived_from || "strategy"
  );

  const position = b?.layout?.product_position || null;
  push(
    "hero_product",
    observed
      ? [clean(observed.form), (observed.materials || []).map(clean).filter(Boolean).join(" and ")]
          .filter(Boolean)
          .join(", ")
      : clean(d?.visual_story),
    "The subject. Everything else exists to make it legible.",
    "It is the hero; no other layer may cover its markings.",
    position?.because || "VisualDNA.observed.product — the identifying surface faces the viewer",
    position?.derived_from || "visual_dna",
  );

  // Supporting objects exist only where the director said what they MEAN.
  // An object with no stated meaning is a prop, and props are how collage
  // starts.
  const meanings = (d?.element_meanings || []).map(clean).filter(Boolean);
  const elements = (d?.important_visual_elements || []).map(clean).filter(Boolean);
  push(
    "supporting_objects",
    elements.join("; "),
    meanings.length ? meanings.join("; ") : "",
    "Each earns its place by saying something about the product; nothing is present for decoration.",
    "Placed where they read as part of the same moment as the product.",
    "director"
  );

  const graphic = b?.visual_world?.styling || null;
  push(
    "graphic_elements",
    graphic?.value || "",
    "Carries the brand's own visual language.",
    "Subordinate to the product; never crosses it.",
    graphic?.because || "",
    graphic?.derived_from || "director"
  );

  const hierarchy = b?.design?.hierarchy_logic || null;
  const textArea = b?.layout?.text_area || null;
  push(
    "typography",
    hierarchy?.value || "",
    "Carries the message the picture cannot.",
    "Sits in the frame around the product, never on its label.",
    textArea?.because || hierarchy?.because || "",
    hierarchy?.derived_from || "director"
  );

  const flow = b?.layout?.attention_flow || null;
  push(
    "cta",
    flow?.value || "",
    "Closes the reading path.",
    "Placed at the end of the path the eye already travels.",
    flow?.because || "",
    flow?.derived_from || "director"
  );

  const finishing = b?.photography?.material_rendering || null;
  push(
    "finishing",
    finishing?.value || "",
    "How surfaces resolve — the difference between a render and a photograph.",
    "Applies to the product's own materials, not as an overlay.",
    finishing?.because || "",
    finishing?.derived_from || "visual_dna"
  );

  const present = new Set(layers.map((l) => l.layer));
  return { layers, omitted: LAYER_ORDER.filter((l) => !present.has(l)) };
}

/** Counts and layer names only — never the layer content. */
export function compositionTelemetry(c: VisualComposition | null | undefined) {
  if (!c) return { composition: false };
  return {
    composition: true,
    layers: c.layers.length,
    of: LAYER_ORDER.length,
    present: c.layers.map((l) => l.layer),
    omitted: c.omitted,
  };
}

/** The stack as the prompt carries it, back to front. */
export function renderComposition(c: VisualComposition | null | undefined): string | undefined {
  if (!c?.layers.length) return undefined;
  return [
    "COMPOSITION — build the frame in this order, back to front. Each layer states what it is for and how it relates to the product.",
    ...c.layers.map(
      (l) => `- ${l.layer.replace(/_/g, " ")}: ${l.content}\n    purpose: ${l.purpose}\n    relationship: ${l.relationship}`
    ),
  ].join("\n");
}
