/**
 * The GPT dialect, in the shape `ExperimentPipeline` already consumes.
 *
 * WHY AN ADAPTER AND NOT A SECOND BRANCH IN THE PIPELINE
 * -----------------------------------------------------
 * `ExperimentPipeline` reads one object from the prompt engine — `SimpleResult` — at a
 * single place (`:560`), and everything downstream of that line (the version log, the
 * telemetry, the fallback ladder, the final-prompt choice) is written against it. Adding
 * a parallel branch for a second result shape would mean touching all of it, and the
 * Gemini path is the rollback: it has to keep behaving exactly as it does today.
 *
 * So the GPT engine runs here and its result is translated. The pipeline gains one
 * `if` and nothing else.
 *
 * WHAT THIS DOES THAT THE GEMINI PATH DOES NOT
 * --------------------------------------------
 * It computes the reference ALLOCATION before writing the prompt. That is the whole
 * point of the dialect: the provider takes two images, five photographs arrive as two
 * contact sheets, and the prompt has to describe the sheets it will actually be handed.
 * Measured on a live render before this existed — `gen_1791446396500_fjk1e` — the prompt
 * said "exactly as in attached photo 3" while two sheets were attached, so the renderer
 * was told to match a photograph it never received.
 *
 * The allocation is computed twice per render: here, to write section C, and again in
 * the provider, to pack the bytes. That is deliberate. `allocateReferences` is pure and
 * deterministic on the same inputs, so both answers are identical by construction —
 * and the alternative, threading one allocation through the orchestrator into the
 * provider, would restructure the call path for no behavioural gain.
 */
import sharp from "sharp";

import { buildGptPrompt, type GptEngineResult } from "./build-gpt";
import type { GptBriefInput, GptReference } from "./gpt-brief";
import type { SimpleResult } from "./build-simple";
import { activeProfile } from "../models/image-model-profiles";
import { gptArtDirector, numericWordsDensity } from "./engine-selector";
import {
  buildArtDirectionSheet,
  printRuleForSheet,
  sheetTelemetry,
  type ArtDirectionSheet,
  type SheetInput,
} from "./art-direction/art-direction-sheet";
import {
  allocateReferences,
  type Allocation,
  type AllocationInput,
} from "../provider/reference-packing/reference-allocation";

/** A reference as the pipeline has it: a buffer, a role and a position. */
export interface PipelineReference {
  index: number;
  role: string;
  filename?: string;
  description?: string;
  buffer?: Buffer;
  mimeType?: string;
  productId?: string | null;
}

export interface GptPipelineInput {
  assetType: string;
  aspectRatio: string;
  concept: string;
  brand: string;
  copy: string[];
  references: PipelineReference[];
  industry?: string;
  intendedUse?: string;
  productFacts?: string[];
  userControls?: { label: string; instruction: string }[];
  strategy?: { label: string; text: string }[];
  referenceData?: { label: string; value: string }[];
  industryModule?: string;
  productCountRule?: string;

  // ── What already ran upstream and was being discarded ──────────────────
  //
  // Each of these is produced by a layer the pipeline ALREADY executes on every render.
  // The audit measured the cost of not passing them: PRODUCT_FACTS, BRAND_KIT, STRATEGY
  // and REFERENCE_DATA all read "(none)" in the live brief while MarketingBrainService,
  // the brand kit and the composition plan had all produced their output and had it
  // dropped on the floor at the adapter boundary.
  //
  // Every one is optional, and the art-director path works with whatever subset arrived:
  // a brief with no strategy is a brief with no strategy, not an error.
  brandKit?: GptBriefInput["brandKit"];
  userApproach?: { label: string; directive: string } | null;
  inferredApproach?: { label: string; directive: string; reason: string } | null;
  resolvedControls?: { label: string; value: string; source: string }[];
  /** Honoured only when `derived_from_image` is true. See `SheetInput.styleManifest`. */
  styleManifest?: SheetInput["styleManifest"];
  salesContext?: { product_name?: string; benefit?: string } | null;
  targetChannel?: string;
  /** Phase 3's hook. Nothing populates it in this round. */
  detectedPrintedBranding?: Array<{ product: string; reads: string }> | null;
}

function roleKind(role: string): AllocationInput["kind"] {
  const r = String(role || "").toUpperCase();
  if (r === "LOGO") return "logo";
  if (r === "INSPIRATION_REFERENCE" || r === "STYLE" || r === "SUPPORT_REFERENCE") return "style";
  return "product";
}

/**
 * Pixel sizes, read once.
 *
 * Needed because the panel size decides whether a product's lettering can be trusted,
 * and that decision belongs in the prompt. A reference sharp cannot read scores zero
 * rather than throwing: it will fail later in the upload path with a better message
 * than this function could give, and a metadata read is the wrong place to end a render.
 */
async function measure(references: PipelineReference[]): Promise<Record<string, { width: number; height: number }>> {
  const out: Record<string, { width: number; height: number }> = {};
  await Promise.all(
    references.map(async (ref) => {
      const key = String(ref.index);
      if (!ref.buffer) {
        out[key] = { width: 0, height: 0 };
        return;
      }
      try {
        const meta = await sharp(ref.buffer).metadata();
        out[key] = { width: meta.width || 0, height: meta.height || 0 };
      } catch {
        out[key] = { width: 0, height: 0 };
      }
    }),
  );
  return out;
}

/** The plan the provider will independently reach from the same references. */
export async function allocationForPipeline(references: PipelineReference[]): Promise<Allocation> {
  const profile = activeProfile();
  const sizes = await measure(references);
  const inputs: AllocationInput[] = references.map((ref) => ({
    id: String(ref.index),
    kind: roleKind(ref.role),
    productId: ref.productId ?? null,
    width: sizes[String(ref.index)]?.width ?? null,
    height: sizes[String(ref.index)]?.height ?? null,
    filename: ref.filename ?? `ref_${ref.index}.png`,
  }));
  return allocateReferences(inputs, {
    limit: profile.maxReferences,
    maxPanelsPerSheet: profile.maxPanelsPerSheet,
    sheetSizePx: profile.sheetSizePx,
  });
}

/**
 * Translates the GPT result into the object the pipeline reads.
 *
 * A refusal becomes `ok: false` with the reason, which is the same thing the pipeline
 * already does with a failed Gemini build — except that for this dialect `ok: false`
 * must NOT fall through to v1. That rule lives at the pipeline's call site, where the
 * final prompt is chosen.
 */
export function asSimpleResult(gpt: GptEngineResult): SimpleResult {
  const decisionLines = String(gpt.decisions || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*\d.)\]]+\s*/, "").trim())
    .filter(Boolean);

  return {
    ok: gpt.ok,
    prompt: gpt.prompt,
    // The director's own account of what it chose. The pipeline prints these as the
    // plan and the assumptions, which is exactly what they are for this dialect.
    plan: gpt.decisions,
    assumptions: decisionLines.slice(0, 8),
    warnings: gpt.warnings,
    llmCalls: gpt.llmCalls,
    // This dialect never shortens the client's copy: the checks refuse a prompt whose
    // quoted strings are not the supplied ones, so "exact" is a statement of fact.
    copyPolicy: "exact",
    copy_original: gpt.copy_original,
    copy_final: gpt.copy_final,
    templates: gpt.templates,
    referenceRoles: (gpt.brief?.slots?.PRODUCT_COUNT ? [] : []) as string[],
    ...(gpt.reason ? { reason: gpt.reason } : {}),
    ...(gpt.refusal ? { reason: `${gpt.refusal.code}: ${gpt.refusal.message_vi}` } : {}),
  };
}

/**
 * Runs the GPT dialect for one render.
 *
 * Never throws. Every failure inside the engine is already `ok: false` with a reason,
 * and anything unexpected here is caught and reported the same way, because a bug in
 * this file must not be able to cost a render.
 */
/**
 * The style words an inspiration image legitimately contributes.
 *
 * Gated on `derived_from_image`, and `types.ts:628` records why: the LLM transport is
 * text-only, so a manifest can be an inference FROM THE CONCEPT wearing the clothes of an
 * observation. Injected as authoritative style, such a manifest competes with the real
 * attached image and reintroduces the generic studio look it was supposed to replace.
 *
 * Composition, light direction and colour mood only. Never the reference image's OBJECTS:
 * a mood photograph of a watch is a lighting instruction for a bottle, not a reason to
 * draw a watch.
 */
function styleWords(manifest: GptPipelineInput["styleManifest"]): { label: string; text: string }[] {
  if (!manifest || manifest.derived_from_image !== true) return [];
  const out: { label: string; text: string }[] = [];
  const add = (label: string, value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.push({ label, text });
  };
  add("Composition read off the mood image", manifest.composition);
  add("Light direction read off the mood image", manifest.lighting);
  add("Colour mood read off the mood image", manifest.colorMood);
  if (out.length) {
    out.push({
      label: "How to use the mood image",
      text:
        "its composition, light and colour only. None of the objects in it appear in this picture; " +
        "the products are the attached photographs and nothing else.",
    });
  }
  return out;
}

/** The sheet's own input, assembled from what the pipeline already has. */
function sheetInputFor(input: GptPipelineInput, allocation: Allocation | null): SheetInput {
  return {
    assetType: input.assetType,
    aspectRatio: input.aspectRatio,
    industry: input.industry,
    concept: input.concept,
    brand: input.brand,
    copy: input.copy,
    products: input.references
      .filter((r) => roleKind(r.role) === "product")
      .map((r) => ({
        id: String(r.index),
        description: String(r.description || r.filename || `product ${r.index}`),
        productId: r.productId ?? null,
      })),
    allocation,
    productFacts: input.productFacts,
    brandKit: input.brandKit ?? null,
    userControls: input.userControls,
    userApproach: input.userApproach ?? null,
    inferredApproach: input.inferredApproach ?? null,
    strategy: [...(input.strategy || []), ...styleWords(input.styleManifest)],
    styleManifest: input.styleManifest ?? null,
    detectedPrintedBranding: input.detectedPrintedBranding ?? null,
    density: numericWordsDensity(),
  };
}

export async function buildGptForPipeline(
  input: GptPipelineInput,
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>,
): Promise<{
  simple: SimpleResult;
  gpt: GptEngineResult | null;
  allocation: Allocation | null;
  sheet: ArtDirectionSheet | null;
}> {
  const profile = activeProfile();
  const artDirector = gptArtDirector();
  try {
    const allocation = await allocationForPipeline(input.references);

    const references: GptReference[] = input.references.map((ref) => ({
      index: ref.index,
      role: String(ref.role || "PRODUCT").toUpperCase(),
      filename: ref.filename,
      description: ref.description,
    }));

    const productCount = input.references.filter((r) => roleKind(r.role) === "product").length;

    // The sheet, and the print rule it selects. Both pure, both deterministic, neither
    // costing a model call — so building them before the flag check would be free, but it
    // would also mean a bug in a derivation rule could end a render that asked for none of
    // this. They are built only when they will be used.
    const sheetInput = artDirector ? sheetInputFor(input, allocation) : null;
    const sheet = sheetInput ? buildArtDirectionSheet(sheetInput) : null;
    const printRule = sheetInput ? printRuleForSheet(sheetInput) : null;
    if (sheet) {
      console.log("[PROMPT_GPT][SHEET]", JSON.stringify(sheetTelemetry(sheet)));
    }

    const briefInput: GptBriefInput = {
      assetType: input.assetType,
      aspectRatio: input.aspectRatio,
      industry: input.industry,
      intendedUse: input.intendedUse,
      productCount,
      concept: input.concept,
      brand: input.brand,
      copy: input.copy,
      references,
      allocation,
      minPanelLongestSidePx: profile.minPanelLongestSidePx,
      productFacts: input.productFacts,
      userControls: input.userControls,
      strategy: input.strategy,
      referenceData: input.referenceData,
      industryModule: input.industryModule,
      productCountRule: input.productCountRule,
      // ── Everything the adapter used to drop ─────────────────────────────
      //
      // All of it behind the flag, including the four fields — brandKit, the two
      // approaches, the resolved controls — that the v1 brief has ALWAYS had slots for and
      // has never had filled. Filling those unconditionally would be the better change on
      // its own terms: the slot exists, the layer runs, and `(none)` in the live brief is
      // a wiring gap rather than a decision.
      //
      // It is gated anyway, because the standing rule for this work is that flag OFF
      // produces a byte-identical prompt, and `run-gpt-golden-tests` enforces that over
      // fourteen briefs. Populating a slot that was empty yesterday changes the prompt.
      // Ungating them is a one-line follow-up and a deliberate golden update.
      ...(artDirector
        ? {
            artDirector: true as const,
            sheet,
            printRule,
            density: numericWordsDensity(),
            brandKit: input.brandKit ?? null,
            userApproach: input.userApproach ?? null,
            inferredApproach: input.inferredApproach ?? null,
            resolvedControls: input.resolvedControls,
            salesContext: input.salesContext ?? null,
            targetChannel: input.targetChannel,
          }
        : {}),
    };

    const gpt = await buildGptPrompt(briefInput, { chat });
    return { simple: asSimpleResult(gpt), gpt, allocation, sheet };
  } catch (err) {
    const message = (err as Error)?.message || String(err);
    return {
      simple: {
        ok: false,
        reason: `the GPT dialect threw: ${message.slice(0, 160)}`,
        warnings: [],
        assumptions: [],
        llmCalls: 0,
        copyPolicy: "exact",
        copy_original: input.copy,
        copy_final: input.copy,
      },
      gpt: null,
      allocation: null,
      sheet: null,
    };
  }
}
