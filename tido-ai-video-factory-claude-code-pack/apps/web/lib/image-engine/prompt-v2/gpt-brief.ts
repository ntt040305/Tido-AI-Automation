/**
 * The GPT Image 2.5 Sunburst brief — thirteen labelled sections, A to M.
 *
 * WHY A SECOND BRIEF COMPILER
 * ---------------------------
 * `brief-compiler.ts` writes for Nano Banana 2 and must keep writing exactly what it
 * writes today, because that is the rollback. This one writes for a different model,
 * reading a different template set, under a different contract. Sharing one compiler
 * between them would mean every change for one model risking the other.
 *
 * WHAT IS DIFFERENT ABOUT THIS ONE
 * --------------------------------
 * Three things, all of which came out of measurement rather than preference:
 *
 *   1. **Section C is generated from the allocation**, not from the reference list. The
 *      provider takes two images; eight photographs arrive as two contact sheets. The
 *      prompt has to describe the sheets it will actually receive — panels, letters and
 *      all — or it describes an arrangement that does not exist.
 *   2. **Section C declares which panels are too small to label-lock.** Sunburst has a
 *      512px identity floor: a panel below it is not reliably legible, and a prompt that
 *      says "reproduce the lettering from panel C" at 496px invites invented letters on a
 *      real product. Measured in the allocation table, not assumed.
 *   3. **Section I quarantines every number.** The upstream layers produce Kelvin,
 *      f-stops and millimetres; this model is told to translate them to plain description
 *      and the checks refuse a prompt that copied one through.
 *
 * Pure. No I/O except the template read its caller does, no model call, no clock.
 */
import type { Allocation, AllocatedSlot } from "../provider/reference-packing/reference-allocation";
/** NFC, locally. `brief-compiler` keeps its own copy private, and so does this. */
const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");

export type GptSectionLetter =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M";

/** The nine headings the master prompt must carry, in order. Exported for the checks. */
export const MASTER_SECTIONS = [
  "OUTPUT:",
  "REFERENCE IMAGES:",
  "SCENE & CONCEPT:",
  "SUBJECT ARRANGEMENT:",
  "COMPOSITION & LAYOUT:",
  "LIGHT / CAMERA / MATERIALS:",
  "COLOR & BRAND STYLE:",
  "TEXT:",
  "CONSTRAINTS:",
] as const;

/** Orientation in words. The ratio digits travel as a parameter and are banned from the prompt. */
export const ORIENTATION: Record<string, string> = {
  "1:1": "square",
  "9:16": "vertical",
  "16:9": "horizontal",
};

/** The layout sentence for a canvas. One rule, used by the engine and the fallback. */
export function layoutFor(ratio: string): string {
  switch (String(ratio).trim()) {
    case "9:16":
      return "a tall frame: the subject low, the words stacked above it, nothing important near the very top or the very bottom";
    case "16:9":
      return "a wide frame: the subject to one side, the words in the clear space opposite";
    default:
      return "a square frame: the subject centred or just below centre, the words in the calm band above it";
  }
}

export interface GptReference {
  /** 1-based, and the same order the provider receives the files in. */
  index: number;
  role: string;
  filename?: string;
  /** What the client said this is. Verbatim. */
  description?: string;
}

export interface GptBriefInput {
  assetType: string;
  aspectRatio: string;
  industry?: string;
  intendedUse?: string;
  productCount?: number;
  /** The client's own words. Never paraphrased. */
  concept: string;
  brand: string;
  /** The client's strings, in order, exactly as typed. */
  copy: string[];
  references: GptReference[];
  /**
   * What `allocateReferences` decided. The single source of truth for what is attached:
   * section C describes these slots and nothing else.
   */
  allocation?: Allocation | null;
  /** The active model's identity floor, in pixels. Panels under it are declared unsafe. */
  minPanelLongestSidePx?: number;
  productFacts?: string[];
  brandKit?: {
    colors?: { hex: string; role?: string }[];
    fonts?: { heading?: string; body?: string };
    stylePreferred?: string[];
    styleForbidden?: string[];
    typographyPreference?: string;
    hasLogoImage?: boolean;
  } | null;
  /** Controls the user actually set. Binding. */
  userControls?: { label: string; instruction: string }[];
  /** An explicit creative approach, when the user chose one. Binding. */
  userApproach?: { label: string; directive: string } | null;
  /** Everything the upstream layers produced. Advisory. */
  strategy?: { label: string; text: string }[];
  /** Controls the SYSTEM resolved rather than the user. Advisory. */
  resolvedControls?: { label: string; value: string; source: string }[];
  /** An inferred creative approach with its reason. Advisory. */
  inferredApproach?: { label: string; directive: string; reason: string } | null;
  /** Numbers from CinematographyLayer / FinishLayer. Quarantined in section I. */
  referenceData?: { label: string; value: string }[];
  industryModule?: string;
  productCountRule?: string;
  modelNotes?: string;
  minChars?: number;
  maxChars?: number;
}

export interface CompiledGptBrief {
  slots: Record<string, string>;
  warnings: string[];
  /** Panels the brief declared unsafe to label-lock, for the log and the decisions tag. */
  unsafePanels: { slot: number; label: string; longestSidePx: number }[];
}

const NONE = "  (none)";

function trim(v: unknown): string {
  return String(v ?? "").trim();
}

function bullets(lines: string[]): string {
  const kept = lines.map(trim).filter(Boolean);
  return kept.length ? kept.map((l) => `  - ${l}`).join("\n") : NONE;
}

/**
 * Section C, written from the allocation.
 *
 * This is the section that most often used to lie. The prompt said "Image 1 is the
 * product" while the provider received a four-panel contact sheet, so the renderer was
 * told to preserve the shape of something that was not in the frame it was handed.
 */
export function renderAllocatedReferences(
  allocation: Allocation | null | undefined,
  references: GptReference[],
  minPanelLongestSidePx: number,
): { text: string; unsafePanels: CompiledGptBrief["unsafePanels"]; warnings: string[] } {
  const unsafePanels: CompiledGptBrief["unsafePanels"] = [];
  const warnings: string[] = [];

  // No allocation means nothing was attached, or the caller is a test of the text path.
  if (!allocation || allocation.slots.length === 0) {
    const hasAny = references.length > 0;
    return {
      text: hasAny
        ? bullets(references.map((r) => `Image ${r.index}: ${r.role}${r.filename ? ` (${r.filename})` : ""}`))
        : "  No reference image is attached. Nothing may be copied from a photograph, and no\n" +
          "  brand mark may be drawn, because none was supplied.",
      unsafePanels,
      warnings: hasAny ? [] : [],
    };
  }

  const byId = new Map(references.map((r) => [String(r.index), r]));
  const lines: string[] = [];

  for (const slot of allocation.slots) {
    lines.push(describeSlot(slot, byId, minPanelLongestSidePx, unsafePanels));
  }

  // The logo question, answered explicitly either way.
  const logoPanel = allocation.slots.some((s) => s.panels.some((p) => p.role === "logo"));
  if (logoPanel) {
    lines.push(
      "The logo appears on the sheet as a small separate strip labelled LOGO. Reproduce that " +
        "mark exactly as supplied, once, and do not redraw, restyle or re-letter it.",
    );
  } else {
    const logoDropped = allocation.dropped.some((d) => /logo/i.test(d.what) || /logo/i.test(d.reason_vi));
    lines.push(
      logoDropped
        ? "NO LOGO IMAGE IS ATTACHED. A logo was supplied but could not travel as an image, so it " +
            "is described in words only. Do NOT ask for a logo, brand mark, wordmark or emblem to be " +
            "drawn, reconstructed or approximated anywhere in the picture."
        : "NO LOGO IMAGE IS ATTACHED. Do NOT ask for a logo, brand mark, wordmark or emblem to be " +
            "drawn anywhere in the picture.",
    );
    if (logoDropped) warnings.push("the logo image did not fit and travels as text only");
  }

  if (allocation.packed) {
    lines.push(
      "The panel letters, the borders between panels and the flat grey ground are annotations " +
        "on a contact sheet. They are not part of any product and must never appear in the " +
        "rendered image.",
    );
  }

  for (const dropped of allocation.dropped) {
    warnings.push(`not attached: ${dropped.what} — ${dropped.reason_vi}`);
  }

  return { text: lines.map((l) => `  ${l}`).join("\n"), unsafePanels, warnings };
}

function describeSlot(
  slot: AllocatedSlot,
  byId: Map<string, GptReference>,
  floor: number,
  unsafePanels: CompiledGptBrief["unsafePanels"],
): string {
  const products = slot.panels.filter((p) => p.role === "product");

  if (slot.kind === "single" && slot.panels.length === 1) {
    const panel = slot.panels[0];
    const ref = byId.get(panel.sourceImageId);
    const what = panel.role === "logo" ? "the logo, as supplied" : describeProduct(ref);
    const lock =
      panel.role === "logo"
        ? "Reproduce it exactly once, as supplied, and do not redraw or restyle it."
        : "Preserve its exact shape, proportions, colours, materials and label layout. Do not " +
          "redesign it and do not re-letter it.";
    return `Image ${slot.index} is ${what}. ${lock}`;
  }

  // A contact sheet.
  const panelText = slot.panels
    .map((p) => {
      const ref = byId.get(p.sourceImageId);
      if (p.role === "logo") return `the strip labelled LOGO is the supplied logo`;
      const longest = Math.max(p.outWidth, p.outHeight);
      const unsafe = longest < floor;
      if (unsafe) unsafePanels.push({ slot: slot.index, label: p.label, longestSidePx: longest });
      return `panel ${p.label} is ${describeProduct(ref)}`;
    })
    .join(", ");

  const smallHere = unsafePanels.filter((u) => u.slot === slot.index);
  const legibility = smallHere.length
    ? ` The lettering on ${
        smallHere.length === slot.panels.length ? "these panels" : `panel${smallHere.length > 1 ? "s" : ""} ${smallHere.map((u) => u.label).join(", ")}`
      } is NOT large enough to read reliably: take shape, proportions, colours and materials from the panel, and take any wording from the product facts below. Do not instruct that the panel's lettering be copied.`
    : "";

  return (
    `Image ${slot.index} is a reference sheet of ${products.length} product photograph${products.length === 1 ? "" : "s"} ` +
    `in panels: ${panelText}. Preserve each product's exact shape, proportions, colours, materials and ` +
    `label layout; do not redesign them and do not re-letter them.${legibility}`
  );
}

function describeProduct(ref: GptReference | undefined): string {
  if (!ref) return "a supplied product photograph";
  const desc = trim(ref.description);
  if (desc) return desc;
  const file = trim(ref.filename);
  return file ? `the product in ${file}` : "a supplied product photograph";
}

/** Section F. Verbatim, NFC, with the roles the layout needs. */
export function renderCopy(copy: string[]): string {
  const kept = copy.map(nfc).filter((c) => c.trim());
  if (!kept.length) {
    return (
      "  NO COPY. The TEXT section of the master prompt must be exactly:\n" +
      '  "No text of any kind anywhere in the image."'
    );
  }
  const roles = kept.map((line, i) => {
    const role = i === 0 ? "headline" : i === kept.length - 1 && kept.length > 2 ? "call to action" : "supporting line";
    return `  ${i + 1}. [${role}] "${line}"`;
  });
  return (
    roles.join("\n") +
    "\n  Every string above appears in the image exactly once, verbatim, character for " +
    "character, in straight double quotes in the TEXT section. Vietnamese keeps every " +
    "diacritic, in NFC. No string may be added, shortened, translated or corrected."
  );
}

export function compileGptBrief(input: GptBriefInput): CompiledGptBrief {
  const copy = input.copy.map(nfc).filter((c) => c.trim());
  const floor = input.minPanelLongestSidePx ?? 512;
  const refs = renderAllocatedReferences(input.allocation, input.references, floor);

  const warnings = [...refs.warnings];
  const orientation = ORIENTATION[trim(input.aspectRatio)] || "square";

  const userChoices: string[] = [];
  for (const c of input.userControls || []) {
    userChoices.push(`${c.label}: ${c.instruction}`);
  }
  if (input.userApproach) {
    userChoices.push(`Creative approach the client chose — ${input.userApproach.label}: ${input.userApproach.directive}`);
  }

  const strategy: string[] = [];
  for (const s of input.strategy || []) {
    if (trim(s.text)) strategy.push(`${s.label}: ${s.text}`);
  }
  // The controls the SYSTEM resolved. These never reached the Gemini v2 brief at all —
  // `ExperimentPipeline.ts:1364` passes the raw control ids, so a value the system
  // detected from the concept was invisible to the director.
  for (const c of input.resolvedControls || []) {
    strategy.push(`${c.label} (${c.source}): ${c.value}`);
  }
  if (input.inferredApproach) {
    strategy.push(
      `Creative approach the system inferred — ${input.inferredApproach.label} ` +
        `(${input.inferredApproach.reason}): ${input.inferredApproach.directive}`,
    );
  }

  const brandKitLines: string[] = [];
  if (input.brandKit) {
    const k = input.brandKit;
    for (const c of k.colors || []) {
      if (trim(c.hex)) brandKitLines.push(`colour ${c.hex}${c.role ? ` (${c.role})` : ""}`);
    }
    if (trim(k.fonts?.heading)) brandKitLines.push(`headline type feels like ${k.fonts!.heading}`);
    if (trim(k.fonts?.body)) brandKitLines.push(`body type feels like ${k.fonts!.body}`);
    if (trim(k.typographyPreference)) brandKitLines.push(`typography: ${k.typographyPreference}`);
    if ((k.stylePreferred || []).length) brandKitLines.push(`preferred style: ${k.stylePreferred!.join(", ")}`);
    if ((k.styleForbidden || []).length) brandKitLines.push(`never: ${k.styleForbidden!.join(", ")}`);
    brandKitLines.push(
      k.hasLogoImage
        ? "the logo is supplied as an image; use only that mark, as-is, exactly once"
        : "no logo image is supplied, so no brand mark may be rendered at all",
    );
  }

  const slots: Record<string, string> = {
    DELIVERABLE: `a finished, publishable ${trim(input.assetType) || "poster"}`,
    ASSET_TYPE: trim(input.assetType) || "poster",
    INDUSTRY: trim(input.industry) || "(not stated)",
    ORIENTATION: `${orientation} (the ratio travels as a parameter; never write ratio digits)`,
    PRODUCT_COUNT: String(input.productCount ?? input.references.filter((r) => r.role !== "LOGO").length),
    INTENDED_USE: trim(input.intendedUse) || "(not stated)",
    BRAND: trim(input.brand) || "(not stated by the client)",
    CONCEPT: trim(input.concept) || "(the client left the concept empty)",
    REFERENCES: refs.text,
    PRODUCT_FACTS: bullets(input.productFacts || []),
    BRAND_KIT: bullets(brandKitLines),
    COPY: renderCopy(copy),
    USER_CHOICES: userChoices.length
      ? bullets(userChoices) + "\n  These are the client speaking. They are binding and outrank everything advisory."
      : "  (the client set no explicit visual choices)",
    STRATEGY: strategy.length
      ? bullets(strategy) + "\n  Advisory. Use what helps; the client's own words in section B win any conflict."
      : NONE,
    REFERENCE_DATA: (input.referenceData || []).length
      ? bullets((input.referenceData || []).map((d) => `${d.label}: ${d.value}`))
      : NONE,
    PLAYBOOK: "", // filled by the caller from the playbook file
    INDUSTRY_MODULE: trim(input.industryModule) || "(neutral studio treatment)",
    PRODUCT_COUNT_RULE: trim(input.productCountRule) || "(one focal point)",
    MODEL_NOTES: trim(input.modelNotes) || "(none beyond the standing instructions)",
    MIN_CHARS: String(input.minChars ?? 1200),
    MAX_CHARS: String(input.maxChars ?? 3500),
    GOLD_EXAMPLE: "", // filled by the caller from the gold file
  };

  if (refs.unsafePanels.length) {
    warnings.push(
      `${refs.unsafePanels.length} product panel(s) are below the ${floor}px identity floor; ` +
        `the brief forbids label-locking from them`,
    );
  }

  return { slots, warnings, unsafePanels: refs.unsafePanels };
}
