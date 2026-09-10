import { ResolvedVisualControls } from "./visual-controls.types";
import {
  CreativeTerritoryV2,
  CreativeUnderstanding,
  DirectorBrief,
  FormatPlan,
  VisualDirection,
} from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 3 — the layer that actually decides.
 *
 * The gap this fills
 * -----------------
 * `ArtDirectionResolverService` arbitrates between candidates from five tiers
 * and picks a winner per dimension. It is good at that. But a brief with no
 * reference image and no explicit camera instruction supplies no candidate above
 * ASSET_DEFAULT, so every such brief resolves to the same asset-type fallback.
 * Nothing in the system was choosing a lens; it was choosing between choices
 * nobody had made, and when nobody had made any it took the default. That is the
 * mechanical reason a strong architecture produces generic pictures.
 *
 * So this engine derives a full visual specification — lens, angle, framing,
 * distance, light source, direction, quality, contrast, hero, supporting
 * elements, negative space, text area, palette, mood, type hierarchy, placement
 * and style — from two things it actually has: the creative territory, and the
 * format the image has to live in.
 *
 * How the two inputs divide the work
 * ---------------------------------
 * The format sets the constraints that are not negotiable — a thumbnail is 120
 * pixels wide whatever the idea is. The territory sets the intent within them —
 * the same thumbnail can be lit to look appetising or to look austere. Where
 * they conflict, the format wins, because a beautiful image that does not
 * function in its slot is not a solution to the brief.
 *
 * Yielding to the client
 * ---------------------
 * Every decision here is a *proposal*. `asCandidates()` emits them at STRATEGY
 * tier, which the existing resolver ranks below USER and REFERENCE. An explicit
 * client instruction still wins, exactly as it did before this engine existed.
 * A system that decides for you is only an improvement while it still yields to
 * you.
 */

/** Light that suits an emotional register. */
const LIGHT_BY_EMOTION: { match: RegExp; source: string; quality: string; contrast: string }[] = [
  {
    match: /appetite|taste|fresh|hunger/i,
    source: "a single large window-like source, close to the subject",
    quality: "soft-edged but directional, so surfaces keep their texture instead of flattening",
    contrast: "medium-high — the shadow side stays readable but the form is unmistakable",
  },
  {
    match: /admiration|craft|properly|premium|quiet/i,
    source: "one restrained key with a black negative fill opposite",
    quality: "controlled and slightly hard, with speculars allowed to stay bright",
    contrast: "high — deep shadow that reads as intent rather than as underexposure",
  },
  {
    match: /relief|looked after|care|gentle|safe/i,
    source: "broad ambient bounce with no identifiable source",
    quality: "very soft, shadowless, even across the frame",
    contrast: "low — nothing in the frame is harsh",
  },
  {
    match: /belonging|together|share|group/i,
    source: "warm practical light apparently coming from within the scene",
    quality: "soft and enveloping, with visible falloff into the room",
    contrast: "medium — warmth in the highlights, cool ambient in the shadows",
  },
  {
    match: /recognition|already live|confidence|borrowed/i,
    source: "available light, unmodified and slightly imperfect",
    quality: "naturalistic, direction visible, small blown highlights permitted",
    contrast: "medium-high with a real sense of a specific time of day",
  },
];

/** Palette that suits an emotional register. */
const PALETTE_BY_EMOTION: { match: RegExp; palette: string; mood: string }[] = [
  { match: /appetite|taste|fresh|hunger/i, palette: "saturated food-native colour against a desaturated neutral ground, one accent only", mood: "immediate and physical" },
  { match: /admiration|craft|premium|quiet/i, palette: "a narrow range of deep neutrals with a single metallic or material accent", mood: "restrained and expensive" },
  { match: /relief|care|gentle|safe/i, palette: "high-key pale neutrals, low saturation throughout, no hard blacks", mood: "calm and unpressured" },
  { match: /belonging|together|share/i, palette: "warm mid-tones with amber highlights and cool blue shadow", mood: "inhabited and generous" },
  { match: /recognition|confidence|jolt|unfamiliar/i, palette: "one high-chroma colour carrying the frame against near-monochrome", mood: "graphic and deliberate" },
];

export class VisualDirectorEngine {
  public static direct(
    brief: DirectorBrief,
    understanding: CreativeUnderstanding,
    territory: CreativeTerritoryV2,
    formatPlan: FormatPlan,
    /** Phase 4.1.5. Binding controls replace the decision rather than colour it. */
    controls?: ResolvedVisualControls
  ): VisualDirection {
    const rationale: Record<string, string> = {};
    const emotion = `${understanding.human_emotion} ${territory.emotional_direction}`;

    // ── Camera ─────────────────────────────────────────────────────────
    // Format sets lens and angle; the territory decides distance and framing,
    // because how close you stand is an editorial choice and how wide you shoot
    // is a functional one.
    const lens = this.extract(formatPlan.camera, /(\d+[-–]\d+mm equivalent|\d+mm equivalent)/i) || "50mm equivalent";
    const angle = this.extract(formatPlan.camera, /^[^.]*?(below eye level|eye level|dead level|straight-on|slightly high|slightly low|level or slightly above)/i) || "eye level";
    const closeIn = /surface|texture|detail|close|proof|examine/i.test(territory.visual_metaphor);
    const framing = closeIn
      ? "tight on the subject, cropping into it so the frame cannot be read as a catalogue shot"
      : "the subject whole, with deliberate air around it so its shape is the first thing read";
    const distance = closeIn
      ? "close enough that surface detail is the primary information"
      : "far enough that the subject's relationship to its setting is legible";
    rationale.camera = `${formatPlan.format} fixes the lens and angle; the territory "${territory.name}" asks for ${closeIn ? "proximity" : "context"}.`;

    // ── Lighting ───────────────────────────────────────────────────────
    const light = LIGHT_BY_EMOTION.find((l) => l.match.test(emotion)) || LIGHT_BY_EMOTION[0];
    const direction = closeIn
      ? "raking across the subject from one side, near-perpendicular to the camera, so texture is described by shadow"
      : "three-quarter front from camera left, high enough to model the form without flattening it";
    rationale.lighting = `Light chosen for "${understanding.human_emotion}"; direction set by the ${closeIn ? "need to describe surface" : "need to model whole form"}.`;

    // ── Composition ────────────────────────────────────────────────────
    const hero = `${brief.product}, unmistakably the subject and never sharing emphasis with anything else in frame`;
    const supporting = this.supportingFor(territory, brief);
    rationale.composition = `Hero and negative space taken from the ${formatPlan.format} plan; supporting elements from the territory's story world.`;

    // ── Colour ─────────────────────────────────────────────────────────
    const colour = PALETTE_BY_EMOTION.find((p) => p.match.test(emotion)) || PALETTE_BY_EMOTION[0];
    rationale.color = `Palette follows the emotional direction "${territory.emotional_direction}".`;

    // ── Typography ─────────────────────────────────────────────────────
    const hasCopy = (brief.copy || []).length > 0;
    const typography = {
      hierarchy: hasCopy
        ? formatPlan.hierarchy.join(" → ")
        : "no rendered type in this pass; the hierarchy is carried by scale and contrast alone",
      placement: formatPlan.text_zones,
      style: formatPlan.typography,
    };
    rationale.typography = hasCopy
      ? `Hierarchy and placement come from the ${formatPlan.format} plan, which is the only authority on where type can sit.`
      : `No authorized copy was supplied, so no type is rendered and the reserved areas stay empty.`;

    const direction_out: VisualDirection = {
      camera: { lens, angle, framing, distance },
      lighting: {
        source: light.source,
        direction,
        quality: light.quality,
        contrast: light.contrast,
      },
      composition: {
        hero_object: hero,
        supporting_elements: supporting,
        negative_space: formatPlan.text_zones,
        text_area: hasCopy ? formatPlan.text_zones : "reserved and left empty — no text is rendered in this pass",
      },
      color: { palette: colour.palette, mood: colour.mood },
      typography,
      rationale,
      territory: territory.name,
    };

    return controls ? this.applyControls(direction_out, controls) : direction_out;
  }

  /**
   * A binding control replaces the corresponding decision.
   *
   * Replaces, not blends. If the user asked for a low angle the angle is low —
   * the director does not get to average its own preference into it. Only
   * `user_selected` and `concept_detected` bind; a reference read or the
   * director's own decision is already what produced the fields above.
   *
   * The overrides are written into the existing camera, lighting, composition,
   * colour and typography fields rather than emitted as a separate block. That
   * keeps one authority per dimension in the prompt — two blocks each naming a
   * camera angle is how a renderer ends up splitting the difference — and it
   * costs no extra characters, which this phase requires.
   */
  private static applyControls(direction: VisualDirection, resolved: ResolvedVisualControls): VisualDirection {
    const out: VisualDirection = {
      ...direction,
      camera: { ...direction.camera },
      lighting: { ...direction.lighting },
      composition: { ...direction.composition },
      color: { ...direction.color },
      typography: { ...direction.typography },
      rationale: { ...direction.rationale },
    };

    for (const control of resolved.explicit) {
      if (!control.instruction) continue;
      const why = `${control.reason} (${control.source})`;
      switch (control.key) {
        case "camera":
          out.camera.angle = control.instruction;
          out.rationale.camera = why;
          break;
        case "lens":
          out.camera.lens = control.instruction;
          out.rationale.lens = why;
          break;
        case "lighting":
          out.lighting.source = control.instruction;
          out.rationale.lighting = why;
          break;
        case "composition":
          out.composition.supporting_elements = control.instruction;
          out.rationale.composition = why;
          break;
        case "typography":
          out.typography.style = control.instruction;
          out.rationale.typography = why;
          // "Không có chữ" is a hard instruction, not a style preference.
          if (control.option === "none") {
            out.typography.hierarchy = "no rendered type at all";
            out.composition.text_area = "no text anywhere in the frame";
          }
          break;
        case "color_mood":
          out.color.palette = control.instruction;
          out.rationale.color = why;
          break;
      }
    }
    return out;
  }

  /**
   * The director's decisions as art-direction candidates.
   *
   * This is the integration seam. Emitted at STRATEGY tier so the existing
   * resolver ranks them below USER and REFERENCE — a client who asked for a
   * low angle still gets a low angle. Confidence is deliberately below a
   * reference read: a derived decision is a good default, not evidence.
   */
  public static asCandidates(
    visual: VisualDirection
  ): { dimension: string; value: string; source: "STRATEGY"; confidence: number }[] {
    return [
      {
        dimension: "camera",
        value: `${visual.camera.angle}, ${visual.camera.lens}; ${visual.camera.framing}; ${visual.camera.distance}`,
        source: "STRATEGY" as const,
        confidence: 0.7,
      },
      {
        dimension: "lighting",
        value: `${visual.lighting.source}, ${visual.lighting.direction}. ${visual.lighting.quality}. Contrast: ${visual.lighting.contrast}`,
        source: "STRATEGY" as const,
        confidence: 0.7,
      },
      {
        dimension: "composition",
        value: `Hero: ${visual.composition.hero_object}. Supporting: ${visual.composition.supporting_elements}. Negative space: ${visual.composition.negative_space}`,
        source: "STRATEGY" as const,
        confidence: 0.7,
      },
      {
        dimension: "colour",
        value: `${visual.color.palette}. Mood: ${visual.color.mood}`,
        source: "STRATEGY" as const,
        confidence: 0.65,
      },
      {
        dimension: "typography",
        value: `${visual.typography.hierarchy}. ${visual.typography.placement}. ${visual.typography.style}`,
        source: "STRATEGY" as const,
        confidence: 0.65,
      },
    ];
  }

  private static supportingFor(territory: CreativeTerritoryV2, brief: DirectorBrief): string {
    if (/hand|process|making|maker/i.test(territory.visual_metaphor)) {
      return "the evidence of the making — hands, tools or residue — present but never sharper than the product";
    }
    if (/room|table|afterwards|consequence/i.test(territory.visual_metaphor)) {
      return "the setting reduced to two or three objects that establish where this is, nothing more";
    }
    if (/surface|texture|detail|proof/i.test(territory.visual_metaphor)) {
      return "nothing else in frame; at this distance any second object is a distraction";
    }
    return `a minimal setting that reads as ${brief.category} without describing it in detail`;
  }

  private static extract(text: string, pattern: RegExp): string {
    const m = String(text || "").match(pattern);
    return m ? (m[1] || m[0]).trim() : "";
  }
}
