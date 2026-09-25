/**
 * Phases 3.3, 3.5 and 4 against the live database.
 *
 * Drives the real repositories, with real embeddings where meaning is
 * involved. The properties checked here are the ones the application depends
 * on and cannot verify for itself: that a counter cannot be inflated, that one
 * workspace cannot read another's learned patterns, and that a run records one
 * decision rather than several.
 *
 * Every account and row it creates is removed, including on failure.
 */

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@tido/shared";
import { MIN_PATTERN_SUPPORT, patternQualifies } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
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

const UID_A = "patterns-probe-alice";
const UID_B = "patterns-probe-bob";
const MODEL = IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL;

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

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const infra = getInfrastructure();
  const runIds: string[] = [];

  async function actorFor(uid: string): Promise<Actor> {
    const r = await infra.identity.resolveActor({ firebaseUid: uid, emailVerified: false });
    if (!r.ok) throw new Error(`could not resolve ${uid}: ${r.error}`);
    return r.data;
  }

  /** A real run row, so concepts have something to hang off. */
  async function makeRun(actor: Actor, n: number): Promise<string> {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const res = await db.from("creative_runs").upsert(
      {
        id,
        engine_generation_id: `gen-pattern-probe-${n}`,
        status: "COMPLETED",
        pipeline: "experiment",
        success: true,
        user_id: actor.profile.id,
        org_id: actor.memberships[0]?.org_id ?? null,
        concept: "a ceramic cup",
      },
      { onConflict: "id" },
    );
    if (res.error) throw new Error(`run ${n}: ${res.error.message}`);
    runIds.push(id);
    return id;
  }

  try {
    console.log("\nCreative patterns and concepts, against the live schema\n");

    const alice = await actorFor(UID_A);
    const bob = await actorFor(UID_B);

    const r1 = await makeRun(alice, 1);
    const r2 = await makeRun(alice, 2);
    const r3 = await makeRun(alice, 3);
    const rb = await makeRun(bob, 9);

    // ── learning ────────────────────────────────────────────────────────────
    console.log("Learning");

    const first = await infra.creativeMemory.learnPatterns(alice, [
      { dimension: "direction", value: "luxury minimal", runId: r1, problems: 0 },
      { dimension: "composition", value: "off-centre, weight lower left", runId: r1, problems: 0 },
    ]);
    check("observations become patterns", first.ok && first.data.created === 2,
      first.ok ? JSON.stringify(first.data) : first.error);

    const repeat = await infra.creativeMemory.learnPatterns(alice, [
      { dimension: "direction", value: "luxury minimal", runId: r1, problems: 0 },
    ]);
    check("the same run cannot be counted twice",
      repeat.ok && repeat.data.reinforced === 0 && repeat.data.skipped === 1,
      repeat.ok ? JSON.stringify(repeat.data) : repeat.error);

    // Case-insensitively the same pattern, from a different run.
    await infra.creativeMemory.learnPatterns(alice, [
      { dimension: "direction", value: "Luxury Minimal", runId: r2, problems: 1 },
    ]);
    await infra.creativeMemory.learnPatterns(alice, [
      { dimension: "direction", value: "luxury minimal", runId: r3, problems: 0 },
    ]);

    const held = await infra.creativeMemory.listPatterns(alice, "direction");
    const direction = held.ok ? held.data.find((p) => p.value_key === "luxury minimal") : null;
    check("one pattern, not three spellings of it", held.ok && held.data.length === 1,
      held.ok ? `${held.data.length}` : held.error);
    check("three different runs raise support to three", direction?.support_count === 3,
      `${direction?.support_count}`);
    check("problems accumulate across those runs", direction?.problem_count === 1,
      `${direction?.problem_count}`);
    check("but nothing is approved yet", direction?.approved_count === 0,
      `${direction?.approved_count}`);

    check("and so it does not qualify: support without approval and with a problem",
      direction ? !patternQualifies(direction) : false,
      "a pattern with a problem and no approval was offered as guidance");

    // ── approval ────────────────────────────────────────────────────────────
    console.log("\nApproval");

    const promoted = await infra.creativeMemory.markRunApproved(alice, r1);
    check("approving a run promotes the patterns learned from it",
      promoted.ok && promoted.data >= 1, promoted.ok ? `${promoted.data}` : promoted.error);

    const again = await infra.creativeMemory.markRunApproved(alice, r1);
    check("approving the same run twice promotes nothing further",
      again.ok && again.data === 0, again.ok ? `${again.data}` : again.error);

    const afterApproval = await infra.creativeMemory.listPatterns(alice, "direction");
    const promotedRow = afterApproval.ok ? afterApproval.data[0] : null;
    check("the approval count rose exactly once", promotedRow?.approved_count === 1,
      `${promotedRow?.approved_count}`);
    check("and now it qualifies", promotedRow ? patternQualifies(promotedRow) : false);

    check("support never counts a run that was only approved",
      promotedRow?.support_count === 3, `${promotedRow?.support_count}`);

    // ── isolation ───────────────────────────────────────────────────────────
    console.log("\nIsolation");

    await infra.creativeMemory.learnPatterns(bob, [
      { dimension: "direction", value: "luxury minimal", runId: rb, problems: 0 },
    ]);

    const bobsPatterns = await infra.creativeMemory.listPatterns(bob, "direction");
    check("the same pattern learned by two workspaces is two rows",
      bobsPatterns.ok && bobsPatterns.data.length === 1 &&
        bobsPatterns.data[0].id !== promotedRow?.id);
    check("and each carries only its own evidence",
      bobsPatterns.ok && bobsPatterns.data[0].support_count === 1,
      bobsPatterns.ok ? `${bobsPatterns.data[0].support_count}` : "");

    const crossPromote = await infra.creativeMemory.markRunApproved(bob, r1);
    check("approving someone else's run promotes nothing of theirs",
      crossPromote.ok && crossPromote.data === 0,
      crossPromote.ok ? `${crossPromote.data}` : crossPromote.error);

    const aliceUnchanged = await infra.creativeMemory.listPatterns(alice, "direction");
    check("and leaves their counts alone",
      aliceUnchanged.ok && aliceUnchanged.data[0].approved_count === 1);

    // RLS, as PostgREST would apply it.
    const asBob = await db.rpc("search_creative_patterns", {
      p_org: bob.memberships[0]?.org_id ?? null,
      p_user: bob.memberships[0]?.org_id ? null : bob.profile.id,
      p_query: `[${new Array(768).fill(0.01).join(",")}]`,
      p_model: MODEL,
      p_dimension: null,
      p_limit: 50,
      p_min: -1,
    });
    check("a search scoped to one workspace never returns another's rows",
      !asBob.error && (asBob.data || []).every((r: { id: number }) => r.id !== promotedRow?.id),
      asBob.error ? asBob.error.message : "");

    // ── meaning ─────────────────────────────────────────────────────────────
    console.log("\nMeaning");

    if (process.env.GEMINI_API_KEY) {
      const text = "direction: luxury minimal — the object alone, given room, one soft source";
      const vector = await EmbeddingService.embedText(text, false);
      const embedded = await infra.creativeMemory.embedPattern(
        alice,
        promotedRow!.id,
        text,
        vector,
        MODEL,
      );
      check("a pattern can be given meaning", embedded.ok && embedded.data === true,
        embedded.ok ? "" : embedded.error);

      const near = await EmbeddingService.embedText("a restrained, minimal luxury still life", true);
      const found = await infra.creativeMemory.similarPatterns(alice, {
        embedding: near,
        model: MODEL,
        limit: 10,
        minScore: -1,
      });
      check("a related brief finds it", found.ok && found.data.some((p) => p.id === promotedRow!.id),
        found.ok ? `${found.data.length} result(s)` : found.error);
      if (found.ok && found.data.length) {
        console.log(`    score ${found.data[0].score.toFixed(3)}`);
        check("the result carries the evidence, not just the value",
          typeof found.data[0].support_count === "number" && typeof found.data[0].approved_count === "number");
      }

      const unsupported = await infra.creativeMemory.similarPatterns(alice, {
        embedding: near,
        model: MODEL,
        minSupport: MIN_PATTERN_SUPPORT + 10,
      });
      check("a support floor excludes patterns that have not earned it",
        unsupported.ok && unsupported.data.length === 0,
        unsupported.ok ? `${unsupported.data.length}` : unsupported.error);

      const wrongModel = await infra.creativeMemory.similarPatterns(alice, {
        embedding: near,
        model: "some-other-model",
      });
      check("a query from another model matches nothing rather than nonsense",
        wrongModel.ok && wrongModel.data.length === 0);
    } else {
      console.log("    (no GEMINI_API_KEY — meaning checks skipped, exact match still covers retrieval)");
    }

    // ── concepts ────────────────────────────────────────────────────────────
    console.log("\nConcepts");

    const stored = await infra.creativeMemory.recordConcepts(r1, [
      { route: "luxury minimal", coreIdea: "the object alone", whyThisRoute: "matte surface", selected: true, origin: "authored" },
      { route: "cinematic premium", coreIdea: "a moment", rejectedReason: "raking light flattens it", origin: "authored" },
      { route: "modern commercial", origin: "offered" },
    ]);
    check("every direction considered is stored", stored.ok && stored.data.stored === 3,
      stored.ok ? JSON.stringify(stored.data) : stored.error);
    check("and one of them is marked as the one that ran", stored.ok && stored.data.hasSelection);

    const readBack = await infra.creativeMemory.conceptsForRun(alice, r1);
    check("they can be read back", readBack.ok && readBack.data.length === 3,
      readBack.ok ? `${readBack.data.length}` : readBack.error);
    check("the winner comes first", readBack.ok && readBack.data[0].selected === true);
    check("a rejection reason survives", readBack.ok &&
      readBack.data.some((c) => c.rejected_reason?.includes("raking light")));

    const twoWinners = await db.from("creative_concepts").insert({
      run_id: r1, route: "a second winner", selected: true,
    });
    check("a run cannot record two winners", Boolean(twoWinners.error),
      twoWinners.error ? "" : "a second selected route was accepted");

    const reasonOnWinner = await db.from("creative_concepts").insert({
      run_id: r2, route: "x", selected: true, rejected_reason: "contradiction",
    });
    check("a rejection reason cannot be attached to the winner", Boolean(reasonOnWinner.error));

    const crossRead = await infra.creativeMemory.conceptsForRun(bob, r1);
    check("nobody reads another workspace's reasoning", crossRead.ok && crossRead.data.length === 0,
      crossRead.ok ? `${crossRead.data.length}` : crossRead.error);

    const rerun = await infra.creativeMemory.recordConcepts(r1, [
      { route: "luxury minimal", coreIdea: "the object alone, given room", selected: true, origin: "authored" },
    ]);
    check("recording the same run again updates rather than duplicates", rerun.ok,
      rerun.ok ? "" : rerun.error);
    const afterRerun = await infra.creativeMemory.conceptsForRun(alice, r1);
    check("and the run still has exactly three considered directions",
      afterRerun.ok && afterRerun.data.length === 3,
      afterRerun.ok ? `${afterRerun.data.length}` : "");

    // ── erasure ─────────────────────────────────────────────────────────────
    console.log("\nErasure");
    await db.from("creative_runs").delete().eq("id", r3);
    const orphans = await db.from("creative_concepts").select("id").eq("run_id", r3);
    check("deleting a run takes its reasoning with it",
      !orphans.error && (orphans.data || []).length === 0);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (e) {
    console.error("verification failed:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    try {
      if (runIds.length) await db.from("creative_runs").delete().in("id", runIds);
      const profiles = await db.from("user_profiles").select("id").in("firebase_uid", [UID_A, UID_B]);
      const ids = (profiles.data || []).map((p: { id: string }) => p.id);
      if (ids.length) {
        const members = await db.from("workspace_members").select("org_id").in("user_id", ids);
        const orgIds = (members.data || []).map((m: { org_id: string }) => m.org_id);
        await db.from("user_profiles").delete().in("id", ids);
        if (orgIds.length) await db.from("organizations").delete().in("id", orgIds);
      }
      const left = await db.from("creative_patterns").select("id");
      const concepts = await db.from("creative_concepts").select("id");
      const users = await db.from("user_profiles").select("id");
      console.log(
        `cleanup: patterns=${left.data?.length ?? "?"} concepts=${concepts.data?.length ?? "?"} profiles=${users.data?.length ?? "?"}`,
      );
    } catch (e) {
      console.error("CLEANUP FAILED — inspect the database:", e instanceof Error ? e.message : String(e));
    }
  }
}

void main();
