import { getInfrastructure, isDatabaseConfigured } from "@tido/infrastructure";
import type { Actor, CreativePatternRow, VerifiedIdentity } from "@tido/shared";
import { MIN_PATTERN_SUPPORT, PROVISIONAL_FACET_FLOOR, patternQualifies } from "@tido/shared";
import { EmbeddingService } from "@/lib/image-engine/retrieval/EmbeddingService";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { contentHash } from "./record-assets";
import type { RouteEvidence } from "@/lib/image-engine/evolution/experiment/DirectionEvaluator";
import { preferenceDecisions, type UserKit } from "@/lib/image-engine/evolution/experiment/UserKit";
import { routeLabel } from "@/lib/image-engine/evolution/experiment/UserKitLearning";

/**
 * What the system already knows, assembled for one brief.
 *
 * Phase 3.5. Everything before this stored memory; this is the first thing that
 * reads it back on the way INTO a render.
 *
 * MEMORY IS CONTEXT, NOT A RULE
 * ------------------------------
 * The brief is explicit about it and the whole module is shaped by it. Three
 * things follow:
 *
 *   - Nothing returned here is an instruction. The sentences are worded as
 *     observations, and the block they land in tells the director to ignore
 *     anything the brief contradicts.
 *   - Nothing unqualified is returned at all. A pattern below
 *     MIN_PATTERN_SUPPORT, or one accumulating vision problems with no
 *     approvals, is withheld rather than hedged -- a weak claim presented
 *     quietly is still presented.
 *   - The output is CAPPED and DIVERSIFIED. This is the failure mode that
 *     matters most: a memory that always returns its strongest pattern makes
 *     every render resemble the last one, which is exactly what Template
 *     Intelligence is supposed to prevent. At most one pattern per dimension
 *     crosses the boundary.
 *
 * IT CANNOT FAIL A RENDER
 * -----------------------
 * Every path returns an array, and an empty array means "render from the brief
 * alone" -- which is what the system did for its whole life before it had a
 * memory, and remains a completely correct outcome.
 */

/** The most sentences memory may contribute. Small on purpose. */
const MAX_RECALL = 6;

/** How near a pattern must be to a brief before it is worth mentioning. */
const BRIEF_MATCH_FLOOR = 0.55;

export interface RecallInput {
  identity: VerifiedIdentity | null;
  /** The brief, used to find patterns relevant to THIS request. */
  brief?: string | null;
  /** Buffers of everything attached, so known assets can be recognised. */
  attachments?: { buffer?: Buffer }[];
  /**
   * Phase 4.2. This person's memory kit, already loaded by the caller, so
   * their thresholded route preferences can join the route evidence without a
   * second read.
   */
  kit?: UserKit | null;
}

export interface Recalled {
  /** Sentences for the engine. Already capped and diversified. */
  sentences: string[];
  /** Counts only, for a log line. Never the sentences themselves. */
  telemetry: Record<string, number | boolean>;
  /** Phase 4.2. How each route has gone for this account, for the director and the evaluator. */
  routeEvidence: RouteEvidence[];
}

const EMPTY: Recalled = { sentences: [], telemetry: { recall: false }, routeEvidence: [] };

/**
 * Route history, as numbers the engine can read.
 *
 * From the `direction` patterns -- one per route this workspace has made, with
 * how often it was made, kept, rejected and what vision found -- plus the
 * person's own route preferences that have ALREADY passed `preferenceDecisions`'
 * threshold. No threshold is applied to the pattern numbers here: the evaluator
 * applies it, in one place, and reports "too few renders to judge" below it.
 */
export function routeEvidenceFrom(patterns: CreativePatternRow[], kit?: UserKit | null): RouteEvidence[] {
  const byLabel = new Map<string, RouteEvidence>();
  for (const p of patterns) {
    if (p.dimension !== "direction" || !p.value) continue;
    const label = routeLabel(p.value).toLowerCase();
    const held = byLabel.get(label);
    const add = {
      route: p.value,
      runs: p.support_count,
      kept: p.approved_count,
      rejected: p.rejected_count ?? 0,
      problems: p.problem_count,
      preference: null as RouteEvidence["preference"],
    };
    byLabel.set(
      label,
      held
        ? { ...held, runs: held.runs + add.runs, kept: held.kept + add.kept, rejected: held.rejected + add.rejected, problems: held.problems + add.problems }
        : add,
    );
  }
  for (const d of preferenceDecisions(kit)) {
    if (d.area !== "visual") continue;
    const value = d.negative ? d.decision.value.replace(/^Avoid:\s*/, "") : d.decision.value;
    const label = routeLabel(value).toLowerCase();
    if (!label) continue;
    const preference = d.negative ? "avoid" : "prefer";
    const held = byLabel.get(label);
    byLabel.set(label, held ? { ...held, preference } : { route: value, runs: 0, kept: 0, rejected: 0, problems: 0, preference });
  }
  return [...byLabel.values()];
}

/**
 * Patterns worth mentioning, at most one per dimension.
 *
 * The per-dimension cap is the diversification rule. Without it a workspace
 * with eleven strong composition patterns would contribute eleven composition
 * sentences and nothing else, and every render would converge on the same
 * frame -- the pattern store making the output MORE uniform, which is the
 * opposite of the point.
 */
function strongest(patterns: CreativePatternRow[]): CreativePatternRow[] {
  const best = new Map<string, CreativePatternRow>();
  for (const p of patterns) {
    if (!patternQualifies(p)) continue;
    const held = best.get(p.dimension);
    // Approvals first, support second. A pattern a human kept four times beats
    // one the machine produced forty times and nobody looked at.
    const better =
      !held ||
      p.approved_count > held.approved_count ||
      (p.approved_count === held.approved_count && p.support_count > held.support_count);
    if (better) best.set(p.dimension, p);
  }
  return [...best.values()];
}

/** A pattern as a sentence, carrying the evidence that justifies it. */
function asSentence(p: { dimension: string; value: string; approved_count: number; support_count: number }): string {
  // The counts travel with the claim on purpose. "Seen in 3" and "kept in 11"
  // are different statements, and a director reading the prompt should be able
  // to weigh them differently rather than being handed a bare assertion.
  const evidence =
    p.approved_count > 0
      ? `kept in ${p.approved_count} of ${p.support_count} previous renders`
      : `seen in ${p.support_count} previous renders, none yet kept`;
  return `${p.dimension}: ${p.value} (${evidence})`;
}

async function actorFor(identity: VerifiedIdentity): Promise<Actor | null> {
  if (!isDatabaseConfigured()) return null;
  const r = await getInfrastructure().identity.resolveActor(identity);
  return r.ok ? r.data : null;
}

/**
 * Assembles memory for one request.
 *
 * Reads three stores and returns sentences. Never throws: a lookup that failed
 * and a person who has taught the system nothing are indistinguishable to the
 * caller, and both correctly mean "render from the brief alone".
 */
export async function recallForBrief(input: RecallInput): Promise<Recalled> {
  try {
    if (!input.identity) return EMPTY;
    const actor = await actorFor(input.identity);
    if (!actor) return EMPTY;

    const infra = getInfrastructure();
    const sentences: string[] = [];
    const telemetry: Record<string, number | boolean> = { recall: true };
    let routeEvidence: RouteEvidence[] = [];

    // ── what we already know about the attached assets ────────────────────
    //
    // Exact, not inferred: these are hash hits, so the system has genuinely
    // seen this file before and the observation is a fact rather than a
    // ranking. That is why it is allowed to go first.
    const hashes = (input.attachments || [])
      .map((a) => (a?.buffer?.length ? contentHash(a.buffer) : null))
      .filter(Boolean) as string[];

    if (hashes.length) {
      const known = await infra.assets.getMany(actor, hashes);
      telemetry.assets_known = known.ok ? known.data.length : 0;
      if (known.ok) {
        for (const asset of known.data.slice(0, 2)) {
          const observed = asset.observed as Record<string, unknown> | null;
          const form = typeof observed?.form === "string" ? observed.form : "";
          const material = Array.isArray(observed?.materials)
            ? (observed!.materials as string[]).join(", ")
            : "";
          const facts = [form, material].filter(Boolean).join("; ");
          if (!facts) continue;
          sentences.push(
            `this exact asset has been used ${asset.times_seen} time(s) before and was observed as: ${facts}`,
          );
        }

        // Phase 3.2.5, read back. The vectors `asset_embeddings` holds were
        // written on every remembered upload and searched by nothing. A known
        // asset's own identity vector is the query: "have I seen this PRODUCT
        // in a different photograph". A cosine is a ranking, not a match, so it
        // is floored at the measured provisional threshold and worded as a
        // resemblance -- never as "this is the same product".
        let similarFound = 0;
        for (const asset of known.data.slice(0, 2)) {
          const near = await infra.assetSemantics.similar(actor, {
            facet: "identity",
            assetId: asset.id,
            limit: 1,
            minScore: PROVISIONAL_FACET_FLOOR.identity,
          });
          if (!near.ok || !near.data.length) continue;
          const n = near.data[0];
          similarFound++;
          sentences.push(
            `a different upload resembles this asset (identity similarity ${n.score.toFixed(2)}, a ranking not a match), used ${n.times_seen} time(s): ${n.source_text.slice(0, 240)}`,
          );
        }
        telemetry.assets_similar = similarFound;
      }
    }

    // ── what this workspace's own work suggests ───────────────────────────
    const listed = await infra.creativeMemory.listPatterns(actor, undefined, 200);
    const qualified = listed.ok ? strongest(listed.data) : [];
    routeEvidence = routeEvidenceFrom(listed.ok ? listed.data : [], input.kit);
    telemetry.routes_with_history = routeEvidence.length;
    telemetry.patterns_held = listed.ok ? listed.data.length : 0;
    telemetry.patterns_qualified = qualified.length;

    // Narrowed to the brief where an embedder is available. Without one the
    // workspace's strongest patterns are still offered -- correct, just less
    // targeted -- rather than nothing being offered at all.
    let chosen = qualified;
    const brief = String(input.brief || "").trim();
    if (brief && qualified.length > 1 && process.env.GEMINI_API_KEY) {
      try {
        const vector = await EmbeddingService.embedText(brief, true);
        const near = await infra.creativeMemory.similarPatterns(actor, {
          embedding: vector,
          model: IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL,
          limit: 20,
          minScore: BRIEF_MATCH_FLOOR,
          minSupport: MIN_PATTERN_SUPPORT,
        });
        if (near.ok && near.data.length) {
          const relevant = new Set(near.data.map((n) => n.id));
          const narrowed = qualified.filter((p) => relevant.has(p.id));
          // Only narrow when something survives. An embedder that matched
          // nothing is a reason to fall back to the strongest patterns, not a
          // reason to contribute nothing.
          if (narrowed.length) chosen = narrowed;
          telemetry.brief_matched = narrowed.length;
        }
      } catch (e) {
        console.warn("[RECALL] brief not embedded:", e instanceof Error ? e.message : String(e));
      }
    }

    for (const p of chosen) {
      if (sentences.length >= MAX_RECALL) break;
      sentences.push(asSentence(p));
    }

    telemetry.sentences = sentences.length;
    return { sentences: sentences.slice(0, MAX_RECALL), telemetry, routeEvidence };
  } catch (e) {
    // Memory is an assist. A failure to read it is never a failure to render.
    console.warn("[RECALL] unavailable:", e instanceof Error ? e.message : String(e));
    return EMPTY;
  }
}

export { MAX_RECALL, strongest, asSentence };
