import type { PackingResult } from "./ReferencePackingTypes";

/**
 * Telling the renderer what the identity sheet is.
 *
 * The packing layer solved transport: four products reach a provider that takes
 * three images. It did not solve meaning. What arrives is a 2x2 grid of
 * letterboxed product photographs with dark label bands, and a renderer given
 * that with no explanation has every reason to read it as a brief — to lay the
 * products out in a grid, to reproduce the grey padding as a background, to
 * paint the words PRODUCT_01 into the picture, or to treat the sheet as a fifth
 * product sitting beside the others.
 *
 * Each of those is a plausible reading of the image. None of them is what it
 * means. This block is the only place the difference is stated.
 *
 * The count problem
 * -----------------
 * The sheet is not the whole payload. Packing also sends the highest-resolution
 * originals alongside it, so a four-product brief arrives as a sheet containing
 * all four plus two of them again at full size. A renderer counting distinct
 * images has six products in front of it and no reason to think otherwise. The
 * protocol says which references are repeats, by name, and states the true
 * count — this is the same duplication hazard the pipeline already guards
 * against elsewhere, arriving through a door the packing layer opened.
 *
 * What this does NOT do
 * --------------------
 * It decides nothing about the picture. Where products go, which one leads, how
 * they relate — all of that is already settled by the creative layer upstream
 * and stated elsewhere in the prompt. This block exists to stop a transport
 * artifact from being mistaken for those decisions, and its last line says so.
 */

const HEADING = "## PACKED_REFERENCE_PROTOCOL";

/**
 * Whether a packing result has anything to communicate.
 *
 * Only a PACKED result does. Pass-through and shed-to-fit send ordinary
 * references and must produce a byte-identical prompt to the one compiled
 * upstream — every single-product render in the system goes through here.
 */
export function needsProtocol(result?: PackingResult | null): boolean {
  return Boolean(result && result.status === "PACKED" && result.packed?.cells?.length);
}

/**
 * The protocol block, or an empty string when there is no sheet.
 *
 * Pure. Same result for the same map, because the request it becomes part of is
 * cached and compared on the assumption that one input makes one request.
 */
export function renderPackedReferenceProtocol(result: PackingResult): string {
  if (!needsProtocol(result)) return "";
  const map = result.packed!;

  // References travelling whole beside the sheet. Each is a product already in
  // the sheet, which is exactly why it has to be named: unexplained, it reads as
  // one more product.
  const companions = result.references
    .filter((r) => r.reference_id !== map.reference_id)
    .map((r) => {
      const cell = map.cells.find((c) => c.source_reference_id === r.reference_id);
      return {
        reference_id: r.reference_id,
        product_id: r.product_id || cell?.product_id,
      };
    });

  const lines: string[] = [
    HEADING,
    "",
    `${map.reference_id} is an identity preservation sheet. It is a container built to carry ` +
      `several product photographs through a provider that accepts a limited number of images. ` +
      `It is not a photograph, not a design, and not an instruction about this image.`,
    "",
    "WHAT TO TAKE FROM IT",
    `Each cell holds one original product reference at its own pixels. Read each product's ` +
      `shape, material, colour, logo, texture and unique details from its cell and carry them ` +
      `into the render exactly as they appear.`,
    "",
    "WHAT IT IS NOT",
    "- It is not a composition reference.",
    "- It is not a layout suggestion.",
    "",
    "RULES",
    "1. Do not reproduce the grid arrangement.",
    "2. Do not place the products where the sheet places them.",
    "3. Do not draw the words PRODUCT_01, PRODUCT_02 or any other label visible in the sheet.",
    "4. Do not render the sheet itself — not its cells, not its borders, not its label bands.",
    "5. The flat grey area around a product inside its cell is padding from the container. It is " +
      "not that product's background and must not appear in the render.",
    "",
    "PACKED_REFERENCE_MAP",
    map.reference_id,
    "",
    "Cell mapping:",
    ...map.cells.map(
      (c) =>
        `- ${c.product_id || c.source_reference_id} (${c.source_reference_id}) → row ${c.row} column ${c.column}`
    ),
    "",
    `Preserve all ${map.contains_products.length || map.cells.length} listed products. Every one of ` +
      `them appears in the render, none is optional, and none may be merged with another.`,
  ];

  if (companions.length) {
    lines.push(
      "",
      "THE SAME PRODUCTS ALSO ARRIVE WHOLE",
      `${companions
        .map((c) => `${c.reference_id}${c.product_id ? ` is ${c.product_id}` : ""}`)
        .join(", ")} — ${companions.length === 1 ? "this is a" : "these are"} full-resolution ` +
        `${companions.length === 1 ? "copy" : "copies"} of ${
          companions.length === 1 ? "a product" : "products"
        } already present in the sheet, supplied at higher detail. ` +
        `${companions.length === 1 ? "It is" : "They are"} the same product${
          companions.length === 1 ? "" : "s"
        }, not additional ones.`,
      `There are ${map.contains_products.length || map.cells.length} distinct products in this brief in total. ` +
        `Counting the images is not how to count the products.`
    );
  }

  lines.push(
    "",
    "Composition is decided by the creative direction stated elsewhere in this prompt, never by " +
      "this sheet."
  );

  return lines.join("\n");
}

/**
 * Appends the protocol to a compiled prompt.
 *
 * Returns the prompt unchanged — the same string, not a copy — when there is no
 * sheet, so nothing about a normal render can be disturbed by this path.
 *
 * Appended rather than inserted. The compiled prompt sets out its own precedence
 * in CONFLICT PRIORITY, and dropping a new authority ahead of that would
 * contradict a section the renderer has already read. This block does not
 * compete with those rules; it says what one of the attached images is.
 */
export function applyPackedReferenceProtocol(prompt: string, result?: PackingResult | null): string {
  if (!needsProtocol(result)) return prompt;
  const block = renderPackedReferenceProtocol(result!);
  if (!block) return prompt;
  return `${prompt}\n\n${block}`;
}

/** Counts and identities only. Never the block, never image content. */
export function protocolTelemetry(result: PackingResult, added: number) {
  return {
    packed_reference: result.packed?.reference_id,
    mapped_products: result.packed?.cells.length ?? 0,
    companion_references: result.references.filter(
      (r) => r.reference_id !== result.packed?.reference_id
    ).length,
    protocol_chars: added,
  };
}
