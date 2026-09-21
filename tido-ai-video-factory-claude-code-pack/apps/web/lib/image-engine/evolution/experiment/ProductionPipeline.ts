import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { LayoutGeometry } from "./LayoutGeometry";
import type { TypographySystem } from "./TypographySystem";
import type { VisualComposition } from "./VisualComposition";
import type { CreativeDocument } from "./CreativeDocument";
import type { CreativeQualityScore } from "../../benchmark/CommercialRenderCritic";

/**
 * The Production Design Context — one object carrying a render's whole design.
 *
 * The problem it solves
 * ---------------------
 * Nine modules now contribute to a render and each was wired independently.
 * That worked, but nothing could answer "did this render actually go through
 * layout?" without reading the logs — and a module silently skipped is exactly
 * the failure this project has hit three times (the blueprint that reached no
 * prompt, the evaluation layer nothing imported, the flag the benchmark
 * bypassed). Each cost a live run to find.
 *
 * So production mode assembles ONE context, validates it before spending a
 * render, and logs what ran, what was skipped and why.
 *
 * It does not re-implement anything. Every field is produced by the module that
 * already owns it; this holds them together and checks they are all present.
 */

export interface ProductionDesignContext {
  creativeBlueprint: CreativeBlueprint | null;
  layoutGeometry: LayoutGeometry | null;
  typographySystem: TypographySystem | null;
  composition: VisualComposition | null;
  creativeDocument: CreativeDocument | null;
  criticResult: CreativeQualityScore | null;
  metadata: {
    ratio: string;
    asset_type: string;
    product_count: number;
    /** Modules that produced output on this render. */
    modules_executed: string[];
    /** Modules that produced nothing, each with the reason. */
    modules_skipped: { module: string; because: string }[];
    execution_ms: number;
  };
}

export interface ValidationResult {
  ok: boolean;
  /** Required pieces that are absent. Empty when `ok`. */
  missing: string[];
  /** A sentence a human can act on, when validation failed. */
  explanation: string;
}

/** The four a production render cannot proceed without. */
export const REQUIRED_MODULES = [
  "creativeBlueprint",
  "layoutGeometry",
  "typographySystem",
  "creativeDocument",
] as const;

/**
 * Checks a context before a render is paid for. Pure.
 *
 * Fails gracefully by design: the caller is told exactly which piece is missing
 * and what that means, rather than getting a render built on half a design.
 */
export function validateContext(ctx: ProductionDesignContext): ValidationResult {
  const missing: string[] = [];
  for (const key of REQUIRED_MODULES) {
    if (!ctx[key]) missing.push(key);
  }
  // A geometry with no zones is present but useless, and a validator that only
  // checked for null would pass it.
  if (ctx.layoutGeometry && !ctx.layoutGeometry.zones.length) missing.push("layoutGeometry.zones");
  if (ctx.typographySystem && !ctx.typographySystem.specs.length) missing.push("typographySystem.specs");

  if (!missing.length) {
    return { ok: true, missing: [], explanation: "" };
  }
  return {
    ok: false,
    missing,
    explanation:
      `Production render blocked: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. ` +
      `A render without ${missing[0]} would be composed by the image model rather than designed, ` +
      `which is the mode production was enabled to replace. Either supply the missing input or run with production_pipeline_v2 off.`,
  };
}

export interface ContextInput {
  creativeBlueprint?: CreativeBlueprint | null;
  layoutGeometry?: LayoutGeometry | null;
  typographySystem?: TypographySystem | null;
  composition?: VisualComposition | null;
  creativeDocument?: CreativeDocument | null;
  criticResult?: CreativeQualityScore | null;
  ratio?: string;
  assetType?: string;
  productCount?: number;
  startedAt?: number;
}

/**
 * Assembles the context and records what participated. Pure.
 *
 * `startedAt` is supplied by the caller rather than read from a clock here, so
 * this stays deterministic and testable.
 */
export function buildProductionContext(input: ContextInput, now = input.startedAt ?? 0): ProductionDesignContext {
  const executed: string[] = [];
  const skipped: { module: string; because: string }[] = [];

  const track = (name: string, value: unknown, emptyReason: string) => {
    if (value) executed.push(name);
    else skipped.push({ module: name, because: emptyReason });
  };

  track("creativeBlueprint", input.creativeBlueprint, "the brain produced no blueprint");
  track("layoutGeometry", input.layoutGeometry, "no geometry: the execution layer did not run");
  track("typographySystem", input.typographySystem, "no typography spec: the execution layer did not run");
  track("composition", input.composition, "no composition: the production layer did not run");
  track("creativeDocument", input.creativeDocument, "no document: geometry or typography was missing");
  track("criticResult", input.criticResult, "the critic did not run");

  return {
    creativeBlueprint: input.creativeBlueprint ?? null,
    layoutGeometry: input.layoutGeometry ?? null,
    typographySystem: input.typographySystem ?? null,
    composition: input.composition ?? null,
    creativeDocument: input.creativeDocument ?? null,
    criticResult: input.criticResult ?? null,
    metadata: {
      ratio: input.ratio || "1:1",
      asset_type: input.assetType || "",
      product_count: Math.max(1, input.productCount || 1),
      modules_executed: executed,
      modules_skipped: skipped,
      execution_ms: input.startedAt ? Math.max(0, now - input.startedAt) : 0,
    },
  };
}

/** Counts and module names only — never any design content. */
export function productionTelemetry(ctx: ProductionDesignContext | null | undefined, validation?: ValidationResult) {
  if (!ctx) return { production_pipeline: false };
  return {
    production_pipeline: true,
    ratio: ctx.metadata.ratio,
    asset_type: ctx.metadata.asset_type,
    modules_executed: ctx.metadata.modules_executed,
    modules_skipped: ctx.metadata.modules_skipped.map((s) => s.module),
    skip_reasons: ctx.metadata.modules_skipped.map((s) => `${s.module}: ${s.because}`),
    execution_ms: ctx.metadata.execution_ms,
    valid: validation ? validation.ok : undefined,
    missing: validation?.missing ?? [],
  };
}
