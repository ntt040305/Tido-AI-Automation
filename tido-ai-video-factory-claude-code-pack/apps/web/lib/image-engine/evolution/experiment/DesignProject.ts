import type { VisualComposition, LayerName } from "./VisualComposition";
import { LAYER_ORDER } from "./VisualComposition";
import type { CreativeBlueprint } from "./CreativeBlueprint";

/**
 * The editable design project — architecture only, and honest about it.
 *
 * What this does NOT do
 * ---------------------
 * It does not make a PNG editable. `ImgStudioImageGenerationProvider` returns
 * one flat raster and no channel for layers; nothing in this repository can
 * separate a rendered image back into background, product and type. Presenting
 * a project whose "layers" are all the same flat image would be a lie that
 * survives a demo and fails the first time somebody tries to move the headline.
 *
 * So `raster_is_flat` is on every project this pipeline can currently produce,
 * and `editable` is false on every element whose geometry came from the
 * renderer rather than from a decision.
 *
 * What it DOES do
 * ---------------
 * It records the structure the system genuinely knows: which layers were
 * DECIDED, what each was for, and which of them carry values a person could
 * legitimately change without re-rendering — text content, and the copy roles
 * that set reading order. That is a real project file for the decisions, and it
 * is what a layered renderer would need on the day one exists.
 *
 * Export targets are declared, not implemented. `photoshop`, `canva` and `svg`
 * describe where this structure could go; nothing here writes those formats,
 * and `exportable` says so.
 */

export type ElementKind = "background" | "product" | "shadow" | "effect" | "text" | "graphic";

export interface ProjectElement {
  id: string;
  kind: ElementKind;
  /** The decision this element came from, so a reader can trace it. */
  from_layer: LayerName;
  content: string;
  /** Why it exists, carried from the composition. */
  purpose: string;
  /**
   * Whether a person could change this without a re-render.
   *
   * True only for values the system decided and the renderer did not invent.
   * Text content qualifies; the pixels that text was rendered into do not.
   */
  editable: boolean;
  /** What specifically could be changed. Empty when `editable` is false. */
  editable_properties: ("text" | "position" | "scale" | "color" | "asset")[];
}

export interface DesignProject {
  elements: ProjectElement[];
  /**
   * True whenever the output is a single flat raster.
   *
   * Currently always true. It is a field rather than a constant because the day
   * a layered provider exists, exactly one thing should have to change.
   */
  raster_is_flat: boolean;
  /** Formats this structure could be written to. None are implemented. */
  export_targets: { format: "photoshop" | "canva" | "svg"; exportable: boolean; blocked_by: string }[];
  /** Share of elements a person could actually edit today. */
  editable_share: number;
}

const BLOCKED = "the image provider returns one flat raster; no layer data exists to write";

/** Which composition layers map to which project element kinds. */
const KIND_OF: Record<LayerName, ElementKind> = {
  background: "background",
  atmosphere: "effect",
  hero_product: "product",
  supporting_objects: "graphic",
  graphic_elements: "graphic",
  typography: "text",
  cta: "text",
  finishing: "effect",
};

/**
 * Builds the project structure from a composition. Pure and total.
 *
 * Nothing is fabricated: an element exists only where the composition decided a
 * layer, so a project mirrors what was actually reasoned about.
 */
export function buildDesignProject(
  composition: VisualComposition | null | undefined,
  blueprint?: CreativeBlueprint | null
): DesignProject {
  const elements: ProjectElement[] = [];

  for (const layer of composition?.layers || []) {
    const kind = KIND_OF[layer.layer];
    // Text is the one thing a person can change without re-rendering, because
    // the system holds the strings and their roles rather than only their
    // pixels. Everything else is geometry the renderer chose.
    const isText = kind === "text";
    elements.push({
      id: `${layer.layer}`,
      kind,
      from_layer: layer.layer,
      content: layer.content,
      purpose: layer.purpose,
      editable: isText,
      editable_properties: isText ? ["text"] : [],
    });
  }

  // The copy hierarchy is editable independently of the render: changing the
  // reading order changes a decision, not a pixel.
  if (blueprint?.design?.hierarchy_logic) {
    elements.push({
      id: "copy_hierarchy",
      kind: "text",
      from_layer: "typography",
      content: blueprint.design.hierarchy_logic.value,
      purpose: "The reading order the design was built around.",
      editable: true,
      editable_properties: ["text"],
    });
  }

  const editable = elements.filter((e) => e.editable).length;
  return {
    elements,
    raster_is_flat: true,
    export_targets: [
      { format: "photoshop", exportable: false, blocked_by: BLOCKED },
      { format: "canva", exportable: false, blocked_by: BLOCKED },
      { format: "svg", exportable: false, blocked_by: BLOCKED },
    ],
    editable_share: elements.length ? Math.round((editable / elements.length) * 100) / 100 : 0,
  };
}

/** Counts only. Reports the honest editability, never a flattering one. */
export function projectTelemetry(p: DesignProject | null | undefined) {
  if (!p) return { design_project: false };
  return {
    design_project: true,
    elements: p.elements.length,
    layers_possible: LAYER_ORDER.length,
    editable_elements: p.elements.filter((e) => e.editable).length,
    editable_share: p.editable_share,
    raster_is_flat: p.raster_is_flat,
    exportable_formats: p.export_targets.filter((t) => t.exportable).map((t) => t.format),
  };
}
