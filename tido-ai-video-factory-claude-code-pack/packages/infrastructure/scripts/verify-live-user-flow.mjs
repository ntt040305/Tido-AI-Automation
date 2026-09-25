// READ-ONLY. What the most recent signed-in person's renders wrote, table by table.
// Run after a real browser session: sign in, upload, generate, download.
// Usage: pnpm --filter @tido/infrastructure verify:live-flow
import { createClient } from "./_connect.mjs";
const c = createClient(process.env.SUPABASE_DB_URL);
const q = async (s, p = []) => (await c.query(s, p)).rows;
await c.connect();
await c.query("begin transaction read only");
try {
  const [p] = await q(`select p.id, p.email is not null has_email, p.display_name is not null has_name, p.created_at,
      (select org_id from workspace_members m where m.user_id = p.id limit 1) org_id
    from user_profiles p where exists (select 1 from creative_runs r where r.user_id = p.id)
    order by (select max(created_at) from creative_runs r where r.user_id = p.id) desc limit 1`);
  if (!p) { console.log("NO SIGNED-IN RUN FOUND"); process.exit(2); }
  const runs = await q(`select id, engine_generation_id eng, pipeline, status, created_at from creative_runs where user_id=$1 order by created_at`, [p.id]);
  const ids = runs.map((r) => r.id);
  const count = async (sql, params) => (await q(sql, params))[0].n;
  const t = {
    user_profiles: { email: p.has_email, display_name: p.has_name },
    creative_runs: runs.map((r) => `${r.eng} ${r.pipeline} ${r.status}`),
    creative_intelligence: await count(`select count(*)::int n from creative_intelligence where run_id = any($1) and prompt is not null`, [ids]),
    creative_blueprints: await count(`select count(*)::int n from creative_blueprints where run_id = any($1)`, [ids]),
    creative_concepts: await count(`select count(*)::int n from creative_concepts where run_id = any($1)`, [ids]),
    render_iterations: await q(`select left(run_id::text,8) run, version, selected, problem_count, prompt is not null has_prompt, instruction is not null has_instr from render_iterations where run_id = any($1) order by run_id, version`, [ids]),
    vision_reviews: await q(`select left(run_id::text,8) run, version, analyzed_image, problem_count from vision_reviews where run_id = any($1) order by run_id, version`, [ids]),
    design_decisions: await count(`select count(*)::int n from design_decisions where run_id = any($1)`, [ids]),
    user_events: await q(`select kind, run_id is not null linked, engine_generation_id eng from user_events where user_id=$1 order by occurred_at`, [p.id]),
    user_creative_profiles: (await q(`select observed_runs from user_creative_profiles where user_id=$1`, [p.id]))[0] ?? null,
    user_preferences: await count(`select count(*)::int n from user_preferences where user_id=$1`, [p.id]),
    asset_memory: await q(`select id, branch, times_seen, model_calls, (observed <> '{}'::jsonb) observed from asset_memory where user_id=$1`, [p.id]),
    asset_embeddings: await count(`select count(*)::int n from asset_embeddings e join asset_memory a on a.id=e.asset_id where a.user_id=$1`, [p.id]),
    creative_patterns: (await q(`select count(*)::int n, count(embedding_model)::int embedded, coalesce(sum(approved_count),0)::int approvals
        from creative_patterns where org_id=$1 or user_id=$2`, [p.org_id, p.id]))[0],
  };
  console.log(JSON.stringify(t, null, 1));
} finally {
  await c.query("rollback");
  await c.end();
}
