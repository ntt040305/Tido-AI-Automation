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
export async function buildGptForPipeline(
  input: GptPipelineInput,
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>,
): Promise<{ simple: SimpleResult; gpt: GptEngineResult | null; allocation: Allocation | null }> {
  const profile = activeProfile();
  try {
    const allocation = await allocationForPipeline(input.references);

    const references: GptReference[] = input.references.map((ref) => ({
      index: ref.index,
      role: String(ref.role || "PRODUCT").toUpperCase(),
      filename: ref.filename,
      description: ref.description,
    }));

    const productCount = input.references.filter((r) => roleKind(r.role) === "product").length;

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
    };

    const gpt = await buildGptPrompt(briefInput, { chat });
    return { simple: asSimpleResult(gpt), gpt, allocation };
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
    };
  }
}
