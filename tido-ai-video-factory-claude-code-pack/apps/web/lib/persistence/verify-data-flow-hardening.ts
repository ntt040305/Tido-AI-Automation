/**
 * Production Data Flow Hardening, against the live database.
 *
 * Drives the REAL persistence code -- `recordGeneration`, `recordApproval`,
 * `recallForBrief` -- with real embeddings, for a signed-in identity. What is
 * synthetic is only the render result handed in: no image is generated here,
 * because the question is what happens to a result once it exists. The
 * real-render half is the authenticated browser flow in the report.
 *
 * The identity is a database-only probe (a `firebase_uid` string, no Firebase
 * account), exactly as `verify-creative-memory.ts` does. Every row it creates
 * is removed, including on failure.
 *
 * Usage: npm run verify:hardening   (from apps/web)
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { recordGeneration, runUuid } from "./record-generation";
import { recallForBrief } from "./recall-memory";
import { recordApproval } from "@/lib/user-kit/kit-memory";
import { memoryContextBrief } from "@/lib/image-engine/evolution/experiment/CreativeDirectorV1";
import { EmbeddingService } from "@/lib/image-engine/retrieval/EmbeddingService";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnv();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

const STAMP = Date.now();
const IDENTITY: VerifiedIdentity = {
  firebaseUid: `hardening-probe-${STAMP}`,
  email: `hardening-probe-${STAMP}@example.invalid`,
  displayName: "Hardening Probe",
  emailVerified: true,
};

/** Observations as the analyzer reports them -- the same object, photographed twice. */
const CUP_A = {
  form: "a straight-sided cylindrical cup",
  materials: ["unglazed stoneware"],
  palette: ["bone", "warm grey"],
  finish: "matte",
  surface_detail: "faint throwing rings",
  scale_cues: "fits in one hand",
};
const CUP_B = {
  form: "a cylindrical cup with straight sides",
  materials: ["unglazed stoneware"],
  palette: ["bone white", "grey"],
  finish: "matte, unpolished",
  surface_detail: "visible throwing rings",
  scale_cues: "hand-sized",
};

const analysis = (hash: string, issues: number) => ({
  analyzed_image: true,
  provider: "llm-gateway",
  image_hash: hash,
  strengths: [{ what: "the product reads as a real object" }],
  issues: Array.from({ length: issues }, (_, i) => ({ what: `issue ${i + 1}` })),
  typography_problems: [{ what: "the headline lacks dominance" }],
  layout_problems: [],
  product_accuracy: [],
  improvement_actions: [],
});

function hide<T extends object>(target: T, values: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(target, k, { value: v, enumerable: false, configurable: true });
  }
  return target;
}

/** A finished experiment render with a vision correction, shaped as the pipeline returns it. */
function renderResult(engineId: string, observed: object) {
  const v1 = analysis("aaaa000000000001", 2);
  const v2 = analysis("aaaa000000000002", 0);
  const intelligence = {
    creative_summary: "A quiet morning ritual, the cup as its anchor.",
    selected_direction: "emotional storytelling — a moment the viewer recognises",
    visual_strategy: { what: "warm low side light, shallow depth" },
    typography_reasoning: { what: "one dominant serif headline" },
    layout_reasoning: { what: "product lower third, headline top left" },
    composition_reasoning: { what: "off-centre, weight lower left" },
    undecided: ["palette"],
    concepts: [],
  };
  const result = {
    success: true,
    generationId: engineId,
    status: "COMPLETED",
    imageUrl: `/api/image/generated/${engineId}-v2`,
    useCase: "Poster",
    aspectRatio: "1:1",
    strategy: { creative_angle: "the ritual, not the object" },
    creativeIntelligence: intelligence,
    visionAnalysis: v2,
    designDecisions: {
      typography_decisions: [
        {
          role: "headline",
          problem: "the headline lacks dominance",
          decision: "Increase headline scale from 2 to 2.7",
          reason: "The headline is not the first anchor.",
          decision_confidence: "high",
          from: 2,
          to: 2.7,
          applied: true,
        },
      ],
      layout_decisions: [],
      protected_elements: [],
    },
    renderComparison: {
      first: `/api/image/generated/${engineId}-v1`,
      second: `/api/image/generated/${engineId}-v2`,
      recommendation: "the correction reduced problems",
    },
  };
  return hide(result, {
    routingDecision: { pipeline: "experiment", pipeline_version: "V4.0.5_EXPERIMENT", features_enabled: ["vision_iteration_v1"] },
    compiledPrompt: "PROMPT V2 — corrected render",
    creativeBlueprint: { concept: { big_idea: { value: "the pause before the day" } }, metrics: { grounded_in_product_score: 0.62 } },
    marketingStrategy: { creative_angle: "the ritual, not the object" },
    assetDna: { product: { form: "cylindrical cup", material: "unglazed stoneware" } },
    visualDna: {
      observed: { product: observed },
      provenance: {
        derived_from_image: true,
        analyzed_roles: ["PRODUCT"],
        source_hashes: [crypto.randomBytes(8).toString("hex")],
        analyzed_at: new Date().toISOString(),
      },
    },
    creativeJudgment: {
      directions: [
        {
          name: "emotional storytelling — a moment the viewer recognises",
          core_idea: "the first quiet sip before the house wakes",
          visual_language: "low warm side light, steam, linen",
          why_it_fits: "the brief is about calm",
        },
        {
          name: "iconic product composition — the object itself is the idea",
          core_idea: "the cup alone, monumental",
          visual_language: "hard light, seamless backdrop",
          why_it_fits: "the surface is distinctive",
        },
      ],
      selected: "emotional storytelling — a moment the viewer recognises",
      selection_reason: "calm is a feeling, and a feeling needs a moment",
      rejected_reason: "a matte surface dies under hard product light",
      strategy: { routes_offered: ["seasonal ritual"] },
      reasoning: { composition: { value: "off-centre, weight lower left" }, lighting: { value: "low warm side light" } },
    },
    visionTrace: {
      versions: [
        { version: 1, imageUrl: `/api/image/generated/${engineId}-v1`, prompt: "PROMPT V1 — first render", analysis: v1 },
        { version: 2, imageUrl: `/api/image/generated/${engineId}-v2`, prompt: "PROMPT V2 — corrected render", analysis: v2 },
      ],
      instruction: "EXECUTION CORRECTIONS: increase headline scale from 2 to 2.7",
      selected: 2,
    },
  });
}

function request(photo: Buffer) {
  return {
    concept: "A stoneware cup on linen, the calm before the day",
    useCase: "Poster",
    aspectRatio: "1:1",
    copyItems: [],
    images: [{ reference_id: "REF_01", buffer: photo, mimeType: "image/png", filename: "cup.png" }],
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const infra = getInfrastructure();

  const gen1 = `gen-hardening-probe-${STAMP}-1`;
  const gen2 = `gen-hardening-probe-${STAMP}-2`;
  const run1 = runUuid(gen1);
  const run2 = runUuid(gen2);
  const photoA = crypto.randomBytes(2048);
  const photoB = crypto.randomBytes(2048);

  try {
    console.log("\nData flow hardening, against the live schema\n");

    // ── one signed-in render, through the real persistence path ───────────
    console.log("A signed-in render with a vision correction (Bugs #1, #3, #6)");
    await recordGeneration({ request: request(photoA) as never, result: renderResult(gen1, CUP_A) as never, identity: IDENTITY, durationMs: 1234 });

    const profile = (await db.from("user_profiles").select("*").eq("firebase_uid", IDENTITY.firebaseUid).maybeSingle()).data;
    check("the person was registered", Boolean(profile?.id));
    check("with their email and display name", profile?.email === IDENTITY.email && profile?.display_name === IDENTITY.displayName,
      `${profile?.email} / ${profile?.display_name}`);

    const run = (await db.from("creative_runs").select("*").eq("id", run1).maybeSingle()).data;
    check("creative_runs: owned by the person, experiment pipeline", run?.user_id === profile?.id && run?.pipeline === "experiment" && Boolean(run?.org_id),
      JSON.stringify({ user: run?.user_id, org: run?.org_id, pipeline: run?.pipeline }));

    const ci = (await db.from("creative_intelligence").select("*").eq("run_id", run1).maybeSingle()).data;
    check("creative_intelligence: the served prompt is stored", ci?.prompt === "PROMPT V2 — corrected render", String(ci?.prompt));

    const bp = (await db.from("creative_blueprints").select("*").eq("run_id", run1).maybeSingle()).data;
    check("creative_blueprints: a vision run keeps its blueprint", Boolean(bp?.blueprint) && Number(bp?.grounded_score) === 0.62);

    const its = (await db.from("render_iterations").select("*").eq("run_id", run1).order("version")).data || [];
    check("render_iterations: V1 and V2, each with its own prompt",
      its.length === 2 && its[0].prompt === "PROMPT V1 — first render" && its[1].prompt === "PROMPT V2 — corrected render");
    check("render_iterations: V2 carries the correction it was sent", !its[0].instruction && /EXECUTION CORRECTIONS/.test(its[1]?.instruction || ""));
    check("render_iterations: per-version problem counts, V2 served",
      its[0]?.problem_count === 3 && its[1]?.problem_count === 1 && its[1]?.selected === true && its[0]?.selected === false,
      JSON.stringify(its.map((i) => [i.version, i.problem_count, i.selected])));

    const vr = (await db.from("vision_reviews").select("*").eq("run_id", run1).order("version")).data || [];
    check("vision_reviews: the V1 review that justified the correction is kept, under V1",
      vr.length === 2 && vr[0].version === 1 && vr[0].problem_count === 3 && vr[1].version === 2 && vr[1].problem_count === 1,
      JSON.stringify(vr.map((v) => [v.version, v.problem_count])));

    const dd = (await db.from("design_decisions").select("*").eq("run_id", run1)).data || [];
    check("design_decisions: reasoning and before/after values", dd.length === 1 && dd[0].reason && dd[0].value_from === "2" && dd[0].value_to === "2.7");

    const cc = (await db.from("creative_concepts").select("*").eq("run_id", run1).order("id")).data || [];
    check("creative_concepts: every direction considered is stored (Bug #1)", cc.length === 3, `${cc.length} rows`);
    check("creative_concepts: exactly one selected, the rejection reason kept",
      cc.filter((c) => c.selected).length === 1 && cc.some((c) => !c.selected && c.rejected_reason),
      JSON.stringify(cc.map((c) => [c.route.slice(0, 20), c.selected, Boolean(c.rejected_reason), c.origin])));

    const actor = await infra.identity.resolveActor(IDENTITY);
    if (!actor.ok) throw new Error(actor.error);
    const orgId = actor.data.memberships[0]?.org_id;

    const patterns = (await db.from("creative_patterns").select("id, dimension, value, embedding_model, evidence_runs, approved_count, approved_runs").eq("org_id", orgId)).data || [];
    check("creative_patterns: learned from the render", patterns.length >= 4, `${patterns.length} patterns`);
    const embedded = patterns.filter((p) => p.embedding_model === IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL);
    check("creative_patterns: new patterns are embedded (Bug #5)", embedded.length === patterns.length,
      `${embedded.length} of ${patterns.length} embedded`);

    const assetsA = (await db.from("asset_memory").select("*").eq("user_id", profile?.id)).data || [];
    check("asset_memory: the upload is remembered with what was observed", assetsA.length === 1 && Object.keys(assetsA[0].observed || {}).length > 0);
    const facetsA = (await db.from("asset_embeddings").select("facet, model").eq("asset_id", assetsA[0]?.id)).data || [];
    check("asset_embeddings: the upload is indexed", facetsA.length > 0, `${facetsA.length} facets`);

    // ── the download signal ────────────────────────────────────────────────
    console.log("\nThe download signal (Bug #2)");
    const outcome = await recordApproval(IDENTITY, {
      kind: "download",
      // Exactly what the old UI sent: the ASSET id.
      generationId: `ast_img_${gen1}`,
      intelligence: renderResult(gen1, CUP_A).creativeIntelligence,
    });
    check("the signal was recorded in the database", outcome.recorded && outcome.storage === "database", JSON.stringify(outcome));

    const ev = (await db.from("user_events").select("*").eq("user_id", profile?.id)).data || [];
    check("user_events: kind, user_id and run_id", ev.length === 1 && ev[0].kind === "download" && ev[0].run_id === run1,
      JSON.stringify(ev.map((e) => ({ kind: e.kind, run: e.run_id, eng: e.engine_generation_id }))));

    const ucp = (await db.from("user_creative_profiles").select("*").eq("user_id", profile?.id).maybeSingle()).data;
    check("user_creative_profiles: the person has a memory profile", ucp?.observed_runs === 1, JSON.stringify(ucp));
    const prefs = (await db.from("user_preferences").select("area, occurrences").eq("user_id", profile?.id)).data || [];
    check("user_preferences: what they kept was learned", prefs.length > 0, `${prefs.length} preferences`);

    const promoted = (await db.from("creative_patterns").select("approved_count, approved_runs").eq("org_id", orgId)).data || [];
    check("creative_patterns: the download promoted the render's patterns",
      promoted.length > 0 && promoted.every((p) => p.approved_count === 1 && (p.approved_runs || []).includes(run1)),
      JSON.stringify(promoted.map((p) => p.approved_count)));

    // ── an approval that beats the background write ────────────────────────
    console.log("\nAn approval that arrives before the render's patterns exist");
    await recordApproval(IDENTITY, { kind: "download", generationId: gen2, intelligence: null });
    await recordGeneration({ request: request(photoB) as never, result: renderResult(gen2, CUP_B) as never, identity: IDENTITY });
    const late = (await db.from("creative_patterns").select("evidence_runs, approved_runs").eq("org_id", orgId)).data || [];
    const run2Patterns = late.filter((p) => (p.evidence_runs || []).includes(run2));
    check("the early download still credits the render's patterns",
      run2Patterns.length > 0 && run2Patterns.every((p) => (p.approved_runs || []).includes(run2)),
      `${run2Patterns.filter((p) => (p.approved_runs || []).includes(run2)).length} of ${run2Patterns.length}`);

    // ── vector retrieval ───────────────────────────────────────────────────
    console.log("\nVector memory retrieval (Bug #5)");
    const assetsAll = (await db.from("asset_memory").select("id, content_hash").eq("user_id", profile?.id)).data || [];
    const hashA = crypto.createHash("sha256").update(photoA).digest("hex");
    const idA = assetsAll.find((a) => a.content_hash === hashA)?.id;
    const near = await infra.assetSemantics.similar(actor.data, { facet: "identity", assetId: idA, limit: 3 });
    check("similar asset retrieval finds the same product in the other photograph",
      near.ok && near.data.length === 1 && near.data[0].asset_id !== idA,
      near.ok ? JSON.stringify(near.data.map((n) => n.score.toFixed(3))) : near.error);

    const query = await EmbeddingService.embedText("a calm morning coffee ritual, an emotional moment", true);
    const nearPatterns = await infra.creativeMemory.similarPatterns(actor.data, {
      embedding: query,
      model: IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL,
      limit: 5,
    });
    check("similar pattern retrieval ranks learned patterns against a brief",
      nearPatterns.ok && nearPatterns.data.length > 0,
      nearPatterns.ok ? nearPatterns.data.map((p) => `${p.dimension} ${p.score.toFixed(2)}`).join(", ") : nearPatterns.error);

    // ── memory into the director ───────────────────────────────────────────
    console.log("\nMemory into the creative director (Bug #4)");
    const recalled = await recallForBrief({ identity: IDENTITY, brief: "a calm morning with a stoneware cup", attachments: [{ buffer: photoA }] });
    check("recall recognises the exact asset", recalled.sentences.some((s) => /this exact asset has been used/.test(s)), JSON.stringify(recalled.telemetry));
    check("recall surfaces the similar asset, worded as a ranking", recalled.sentences.some((s) => /resembles this asset .*a ranking not a match/.test(s)));
    const block = memoryContextBrief([], recalled.sentences);
    check("the recalled memory becomes the director's context block",
      Boolean(block) && block!.includes("observations, not instructions") && recalled.sentences.every((s) => block!.includes(s)));

    // ── identity is not erased by a UID-only caller ────────────────────────
    console.log("\nIdentity (Bug #6)");
    await infra.identity.resolveActor({ firebaseUid: IDENTITY.firebaseUid, emailVerified: false });
    const after = (await db.from("user_profiles").select("email, display_name").eq("firebase_uid", IDENTITY.firebaseUid).maybeSingle()).data;
    check("a caller holding only the UID no longer erases email and name",
      after?.email === IDENTITY.email && after?.display_name === IDENTITY.displayName, JSON.stringify(after));
  } catch (e) {
    failed++;
    console.error("verification failed:", e instanceof Error ? e.message : String(e));
  } finally {
    try {
      // Profile first. Deleting a run that has events fails: `user_events.run_id`
      // is ON DELETE SET NULL, and 0005's append-only trigger refuses the
      // UPDATE that implies. Removing the person cascades their events away.
      const prof = (await db.from("user_profiles").select("id").eq("firebase_uid", IDENTITY.firebaseUid).maybeSingle()).data;
      if (prof?.id) {
        const orgs = ((await db.from("workspace_members").select("org_id").eq("user_id", prof.id)).data || []).map((m) => m.org_id);
        await db.from("creative_requests").delete().eq("user_id", prof.id);
        const p = await db.from("user_profiles").delete().eq("id", prof.id);
        if (p.error) console.error("profile cleanup:", p.error.message);
        if (orgs.length) await db.from("organizations").delete().in("id", orgs);
      }
      const r = await db.from("creative_runs").delete().in("id", [run1, run2]);
      if (r.error) console.error("run cleanup:", r.error.message);
      const left = await Promise.all([
        db.from("user_profiles").select("id", { count: "exact", head: true }).eq("firebase_uid", IDENTITY.firebaseUid),
        db.from("creative_runs").select("id", { count: "exact", head: true }).in("id", [run1, run2]),
        db.from("creative_concepts").select("id", { count: "exact", head: true }).in("run_id", [run1, run2]),
      ]);
      console.log(`\ncleanup: profiles=${left[0].count} runs=${left[1].count} concepts=${left[2].count}`);
    } catch (e) {
      console.error("CLEANUP FAILED — inspect manually:", e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
