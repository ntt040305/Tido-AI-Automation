import type { AssetFacet } from "@tido/shared";
import { ASSET_FACETS } from "@tido/shared";

/**
 * Turning an observation into the three texts that get embedded.
 *
 * This is the whole of Phase 3.2.5's judgement, and it is deliberately small
 * and readable, because everything downstream -- the vectors, the rankings, the
 * three questions -- is determined here and nowhere else.
 *
 * THE RULE: ONLY WHAT WAS SEEN
 * -----------------------------
 * Every word that reaches an embedding came out of `VisualDNA.observed` or the
 * `AssetDNA` reading of it. There is no category table, no industry lookup and
 * no style vocabulary. Two ceramic cups land in different places because their
 * finishes were OBSERVED to differ, not because anything here knows what a cup
 * is -- which is the same rule `AssetDNA` was written to hold, and the reason
 * this file reads its output rather than inventing a parallel description.
 *
 * WHY THE FIELD NAME IS EMBEDDED ALONGSIDE THE VALUE
 * ---------------------------------------------------
 * `surface: matte` rather than bare `matte`. The label carries real signal to a
 * text embedder -- it says which KIND of thing the word describes -- and
 * without it two assets sharing the word "warm" in unrelated fields (a warm
 * palette, a warm light) are pulled together by a coincidence of vocabulary.
 *
 * WHY AN EMPTY FACET IS ABSENT RATHER THAN EMPTY
 * -----------------------------------------------
 * An asset whose palette was never read has no `appearance` text, and gets no
 * appearance vector. The alternative -- embedding an empty or boilerplate
 * string -- puts every unread asset at the same point in the space, so they all
 * come back as each other's nearest neighbours. That is not a degraded result,
 * it is a confident wrong one, and it would look like the feature working.
 */

/** A source document, as loosely typed as it actually arrives. */
type Doc = Record<string, unknown> | null | undefined;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Flattens the shapes the analyzer produces: string, string[], or a Decision. */
function valueOf(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(valueOf).filter(Boolean).join(", ");
  if (v && typeof v === "object") {
    // A `Decision` carries its answer in `value`. Its `because` is the
    // reasoning behind the answer and is deliberately NOT embedded: it
    // describes why the engine said something, not what the object is like,
    // and it would drown the observation in explanatory prose.
    const d = v as { value?: unknown };
    if (typeof d.value === "string") return d.value.trim();
  }
  return "";
}

/** `label: value`, or nothing at all when there is no value. */
function field(label: string, v: unknown): string | null {
  const value = valueOf(v);
  return value ? `${label}: ${value}` : null;
}

/**
 * Which observed fields answer which question.
 *
 * Kept as data so the decomposition is readable in one place and arguable. The
 * keys are the analyzer's own field names; nothing is renamed on the way past,
 * so a field added to `VisualDNAObserved` shows up here as a missing line
 * rather than as a silent behaviour change.
 */
const FACET_FIELDS: Record<AssetFacet, { from: "observed" | "treatment"; key: string; label: string }[]> = {
  // Is this the same OBJECT? Physical facts that survive a change of lighting,
  // a change of background and a different photographer.
  identity: [
    { from: "observed", key: "form", label: "form" },
    { from: "observed", key: "materials", label: "material" },
    { from: "observed", key: "finish", label: "finish" },
    { from: "observed", key: "condition", label: "condition" },
    { from: "observed", key: "scale_cues", label: "scale" },
    // A logo is identified by its letterforms, not its colour.
    { from: "observed", key: "letterform", label: "letterform" },
    { from: "observed", key: "geometry", label: "geometry" },
    { from: "observed", key: "weight", label: "weight" },
    { from: "treatment", key: "form", label: "form" },
    { from: "treatment", key: "material", label: "material" },
  ],
  // Does it LOOK alike? What a viewer notices before identifying the object.
  appearance: [
    { from: "observed", key: "palette", label: "palette" },
    { from: "observed", key: "colour", label: "colour" },
    { from: "observed", key: "surface_detail", label: "surface" },
    { from: "observed", key: "finish", label: "finish" },
    { from: "treatment", key: "palette", label: "palette" },
    { from: "treatment", key: "texture", label: "texture" },
  ],
  // Is it TREATED alike? How the photograph was made, rather than what is in
  // it. This is the facet an inspiration reference is mostly made of.
  style: [
    { from: "observed", key: "composition", label: "composition" },
    { from: "observed", key: "light_behaviour", label: "light" },
    { from: "observed", key: "tonal_range", label: "tone" },
    { from: "treatment", key: "personality", label: "character" },
  ],
};

export interface FacetText {
  facet: AssetFacet;
  sourceText: string;
}

/**
 * Builds the facet texts for one asset. Pure, and silent where it saw nothing.
 *
 * Fields are emitted in the declared order rather than the order they happen to
 * appear in the document, so the same observation always produces byte-identical
 * text -- which is what lets the caller skip re-embedding an unchanged asset by
 * comparing strings.
 */
export function facetTexts(observed: Doc, treatment: Doc): FacetText[] {
  const out: FacetText[] = [];

  for (const facet of ASSET_FACETS) {
    const parts: string[] = [];
    const seen = new Set<string>();

    for (const spec of FACET_FIELDS[facet]) {
      const source = spec.from === "observed" ? observed : treatment;
      // One line per LABEL, and the first wins.
      //
      // `form` and `material` are reachable from both the observation and the
      // AssetDNA reading of it, with different words for the same thing --
      // "a straight-sided cylindrical cup" and "a thrown vessel". Emitting
      // both says the object has two forms, and an embedder has no way to know
      // it is reading one fact twice.
      //
      // The observed entries are declared first in FACET_FIELDS, so first-wins
      // gives the observation priority over the reading derived from it. That
      // is the engine's standing authority order -- what was seen outranks what
      // was reasoned -- applied here rather than restated.
      if (seen.has(spec.label)) continue;
      const line = field(spec.label, source?.[spec.key]);
      if (!line) continue;
      seen.add(spec.label);
      parts.push(line);
    }

    // Nothing observed for this question. No text, and therefore no vector --
    // see the note at the top about why an empty one is worse than none.
    if (!parts.length) continue;

    out.push({ facet, sourceText: parts.join(" | ").slice(0, 4000) });
  }

  return out;
}

/**
 * The same three texts, from a stored `asset_memory` row.
 *
 * A separate entry point because the row shape and the in-flight shape differ
 * by their column names, and a caller that had to remember which one it held
 * would eventually pass the wrong one.
 */
export function facetTextsForRow(row: { observed?: Doc; treatment?: Doc }): FacetText[] {
  return facetTexts(row?.observed ?? null, row?.treatment ?? null);
}

/** A short, non-identifying summary for a log line. */
export function facetTelemetry(facets: FacetText[]) {
  return {
    facets: facets.length,
    // Lengths, never the text: an observation describes a customer's product.
    chars: facets.reduce((n, f) => n + f.sourceText.length, 0),
    which: facets.map((f) => f.facet).join(","),
  };
}

export { text as cleanText };
