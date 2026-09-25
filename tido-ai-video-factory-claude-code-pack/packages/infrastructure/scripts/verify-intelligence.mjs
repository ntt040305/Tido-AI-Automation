#!/usr/bin/env node
/**
 * Proves the intelligence persistence path end to end, against the real schema.
 *
 * WHY THIS EXISTS SEPARATELY FROM A REAL RENDER
 * ----------------------------------------------
 * `design_decisions` and `vision_reviews` are only populated when the vision
 * loop runs, and every attempt to run it failed at the image provider
 * (`PROVIDER_TIMEOUT`). That left two tables unverified -- and "unverified
 * because something upstream broke" is indistinguishable, from the outside,
 * from "the persistence path is broken".
 *
 * This separates the two. It writes rows shaped exactly as the mapping in
 * `record-generation.ts` produces them, reads them back through the repository,
 * and checks the shape survived. If the vision loop had produced data, this is
 * what would have happened to it.
 *
 * What it does NOT prove: that the engine produces vision analysis. That needs
 * a working provider, and faking it here would test the fake.
 *
 * Everything it writes is removed, including on failure.
 */

import { createClient } from "./_connect.mjs";

const client = createClient(process.env.SUPABASE_DB_URL);

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

// A UUIDv5-shaped id, matching what record-generation derives from an engine id.
const RUN_ID = "11111111-2222-5333-8444-555555555555";
const ENGINE_ID = "gen-intelligence-probe";

try {
  await client.connect();
  console.log("Intelligence persistence, against the live schema\n");

  // A run to hang everything off, written directly since this is setup.
  await client.query(
    `insert into public.creative_runs (id, engine_generation_id, status, pipeline, success, concept)
     values ($1,$2,'COMPLETED','experiment',true,'intelligence probe')
     on conflict (id) do nothing`,
    [RUN_ID, ENGINE_ID],
  );

  // Rows shaped exactly as the mapping produces them.
  await client.query(
    `insert into public.creative_intelligence (run_id, selected_direction, strategy, intelligence, prompt)
     values ($1,$2,$3,$4,$5)
     on conflict (run_id) do update set prompt = excluded.prompt`,
    [
      RUN_ID,
      "emotional storytelling",
      JSON.stringify({ creative_angle: "the ritual, not the object" }),
      JSON.stringify({ selected_direction: "emotional storytelling", undecided: ["typography"] }),
      "A compiled prompt, as sent to the provider.",
    ],
  );
  await client.query(
    `insert into public.creative_blueprints (run_id, blueprint, typography, layout, composition, asset_dna, grounded_score, missing_count)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (run_id) do nothing`,
    [
      RUN_ID,
      JSON.stringify({ concept: { big_idea: { value: "the pause before the day" } }, metrics: { grounded_in_product_score: 0.82 } }),
      JSON.stringify({ specs: [{ role: "headline", scale: 2.4 }] }),
      JSON.stringify({ zones: [{ name: "cta", x: 50, y: 88 }] }),
      JSON.stringify({ approach: "off-centre, weight lower left" }),
      JSON.stringify({ product: { material: { value: "unglazed stoneware" } } }),
      0.82,
      4,
    ],
  );

  // The two tables a real render could not reach.
  await client.query("delete from public.design_decisions where run_id = $1", [RUN_ID]);
  await client.query(
    `insert into public.design_decisions
       (run_id, kind, target, action, problem, decision, reason, value_from, value_to, confidence, applied)
     values
       ($1,'typography','headline','increase_headline_hierarchy','the headline lacks dominance',
        'Increase headline scale from 2 to 2.7','The headline is not the first anchor.','2','2.7','high',true),
       ($1,'layout','cta','move_cta_to_safe_area','the cta runs off the lower edge',
        'Move the cta inside the safe area','It can be cropped by a platform.','50, 96','50, 88','high',true),
       ($1,'typography','cta','loosen_tracking','the cta reads as one mass',
        'Open the cta letter spacing','Held: not confident enough.',null,null,'low',false)`,
    [RUN_ID],
  );

  await client.query("delete from public.vision_reviews where run_id = $1", [RUN_ID]);
  await client.query(
    `insert into public.vision_reviews
       (run_id, version, analyzed_image, provider, image_hash, findings, problem_count)
     values ($1,1,true,'llm-gateway','910e56022535e2ca',$2,3)`,
    [
      RUN_ID,
      JSON.stringify({
        strengths: [{ what: "the product reads as a real object" }],
        issues: [{ what: "the closing line is hard to read" }],
        typography_problems: [{ what: "renders as GHE THU, missing diacritics" }],
        layout_problems: [{ what: "headline tangent to the cup rim" }],
        product_accuracy: [],
        improvement_actions: [{ action: "Reproduce the closing line exactly", scope: "error" }],
      }),
    ],
  );

  await client.query("delete from public.render_iterations where run_id = $1", [RUN_ID]);
  await client.query(
    `insert into public.render_iterations (run_id, version, image_path, instruction, problem_count, selected)
     values ($1,1,'/api/image/generated/v1',null,3,false),
            ($1,2,'/api/image/generated/v2','EXECUTION CORRECTIONS...',1,true)`,
    [RUN_ID],
  );

  // ── read back ────────────────────────────────────────────────────────────
  const ci = await client.query("select * from public.creative_intelligence where run_id=$1", [RUN_ID]);
  check("creative_intelligence stores direction, strategy, intelligence and prompt",
    ci.rows.length === 1 &&
      ci.rows[0].selected_direction === "emotional storytelling" &&
      ci.rows[0].strategy?.creative_angle === "the ritual, not the object" &&
      typeof ci.rows[0].prompt === "string" && ci.rows[0].prompt.length > 10);

  const cb = await client.query("select * from public.creative_blueprints where run_id=$1", [RUN_ID]);
  check("creative_blueprints stores blueprint, typography, layout, composition and asset_dna",
    cb.rows.length === 1 &&
      Boolean(cb.rows[0].blueprint) && Boolean(cb.rows[0].typography) &&
      Boolean(cb.rows[0].layout) && Boolean(cb.rows[0].composition) &&
      Boolean(cb.rows[0].asset_dna));
  check("grounded_score is stored as a number", Number(cb.rows[0]?.grounded_score) === 0.82,
    `got ${cb.rows[0]?.grounded_score}`);

  const dd = await client.query("select * from public.design_decisions where run_id=$1 order by id", [RUN_ID]);
  check("design_decisions accepts typography and layout rows", dd.rows.length === 3, `got ${dd.rows.length}`);
  check("a declined decision is kept, not dropped",
    dd.rows.filter((r) => r.applied === false).length === 1);
  check("before/after values survive", dd.rows[0]?.value_from === "2" && dd.rows[0]?.value_to === "2.7");
  check("confidence is constrained to the three allowed values",
    dd.rows.every((r) => ["high", "medium", "low"].includes(r.confidence)));

  const vr = await client.query("select * from public.vision_reviews where run_id=$1", [RUN_ID]);
  check("vision_reviews stores findings and the problem count",
    vr.rows.length === 1 && vr.rows[0].problem_count === 3 &&
      Array.isArray(vr.rows[0].findings?.typography_problems));
  check("analyzed_image survives as a real column, not buried in the document",
    vr.rows[0]?.analyzed_image === true);

  const ri = await client.query("select * from public.render_iterations where run_id=$1 order by version", [RUN_ID]);
  check("render_iterations stores V1 and V2", ri.rows.length === 2);
  check("exactly one version is marked as served",
    ri.rows.filter((r) => r.selected).length === 1 && ri.rows[1].selected === true);

  // ── constraints actually bite ────────────────────────────────────────────
  let rejected = false;
  try {
    await client.query(
      "insert into public.design_decisions (run_id, kind, action) values ($1,'colour','change_palette')",
      [RUN_ID],
    );
  } catch {
    rejected = true;
  }
  check("an out-of-vocabulary decision kind is refused by the database", rejected);

  let dupRejected = false;
  try {
    await client.query(
      "insert into public.render_iterations (run_id, version) values ($1, 1)",
      [RUN_ID],
    );
  } catch {
    dupRejected = true;
  }
  check("a duplicate version for the same run is refused", dupRejected);

  // Cascade: removing the run must take its reasoning with it, or the
  // database accumulates orphans nothing can reach.
  await client.query("delete from public.creative_runs where id = $1", [RUN_ID]);
  const orphans = await client.query(
    `select
       (select count(*)::int from public.creative_intelligence where run_id=$1) a,
       (select count(*)::int from public.creative_blueprints   where run_id=$1) b,
       (select count(*)::int from public.design_decisions      where run_id=$1) c,
       (select count(*)::int from public.render_iterations     where run_id=$1) d,
       (select count(*)::int from public.vision_reviews        where run_id=$1) e`,
    [RUN_ID],
  );
  const o = orphans.rows[0];
  check("deleting a run cascades to all five child tables",
    o.a === 0 && o.b === 0 && o.c === 0 && o.d === 0 && o.e === 0,
    JSON.stringify(o));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("verification failed:", e.message);
  process.exitCode = 1;
} finally {
  try {
    await client.query("delete from public.creative_runs where id = $1", [RUN_ID]);
    const left = await client.query(
      `select (select count(*)::int from public.design_decisions) d,
              (select count(*)::int from public.vision_reviews) v`,
    );
    console.log(`cleanup: design_decisions=${left.rows[0].d} vision_reviews=${left.rows[0].v}`);
  } catch (e) {
    console.error("CLEANUP FAILED — inspect manually:", e.message);
  }
  await client.end().catch(() => {});
}
