/**
 * The print rule: what happens to branding that is already on the product.
 *
 * THE LIVE CONTRADICTION THIS FIXES
 * ---------------------------------
 * Measured on a real render. The prompt said:
 *
 *   "No logo image is supplied; do not draw or render any logo, wordmark, or brand icon."
 *
 * while the attached photographs were five cups with the brand printed on them. The two
 * instructions cannot both be obeyed. The model has to either erase branding off a
 * product it was told to preserve exactly, or disobey the sentence — and which one it
 * picks is not something the prompt decided.
 *
 * The rule the old text was reaching for is "do not INVENT a mark". That is a different
 * sentence from "do not draw any mark", and the difference is a whole class of wrong
 * render.
 *
 * THREE BRANCHES, EXACTLY ONE PRESENT
 * -----------------------------------
 *   supplied_logo         the client gave a logo image → use that mark, unaltered.
 *   photographed_branding no logo image → keep what the photographs show, invent nothing.
 *   detected_branding     RESERVED for Phase 3, when a vision pass can state what is
 *                         actually printed on each product. Typed, selectable, and never
 *                         chosen in this round because nothing produces its input yet.
 *
 * "Exactly one" is enforced, not hoped for: each branch carries a distinctive marker
 * sentence, the brief tells the director to carry that sentence through verbatim, and
 * `gpt-checks` fails a prompt in which the marker count is not one. Two print rules in a
 * prompt is the same defect as the live one, just better hidden.
 *
 * NOTHING IS DELETED FOR THIS
 * ---------------------------
 * `gpt-brief.ts` keeps its original two-branch logo text, and that is still what a
 * flag-OFF render gets. This is an additional, selectable rule.
 *
 * Pure. No I/O, no clock, no model call.
 */

export type PrintRuleBranch = "supplied_logo" | "photographed_branding" | "detected_branding";

export interface PrintRule {
  branch: PrintRuleBranch;
  /** The sentence the prompt must carry. Verbatim — the check looks for its marker. */
  text: string;
  /** Why this branch and not another. For the sheet's record, never for the prompt. */
  reason: string;
}

/**
 * The marker phrase per branch.
 *
 * Chosen to be distinctive enough that a paraphrase does not accidentally match another
 * branch's marker, and short enough that a director carrying the sentence through keeps
 * it intact. Exported because the checks and the tests must look for the same strings the
 * brief writes — two copies of these would drift.
 */
export const PRINT_RULE_MARKERS: Record<PrintRuleBranch, string> = {
  supplied_logo: "the supplied logo exactly as given",
  photographed_branding: "exactly as photographed",
  detected_branding: "the printed branding recorded below",
};

export interface PrintRuleInput {
  /** A logo arrived as an image and will be attached. */
  hasLogoImage: boolean;
  /**
   * What a vision pass read off the product photographs.
   *
   * RESERVED. Phase 3 fills it; nothing in this round does, so the third branch is
   * unreachable today. The hook is typed now because adding it later would mean changing
   * this function's signature, its callers and the checks at the same time — and the
   * whole point of a reserved branch is that Phase 3 only has to supply data.
   */
  detectedPrintedBranding?: Array<{ product: string; reads: string }> | null;
}

/**
 * Which branch applies, and the sentence for it.
 *
 * Order matters and is the product decision: a supplied logo outranks anything read off a
 * photograph, because the client handing over a logo file is the client telling you which
 * mark is correct.
 */
export function printRuleFor(input: PrintRuleInput): PrintRule {
  if (input.hasLogoImage) {
    return {
      branch: "supplied_logo",
      text:
        `Use ${PRINT_RULE_MARKERS.supplied_logo}: reproduce it once, at the proportions supplied, ` +
        `without altering, restyling, re-lettering, recolouring or adding to it. Keep any branding ` +
        `already printed on the product photographs as photographed. Draw no other logo, wordmark, ` +
        `emblem or icon anywhere in the picture.`,
      reason: "the client supplied a logo image, so that mark is the authority",
    };
  }

  const detected = (input.detectedPrintedBranding || []).filter((d) => d && String(d.reads).trim());
  if (detected.length) {
    // Unreachable in this round: nothing populates the input. Written now so Phase 3 is a
    // data change rather than a signature change.
    return {
      branch: "detected_branding",
      text:
        `Reproduce ${PRINT_RULE_MARKERS.detected_branding} on each product exactly as recorded — same ` +
        `wording, same position, same size, same artwork — and nothing else. Draw no other logo, ` +
        `wordmark, emblem or icon anywhere in the picture.`,
      reason: `a vision pass read branding on ${detected.length} product photograph(s)`,
    };
  }

  return {
    branch: "photographed_branding",
    text:
      `Keep any branding already printed on the product photographs ${PRINT_RULE_MARKERS.photographed_branding} ` +
      `— same artwork, same position, same size. Where it is not clearly legible, leave that area clean ` +
      `rather than guessing at letters. Draw no other logo, wordmark, emblem or icon anywhere in the picture.`,
    reason: "no logo image was supplied, so the photographs are the only authority on branding",
  };
}

/**
 * How many branch markers a piece of text contains. Must be 1 in a finished prompt.
 *
 * Counts DISTINCT branches rather than occurrences, because a director that restates the
 * same rule in the REFERENCE and CONSTRAINTS sections has not contradicted itself — and
 * the contract asks for fidelity to be restated at the end. Two different branches is the
 * defect.
 */
export function printRuleBranchesIn(text: string): PrintRuleBranch[] {
  const haystack = String(text || "").toLowerCase();
  return (Object.keys(PRINT_RULE_MARKERS) as PrintRuleBranch[]).filter((branch) =>
    haystack.includes(PRINT_RULE_MARKERS[branch].toLowerCase()),
  );
}
