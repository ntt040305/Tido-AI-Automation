/**
 * MASTER_PROMPT_OPTIMIZATION_V2 — Task 3.
 *
 * What this is
 * -----------
 * A relabelling and reordering pass. The compiled prompt arrives as eighteen
 * architecture-named sections — `## VIEWPOINT DECOUPLING`, `## SCENE-NATIVE
 * PRODUCT INTEGRATION`, `## PROFESSIONAL KNOWLEDGE` — which describe how the
 * compiler is built. A renderer reads them better grouped by what they are
 * about: subject, scene, camera, lighting, material, style, constraints.
 *
 * What it is not
 * -------------
 * A rewriter. Every line of every section is carried across verbatim. Sections
 * move and gain a new heading; their contents do not change. That restriction is
 * what makes the integrity check below meaningful — if nothing is rewritten,
 * then anything missing afterwards was dropped, and dropping is a bug.
 *
 * Why it verifies itself
 * ---------------------
 * This pass runs after `ExactCopyIntegrityValidator`, which is the thing that
 * guarantees the user's literal copy survived compilation. Anything reordering
 * the prompt after that check could lose a headline with nothing left to notice.
 * So the formatter re-checks its own output: every non-trivial line in must be a
 * line out. If that fails, it returns the input unchanged and says so, because a
 * prompt with the old headings is a cosmetic problem and a prompt missing the
 * client's headline is a reprint.
 */

export interface CompactFormatResult {
  prompt: string;
  applied: boolean;
  /** Compact sections that received content, in output order. */
  sections: string[];
  /** Headings that had no compact home and were kept under [ADDITIONAL DIRECTION]. */
  unmapped: string[];
  reason: string;
}

/** The seven compact sections, in the order a renderer reads them. */
const COMPACT_ORDER = [
  "SUBJECT",
  "SCENE",
  "CAMERA",
  "LIGHTING",
  "MATERIAL REALISM",
  "COMMERCIAL STYLE",
  "NEGATIVE CONSTRAINTS",
] as const;

type CompactSection = (typeof COMPACT_ORDER)[number];

/**
 * Which compiled section belongs under which compact heading.
 *
 * Matched on substrings of the `##` heading. A heading matching nothing here is
 * not guessed at — it goes to `[ADDITIONAL DIRECTION]` intact, because inventing
 * a home for an unrecognised section is how a camera instruction ends up filed
 * under lighting and quietly contradicts the real one.
 */
const MAP: { match: string; to: CompactSection }[] = [
  { match: "PRODUCT IDENTITY", to: "SUBJECT" },
  { match: "MULTI-PRODUCT IDENTITY ISOLATION", to: "SUBJECT" },
  { match: "PRODUCT INSTANCE REQUIREMENTS", to: "SUBJECT" },
  { match: "REFERENCE INTERPRETATION", to: "SUBJECT" },
  { match: "REFERENCE SEMANTICS", to: "SUBJECT" },
  { match: "SINGLE REFERENCE POLICY", to: "SUBJECT" },
  { match: "USER BRIEF", to: "SCENE" },
  { match: "SCENE-NATIVE PRODUCT INTEGRATION", to: "SCENE" },
  { match: "COMMERCIAL LAYOUT", to: "SCENE" },
  { match: "TYPOGRAPHY & READABLE COPY", to: "SCENE" },
  { match: "VIEWPOINT DECOUPLING", to: "CAMERA" },
  { match: "ART DIRECTION", to: "LIGHTING" },
  { match: "PROFESSIONAL KNOWLEDGE", to: "MATERIAL REALISM" },
  { match: "BRAND KNOWLEDGE", to: "COMMERCIAL STYLE" },
  { match: "OUTPUT CONTEXT", to: "COMMERCIAL STYLE" },
  { match: "ROLE", to: "COMMERCIAL STYLE" },
  { match: "USER HARD REQUIREMENTS", to: "NEGATIVE CONSTRAINTS" },
  { match: "CONFLICT PRIORITY", to: "NEGATIVE CONSTRAINTS" },
  { match: "FINAL OUTPUT", to: "NEGATIVE CONSTRAINTS" },
];

export class CompactPromptFormatter {
  /**
   * @param budget Characters the formatted prompt may not exceed. Regrouping adds
   *   the compact headings, which costs a little over a hundred characters; on a
   *   prompt with room that is a fair trade for legibility, and on one already at
   *   its ceiling it is not. Omit to format regardless of size.
   */
  public static format(prompt: string, budget?: number): CompactFormatResult {
    const text = String(prompt || "");
    if (!text.trim()) {
      return { prompt: text, applied: false, sections: [], unmapped: [], reason: "Empty prompt." };
    }

    const buckets = new Map<CompactSection, string[]>();
    const unmapped: string[] = [];
    const extra: string[] = [];

    const parts = text.split(/\n(?=## )/);
    const preamble = parts[0].startsWith("## ") ? "" : parts.shift() || "";

    for (const part of parts) {
      const newline = part.indexOf("\n");
      const heading = (newline < 0 ? part : part.slice(0, newline)).replace(/^#+\s*/, "").trim();
      const body = (newline < 0 ? "" : part.slice(newline + 1)).trim();
      if (!body) continue;

      const hit = MAP.find((m) => heading.toUpperCase().includes(m.match));
      if (!hit) {
        unmapped.push(heading);
        extra.push(`${heading}:\n${body}`);
        continue;
      }
      const list = buckets.get(hit.to) || [];
      // The original heading is kept as a label inside the compact section. It
      // costs one short line and it is what keeps two merged sections from
      // reading as one run-on instruction.
      list.push(`${heading}:\n${body}`);
      buckets.set(hit.to, list);
    }

    const out: string[] = [];
    const sections: string[] = [];
    for (const name of COMPACT_ORDER) {
      const content = buckets.get(name);
      if (!content || !content.length) continue;
      sections.push(name);
      out.push(`[${name}]\n${content.join("\n\n")}`);
    }
    if (extra.length) out.push(`[ADDITIONAL DIRECTION]\n${extra.join("\n\n")}`);

    const formatted = [preamble.trim(), out.join("\n\n")].filter(Boolean).join("\n\n").trim();

    // ── The check that makes this safe ────────────────────────────────
    const missing = this.missingLines(text, formatted);
    if (missing.length) {
      return {
        prompt: text,
        applied: false,
        sections: [],
        unmapped,
        reason: `Not applied: ${missing.length} line(s) would have been lost, first: "${missing[0].slice(0, 70)}".`,
      };
    }

    if (typeof budget === "number" && formatted.length > budget && formatted.length > text.length) {
      return {
        prompt: text,
        applied: false,
        sections: [],
        unmapped,
        reason: `Not applied: regrouping would grow the prompt to ${formatted.length}, past the ${budget} budget.`,
      };
    }

    return {
      prompt: formatted,
      applied: true,
      sections,
      unmapped,
      reason: `Regrouped into ${sections.length} compact section(s)${unmapped.length ? `, ${unmapped.length} kept as additional direction` : ""}.`,
    };
  }

  /**
   * Lines present in the input and absent from the output.
   *
   * Headings are excluded — they are deliberately relabelled — and so are very
   * short lines, which are punctuation and separators. What remains is
   * instruction text, and none of it is allowed to go missing.
   */
  private static missingLines(before: string, after: string): string[] {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const present = new Set(after.split("\n").map(norm));
    return before
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 12 && !l.startsWith("#"))
      .filter((l) => !present.has(norm(l)));
  }
}
