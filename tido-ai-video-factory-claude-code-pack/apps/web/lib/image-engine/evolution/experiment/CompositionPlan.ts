import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { LayoutGeometry, Zone, ZoneName } from "./LayoutGeometry";
import type { VisualComposition } from "./VisualComposition";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { AssetContext } from "./AssetContext";

/**
 * Phase 5.6.4 — the composition, decided before anything is rendered.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every fact a composition is made of was already being decided somewhere, and
 * nowhere were they decided TOGETHER:
 *
 *   - `LayoutGeometry` decided where things sit, from the ratio and the copy.
 *   - `CreativeBlueprint.photography` decided the camera and the light.
 *   - `VisualComposition` decided the layer stack and what relates to what.
 *   - `TypographyPlan` decided, separately, what area the copy needed.
 *   - the prompt assembled three of those into one instruction and hoped.
 *
 * Four modules reading the same brief and each reaching its own conclusion is
 * how a frame ends up internally inconsistent -- copy planned for an area the
 * light was never asked to leave quiet, a product placed where the camera
 * distance makes no sense. This resolves them into ONE artifact and makes that
 * artifact the thing everything downstream reads.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not decide the camera, the light, the environment or the story. The
 * Creative Director decided those with a model, per brief, and they are carried
 * here VERBATIM with the field they came from recorded. What this adds is the
 * reasoning BETWEEN them: what the hero actually is, what role the product
 * plays, why the empty area is empty, where typography belongs and -- the point
 * of the phase -- what typography's relationship to the composition is, in
 * meaning rather than coordinates.
 *
 * NO TEMPLATES, AND HOW THAT IS ENFORCED
 * --------------------------------------
 * There is no table anywhere in this file keyed on a category or a style.
 * "Luxury gets a close-up", "food is centred", "technology is blue" are
 * stereotypes, and a system that holds them produces the same eight pictures
 * for every client. Where the director stated a camera decision it is carried;
 * where the director stated nothing, the field is ABSENT and says so, and the
 * prompt asks for nothing rather than inventing a default. An absent field is a
 * better answer than a plausible invention, because the invention would be
 * indistinguishable from a decision in the record.
 *
 * Deterministic, pure, no model call.
 */

/** Where a decided thing came from. `absent` means nobody decided it. */
export type PlanSource = "director" | "geometry" | "product" | "brand" | "derived" | "absent";

/** One decided thing, with its provenance. */
export interface PlanField<T = string> {
  value: T;
  /** Why this, quoting whatever produced it. Never "it looks good". */
  because: string;
  from: PlanSource;
}

/** A rectangle in frame percentages, origin top-left. */
export interface PlanBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ProductRole = "hero" | "evidence" | "participant" | "absent";

export interface DepthPlane {
  plane: "foreground" | "midground" | "background";
  holds: string;
  because: string;
}

export interface HierarchyStep {
  element: string;
  /** 1 is seen first. */
  rank: number;
  because: string;
}

export interface CompositionPlan {
  // ── what the picture is about ─────────────────────────────────────────
  /** The thing the frame exists to show. Not always the product. */
  hero_subject: PlanField;
  product_role: PlanField<ProductRole>;
  storytelling_intent: PlanField;

  // ── where things are ──────────────────────────────────────────────────
  product_position: PlanField<PlanBox & { label: string }>;
  /** Share of the frame the product occupies, and what that reads as. */
  product_scale: PlanField<{ share: number; label: string }>;
  /**
   * The area left deliberately empty, and WHAT FOR.
   *
   * Negative space is a decision, not a leftover. The share comes from the
   * geometry; the purpose is reasoned, because "38% of the frame is empty" and
   * "the frame is quiet enough for the restraint to be credible" are different
   * statements and only the second is art direction.
   */
  negative_space: PlanField<{ share: number; purpose: string }>;
  typography_zone: PlanField<PlanBox & { label: string }>;
  /**
   * What typography's presence MEANS here, not where it sits.
   *
   * The phase exists for this field. "text_position: top_left" tells the
   * typography engine nothing it can reason with; "the copy occupies the calm
   * the low morning light leaves on the left, so the product keeps the eye"
   * tells it what it is protecting when it places a line.
   */
  typography_relationship: PlanField;
  visual_hierarchy: HierarchyStep[];

  // ── how it is seen ────────────────────────────────────────────────────
  camera_angle: PlanField;
  camera_distance: PlanField;
  camera_lens_behavior: PlanField;
  environment: PlanField;
  lighting_direction: PlanField;
  lighting_quality: PlanField;
  atmosphere: PlanField;

  // ── how deep it is ────────────────────────────────────────────────────
  foreground_background_relationship: PlanField;
  depth_structure: DepthPlane[];
  supporting_elements: Array<{ element: string; purpose: string; relationship: string }>;

  /** The six questions an art director answers before picking up a camera. */
  questions: {
    visual_hero: string;
    noticed_first: string;
    emotion: string;
    typography_home: string;
    environment_role: string;
    kept_quiet: string;
  };

  /** Which fields rest on a decision and which are absent, counted. */
  provenance: Record<PlanSource, number>;
  /** Share of the plan that rests on a real decision, 0-1. Never a quality score. */
  completeness: number;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function decisionText(d: unknown): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  const o = d as { value?: unknown };
  return clean(o.value);
}

const shorten = (s: string, n = 110) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** A field the director decided, or an honest absence. */
function fromDirector(value: string, field: string): PlanField {
  return value
    ? { value: clean(value), because: `the director's ${field.replace(/_/g, " ")}`, from: "director" }
    : { value: "", because: `no ${field.replace(/_/g, " ")} was decided, so nothing is claimed about it`, from: "absent" };
}

export interface CompositionPlanInput {
  blueprint?: CreativeBlueprint | null;
  /** Where things sit. The plan does not re-derive this; it reads it. */
  geometry?: LayoutGeometry | null;
  /** The layer stack, for supporting elements and depth. */
  composition?: VisualComposition | null;
  /** What was observed in a supplied product image. */
  visualDNA?: VisualDNA | null;
  assetContext?: AssetContext | null;
  /** How many client lines there are. A frame with no copy is composed differently. */
  copyLines?: number;
}

/**
 * Resolves the composition. Pure and total.
 *
 * Reads in one order and never doubles back: what the work is ABOUT, then how
 * the frame is ARRANGED, then how it is SEEN, then what that means for the
 * words. Typography is last because it is a consequence of the composition, not
 * a parallel decision about the same frame.
 */
export function buildCompositionPlan(input: CompositionPlanInput): CompositionPlan {
  const bp = input.blueprint || null;
  const g = input.geometry || null;
  const f = (section: string, key: string): string => {
    const held = (bp as unknown as Record<string, Record<string, unknown> | null> | null)?.[section];
    return held ? decisionText(held[key]) : "";
  };

  const zones = g?.zones ?? [];
  const zone = (name: ZoneName): Zone | null => zones.find((z) => z.name === name) ?? null;
  const productZone = zone("product");
  const copyZones = zones.filter((z) => z.name !== "product" && z.name !== "logo");
  const copyLines = input.copyLines ?? 0;

  // ── what the picture is about ───────────────────────────────────────────
  const bigIdea = f("concept", "big_idea") || f("concept", "campaign_concept");
  const visualStory = f("concept", "visual_story");
  const hook = f("concept", "emotional_hook") || f("brand_expression", "emotional_direction");
  const observed = clean(input.visualDNA?.observed?.product as unknown as string) || "";

  // The hero is the PRODUCT unless the idea says the picture is about something
  // else. It is read from the idea rather than assumed, because a campaign
  // whose subject is a moment and whose product is evidence composes
  // differently from one where the bottle is the whole point.
  const aboutAFeeling =
    Boolean(hook) && !!visualStory &&
    /\b(moment|feeling|memory|ritual|morning|people|person|hand|hands|someone|somebody|family|friends|together|day|life)\b/i.test(visualStory);
  const hero_subject: PlanField = visualStory
    ? { value: shorten(visualStory), because: "the director's visual story is what the frame is of", from: "director" }
    : observed
      ? { value: `the product as supplied: ${shorten(observed, 80)}`, because: "no visual story was decided, so the frame is of the product that was given", from: "product" }
      : { value: "", because: "neither a visual story nor a product image was available to say what the frame is of", from: "absent" };

  // The camera is resolved here, before the product's size, because it DECIDES
  // that size: a wide establishing shot makes the product small in the frame
  // whatever area the layout reserved for it, and a macro makes it everything.
  // Reading the zone alone produced the same product role for a macro and for
  // an establishing shot, which is the layout convention talking over a stated
  // creative decision.
  const cameraLanguage = f("photography", "camera_language");
  const camera_angle = extracted(cameraLanguage, ANGLE_WORDS, "camera_language", "angle");
  const camera_distance = extracted(cameraLanguage, DISTANCE_WORDS, "camera_language", "distance");

  const zoneShare = productZone ? (productZone.width * productZone.height) / 100 : 0;
  const fromCamera = distanceShare(camera_distance.value);
  const productShare = fromCamera ?? zoneShare;
  const product_role: PlanField<ProductRole> = !productZone
    ? { value: "absent", because: "the layout reserves no area for a product", from: "geometry" }
    : aboutAFeeling && productShare < 26
      ? {
          value: "evidence",
          because: `the idea is about ${shorten(hook || visualStory, 60)}, and the product occupies ${productShare.toFixed(0)}% of the frame: it proves the claim rather than being it`,
          from: "derived",
        }
      : productShare >= 26
        ? { value: "hero", because: `the product holds ${productShare.toFixed(0)}% of the frame and the highest-priority zone`, from: "geometry" }
        : { value: "participant", because: `the product holds ${productShare.toFixed(0)}% of the frame: present and deliberate, but not the whole subject`, from: "derived" };

  const storytelling_intent: PlanField = bigIdea
    ? { value: shorten(bigIdea, 140), because: "the director's big idea is what the composition is arranged to say", from: "director" }
    : { value: "", because: "no idea was decided, so the composition can only present the product clearly", from: "absent" };

  // ── where things are ────────────────────────────────────────────────────
  const product_position: PlanField<PlanBox & { label: string }> = productZone
    ? {
        value: {
          x: round(productZone.x - productZone.width / 2),
          y: round(productZone.y - productZone.height / 2),
          width: round(productZone.width),
          height: round(productZone.height),
          label: positionLabel(productZone.x, productZone.y),
        },
        because: productZone.because,
        from: "geometry",
      }
    : {
        value: { x: 0, y: 0, width: 0, height: 0, label: "none" },
        because: "no product zone exists in this layout",
        from: "absent",
      };

  const product_scale: PlanField<{ share: number; label: string }> = productZone
    ? {
        value: { share: round(productShare), label: scaleLabel(productShare) },
        because:
          fromCamera !== null
            ? `the director framed it ${camera_distance.value}, which puts it at roughly ${productShare.toFixed(0)}% of the frame — the layout had reserved ${zoneShare.toFixed(0)}%`
            : `${productShare.toFixed(0)}% of the frame, which reads as ${scaleLabel(productShare)}`,
        from: fromCamera !== null ? "director" : "geometry",
      }
    : { value: { share: 0, label: "none" }, because: "no product in this frame", from: "absent" };

  // ── the empty area, and why it is empty ────────────────────────────────
  const whitespace = g?.decisions?.whitespace ?? null;
  const spaceDecision = f("layout", "negative_space");
  const negative_space: PlanField<{ share: number; purpose: string }> = (() => {
    const share = whitespace ? round(whitespace.share) : 0;
    if (spaceDecision) {
      return { value: { share, purpose: shorten(spaceDecision, 130) }, because: "the director decided what the empty area is for", from: "director" };
    }
    if (!g) return { value: { share: 0, purpose: "" }, because: "no layout was available to say what is left empty", from: "absent" };
    // Reasoned, not measured. The share is a fact; the purpose is the decision
    // the share serves, and a plan that reports only the number has said
    // nothing a designer could act on.
    const purpose =
      copyLines === 0
        ? "the frame is left open because there is nothing to read: the space is the product's, and crowding it would only reduce it"
        : share >= 45
          ? "enough of the frame is kept empty that the eye has somewhere to rest, which is what makes the work read as considered rather than full"
          : share >= 28
            ? "the empty area is the copy's room to breathe: it exists so the lines are read as a statement rather than as a label on a picture"
            : "little is left empty, so the frame has to earn its density: every element present is carrying something";
    return { value: { share, purpose }, because: `reasoned from the ${share}% the layout leaves empty and ${copyLines} line${copyLines === 1 ? "" : "s"} of copy`, from: "derived" };
  })();

  // ── where the words live, and what that means ──────────────────────────
  const copyBox = boundingBox(copyZones);
  const typography_zone: PlanField<PlanBox & { label: string }> = copyBox
    ? {
        value: { ...copyBox, label: positionLabel(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2) },
        because: copyZones[0]?.because || "the area the layout reserved for copy",
        from: "geometry",
      }
    : {
        value: { x: 0, y: 0, width: 0, height: 0, label: "none" },
        because: copyLines === 0 ? "this frame carries no copy" : "no copy zone exists in this layout",
        from: copyLines === 0 ? "derived" : "absent",
      };

  const lightingBehaviour = f("photography", "lighting_behavior");
  const atmosphereText = f("visual_world", "atmosphere");
  const typography_relationship: PlanField = (() => {
    if (!copyBox || copyLines === 0) {
      return { value: "no typography in this frame", because: "there is no copy to place", from: "derived" };
    }
    const placementReason = f("design", "placement_reason");
    if (placementReason) {
      return { value: shorten(placementReason, 160), because: "the director decided why the words sit where they sit", from: "director" };
    }
    // Composed, so the typography engine receives MEANING and not a corner.
    // Each clause is a fact from somewhere else in this plan, which is what
    // makes the sentence true of this frame rather than of frames in general.
    const side = product_position.from === "geometry" ? oppositeOf(product_position.value.label) : "";
    const parts = [
      side ? `the copy takes the ${side} the product leaves open` : "the copy takes the area the product leaves open",
      lightingBehaviour ? `which the light keeps quiet — ${shorten(lightingBehaviour.toLowerCase(), 70)}` : "",
      product_role.value === "hero"
        ? "so the product keeps the eye and the words are read second"
        : product_role.value === "evidence"
          ? "so the words carry the claim and the product proves it"
          : "so neither competes with the other",
    ].filter(Boolean);
    return { value: parts.join(", "), because: "composed from the product's position, the light and the product's role", from: "derived" };
  })();

  // ── the order the eye takes ─────────────────────────────────────────────
  const visual_hierarchy = buildHierarchy(g, product_role.value, copyLines, f("layout", "attention_flow"));

  // ── how it is seen. Carried, never invented. ───────────────────────────
  // (the angle and the distance were resolved above, before the product's size)
  const camera_lens_behavior = fromDirector(f("photography", "lens_character") || f("photography", "focus_behavior"), "lens character");
  const environment = fromDirector(f("visual_world", "environment_logic") || f("visual_world", "visual_world"), "environment logic");
  const lighting_direction = extracted(lightingBehaviour, LIGHT_DIRECTION_WORDS, "lighting_behavior", "direction");
  const lighting_quality = fromDirector(lightingBehaviour, "lighting behaviour");
  const atmosphere = fromDirector(atmosphereText, "atmosphere");

  // ── depth ───────────────────────────────────────────────────────────────
  const depth_structure = buildDepth(input.composition ?? null, f("photography", "depth_feeling"), product_role.value);
  const foreground_background_relationship: PlanField = (() => {
    const depthFeeling = f("photography", "depth_feeling");
    if (depthFeeling) return { value: shorten(depthFeeling, 140), because: "the director decided how deep the frame is", from: "director" };
    if (depth_structure.length < 2) {
      return { value: "", because: "not enough was decided about the frame's planes to state a relationship between them", from: "absent" };
    }
    const back = depth_structure.find((d) => d.plane === "background");
    return {
      value: `${back ? shorten(back.holds, 60) : "the background"} sits behind and supports the ${product_role.value === "hero" ? "product" : "subject"} rather than competing with it`,
      because: "derived from the layer stack: the planes that exist and what each holds",
      from: "derived",
    };
  })();

  const supporting_elements = (input.composition?.layers ?? [])
    .filter((l) => l.layer === "supporting_objects" || l.layer === "graphic_elements" || l.layer === "atmosphere")
    .map((l) => ({ element: l.content, purpose: l.purpose, relationship: l.relationship }));

  const plan: CompositionPlan = {
    hero_subject,
    product_role,
    storytelling_intent,
    product_position,
    product_scale,
    negative_space,
    typography_zone,
    typography_relationship,
    visual_hierarchy,
    camera_angle,
    camera_distance,
    camera_lens_behavior,
    environment,
    lighting_direction,
    lighting_quality,
    atmosphere,
    foreground_background_relationship,
    depth_structure,
    supporting_elements,
    questions: {
      visual_hero: hero_subject.value || "not decided",
      noticed_first: visual_hierarchy[0]?.element ?? "not decided",
      emotion: hook ? shorten(hook, 120) : atmosphereText ? shorten(atmosphereText, 120) : "not decided",
      typography_home: typography_relationship.value || "no typography in this frame",
      environment_role: environment.value
        ? `${shorten(environment.value, 100)} — ${product_role.value === "evidence" ? "it carries the story the product proves" : "it gives the product somewhere to be"}`
        : "not decided",
      kept_quiet: negative_space.value.purpose || "not decided",
    },
    provenance: { director: 0, geometry: 0, product: 0, brand: 0, derived: 0, absent: 0 },
    completeness: 0,
  };

  // ── provenance, counted rather than claimed ────────────────────────────
  const fields: PlanField<unknown>[] = [
    hero_subject, product_role, storytelling_intent, product_position, product_scale,
    negative_space, typography_zone, typography_relationship, camera_angle, camera_distance,
    camera_lens_behavior, environment, lighting_direction, lighting_quality, atmosphere,
    foreground_background_relationship,
  ];
  for (const field of fields) plan.provenance[field.from]++;
  plan.completeness = round((fields.length - plan.provenance.absent) / fields.length, 2);
  return plan;
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A position in words, the way a designer says it. */
function positionLabel(x: number, y: number): string {
  const v = y < 34 ? "upper" : y > 66 ? "lower" : "centre";
  const h = x < 40 ? "left" : x > 60 ? "right" : "centre";
  return v === "centre" && h === "centre" ? "centre" : `${v} ${h}`;
}

/** The side of the frame a position does NOT occupy. */
function oppositeOf(label: string): string {
  if (label.includes("left")) return "right of the frame";
  if (label.includes("right")) return "left of the frame";
  if (label.includes("upper")) return "lower part of the frame";
  if (label.includes("lower")) return "upper part of the frame";
  return "space around it";
}

/**
 * Roughly how much of the frame a stated framing gives the subject.
 *
 * Not a template: this does not decide the camera, it reads the consequence of
 * a camera the DIRECTOR chose. The numbers are what those words mean to anyone
 * who has held a camera, and they exist so a wide shot and a macro cannot both
 * report the product as the same size just because the layout reserved it the
 * same box.
 */
function distanceShare(distance: string): number | null {
  if (!distance) return null;
  if (distance.startsWith("macro")) return 55;
  if (distance.startsWith("close")) return 38;
  if (distance.startsWith("medium")) return 20;
  if (distance.startsWith("wide")) return 9;
  return null;
}

function scaleLabel(share: number): string {
  if (share >= 40) return "dominant — the product IS the frame";
  if (share >= 26) return "large — unmistakably the subject";
  if (share >= 14) return "measured — clearly present, with room around it";
  return "small — placed within a larger scene";
}

function boundingBox(zones: Zone[]): PlanBox | null {
  if (!zones.length) return null;
  const x0 = Math.min(...zones.map((z) => z.x - z.width / 2));
  const x1 = Math.max(...zones.map((z) => z.x + z.width / 2));
  const y0 = Math.min(...zones.map((z) => z.y - z.height / 2));
  const y1 = Math.max(...zones.map((z) => z.y + z.height / 2));
  return { x: round(Math.max(0, x0)), y: round(Math.max(0, y0)), width: round(x1 - x0), height: round(y1 - y0) };
}

/**
 * Words a director uses for an angle or a distance.
 *
 * RECOGNITION, not a table of defaults. Nothing here maps a category or a mood
 * to a camera -- the only way a value appears is that the director wrote it.
 * A brief whose camera decision says nothing about angle produces no angle.
 */
const ANGLE_WORDS: Array<[RegExp, string]> = [
  [/\b(low angle|from below|looking up|worm'?s eye)\b/i, "low, looking up at the subject"],
  [/\b(high angle|from above|looking down|overhead|top-?down|bird'?s eye|flat ?lay)\b/i, "high, looking down at the subject"],
  [/\b(eye level|straight on|head ?on|frontal|at eye height)\b/i, "eye level, straight on"],
  [/\b(three.quarter|3\/4|angled view|oblique)\b/i, "three-quarter, turned off the axis"],
  [/\b(dutch|tilted|canted)\b/i, "tilted off the horizontal"],
];

const DISTANCE_WORDS: Array<[RegExp, string]> = [
  [/\b(macro|extreme close|very close|detail shot)\b/i, "macro — closer than the eye would get"],
  [/\b(close.?up|close|tight|intimate framing|fills the frame)\b/i, "close — the subject fills the frame"],
  [/\b(medium shot|mid shot|waist|half.length)\b/i, "medium — the subject and a little of its world"],
  [/\b(wide|establishing|full shot|pulled back|distant|environmental)\b/i, "wide — the subject inside its environment"],
];

const LIGHT_DIRECTION_WORDS: Array<[RegExp, string]> = [
  [/\b(back ?lit|backlight|from behind|rim ?light|contre.?jour)\b/i, "from behind the subject"],
  [/\b(side ?lit|side ?light|from the side|raking|cross.?light)\b/i, "from the side, raking across the surface"],
  [/\b(top ?light|from above|overhead light|skylight)\b/i, "from above"],
  [/\b(front ?lit|frontal light|from the front|flat light)\b/i, "from the front"],
  [/\b(under ?lit|from below|uplight)\b/i, "from below"],
  [/\b(window|daylight from|morning light|afternoon light|golden hour)\b/i, "natural, from a single window or sun"],
];

/**
 * A specific decision recognised inside the director's prose, or an absence.
 *
 * The prose is kept as the reason, so a reader can check the recognition
 * against what was actually written.
 */
function extracted(prose: string, table: Array<[RegExp, string]>, field: string, what: string): PlanField {
  const text = clean(prose);
  if (!text) {
    return { value: "", because: `no ${field.replace(/_/g, " ")} was decided, so no ${what} is claimed`, from: "absent" };
  }
  for (const [re, value] of table) {
    if (re.test(text)) {
      return { value, because: `recognised in the director's ${field.replace(/_/g, " ")}: "${shorten(text, 90)}"`, from: "director" };
    }
  }
  return {
    value: "",
    because: `the director decided the ${field.replace(/_/g, " ")} — "${shorten(text, 90)}" — but stated no ${what}, so none is claimed`,
    from: "absent",
  };
}

/**
 * The order the eye takes, and why.
 *
 * Built from the geometry's own eye path where it has one, because that was
 * derived from the zones and cannot disagree with them. The product's ROLE
 * decides whether it leads: a product that is evidence for a claim is not the
 * first thing the frame should say.
 */
function buildHierarchy(
  g: LayoutGeometry | null,
  role: ProductRole,
  copyLines: number,
  attentionFlow: string,
): HierarchyStep[] {
  if (!g) return [];
  const path = g.eye_path;
  const named = path ? [path.enter, ...path.through, path.exit] : g.zones.map((z) => z.name);
  const seen = new Set<ZoneName>();
  const order: ZoneName[] = [];
  for (const n of named) {
    if (!seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  }
  // A product that is only evidence should not be the first thing seen, even
  // when it holds the largest zone. This is the one place the plan overrides
  // the geometry, and it says so.
  if (role === "evidence" && order[0] === "product" && order.length > 1) {
    order.splice(0, 1);
    order.splice(1, 0, "product");
  }
  return order
    .filter((n) => (copyLines > 0 ? true : n === "product" || n === "logo"))
    .map((n, i) => ({
      element: n,
      rank: i + 1,
      because:
        i === 0
          ? attentionFlow
            ? `the first thing the frame says, following the director's attention flow: ${shorten(attentionFlow, 70)}`
            : role === "evidence" && n !== "product"
              ? "the product is evidence for the claim, so the claim is read first"
              : "the largest, highest-priority zone in the layout"
          : `read after ${order[i - 1]}, because the layout puts it next on the path`,
    }));
}

/**
 * The frame's planes, from the layer stack that already exists.
 *
 * `VisualComposition` decided what occupies the frame and how each part relates
 * to the hero; this reads depth out of it rather than deciding it again.
 */
function buildDepth(composition: VisualComposition | null, depthFeeling: string, role: ProductRole): DepthPlane[] {
  if (!composition?.layers?.length) return [];
  const out: DepthPlane[] = [];
  const at = (name: string) => composition.layers.find((l) => l.layer === name) ?? null;
  const background = at("background");
  const hero = at("hero_product");
  const support = at("supporting_objects");
  const atmosphereLayer = at("atmosphere");
  if (background) {
    out.push({ plane: "background", holds: background.content, because: background.placement_reason });
  }
  if (hero) {
    out.push({
      plane: "midground",
      holds: hero.content,
      because: role === "hero" ? "the product is the subject, so it owns the plane the eye settles on" : hero.placement_reason,
    });
  }
  if (support || atmosphereLayer) {
    const l = support ?? atmosphereLayer!;
    out.push({
      plane: "foreground",
      holds: l.content,
      because: depthFeeling ? `${l.placement_reason}; the director asked for ${shorten(depthFeeling.toLowerCase(), 60)}` : l.placement_reason,
    });
  }
  return out;
}

/** Counts and names only. Never the client's copy. */
export function compositionPlanTelemetry(p: CompositionPlan | null | undefined) {
  if (!p) return { composition_plan: false };
  return {
    composition_plan: true,
    hero: p.hero_subject.from,
    product_role: p.product_role.value,
    product_scale: p.product_scale.value.label,
    negative_space: p.negative_space.value.share,
    typography_zone: p.typography_zone.value.label,
    hierarchy: p.visual_hierarchy.map((h) => h.element).join(" → "),
    camera: [p.camera_angle.value, p.camera_distance.value].filter(Boolean).length,
    lighting: p.lighting_direction.from,
    depth_planes: p.depth_structure.length,
    completeness: p.completeness,
    absent: p.provenance.absent,
  };
}

/**
 * The plan as the IMAGE prompt's composition section.
 *
 * It replaces what the geometry and the layer stack used to write separately,
 * so the renderer receives ONE account of the frame instead of three that have
 * to agree. Absent fields are omitted entirely -- an instruction inventing a
 * camera the director never chose is worse than no instruction, because the
 * model will follow it.
 *
 * `sceneOnly` drops every mention of the copy: in hybrid typography the model
 * renders no words, and is told only what area to keep clear.
 */
export function renderCompositionPlan(
  plan: CompositionPlan | null | undefined,
  opts: { sceneOnly?: boolean } = {},
): string | undefined {
  if (!plan) return undefined;
  const lines: string[] = [];
  const say = (label: string, field: PlanField | string) => {
    const value = typeof field === "string" ? field : field.value;
    if (typeof field !== "string" && field.from === "absent") return;
    if (!clean(value)) return;
    lines.push(`- ${label}: ${value}`);
  };

  say("what the frame is of", plan.hero_subject);
  if (plan.product_role.value !== "absent") {
    say("the product's role", `${plan.product_role.value} — ${plan.product_scale.value.label}`);
  }
  if (plan.product_position.from !== "absent") {
    const p = plan.product_position.value;
    say("where the product sits", `${p.label} of the frame, about ${p.width}% by ${p.height}%`);
  }
  say("camera angle", plan.camera_angle);
  say("camera distance", plan.camera_distance);
  say("lens behaviour", plan.camera_lens_behavior);
  say("environment", plan.environment);
  say("light direction", plan.lighting_direction);
  say("light quality", plan.lighting_quality);
  say("atmosphere", plan.atmosphere);
  say("depth", plan.foreground_background_relationship);
  // The planes and what is on them. Carried here because this section replaces
  // the layer stack's own block in the prompt: if the plan does not say what
  // occupies the frame, dropping that block would lose it.
  for (const d of plan.depth_structure) {
    lines.push(`- ${d.plane}: ${d.holds}`);
  }
  for (const e of plan.supporting_elements) {
    lines.push(`- ${e.element} — ${e.purpose}; ${e.relationship}`);
  }

  const t = plan.typography_zone;
  if (!opts.sceneOnly && t.from === "geometry") {
    say("where the words go", `${t.value.label} of the frame`);
  }
  if (t.from === "geometry") {
    lines.push(
      `- keep clear: the ${t.value.label} of the frame, about ${t.value.width}% by ${t.value.height}%, ` +
        `stays free of detail — ${plan.negative_space.value.purpose}`,
    );
  } else if (plan.negative_space.value.purpose) {
    say("what stays quiet", plan.negative_space.value.purpose);
  }

  if (!lines.length) return undefined;
  return [
    "THE COMPOSITION",
    "Decided before this render, and the only account of the frame: every line below",
    "was reasoned from the brief, and nothing omitted here should be invented.",
    ...lines,
  ].join("\n");
}
