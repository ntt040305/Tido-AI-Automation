/**
 * The Art Direction Sheet, rendered as the brief slots the v2 request template reads.
 *
 * THE ONE JOB
 * -----------
 * Translate. The sheet holds 85, f/2.8, 3200K and forty-two percent; the prompt may hold
 * none of them. Every number crosses this file and comes out the other side as the thing
 * it would look like — "a long, gently compressing view", "warm amber, like late afternoon
 * indoors" — through `words.ts`, which is the only place that mapping exists.
 *
 * WHY THAT TRANSLATION IS NOT JUST DELETION
 * -----------------------------------------
 * Because the alternative was measured. The checks already refuse a numeral, and the
 * director's reaction to a refusal is to DROP the instruction rather than rephrase it — so
 * a client who typed "85mm" got no instruction about the lens at all, and the only person
 * in the brief who stated a preference was the one it was taken from. Translating keeps
 * the instruction and loses only the digits.
 *
 * STRUCTURE
 * ---------
 * The v2 template keeps the nine master-prompt headings as the outer structure, because
 * `gpt-checks` enforces them and the whole dialect is built on their order. The Composer
 * skeleton maps into them rather than replacing them:
 *
 *   OUTPUT                       → OUTPUT:
 *   BIG IDEA                     → SCENE & CONCEPT: (opening)
 *   REFERENCES AND FIDELITY      → REFERENCE IMAGES: (+ print rule, product map, hero)
 *   LAYOUT                       → COMPOSITION & LAYOUT:
 *   ARRANGEMENT AND DEPTH        → SUBJECT ARRANGEMENT:
 *   CAMERA, LIGHTING             → LIGHT / CAMERA / MATERIALS: (opening)
 *   SET AND PROPS                → SCENE & CONCEPT: (close)
 *   COLOUR                       → COLOR & BRAND STYLE:
 *   TYPOGRAPHY + TEXT MANIFEST   → TEXT:
 *   REALISM, FINISH              → LIGHT / CAMERA / MATERIALS: (close)
 *   CONSTRAINTS                  → CONSTRAINTS:
 *
 * Pure. No I/O, no clock, no model call.
 */
import type { NumericWordsDensity } from "../engine-selector";
import type { ArtDirectionSheet } from "./art-direction-sheet";
import type { PrintRule } from "./print-rule";
import {
  CAMERA_HEIGHT_WORDS,
  KEY_DIRECTION_WORDS,
  apertureWords,
  bandWords,
  capHeightFloorWords,
  fillRatioWords,
  kelvinWords,
  lensWords,
  colourWords,
  numberWord,
  percentWords,
  shareWords,
  tiltWords,
  type CameraHeight,
  type KeyDirection,
} from "./words";

const trim = (v: unknown): string => String(v ?? "").trim();

function bullets(lines: string[]): string {
  const kept = lines.map(trim).filter(Boolean);
  return kept.length ? kept.map((l) => `  - ${l}`).join("\n") : "  (none)";
}

/**
 * A share of the frame, in the density the caller asked for.
 *
 * Both forms describe the same number. `words_only` is the default because it is the
 * behaviour the D8/K12 migration measured as safe; `words_plus_percent` is the hypothesis
 * the A/B exists to test.
 */
function share(pct: number, density: NumericWordsDensity): string {
  return density === "words_plus_percent" ? `${percentWords(pct)} of the frame` : shareWords(pct);
}

function margin(pct: number, density: NumericWordsDensity): string {
  return density === "words_plus_percent"
    ? `a clear margin of ${percentWords(pct)} of the shorter edge on every side`
    : "a clear, even margin on every side, wide enough that nothing important reads as touching an edge";
}

/** LAYOUT. Zones, margins, platform interface, negative space. */
export function renderLayout(sheet: ArtDirectionSheet, density: NumericWordsDensity): string {
  const z = sheet.canvas_zones;
  const lines = [
    `The frame is ${sheet.provenance.aspect_ratio === "9:16" ? "vertical" : sheet.provenance.aspect_ratio === "16:9" ? "horizontal" : "square"}.`,
    `${margin(z.safe_margin_pct, density)}; nothing that must be read crosses into it.`,
    `The subject occupies ${share((z.subject.width_pct * z.subject.height_pct) / 100, density)}, in ${bandWords(z.subject.top_pct, z.subject.height_pct)}.`,
    z.text.height_pct > 0 && z.text.width_pct > 0
      ? `The words live in ${bandWords(z.text.top_pct, z.text.height_pct)}${z.text.width_pct < 60 ? `, in the ${z.text.left_pct < 50 ? "left" : "right"} ${shareWords(z.text.width_pct)} of the width` : ""}, and nowhere else. No word is placed over the hero.`
      : "There are no words in this image, so the whole frame is the picture.",
    z.platform_ui
      ? `This canvas is shown inside an application that draws its own interface over the image: ${
          density === "words_plus_percent"
            ? `keep the top ${percentWords(z.platform_ui.top_pct)} and the bottom ${percentWords(z.platform_ui.bottom_pct)} of the height free`
            : "keep a generous band clear at the very top and a wider one at the very bottom"
        } of anything that must be read or seen.`
      : "",
    `Leave ${share(z.negative_space_pct, density)} as quiet, uncluttered ground.`,
  ];
  return bullets(lines);
}

/** ARRANGEMENT AND DEPTH. */
export function renderArrangement(sheet: ArtDirectionSheet, density: NumericWordsDensity): string {
  const a = sheet.arrangement;
  const hero = sheet.products.find((p) => p.id === sheet.hero.id);
  return bullets([
    `The hero is ${hero ? hero.description : "the lead product"}, holding ${share(a.hero_scale_pct, density)}; nothing else competes for that share.`,
    // Spelled, not "3": the art-director contract bans digits in the prompt, and a bare
    // integer is exactly the kind that slips past a regex written for units.
    `${numberWord(a.depth_layers)} depth layers: a soft near foreground, the hero sharp, a background clearly behind.`,
    a.overlaps
      ? "The group overlaps: items in front partly occlude those behind, so it reads as one object with depth, not a row."
      : "No overlap is needed: the subject stands clear of everything else.",
    "Nothing is deformed, mirrored, stretched or duplicated to fill a gap.",
  ]);
}

/** CAMERA. Every value translated. */
export function renderCamera(sheet: ArtDirectionSheet): string {
  const c = sheet.camera;
  return bullets([
    CAMERA_HEIGHT_WORDS[c.height as CameraHeight] ?? CAMERA_HEIGHT_WORDS.slightly_above,
    tiltWords(c.tilt_deg),
    lensWords(c.lens_mm),
    apertureWords(c.aperture),
    // `c.focus_rule` is not emitted: the realism block states focus falloff and lands in
    // the same master-prompt section, so emitting both put the same instruction twice.
  ]);
}

/** LIGHTING. Every value translated. */
export function renderLighting(sheet: ArtDirectionSheet): string {
  const l = sheet.lighting;
  return bullets([
    KEY_DIRECTION_WORDS[l.key_direction as KeyDirection] ?? KEY_DIRECTION_WORDS.front_left,
    `the light is ${kelvinWords(l.kelvin)}`,
    fillRatioWords(l.fill_ratio),
    l.rim
      ? "a narrow rim or edge light separates the subject from the background along one side"
      : "no rim light: with this many objects in frame it would outline all of them and read as a cutout",
    l.shadow_rule,
    // Conditional on an observation, and silent without one, so a render with no vision
    // pass reads exactly as it does today.
    sheet.material_lighting_note ?? "",
  ]);
}

/** SET AND PROPS. */
export function renderSet(sheet: ArtDirectionSheet): string {
  const s = sheet.set;
  return bullets([
    `Surface: ${s.surface}.`,
    `Background: ${s.background}.`,
    s.props.length
      ? `Props, and only these: ${s.props.join("; ")}. Nothing else is added to the scene.`
      : "No added props beyond anything the concept names; otherwise the subject and the surface are the whole set.",
    s.culture_signals.length ? `Cultural detail the brief named: ${s.culture_signals.join("; ")}.` : "",
    s.mood_reference.length ? `From the mood image — ${s.mood_reference.join("; ")}.` : "",
  ]);
}

/** COLOUR. 60/30/10 as roles, with the one hard rule restated. */
export function renderColour(sheet: ArtDirectionSheet, density: NumericWordsDensity): string {
  const p = sheet.palette;
  const sixty = density === "words_plus_percent" ? `about sixty percent` : "most";
  const thirty = density === "words_plus_percent" ? `about thirty percent` : "roughly a third";
  const ten = density === "words_plus_percent" ? `about ten percent` : "a small part";
  return bullets([
    `${sixty} of the frame is the field colour — ${colourWords(p.sixty)} — carrying the background and the surface.`,
    `${thirty} is the secondary, ${colourWords(p.thirty)}: the supporting surfaces and the larger shapes.`,
    `${ten} is the accent, ${colourWords(p.ten)}: emphasis only — a single element, a price card, the tightest highlight.`,
    "The background is never the product's own dominant colour.",
    // `p.reason` is NOT emitted here. It names precedence tiers — "accent from
    // product_appearance" — and a raw snake_case identifier in a master prompt is exactly
    // the `coffee_tea` leak in another costume. It rides in DERIVED DECISIONS instead,
    // which the director reads and never writes.
  ]);
}

/**
 * TYPOGRAPHY + TEXT MANIFEST.
 *
 * The manifest is the part that matters: every string the client supplied, once, with its
 * part, its place, its size floor and its colour. Nothing else may be set.
 */
export function renderTypography(sheet: ArtDirectionSheet, density: NumericWordsDensity): string {
  const t = sheet.typography;
  if (!sheet.text_manifest.length) {
    return "  No text of any kind anywhere in the image. Nothing is quoted, nothing is set, no numerals.";
  }
  const families = t.families.length
    ? t.families.length === 1
      ? `One type family: ${t.families[0]}.`
      : `Two type families and no more: ${t.families.join(" for the headline, ")} for everything else.`
    : "One type family throughout: a clean, high-contrast sans-serif. Never more than two families in the frame.";

  const entries = sheet.text_manifest.map(
    (m) =>
      `[${m.role}] "${m.exact_string}" — ${m.position}, ${capHeightFloorWords(m.size_pct, density)}, set in ${colourWords(m.colour)}`,
  );

  return [
    bullets([
      families,
      t.hierarchy,
      t.treatment_over_texture,
      "Every Vietnamese diacritic is rendered exactly as written, in NFC. No string is added, shortened, translated or corrected.",
    ]),
    "",
    "  THE TEXT MANIFEST — every string that may appear, each exactly once:",
    ...entries.map((e) => `    ${e}`),
    "",
    "  Nothing outside this manifest is set. No extra numerals, no invented strap line, no watermark.",
  ].join("\n");
}

/** REALISM + FINISH. Phase 4. */
export function renderRealism(sheet: ArtDirectionSheet): string {
  return bullets([...sheet.realism_details, `Finish: ${sheet.finish}.`]);
}

/** CONSTRAINTS. The negatives and the exclusions, together. */
export function renderConstraints(sheet: ArtDirectionSheet): string {
  return bullets([...sheet.negatives, ...sheet.set.exclusions]);
}

/**
 * The derived decisions, with the tier that produced each.
 *
 * Shown to the director so it knows which instructions are the client's and which are the
 * system's, and shown to a reviewer so a surprising frame has an explanation that is not a
 * guess. Not sent to the image model.
 */
export function renderProvenance(sheet: ArtDirectionSheet): string {
  const p = sheet.provenance;
  return bullets([
    `creative approach: ${p.approach} — ${p.approach_reason}`,
    `asset family: ${p.asset_family}; canvas: ${p.aspect_ratio}`,
    `print rule branch: ${p.print_rule_branch}`,
    `palette: ${sheet.palette.reason}`,
    p.concept_specs.length
      ? `the client stated these specs in the concept and they were honoured: ${p.concept_specs.join(", ")} (carried as description, never as numerals)`
      : "the client stated no technical specs in the concept",
    ...sheet.conflicts_resolved,
    ...sheet.products
      .filter((pr) => pr.material === "unverified")
      .map((pr) => `unverified material: ${pr.description} — describe its surface from the photograph, do not name a material`),
  ]);
}

/** The whole set of v2-only slots. Merged over the v1 slots by the brief compiler. */
export function artDirectionSlots(
  sheet: ArtDirectionSheet,
  printRule: PrintRule,
  density: NumericWordsDensity,
): Record<string, string> {
  return {
    BIG_IDEA: sheet.big_idea,
    MOOD: `${sheet.mood}; addressed to ${sheet.audience_tone}`,
    PRINT_RULE: `  ${printRule.text}`,
    PRODUCT_MAP: bullets(
      sheet.products.map(
        (p) =>
          `${p.id === sheet.hero.id ? "HERO — " : ""}${p.description}` +
          `${p.colours.length ? `; reads ${p.colours.join(", ")}` : ""}` +
          `${p.material !== "unverified" ? `; ${p.material}` : "; material unverified, take it from the photograph"}` +
          `${p.size_class !== "unverified" ? `; ${p.size_class}` : ""}` +
          `${p.printed_branding !== "unverified" ? `; printed branding reads ${p.printed_branding}` : ""}`,
      ),
    ),
    HERO: `  ${sheet.products.find((p) => p.id === sheet.hero.id)?.description ?? "the lead product"} — ${sheet.hero.reason}`,
    LAYOUT_ZONES: renderLayout(sheet, density),
    ARRANGEMENT: renderArrangement(sheet, density),
    CAMERA: renderCamera(sheet),
    LIGHTING: renderLighting(sheet),
    SET_AND_PROPS: renderSet(sheet),
    COLOUR: renderColour(sheet, density),
    TYPOGRAPHY: renderTypography(sheet, density),
    REALISM: renderRealism(sheet),
    CONSTRAINTS_BLOCK: renderConstraints(sheet),
    DERIVED_DECISIONS: renderProvenance(sheet),
  };
}
