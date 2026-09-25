import crypto from "crypto";
import { getInfrastructure } from "@tido/infrastructure";
import type { Actor, VerifiedIdentity } from "@tido/shared";
import { recordAssets } from "./record-assets";
import { recordCreativeMemory } from "./record-creative-memory";
import type { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "@/lib/image-engine/types";
import type { VisionAnalysisResult } from "@/lib/image-engine/evolution/experiment/VisionAnalysisResult";
import type { VisionTrace } from "@/lib/image-engine/evolution/VisionReviewLayer";

/**
 * Writes down what a render decided.
 *
 * WHY THIS LIVES IN apps/web AND NOT IN THE ENGINE
 * -------------------------------------------------
 * The engine has no path to a database and must keep it that way: a render bug
 * cannot leak customer data when there is no customer data in reach, and a test
 * walks `lib/image-engine` on every build to enforce it. So the engine returns
 * its reasoning on the result object, and this -- application code, above the
 * boundary -- is what stores it.
 *
 * WHY IT CANNOT FAIL A RENDER
 * ---------------------------
 * By the time any of this runs the picture exists and the user is waiting.
 * Losing the reasoning costs a data point; losing the picture costs the
 * request. Everything below is wrapped and the caller does not await a result
 * it can act on.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not invent rows. A stable render produces intelligence and no
 * blueprint; an experiment render with the vision loop off produces a blueprint
 * and no reviews. Each section is written only when the engine actually
 * produced it, because an empty row is a claim that the render decided nothing,
 * which is a different statement from "this was not asked for".
 */

/**
 * A stable UUID for an engine generation id.
 *
 * `creative_runs.id` is a uuid; the engine mints `gen_1790178671861_gh540`.
 * The first real render after this layer shipped proved the mismatch -- the
 * insert failed on the primary key and, because persistence is deliberately
 * unable to fail a render, did so silently.
 *
 * UUIDv5 rather than v4: the same engine id must always map to the same row,
 * so recording a render twice (a retry above this layer, a correction pass)
 * updates one row instead of creating two. The namespace is a fixed constant
 * for this product, which is what makes the mapping reproducible outside this
 * process -- anyone with the engine id can compute the row id.
 */
const RUN_NAMESPACE = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";

export function runUuid(engineId: string): string {
  const ns = Buffer.from(RUN_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = crypto.createHash("sha1").update(Buffer.concat([ns, Buffer.from(engineId)])).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Everything the caller already has in scope when a render finishes. */
export interface RecordGenerationInput {
  request: SimpleInputRequestV1;
  result: SimpleImageGenerationResultV1;
  /**
   * The verified identity, or null for an anonymous render. Preferred over
   * `firebaseUid`: resolving an actor from the UID alone told the profile layer
   * the account had no email or name, and it duly erased both on every
   * signed-in render.
   */
  identity?: VerifiedIdentity | null;
  /**
   * The Firebase UID from a verified token, or null for an anonymous render.
   * Used only when `identity` is absent.
   *
   * Deliberately NOT the internal profile id. `creative_runs.user_id` is a
   * foreign key to `user_profiles.id`, and the two are different identifiers:
   * passing the Firebase UID straight through would violate the constraint on
   * every signed-in render. The translation happens below, once, rather than
   * at each call site where it could be forgotten.
   */
  firebaseUid?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  durationMs?: number;
  pipeline?: "stable" | "experiment";
  pipelineVersion?: string | null;
  featuresEnabled?: string[];
}

/**
 * Pulls the design structures the pipeline attached non-enumerably.
 *
 * `ExperimentPipeline` hangs the blueprint, typography and geometry off the
 * result with `enumerable: false` so they never ride into a JSON response.
 * That makes them invisible to a spread and visible to a direct read, which is
 * exactly what is wanted here and nowhere else.
 */
function designContext(result: SimpleImageGenerationResultV1) {
  const r = result as unknown as Record<string, unknown>;
  const blueprint = (r.creativeBlueprint as Record<string, unknown>) ?? null;

  // How much of the blueprint was grounded rather than invented. The engine
  // already computes this per render; reading it here rather than recomputing
  // keeps one definition of "grounded" in the system.
  const metrics = blueprint?.metrics as Record<string, number> | undefined;
  const grounded =
    metrics && typeof metrics.grounded_in_product_score === "number"
      ? metrics.grounded_in_product_score
      : null;

  return {
    blueprint,
    typography: (r.typographySystem as Record<string, unknown>) ?? null,
    layout: (r.layoutGeometry as Record<string, unknown>) ?? null,
    composition: (r.visualComposition as Record<string, unknown>) ?? null,
    assetDna: (r.assetDna as Record<string, unknown>) ?? null,
    designDocument: syncDesignDocument((r.designDocument as Record<string, unknown>) ?? null, result),
    prompt: typeof r.compiledPrompt === "string" ? r.compiledPrompt : null,
    // The experiment path attaches the full MarketingBrainStrategy, but only
    // when `strategy_first` is on. Every render carries the orchestrator's own
    // strategy record regardless, so that is the fallback -- a summary of the
    // real strategy beats a null where one genuinely ran.
    strategy:
      (r.marketingStrategy as Record<string, unknown>) ??
      ((result.strategy as unknown as Record<string, unknown>) || null),
    grounded,
  };
}

/**
 * Phase 5.1. Ties the stored design document to the render it produced.
 *
 * The document is the structure the render prompt was written from, so it is
 * synchronized by construction; what this adds is the check that it came out
 * that way. Each text layer is marked verified when the vision review found its
 * exact text in the served image, and unverified when it found it missing or
 * wrong -- the raster is flat, so the TEXT is what can be checked against the
 * pixels, and it is checked rather than assumed.
 */
export function syncDesignDocument(
  document: Record<string, unknown> | null,
  result: SimpleImageGenerationResultV1,
): Record<string, unknown> | null {
  if (!document) return null;
  const trace = traceOf(result);
  const served = trace?.versions.find((v) => v.version === trace.selected)?.analysis ?? result.visionAnalysis ?? null;
  const check = (served as { text_check?: { missing: string[]; incorrect: { expected: string }[]; compliant: boolean } } | null)?.text_check ?? null;
  const elements = Array.isArray(document.elements) ? (document.elements as Record<string, unknown>[]) : [];
  const textLayers = elements.filter((e) => e.type === "text");
  const synced = elements.map((e) => {
    if (e.type !== "text" || !check) return e;
    const content = String(e.content || "");
    const wrong = check.missing.includes(content) || check.incorrect.some((i) => i.expected === content);
    return { ...e, verified_in_render: !wrong };
  });
  return {
    ...document,
    elements: synced,
    sync: {
      generation_id: result.generationId ?? null,
      image_url: result.imageUrl ?? null,
      // The render prompt's layout and typography were written from this
      // document, not alongside it.
      rendered_from_document: true,
      raster_is_flat: true,
      served_version: trace?.selected ?? 1,
      vision_reviewed: Boolean(served?.analyzed_image),
      text_check_compliant: check ? check.compliant : null,
      text_layers: textLayers.length,
      text_layers_verified: check ? synced.filter((e) => e.type === "text" && (e as { verified_in_render?: boolean }).verified_in_render).length : null,
    },
  };
}

/**
 * Flattens the design decisions into one row each, as the table expects.
 *
 * `applied` means the change reached a picture. The decision engine's own
 * `applied` says a decision was confident enough to act on; when the vision
 * loop then had no time for a corrected render, nothing was applied to
 * anything, and recording `true` claimed a correction that never happened --
 * seen on live data, 2026-09-24. So it is true only when a V2 was rendered.
 */
export function decisionRows(result: SimpleImageGenerationResultV1) {
  const d = result.designDecisions;
  if (!d) return [];
  const trace = traceOf(result);
  const rendered = trace ? trace.versions.some((v) => v.version === 2) : true;
  const rows: Array<Record<string, unknown>> = [];

  for (const t of d.typography_decisions ?? []) {
    rows.push({
      kind: "typography",
      target: t.role ?? null,
      // The action name is not on the public decision shape, so the decision
      // sentence stands in. Losing the enum costs the cheapest aggregate;
      // inventing one would cost its correctness.
      action: t.decision ?? "unspecified",
      problem: t.problem ?? null,
      decision: t.decision ?? null,
      reason: t.reason ?? null,
      value_from: t.from !== undefined ? String(t.from) : null,
      value_to: t.to !== undefined ? String(t.to) : null,
      confidence: t.decision_confidence ?? null,
      applied: Boolean(t.applied) && rendered,
    });
  }
  for (const l of d.layout_decisions ?? []) {
    rows.push({
      kind: "layout",
      target: l.zone ?? null,
      action: l.decision ?? "unspecified",
      problem: l.problem ?? null,
      decision: l.decision ?? null,
      reason: l.reason ?? null,
      value_from: l.from !== undefined ? String(l.from) : null,
      value_to: l.to !== undefined ? String(l.to) : null,
      confidence: l.decision_confidence ?? null,
      applied: Boolean(l.applied) && rendered,
    });
  }
  return rows;
}

/**
 * How many problems a vision review actually found.
 *
 * Derived rather than read: the analyzer reports findings in four lists and
 * never a total, so the total is a decision about what counts as a problem.
 * Made in one place because two callers need it -- the review row and the
 * pattern learner -- and two spellings of "how bad was this render" would
 * eventually disagree about which patterns are worth following.
 */
export function problemCountOf(v: VisionAnalysisResult | null | undefined): number {
  if (!v) return 0;
  return (
    (v.issues?.length ?? 0) +
    (v.typography_problems?.length ?? 0) +
    (v.layout_problems?.length ?? 0) +
    (v.product_accuracy?.length ?? 0)
  );
}

export function visionProblemCount(result: SimpleImageGenerationResultV1): number {
  return problemCountOf(result.visionAnalysis);
}

/** Both sides of the vision loop, when it ran. Attached by `VisionReviewLayer`. */
function traceOf(result: SimpleImageGenerationResultV1): VisionTrace | null {
  const t = (result as unknown as Record<string, unknown>).visionTrace as VisionTrace | undefined;
  return t && Array.isArray(t.versions) && t.versions.length ? t : null;
}

function reviewRow(version: number, v: VisionAnalysisResult, extra?: Record<string, unknown>) {
  return {
    version,
    // Carried through exactly as the analyzer set it. This is the field that
    // separates an observation from a guess, and re-deriving it here would
    // be inventing the one claim that must never be invented.
    analyzed_image: Boolean(v.analyzed_image),
    provider: v.provider ?? null,
    image_hash: v.image_hash ?? null,
    findings: { ...(v as unknown as Record<string, unknown>), ...(extra || {}) },
    problem_count: problemCountOf(v),
    unavailable_reason: v.unavailable_reason ?? null,
  };
}

/**
 * One review per version that was actually looked at.
 *
 * Before, only the served image's review was kept, and it was labelled V2
 * whenever a second render existed -- even when V1 was the one served. The V1
 * review that justified the correction was lost in every case, which is the
 * one piece of evidence "did the correction help?" cannot be answered without.
 */
export function reviewRows(result: SimpleImageGenerationResultV1) {
  const trace = traceOf(result);
  if (trace) {
    // Phase 4.5. The V2 review also records the iteration itself: why it
    // happened (the V1 problems it answered), what changed (the correction),
    // and what improved or worsened (the design comparison).
    const v1 = trace.versions.find((t) => t.version === 1)?.analysis ?? null;
    return trace.versions
      .filter((t) => t.analysis)
      .map((t) =>
        reviewRow(
          t.version,
          t.analysis!,
          t.version === 2
            ? {
                iteration: {
                  why: { v1_problems: problemCountOf(v1), v2_problems: problemCountOf(t.analysis) },
                  what_changed: trace.instruction,
                  what_improved: trace.comparison ?? null,
                  served: trace.selected === 2 ? "v2" : "v1",
                },
              }
            : undefined,
        ),
      );
  }
  const v = result.visionAnalysis;
  return v ? [reviewRow(1, v)] : [];
}

/**
 * V1 and, when a correction pass ran, V2 -- each with the prompt that produced
 * it, the correction it was sent (V2 only) and the problems a review found in
 * it. Those three were hard-coded to null before, so no row could say what a
 * version was built from or whether the correction improved anything.
 */
export function iterationRows(result: SimpleImageGenerationResultV1) {
  const trace = traceOf(result);
  if (trace) {
    return trace.versions
      .filter((t) => t.imageUrl)
      .map((t) => ({
        version: t.version,
        image_path: t.imageUrl,
        prompt: t.prompt,
        instruction: t.version === 2 ? trace.instruction : null,
        problem_count: t.analysis ? problemCountOf(t.analysis) : null,
        selected: trace.selected === t.version,
      }));
  }
  const prompt = designContext(result).prompt;
  return result.imageUrl
    ? [{ version: 1, image_path: result.imageUrl, prompt, instruction: null, problem_count: null, selected: true }]
    : [];
}

/**
 * Records the run and its reasoning. Never throws, never awaited for a value.
 */
export async function recordGeneration(input: RecordGenerationInput): Promise<void> {
  try {
    const infra = getInfrastructure();
    if (!infra.isConfigured()) return;

    const { request, result } = input;
    const engineId = result.generationId;
    if (!engineId) return;
    const runId = runUuid(engineId);

    // Read back from the router rather than defaulted. A run recorded as
    // "stable" when the experiment path produced it makes every later
    // comparison between the two pipelines wrong.
    const routing = (result as unknown as Record<string, unknown>).routingDecision as
      | { pipeline?: "stable" | "experiment"; pipeline_version?: string; features_enabled?: string[] }
      | undefined;

    // Verified identity -> internal profile id. Also creates the profile on
    // first sight, which is what makes a first-ever render by a new account
    // record correctly rather than silently dropping its ownership.
    //
    // The whole identity, not the UID alone: the profile layer mirrors email
    // and display name from whatever it is handed, and a bare UID read as
    // "this account has neither" -- erasing both on every signed-in render.
    let userId: string | null = null;
    let orgId: string | null = input.orgId ?? null;
    let actor: Actor | null = null;
    const identity: VerifiedIdentity | null =
      input.identity ?? (input.firebaseUid ? { firebaseUid: input.firebaseUid, emailVerified: false } : null);
    if (identity) {
      const resolved = await infra.identity.resolveActor(identity);
      if (resolved.ok) {
        actor = resolved.data;
        userId = resolved.data.profile.id;
        // Their personal workspace, unless the caller named one.
        orgId = orgId ?? resolved.data.memberships[0]?.org_id ?? null;
      }
    }

    // THE ORDER BELOW IS THE FIX FOR A LIVE DEFECT, NOT A STYLE CHOICE.
    //
    //   request -> run -> intelligence -> concepts/patterns -> assets
    //
    // Concepts used to be started, unawaited, before the run existed. Their
    // insert always reached Postgres first and failed the foreign key to
    // creative_runs (23503) -- so creative_concepts never held a single row.
    // Everything here is already off the request path (the route does not
    // await this function), so awaiting each step costs the user nothing and
    // makes "the parent row exists" a sequencing fact rather than a race.

    // The brief, as its own record. One brief can produce several renders.
    const requestResult = await infra.intelligence.recordRequest({
      orgId,
      projectId: input.projectId ?? null,
      userId,
      brief: request.concept ?? null,
      assetType: (request as { useCase?: string }).useCase ?? result.useCase ?? null,
      aspectRatio: request.aspectRatio ?? null,
      assets: (request.images ?? []).map((i: { role?: string }) => ({ role: i?.role ?? "product" })),
      goals: {
        copyItems: request.copyItems ?? [],
        marketingContext: (request as { marketingContext?: unknown }).marketingContext ?? null,
      },
    });
    const requestId = requestResult.ok ? requestResult.data.id : null;

    // The run itself. Written before the reasoning because everything else
    // has a foreign key to it -- and checked, because every step below is
    // pointless if the parent row is not there.
    const run = await infra.runs.record({
      id: runId,
      engineGenerationId: engineId,
      orgId,
      projectId: input.projectId ?? null,
      userId,
      concept: request.concept ?? null,
      assetType: (request as { useCase?: string }).useCase ?? result.useCase ?? null,
      aspectRatio: result.aspectRatio ?? null,
      pipeline: input.pipeline ?? routing?.pipeline ?? "stable",
      pipelineVersion: input.pipelineVersion ?? routing?.pipeline_version ?? null,
      featuresEnabled: input.featuresEnabled ?? routing?.features_enabled ?? [],
      status: String(result.status),
      success: Boolean(result.success),
      durationMs: input.durationMs ?? result.diagnostics?.totalDurationMs ?? null,
      errorCode: result.error?.code ?? null,
      imagePath: result.imageUrl ?? null,
    });
    if (!run.ok) {
      if (run.unavailable) return;
      // A duplicate key means this render was recorded already -- the same
      // engine id maps to the same UUID -- so the parent exists and the
      // children below can still be written idempotently. Anything else means
      // there is no parent, and every child write would fail its foreign key.
      if (!run.error.startsWith("[23505]")) {
        console.warn("[DB] run not recorded:", run.error);
        return;
      }
    }

    const design = designContext(result);
    const intelligence = result.creativeIntelligence;

    await infra.intelligence.persistSafely({
      runId,
      requestId,
      selectedDirection: intelligence?.selected_direction ?? null,
      intelligence: (intelligence as unknown as Record<string, unknown>) ?? null,
      strategy: design.strategy,
      prompt: design.prompt,
      blueprint: design.blueprint,
      typography: design.typography,
      layout: design.layout,
      composition: design.composition,
      assetDna: design.assetDna,
      designDocument: design.designDocument,
      groundedScore: design.grounded,
      missingCount: intelligence?.undecided?.length ?? null,
      decisions: decisionRows(result) as never,
      iterations: iterationRows(result) as never,
      reviews: reviewRows(result) as never,
    });

    // Phases 3.3 and 4. The directions this brief could have gone, and what
    // keeps recurring across the work. Only now that the run exists: concepts
    // hang off it by foreign key.
    await recordCreativeMemory({
      result,
      runId,
      actor,
      orgId,
      problems: visionProblemCount(result),
    });

    // Phase 3.2. What the uploaded images are, keyed by their bytes rather than
    // by this run -- so the same product photograph is read once rather than on
    // every render that uses it. Anonymous renders resolve no actor and are not
    // remembered.
    await recordAssets({ request, result, actor });
  } catch (e) {
    console.warn(
      "[PERSISTENCE] generation not recorded:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
