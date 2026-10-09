/**
 * How a material behaves under light, and what that means for the lamp and the lens.
 *
 * WHY THIS IS NOT AN INDUSTRY LOCK
 * --------------------------------
 * It would be very easy to mistake this file for the thing the whole design forbids: a
 * table of creative constants. The difference is what the key is.
 *
 * A forbidden rule is keyed on what a product IS FOR — `coffee_tea` gets warm light,
 * `electronics_tech` gets a hard rim. That is a guess dressed as knowledge, and it is
 * wrong the moment a coffee brand wants a cold, clinical frame.
 *
 * These rules are keyed on what a surface DOES TO PHOTONS, which a vision pass OBSERVED in
 * the client's own photograph. Glass transmits, so it needs light coming through it or it
 * reads as grey plastic. A matte surface scatters, so a frontal light flattens it and a
 * raking light describes it. Those are facts about the material, identical for a perfume
 * bottle and a jar of sauce, and they do not change when the industry dropdown changes.
 *
 * The test suite proves the distinction behaviourally: swapping the industry id leaves
 * every one of these outputs identical, while swapping the observed material changes them.
 *
 * NOTHING HERE FIRES WITHOUT AN OBSERVATION
 * -----------------------------------------
 * Every function takes materials that came from `product-vision.ts`. With no vision pass
 * there are no materials, every function returns null, and the sheet keeps the neutral
 * defaults it has today. The rules cannot act on a guess because they are never given one.
 *
 * Pure. No I/O, no clock, no model call.
 */
import type { ProductVisionItem } from "./product-vision";
import type { CameraHeight, KeyDirection } from "./words";

/**
 * The families a surface can belong to, by optical behaviour.
 *
 * Five, because five is how many distinct lighting answers there are. A sixth family that
 * wanted the same lamp as one of these would be a distinction with no consequence.
 */
export type OpticalFamily = "transmissive" | "specular" | "metallic" | "scattering" | "mixed";

/**
 * Words that identify each family, matched against what the vision pass SAW.
 *
 * Matched as substrings of the observed material text, because the vision pass is
 * free-form on purpose: "frosted glass" and "clear plastic lid" are both more useful than
 * any enum would have been, and both are recognisable here.
 */
const FAMILY_WORDS: Record<Exclude<OpticalFamily, "mixed">, string[]> = {
  // Light goes THROUGH it. Lit from the front it reads as grey plastic.
  transmissive: ["glass", "transparent", "clear", "liquid", "water", "ice", "juice", "oil", "acrylic", "perspex", "translucent"],
  // Light BOUNCES in a mirror-like way off a non-metal. Hot spots are the failure.
  specular: ["gloss", "glossy", "polished", "lacquer", "varnish", "enamel", "plastic", "vinyl", "ceramic", "porcelain", "glazed", "foil", "cellophane"],
  // Reflects the whole environment, tinted. Needs something worth reflecting.
  metallic: ["metal", "metallic", "steel", "aluminium", "aluminum", "brass", "copper", "chrome", "tin", "silver", "gold leaf", "anodised"],
  // Light SCATTERS. A frontal light flattens it; a raking light shows the texture.
  scattering: ["matte", "matt", "paper", "card", "cardboard", "kraft", "fabric", "cotton", "linen", "canvas", "felt", "leather", "suede", "wood", "unglazed", "stone", "concrete", "powder", "foam"],
};

const lower = (v: unknown): string => String(v ?? "").toLowerCase();

/** Which family a single observed material string belongs to, or null. */
export function familyOf(material: string): Exclude<OpticalFamily, "mixed"> | null {
  const text = lower(material);
  if (!text) return null;
  // Order matters where words overlap. "frosted glass" is transmissive before it is
  // anything else, and "glazed ceramic" is specular before "ceramic" is scattering.
  for (const family of ["transmissive", "metallic", "specular", "scattering"] as const) {
    if (FAMILY_WORDS[family].some((word) => text.includes(word))) return family;
  }
  return null;
}

export interface MaterialReading {
  /** The family of the material with the largest visible area. */
  dominant: Exclude<OpticalFamily, "mixed">;
  /** The next distinct family present, when there is one. */
  secondary?: Exclude<OpticalFamily, "mixed">;
  /** The observed words that produced the reading, for the sheet's record. */
  observed: string[];
}

/**
 * The dominant family and, when the product is mixed, the secondary.
 *
 * Dominant by VISIBLE AREA, which is why the vision prompt asks for materials "most
 * dominant first, by visible area": a glass cup with a plastic lid is lit for the glass,
 * and the lid gets a fill rule rather than half the lighting plan.
 */
export function readMaterials(materials: string[] | null | undefined): MaterialReading | null {
  const families: Array<Exclude<OpticalFamily, "mixed">> = [];
  const observed: string[] = [];
  for (const material of materials || []) {
    const family = familyOf(material);
    if (!family) continue;
    observed.push(String(material));
    if (!families.includes(family)) families.push(family);
  }
  if (!families.length) return null;
  return {
    dominant: families[0],
    ...(families[1] ? { secondary: families[1] } : {}),
    observed,
  };
}

/**
 * The lighting plan a family needs, in the sheet's own vocabulary.
 *
 * `key` and `rim` feed the existing lighting fields; `note` is the sentence that reaches
 * the brief. Every one of these is the same answer whatever the product is for.
 */
export interface LightingPhysics {
  key: KeyDirection;
  rim: boolean;
  /** Key-to-fill ratio. Lower is flatter. */
  fill_ratio: number;
  note: string;
}

const LIGHTING: Record<Exclude<OpticalFamily, "mixed">, LightingPhysics> = {
  transmissive: {
    // From behind, so the light travels through the body of the product.
    key: "back_left",
    rim: true,
    fill_ratio: 2,
    note:
      "the product is transparent, so the main light comes from behind and slightly above it and travels " +
      "THROUGH the body — the liquid glows rather than being lit from the front — with a thin bright rim " +
      "down one edge to describe the shape and a soft fill from the front to keep the near face readable",
  },
  specular: {
    key: "front_left",
    rim: false,
    fill_ratio: 2,
    note:
      "the surface is glossy, so the light is one large soft source read as a smooth gradient across the " +
      "form rather than as a small bright spot; no hard hot spot anywhere, and no second specular " +
      "highlight competing with the first",
  },
  metallic: {
    key: "side_left",
    rim: true,
    fill_ratio: 3,
    note:
      "the surface is metal, so it reflects whatever is in front of it: light it with long controlled " +
      "strip reflections running the length of the form, keep the reflected field clean and simple, and " +
      "let the dark gaps between strips describe the edges",
  },
  scattering: {
    // Raking, so the texture casts its own micro-shadows.
    key: "side_right",
    rim: false,
    fill_ratio: 4,
    note:
      "the surface is matte and takes texture, so the light rakes across it from one side at a shallow " +
      "angle and the grain, weave or tooth casts its own tiny shadows; a frontal light would flatten it " +
      "into paper",
  },
};

/** The secondary material's fill rule, when the product is mixed. One sentence. */
const SECONDARY_FILL: Record<Exclude<OpticalFamily, "mixed">, string> = {
  transmissive: "where a transparent part meets the rest, let a little light pass through it so it does not read as grey",
  specular: "the glossy secondary part takes one soft gradient highlight and no hot spot",
  metallic: "the metal secondary part takes a single clean strip reflection, not a scatter of bright points",
  scattering: "the matte secondary part keeps its texture under the same raking light, slightly darker than the hero surface",
};

export function lightingFor(reading: MaterialReading | null): (LightingPhysics & { secondary_note?: string }) | null {
  if (!reading) return null;
  const base = LIGHTING[reading.dominant];
  return {
    ...base,
    ...(reading.secondary ? { secondary_note: SECONDARY_FILL[reading.secondary] } : {}),
  };
}

/**
 * How the real-world size of a thing changes the lens and the camera height.
 *
 * Small objects need a longer lens: at a wide angle you have to get close enough that the
 * near edge stretches. Large or contextual objects need a wider one, or the setting that
 * gives them their scale falls outside the frame. This is geometry, not taste.
 *
 * Returns a DELTA in millimetres applied to the count-derived default, so the existing
 * "more products means a shorter lens" rule still holds and this only nudges it.
 */
export interface SizePhysics {
  lens_delta_mm: number;
  height?: CameraHeight;
  note: string;
}

export function sizeFor(sizeClass: string | null | undefined): SizePhysics | null {
  const text = lower(sizeClass);
  if (!text) return null;
  // Two-handed is tested FIRST, because "two-handed" contains "hand" and the one-handed
  // pattern would otherwise claim it. Measured: a two-handed box came back with the +25mm
  // meant for something that fits in a palm.
  if (/two-handed|two handed|both hands|bottle|medium/.test(text)) {
    return { lens_delta_mm: 10, note: "the product is held in two hands, so the view is slightly long and undistorted" };
  }
  if (/hand|palm|pocket|small|tiny/.test(text)) {
    return {
      lens_delta_mm: 25,
      note: "the product is small enough to hold in one hand, so the view is longer and closer in: at a wider angle the near edge would stretch",
    };
  }
  if (/tabletop|table|counter/.test(text)) {
    return { lens_delta_mm: 0, note: "the product sits on a surface and is seen as it would be approached" };
  }
  if (/furniture|large|room|appliance|contextual/.test(text)) {
    return {
      lens_delta_mm: -15,
      height: "subject_line",
      note: "the product is large, so the view widens to keep the space that gives it its scale, from its own eye level",
    };
  }
  return null;
}

/**
 * Everything the physics layer contributes for one product.
 *
 * Null when the vision pass said nothing usable, which is the same as having no vision
 * pass at all — and is what keeps this file unable to act on a guess.
 */
export interface ProductPhysics {
  material: MaterialReading;
  lighting: LightingPhysics & { secondary_note?: string };
  size: SizePhysics | null;
}

export function physicsFor(item: ProductVisionItem | null | undefined): ProductPhysics | null {
  if (!item) return null;
  const material = readMaterials(item.materials);
  if (!material) return null;
  const lighting = lightingFor(material);
  if (!lighting) return null;
  return { material, lighting, size: sizeFor(item.size_class) };
}

/** Counts and family names only. */
export function physicsTelemetry(physics: ProductPhysics | null | undefined) {
  if (!physics) return { physics: false };
  return {
    physics: true,
    dominant: physics.material.dominant,
    secondary: physics.material.secondary ?? null,
    key: physics.lighting.key,
    lens_delta_mm: physics.size?.lens_delta_mm ?? 0,
  };
}
