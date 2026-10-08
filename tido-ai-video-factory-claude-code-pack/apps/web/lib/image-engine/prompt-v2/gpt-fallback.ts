/**
 * The prompt built in code, used when the director failed and the repair failed too.
 *
 * WHY NOT FALL BACK TO v1
 * -----------------------
 * Because v1 writes Gemini dialect. Sending Sunburst a ~26,000-character prompt built for
 * a different model produces an image that looks like a result and costs 150-250 VND, and
 * the only symptom is that the picture is worse than it should be — which is exactly the
 * failure mode that hid for a whole phase when `__dirname` broke the template read. The
 * standing rule is: never v1 for this dialect.
 *
 * So this exists instead. It is deliberately plain: it assembles the nine sections from
 * the same brief data the director was given, in prose, with no creative decision of its
 * own beyond the playbook's defaults. A dull prompt that is correct beats a good prompt
 * written for another model.
 *
 * It must pass `runGptChecks` by construction. If it ever does not, the checks are right
 * and this is wrong.
 *
 * Pure. No I/O, no model call.
 */
import { MASTER_SECTIONS, ORIENTATION, layoutFor, type GptBriefInput } from "./gpt-brief";
import { fillSlots } from "./templates";
import type { Allocation } from "../provider/reference-packing/reference-allocation";

const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");

function trim(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Strips double quotes from anything that is not the client's copy.
 *
 * The contract allows exactly one kind of quoted string in a master prompt: a line the
 * client asked to have set. Product facts legitimately contain label wording — `label
 * reads "COLD BREW / ARABICA"` — and quoting it there made the checks read it as invented
 * copy, correctly. The information is kept; the quotation marks are not. The dialect
 * already permits unquoted lettering for exactly this.
 */
function unquote(text: string): string {
  return text.replace(/["“”]/g, "");
}

/** "Image 1 is …" for every slot the allocator returned. */
function referenceLines(
  allocation: Allocation | null | undefined,
  input: GptBriefInput,
  floor: number,
): string {
  if (!allocation || allocation.slots.length === 0) {
    return (
      "No reference image is attached, so nothing is copied from a photograph and no brand " +
      "mark is drawn."
    );
  }
  const byIndex = new Map(input.references.map((r) => [String(r.index), r]));
  const out: string[] = [];
  let anyUnsafe = false;

  for (const slot of allocation.slots) {
    if (slot.kind === "single" && slot.panels.length === 1) {
      const panel = slot.panels[0];
      const ref = byIndex.get(panel.sourceImageId);
      if (panel.role === "logo") {
        out.push(
          `Image ${slot.index} is the supplied logo. Reproduce it exactly as supplied, once, and do not redraw or restyle it.`,
        );
      } else {
        out.push(
          `Image ${slot.index} is ${trim(ref?.description) || "the product"}. Preserve its exact shape, proportions, colours, materials and label layout; do not redesign it and do not re-letter it.`,
        );
      }
      continue;
    }
    const panels = slot.panels
      .map((p) => {
        if (p.role === "logo") return "the strip labelled LOGO is the supplied logo";
        const ref = byIndex.get(p.sourceImageId);
        if (Math.max(p.outWidth, p.outHeight) < floor) anyUnsafe = true;
        return `panel ${p.label} is ${trim(ref?.description) || "a supplied product"}`;
      })
      .join(", ");
    out.push(
      `Image ${slot.index} is a reference sheet in panels: ${panels}. Preserve each product's exact shape, proportions, colours, materials and label layout; do not redesign them and do not re-letter them.`,
    );
  }

  if (allocation.packed) {
    out.push(
      "The panel letters, the borders between panels and the flat grey ground are annotations and must not appear in the rendered image.",
    );
  }
  if (anyUnsafe) {
    out.push(
      "Some panels are too small for their lettering to be read reliably; take shape, proportions, colours and materials from those panels and do not reproduce their lettering.",
    );
  }
  const hasLogoImage = allocation.slots.some((s) => s.panels.some((p) => p.role === "logo"));
  if (!hasLogoImage) {
    out.push("No logo image is attached, so no logo, brand mark or emblem is drawn anywhere.");
  }
  return out.join(" ");
}

function textLines(copy: string[]): string {
  const kept = copy.map(nfc).filter((c) => c.trim());
  if (!kept.length) return "No text of any kind anywhere in the image.";
  const placed = kept.map((line, i) => {
    const where =
      i === 0
        ? "in the upper area, as the headline, large and first to be read"
        : i === kept.length - 1 && kept.length > 2
          ? "near the lower edge, small, as the call to action"
          : "directly below the headline, smaller and lighter";
    return `${where}: "${line}"`;
  });
  return (
    `Set each of the following exactly once, ${placed.join("; ")}. ` +
    "Render every Vietnamese diacritic exactly. " +
    "No other text, numbers, watermarks or extra logos."
  );
}

/**
 * The prompt, assembled.
 *
 * Padded to the contract's lower bound with the playbook's own defaults rather than with
 * filler: a prompt that fails the length check cannot be sent, and the honest way to make
 * it longer is to say more of what the playbook already decided.
 */
export function buildGptFallbackPrompt(input: GptBriefInput, playbookText: string): string {
  const floor = input.minPanelLongestSidePx ?? 512;
  const orientation = ORIENTATION[trim(input.aspectRatio)] || "square";
  const asset = trim(input.assetType) || "poster";
  const brand = trim(input.brand) || "the brand";
  const industry = trim(input.industry) || "general consumer goods";
  const use = trim(input.intendedUse) || "a commercial placement";
  const concept = trim(input.concept);
  const facts = (input.productFacts || []).map(trim).filter(Boolean).map(unquote);

  const colours = (input.brandKit?.colors || []).map((c) => trim(c.hex)).filter(Boolean);
  const preferred = (input.brandKit?.stylePreferred || []).map(trim).filter(Boolean);
  const forbidden = (input.brandKit?.styleForbidden || []).map(trim).filter(Boolean);

  const approach = input.userApproach || input.inferredApproach || null;

  // The playbook, as sentences rather than as a block with its own headings.
  const playbookSentences = fillSlots(String(playbookText || ""), {
    ASPECT_RATIO: input.aspectRatio,
    LAYOUT: layoutFor(input.aspectRatio),
  })
    .split("\n")
    .map((l) => l.replace(/^[A-Z][A-Z \-—]*:\s*/, "").trim())
    .filter((l) => l && !/^\{\{/.test(l) && !/^status:/.test(l))
    .join(" ");

  const sections: Record<(typeof MASTER_SECTIONS)[number], string> = {
    "OUTPUT:": `A ${orientation} ${asset} for ${brand}, ${industry}, for ${use}. Photorealistic, finished and ready to publish.`,
    "REFERENCE IMAGES:": referenceLines(input.allocation, input, floor),
    "SCENE & CONCEPT:": concept
      ? `${unquote(concept)}`
      : `The product presented plainly and attractively, with one clear idea and nothing competing with it.`,
    "SUBJECT ARRANGEMENT:": `${
      input.productCount && input.productCount > 1
        ? `The ${input.productCount} products are grouped with a clear hierarchy, the main product largest and nearest, none of them deformed or duplicated.`
        : "One product, one focal point, placed so nothing competes with it."
    }`,
    "COMPOSITION & LAYOUT:": `${unquote(playbookSentences) || "A clear reading order with generous margins and one focal point."} Text sits in the calmest area the composition leaves and never over the product.`,
    "LIGHT / CAMERA / MATERIALS:": `${
      unquote(trim(input.industryModule)) || "Neutral studio lighting: a soft key that models the form, a rim that separates the subject from the background, and a soft contact shadow."
    }${facts.length ? ` Materials and surfaces as supplied: ${facts.join("; ")}.` : ""} Shallow depth of field so the background falls gently out of focus.`,
    "COLOR & BRAND STYLE:": `${
      colours.length ? `Built on ${colours.join(" and ")}.` : "A restrained palette of two colours, the second almost absent."
    }${preferred.length ? ` The look is ${unquote(preferred.join(", "))}.` : ""}${
      approach ? ` ${unquote(approach.directive)}` : ""
    }`,
    "TEXT:": textLines(input.copy),
    "CONSTRAINTS:": `No people other than those described. No second copy of the product. No invented lettering of any kind. No brand mark other than one supplied as an image.${
      forbidden.length ? ` Avoid: ${unquote(forbidden.join(", "))}.` : ""
    }`,
  };

  return MASTER_SECTIONS.map((heading) => `${heading} ${sections[heading]}`).join("\n\n");
}
