/**
 * One vision pass over the packed reference sheets, so "unverified" becomes a fact.
 *
 * WHAT IT REPLACES
 * ----------------
 * Today the Art Direction Sheet marks every product's material, size class and printed
 * branding `unverified`, and says so in the brief: "material unverified, take it from the
 * photograph". That is honest, and it is also the reason the derivation cannot do its best
 * work. Material is not decoration — it decides the light. A transparent cup needs a
 * backlight; a matte box needs a raking light; a metal device needs a controlled strip
 * reflection. Guessing any of those from the INDUSTRY is exactly what this system forbids,
 * so the only way to know is to look.
 *
 * ONE CALL, OVER THE SHEETS THE PROVIDER WILL GET
 * -----------------------------------------------
 * Not one call per product. The products have already been packed into at most two contact
 * sheets with lettered panels, and those sheets are what the renderer receives — so a
 * single call that reads them answers every product at once, costs one request, and talks
 * about panels in the same language section C of the brief uses.
 *
 * NO NEW PROVIDER
 * ---------------
 * It goes through `LLMProviderService.generateChatCompletion` with `image_url` content,
 * which is the same transport `InspirationStyleIntelligenceService` has used since the
 * inspiration layer shipped. The client is injected so tests can mock it.
 *
 * NEVER BLOCKS A RENDER
 * ---------------------
 * Invalid JSON, a schema violation, a timeout, a thrown client — all of it logs and
 * returns null, and a null puts the sheet back on today's `unverified` defaults. A vision
 * pass that can fail a paid render is worse than no vision pass: the render is the thing
 * the user asked for, and the material is an improvement to it.
 */
import crypto from "crypto";
import { z } from "zod";

import type { Allocation } from "../../provider/reference-packing/reference-allocation";

/** Bumped when the prompt changes, so a cached answer to an older question is not reused. */
export const PRODUCT_VISION_PROMPT_VERSION = "pv1";

/**
 * What one product's panel yields.
 *
 * `materials` is free-form and multi-label on purpose: a cup is "glass, plastic lid, paper
 * sleeve" and forcing that into one enum would throw away the thing the lighting rules need
 * most, which is that the DOMINANT material is glass and there is a secondary.
 */
export const ProductVisionItemSchema = z.object({
  /** The panel letter, or "1"/"2" for a whole slot that holds one product. */
  panel: z.string(),
  materials: z.array(z.string()).default([]),
  /** Free text, not an enum: "fits in a hand", "tabletop", "furniture-sized". */
  size_class: z.string().default(""),
  dominant_colours: z.array(z.string()).default([]),
  printed_branding: z.object({
    present: z.boolean(),
    description: z.string().default(""),
    /** False when the model can see that something is printed but cannot read it. */
    legible: z.boolean(),
  }),
  notes: z.string().default(""),
});

export const ProductVisionSchema = z.object({
  products: z.array(ProductVisionItemSchema),
});

export type ProductVisionItem = z.infer<typeof ProductVisionItemSchema>;
export type ProductVision = z.infer<typeof ProductVisionSchema>;

/**
 * The cache key: the bytes plus the question.
 *
 * The buffers, because the same products re-uploaded are the same answer; the prompt
 * version, because a cached answer to a question we no longer ask is worse than no cache.
 */
export function visionCacheKey(buffers: Buffer[], promptVersion = PRODUCT_VISION_PROMPT_VERSION): string {
  const hash = crypto.createHash("sha256");
  hash.update(promptVersion);
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest("hex").slice(0, 32);
}

/** Process-local, bounded. Not a source of truth, and losing it costs one call. */
const CACHE_MAX = 64;
const cache = new Map<string, ProductVision>();

export function cachedVision(key: string): ProductVision | undefined {
  return cache.get(key);
}

export function cacheVision(key: string, value: ProductVision): void {
  // Oldest out first. A Map keeps insertion order, so the first key is the oldest.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** For tests, and for a process that wants a cold read. */
export function clearVisionCache(): void {
  cache.clear();
}

/**
 * The panels the call should be asked about, in the order section C names them.
 *
 * Derived from the ALLOCATION rather than from the upload list, for the same reason section
 * C is: the model is looking at sheets, and a question about "product 5" is a question about
 * something it cannot see.
 */
export function panelsToAsk(allocation: Allocation | null | undefined): Array<{ slot: number; panel: string }> {
  if (!allocation) return [];
  const out: Array<{ slot: number; panel: string }> = [];
  for (const slot of allocation.slots) {
    for (const panel of slot.panels) {
      if (panel.role !== "product") continue;
      out.push({ slot: slot.index, panel: slot.kind === "single" ? String(slot.index) : panel.label });
    }
  }
  return out;
}

const SYSTEM =
  "You are a product photographer looking at reference photographs. You report only what " +
  "you can SEE. You never infer a material from what a product is for, never guess at " +
  "lettering you cannot read, and never describe a product that is not in the frame.";

/**
 * The question.
 *
 * Written to make the honest answer the easy one: every field has an explicit way to say
 * "I cannot tell", because a model with no way to express uncertainty invents a value. The
 * `legible` flag exists for exactly the case the 512px floor creates — branding that is
 * visibly present and too small to read.
 */
export function productVisionPrompt(panels: Array<{ slot: number; panel: string }>): string {
  const list = panels.map((p) => `Image ${p.slot}, panel ${p.panel}`).join("; ");
  return [
    `Report on each of these product panels: ${list}.`,
    "",
    "The attached images may be CONTACT SHEETS: several photographs laid out in panels with",
    "a letter above each, on a flat grey ground. The letters, borders and grey ground are",
    "annotations, not products. Report on the photographs only.",
    "",
    "For each panel, answer with:",
    '  materials         every material you can SEE, most dominant first, by visible area.',
    "                    Free text, several allowed: glass, frosted glass, clear plastic,",
    "                    matte plastic, ceramic, metal, brushed metal, paper, card, fabric,",
    "                    leather, wood, liquid, foam, ice — or whatever you actually see.",
    "                    Empty array if you cannot tell.",
    '  size_class        how big the real object is, in plain words: "fits in a hand",',
    '                    "two-handed", "tabletop", "furniture-sized". "" if you cannot tell.',
    "  dominant_colours  up to three, as #rrggbb hex, most dominant first.",
    "  printed_branding  present: is there ANY printed lettering, logo or mark on the product?",
    "                    description: what it says or looks like, as exactly as you can.",
    "                    legible: true ONLY if you can read it with confidence. If you can",
    "                    see that something is printed but cannot read it, present is true",
    "                    and legible is FALSE. Do not guess at letters.",
    "  notes             anything a photographer would need: condensation, wetness, a seam,",
    '                    a specular highlight that will be hard to control. "" if nothing.',
    "",
    "Answer with ONLY a JSON object:",
    '{"products":[{"panel":"A","materials":[],"size_class":"","dominant_colours":[],' +
      '"printed_branding":{"present":false,"description":"","legible":false},"notes":""}]}',
    "",
    "One entry per panel listed above, with `panel` exactly as given. Nothing else.",
  ].join("\n");
}

/** The messages for the call, with the sheets attached. */
export function productVisionMessages(
  panels: Array<{ slot: number; panel: string }>,
  sheets: Array<{ buffer: Buffer; mimeType?: string }>,
): Array<{ role: "system" | "user"; content: unknown }> {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: productVisionPrompt(panels) },
        ...sheets.map((sheet) => ({
          type: "image_url",
          image_url: {
            url: `data:${sheet.mimeType || "image/png"};base64,${sheet.buffer.toString("base64")}`,
            detail: "high",
          },
        })),
      ],
    },
  ];
}

/**
 * Parses and validates, or returns null.
 *
 * Tolerant about where the JSON sits — models wrap it in prose and in fences — and strict
 * about its shape, because a half-parsed answer silently missing `printed_branding` would
 * activate the wrong print-rule branch.
 */
export function parseProductVision(raw: string): ProductVision | null {
  const text = String(raw || "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = ProductVisionSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    // An empty list is not an answer; it is a model declining to answer in valid JSON.
    return parsed.data.products.length ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ProductVisionDeps {
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>;
  /** Default 45s. Past that the render is waiting on an optional improvement. */
  timeoutMs?: number;
}

export interface ProductVisionResult {
  vision: ProductVision | null;
  /** `cache`, `model`, or why it was not obtained. Logged, never sent to a model. */
  source: "cache" | "model" | "skipped" | "failed";
  reason?: string;
}

/**
 * Reads the products, or reports why it could not.
 *
 * Never throws and never rejects. Every failure path returns `vision: null`, which the
 * sheet treats exactly as it treats no vision pass at all.
 */
export async function readProductVision(
  allocation: Allocation | null | undefined,
  sheets: Array<{ buffer: Buffer; mimeType?: string }>,
  deps: ProductVisionDeps,
): Promise<ProductVisionResult> {
  const panels = panelsToAsk(allocation);
  if (!panels.length || !sheets.length) {
    return { vision: null, source: "skipped", reason: "no product panels or no sheet bytes" };
  }

  const key = visionCacheKey(sheets.map((s) => s.buffer));
  const hit = cachedVision(key);
  if (hit) return { vision: hit, source: "cache" };

  const timeoutMs = deps.timeoutMs ?? 45000;
  try {
    // Raced rather than relying on the client's own timeout: this call is optional, and a
    // client that hangs would hold a paid render open behind an improvement to it.
    const raw = await Promise.race([
      deps.chat(productVisionMessages(panels, sheets), "product_vision"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`product vision timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    const vision = parseProductVision(raw);
    if (!vision) {
      return { vision: null, source: "failed", reason: "the reply was not valid product-vision JSON" };
    }
    cacheVision(key, vision);
    return { vision, source: "model" };
  } catch (err) {
    return { vision: null, source: "failed", reason: (err as Error)?.message?.slice(0, 160) || "unknown" };
  }
}

/** Counts and flags only. Never a buffer, never the client's copy. */
export function productVisionTelemetry(result: ProductVisionResult | null | undefined) {
  if (!result) return { product_vision: false };
  return {
    product_vision: true,
    source: result.source,
    products: result.vision?.products.length ?? 0,
    with_materials: result.vision?.products.filter((p) => p.materials.length).length ?? 0,
    with_branding: result.vision?.products.filter((p) => p.printed_branding.present).length ?? 0,
    legible_branding: result.vision?.products.filter((p) => p.printed_branding.legible).length ?? 0,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}
