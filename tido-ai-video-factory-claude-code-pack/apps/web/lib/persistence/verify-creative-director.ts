/**
 * Phase 4, against the live database: the Creative Director's whole loop.
 *
 *   evaluated concepts are stored -> a person rejects a route three times ->
 *   the rejections reach patterns, events and preferences -> recall turns them
 *   into route evidence -> the evaluator sets the route aside next time.
 *
 * Drives the real persistence code with a database-only probe identity (a
 * `firebase_uid` string, no Firebase account). The judgments are fixtures in
 * the director's exact shape: what is tested is everything that happens to a
 * judgment once it exists. Every row it creates is removed.
 *
 * Usage: npm run verify:creative-director   (from apps/web)
 */

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { recordGeneration, runUuid } from "./record-generation";
import { recallForBrief } from "./recall-memory";
import { recordApproval, loadKitForIdentity } from "@/lib/user-kit/kit-memory";
import { preferenceDecisions } from "@/lib/image-engine/evolution/experiment/UserKit";
import { applyEvaluation, evaluateDirections } from "@/lib/image-engine/evolution/experiment/DirectionEvaluator";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
loadEnv();
// Embeddings are not what this verifies; keep the run free of model calls.
process.env.TIDO_PATTERN_EMBEDDINGS = "off";

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
  firebaseUid: `director-probe-${STAMP}`,
  email: `director-probe-${STAMP}@example.invalid`,
  displayName: "Director Probe",
  emailVerified: true,
};

const EDITORIAL = "editorial advertising — a photograph with a point of view";
const ICONIC = "iconic product composition — the object itself is the idea";
const v = (stance: string, because: string) => ({ stance, because, evidence: "quoted from the brief" });
const assessment = {
  product: v("supports", "the glass reads as real"),
  audience: v("supports", "office workers"),
  objective: v("supports", "promotion"),
  brand: v("neutral", "no brand history"),
  channel: v("supports", "square post"),
  feasibility: v("supports", "one product"),
};

function directorJudgment() {
  return {
    directions: [],
    selected: "",
    selection_reason: "",
    reasoning: {
      camera: { choice: "waist-high 50mm", reason: "editorial" },
      lighting: { choice: "window light", reason: "morning" },
      composition: { choice: "desk context", reason: "story" },
      typography: { choice: "serif headline", reason: "magazine" },
      colour: { choice: "warm neutrals", reason: "calm" },
    },
    strategy: {
      routes_offered: [EDITORIAL, ICONIC],
      routes_developed: [EDITORIAL, ICONIC],
      selected: EDITORIAL,
      selection_reason: "the audience reads magazines",
      runner_up: ICONIC,
      why_not_runner_up: "the label would carry the frame alone",
      candidates: [
        { route: EDITORIAL, core_idea: "a desk at 7am", visual_language: "window light", composition: "product lower third", typography: "serif headline top left", lighting: "soft window light", why_this_route: "fits calm", assessment },
        { route: ICONIC, core_idea: "the bottle alone", visual_language: "hard key", composition: "bottle centred, low angle", typography: "bold sans at the base", lighting: "hard key, rim light", why_this_route: "distinctive glass", assessment: { ...assessment, brand: v("supports", "the glass is the brand") } },
      ],
    },
  };
}

/** A finished render made from `judgment`, shaped as the pipeline returns it. */
function render(engineId: string, judgment: object) {
  const result = {
    success: true,
    generationId: engineId,
    status: "COMPLETED",
    imageUrl: `/api/image/generated/${engineId}`,
    useCase: "Poster",
    aspectRatio: "1:1",
    // As the pipeline derives it: from the (evaluated) judgment's selected route.
    creativeIntelligence: {
      selected_direction: (judgment as { strategy?: { selected?: string } }).strategy?.selected ?? EDITORIAL,
      undecided: [],
    },
  };
  for (const [k, value] of Object.entries({
    routingDecision: { pipeline: "experiment", pipeline_version: "V4.0.5_EXPERIMENT", features_enabled: ["creative_director_control_v1"] },
    compiledPrompt: "PROMPT",
    creativeBlueprint: { metrics: { grounded_in_product_score: 0.4 } },
    creativeJudgment: judgment,
  })) Object.defineProperty(result, k, { value, enumerable: false, configurable: true });
  return result;
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
  const gens = [1, 2, 3, 4].map((n) => `gen-director-probe-${STAMP}-${n}`);
  const runs = gens.map(runUuid);
  const request = { concept: "cold brew for mornings", useCase: "Poster", aspectRatio: "1:1", copyItems: [], images: [] };

  try {
    console.log("\nCreative Director loop, against the live schema\n");

    // ── 4.1-4.3: evaluated concepts are stored ─────────────────────────────
    console.log("Evaluated concepts (4.1-4.3)");
    const first = applyEvaluation(directorJudgment() as never, evaluateDirections(directorJudgment() as never, { productObserved: true }));
    await recordGeneration({ request: request as never, result: render(gens[0], first) as never, identity: IDENTITY });

    const cc = (await db.from("creative_concepts").select("*").eq("run_id", runs[0]).order("id")).data || [];
    const chosen = cc.find((c) => c.selected);
    check("every direction is stored as a concept", cc.length === 2, `${cc.length}`);
    check("each carries composition, typography and lighting", cc.every((c) => c.details?.composition && c.details?.typography && c.details?.lighting));
    check("each carries a score, strengths, weaknesses and a risk",
      cc.every((c) => typeof Number(c.score) === "number" && c.evaluation?.risk?.level && Array.isArray(c.evaluation?.strengths)),
      JSON.stringify(cc.map((c) => c.score)));
    check("the selected concept says why it was selected, and by whom",
      chosen?.route === EDITORIAL && chosen?.evaluation?.selection?.source === "director" && /magazines/.test(chosen?.why_this_route || ""));
    check("the runner-up keeps the director's reason for turning it down",
      /carry the frame/.test(cc.find((c) => c.route === ICONIC)?.rejected_reason || ""));

    // ── 4.6: three rejections of the same route ───────────────────────────
    console.log("\nRejections (4.6)");
    // The third rejection arrives BEFORE its render is stored: the late path.
    for (const n of [1, 2]) {
      await recordGeneration({ request: request as never, result: render(gens[n], first) as never, identity: IDENTITY });
    }
    for (const n of [0, 1]) {
      await recordApproval(IDENTITY, { kind: "reject", generationId: gens[n], intelligence: { selected_direction: EDITORIAL } });
    }
    await recordApproval(IDENTITY, { kind: "reject", generationId: gens[2], intelligence: { selected_direction: EDITORIAL } });
    // A duplicate reject click, and a regenerate of an already-rejected render.
    const dup = await recordApproval(IDENTITY, { kind: "reject", generationId: gens[0], intelligence: { selected_direction: EDITORIAL } });
    await recordApproval(IDENTITY, { kind: "repeat_edit", generationId: gens[0] });
    check("a second reject of one render is refused as a duplicate", dup.duplicate === true);

    const profile = (await db.from("user_profiles").select("id").eq("firebase_uid", IDENTITY.firebaseUid).maybeSingle()).data;
    const events = (await db.from("user_events").select("kind, run_id").eq("user_id", profile?.id)).data || [];
    check("user_events: every signal kept, linked to its run",
      events.filter((e) => e.kind === "reject").length === 3 && events.every((e) => e.run_id),
      JSON.stringify(events.map((e) => [e.kind, Boolean(e.run_id)])));

    const actor = await infra.identity.resolveActor(IDENTITY);
    if (!actor.ok) throw new Error(actor.error);
    const orgId = actor.data.memberships[0]?.org_id;
    const direction = (await db.from("creative_patterns").select("support_count, approved_count, rejected_count, rejected_runs")
      .eq("org_id", orgId).eq("dimension", "direction")).data?.[0];
    check("creative_patterns: the route was made 3 times and rejected 3 times, once per run",
      direction?.support_count === 3 && direction?.rejected_count === 3 && (direction?.rejected_runs || []).length === 3,
      JSON.stringify(direction));

    const kit = await loadKitForIdentity(IDENTITY);
    const avoid = preferenceDecisions(kit).filter((d) => d.negative);
    check("user_preferences: three rejections became one thresholded 'avoid'",
      avoid.length === 1 && avoid[0].decision.value === "Avoid: editorial advertising",
      JSON.stringify(avoid.map((a) => a.decision.value)));
    const ucp = (await db.from("user_creative_profiles").select("observed_runs").eq("user_id", profile?.id).maybeSingle()).data;
    check("a rejection is not counted as an approved run", (ucp?.observed_runs ?? 0) === 0, JSON.stringify(ucp));

    // ── the next render: memory sets the route aside ───────────────────────
    console.log("\nThe next render (4.2-4.4)");
    const recalled = await recallForBrief({ identity: IDENTITY, brief: "cold brew for mornings", kit });
    const ev = recalled.routeEvidence.find((e) => /editorial/.test(e.route));
    check("recall hands the director this account's route history",
      ev?.runs === 3 && ev?.rejected === 3 && ev?.preference === "avoid", JSON.stringify(ev));

    const evaluation = evaluateDirections(directorJudgment() as never, { evidence: recalled.routeEvidence, productObserved: true });
    check("the evaluator sets the rejected route aside for the other developed direction",
      evaluation?.source === "memory_override" && evaluation?.selected === ICONIC, JSON.stringify({ source: evaluation?.source, selected: evaluation?.selected }));
    check("and says why, citing the evidence", /rejected in 3 of 3/.test(evaluation?.set_aside_reason || "") && /turned this direction down/.test(evaluation?.set_aside_reason || ""),
      evaluation?.set_aside_reason);

    const next = applyEvaluation(directorJudgment() as never, evaluation);
    await recordGeneration({ request: request as never, result: render(gens[3], next) as never, identity: IDENTITY });
    const after = (await db.from("creative_concepts").select("route, selected, rejected_reason, evaluation").eq("run_id", runs[3])).data || [];
    check("the stored decision records the override and the set-aside route",
      after.find((c) => c.selected)?.route === ICONIC &&
        after.find((c) => c.selected)?.evaluation?.selection?.source === "memory_override" &&
        /set aside/.test(after.find((c) => c.route === EDITORIAL)?.rejected_reason || ""));

    // ── approval still promotes, and only approval does ────────────────────
    console.log("\nApproval (4.6)");
    await recordApproval(IDENTITY, { kind: "approve", generationId: gens[3], intelligence: { selected_direction: ICONIC } });
    const iconic = (await db.from("creative_patterns").select("approved_count, rejected_count").eq("org_id", orgId).eq("dimension", "direction").ilike("value", "iconic%")).data?.[0];
    check("an approval promotes the kept route and records no rejection", iconic?.approved_count === 1 && (iconic?.rejected_count ?? 0) === 0, JSON.stringify(iconic));
  } catch (e) {
    failed++;
    console.error("verification failed:", e instanceof Error ? e.message : String(e));
  } finally {
    try {
      // Profile first: runs with events cannot be deleted while the events
      // exist (append-only trigger vs ON DELETE SET NULL).
      const prof = (await db.from("user_profiles").select("id").eq("firebase_uid", IDENTITY.firebaseUid).maybeSingle()).data;
      if (prof?.id) {
        const orgs = ((await db.from("workspace_members").select("org_id").eq("user_id", prof.id)).data || []).map((m) => m.org_id);
        await db.from("creative_requests").delete().eq("user_id", prof.id);
        const p = await db.from("user_profiles").delete().eq("id", prof.id);
        if (p.error) console.error("profile cleanup:", p.error.message);
        if (orgs.length) await db.from("organizations").delete().in("id", orgs);
      }
      const r = await db.from("creative_runs").delete().in("id", runs);
      if (r.error) console.error("run cleanup:", r.error.message);
      const left = await Promise.all([
        db.from("user_profiles").select("id", { count: "exact", head: true }).eq("firebase_uid", IDENTITY.firebaseUid),
        db.from("creative_runs").select("id", { count: "exact", head: true }).in("id", runs),
        db.from("creative_concepts").select("id", { count: "exact", head: true }).in("run_id", runs),
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
