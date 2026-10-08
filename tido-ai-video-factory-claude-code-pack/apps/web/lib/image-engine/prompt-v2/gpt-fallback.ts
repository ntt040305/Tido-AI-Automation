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
import { industryLabel } from "./art-direction/industry-label";
import {
  renderArrangement,
  renderCamera,
  renderColour,
  renderLayout,
  renderLighting,
  renderRealism,
  renderSet,
} from "./art-direction/art-direction-brief";
import type { ArtDirectionSheet } from "./art-direction/art-direction-sheet";
import type { PrintRule } from "./art-direction/print-rule";
import type { NumericWordsDensity } from "./engine-selector";

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
/**
 * Bullet lines flattened into prose: dashes removed, each line a sentence.
 *
 * Capitalised, because the sheet's clauses are written as clauses — "a clear, even margin
 * on every side" — and a prompt made of lowercase sentence-starts reads as a dumped list,
 * which is the thing this whole path exists to stop being.
 */
function flatten(block: string): string {
  return String(block || "")
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((l) => l && l !== "(none)")
    .map((l) => (/[.!?]$/.test(l) ? l : `${l}.`))
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
    .join(" ");
}

/**
 * The manifest, as the TEXT section. Every string once, with its part and its place.
 *
 * GROUPED by part and place, not one clause per string. Measured on the Florian fixture:
 * nine strings, six of them price lines sharing one position, produced 1,437 characters of
 * which about seven hundred were the same placement sentence repeated. The client's words
 * are untouchable; the scaffolding around them is not.
 */
function manifestText(sheet: ArtDirectionSheet): string {
  if (!sheet.text_manifest.length) return "No text of any kind anywhere in the image.";

  const groups: Array<{ role: string; position: string; strings: string[] }> = [];
  for (const m of sheet.text_manifest) {
    const last = groups[groups.length - 1];
    // Only CONSECUTIVE entries are grouped, so the reading order the manifest states is
    // the reading order the prompt states.
    if (last && last.role === m.role && last.position === m.position) last.strings.push(m.exact_string);
    else groups.push({ role: m.role, position: m.position, strings: [m.exact_string] });
  }

  const clauses = groups.map((g) => {
    const quoted = g.strings.map((s) => `"${s}"`).join("; ");
    return g.strings.length === 1
      ? `as the ${g.role}, ${g.position}: ${quoted}`
      : `as ${g.role}s, ${g.position}: ${quoted}`;
  });

  return (
    `Set each of the following exactly once, and nothing else — ${clauses.join(". Then ")}. ` +
    `${sheet.typography.hierarchy.charAt(0).toUpperCase()}${sheet.typography.hierarchy.slice(1)}. ` +
    `${sheet.typography.treatment_over_texture.charAt(0).toUpperCase()}${sheet.typography.treatment_over_texture.slice(1)}. ` +
    "Render every Vietnamese diacritic exactly as written. " +
    "No other text, numbers, watermarks or extra logos."
  );
}

/**
 * The art-director fallback: the same nine sections, written from the sheet.
 *
 * It exists for the same reason the plain one does — the director failed twice and
 * something correct still has to be sent — but it has more to work with, because the sheet
 * already resolved every decision. So this is not a degraded prompt; it is the sheet
 * without the prose.
 *
 * It must pass `runGptChecks` INCLUDING the art-director rule set, by construction. That
 * is the reason the industry goes through `industryLabel` here and the print rule is
 * emitted exactly once: a fallback that fails the checks is a render that fails outright,
 * since this dialect has no v1 to fall through to.
 */
function buildSheetFallbackPrompt(
  input: GptBriefInput,
  sheet: ArtDirectionSheet,
  printRule: PrintRule,
  density: NumericWordsDensity,
): string {
  const floor = input.minPanelLongestSidePx ?? 512;
  const orientation = ORIENTATION[trim(input.aspectRatio)] || "square";
  const asset = trim(input.assetType) || "poster";
  const brand = trim(input.brand) || "the brand";
  const use = trim(input.intendedUse) || "a commercial placement";
  const heroProduct = sheet.products.find((p) => p.id === sheet.hero.id);

  const sections: Record<(typeof MASTER_SECTIONS)[number], string> = {
    // `industryLabel` and not the raw id: the RAW_IDENTIFIER check refuses `coffee_tea`,
    // and it is right to.
    "OUTPUT:": `A ${orientation} ${asset} for ${brand}, a ${industryLabel(input.industry)} brand, for ${use}. Photorealistic, finished and ready to publish.`,
    // `referenceLines` has already named every product, panel by panel, and already said
    // that each keeps its shape, proportions, colours, materials and label layout. The
    // first draft repeated the whole product list and the whole fidelity sentence here, at
    // six hundred characters, and said nothing the renderer had not just been told.
    // What is NOT already stated is which product leads, and the print rule.
    "REFERENCE IMAGES:":
      `${referenceLines(input.allocation, input, floor)} ` +
      `${heroProduct ? `The hero — the product the picture is about — is ${unquote(heroProduct.description)}. ` : ""}` +
      `${printRule.text}`,
    "SCENE & CONCEPT:": `${unquote(sheet.big_idea)} The mood is ${sheet.mood}. ${flatten(renderSet(sheet))}`,
    "SUBJECT ARRANGEMENT:": flatten(renderArrangement(sheet, density)),
    "COMPOSITION & LAYOUT:": flatten(renderLayout(sheet, density)),
    "LIGHT / CAMERA / MATERIALS:":
      `${flatten(renderCamera(sheet))} ${flatten(renderLighting(sheet))} ${flatten(renderRealism(sheet))}` +
      (heroProduct && heroProduct.material === "unverified"
        ? " Take every surface and material from the photographs rather than naming one."
        : ""),
    "COLOR & BRAND STYLE:": flatten(renderColour(sheet, density)),
    "TEXT:": manifestText(sheet),
    // The print rule is NOT repeated here: exactly one statement about branding is the
    // whole contract, and the checks count the branches.
    //
    // And the fidelity restatement deliberately avoids the words "exactly as photographed".
    // That phrase is the MARKER for the photographed-branding branch, so on a brief with a
    // supplied logo this sentence used to raise the branch count to two — caught by
    // PRINT_RULE_BRANCHES on the brand-kit fixture, which is what the check is for.
    "CONSTRAINTS:": `${sheet.negatives.join(". ")}.${
      sheet.set.exclusions.length ? ` ${sheet.set.exclusions.map((e) => unquote(e)).join(". ")}.` : ""
    } Every product is reproduced as supplied in the reference photographs, and only the strings listed above are set.`,
  };

  return MASTER_SECTIONS.map((heading) => `${heading} ${sections[heading]}`).join("\n\n");
}

export function buildGptFallbackPrompt(input: GptBriefInput, playbookText: string): string {
  // The art-director path, when the sheet exists. Nothing below changes for anyone else.
  if (input.artDirector && input.sheet && input.printRule) {
    return buildSheetFallbackPrompt(input, input.sheet, input.printRule, input.density ?? "words_only");
  }
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
