-- ============================================================================
-- 0005 · Human feedback and user creative memory
--
-- The Phase 3 audit found seven memory modules, 1,587 lines, zero importers in
-- the render path and zero persistence. It also found the harder problem, which
-- no schema can fix on its own: the system had no trustworthy definition of
-- success. `approved` was a boolean the caller supplied, and the failure
-- reasons came from the engine's own score thresholds -- a model grading its
-- own work and then learning from the grade.
--
-- This migration builds the part that CAN be fixed by a schema: somewhere for
-- the one genuinely external signal to live, and somewhere durable for what is
-- learned from it.
--
-- WHY EVENTS ARE A TABLE AND NOT A COLUMN
-- ----------------------------------------
-- The preferences in `user_preferences` are a derived summary. `user_events` is
-- the evidence they were derived from. Keeping only the summary would mean the
-- learning rules could never be changed retroactively -- every threshold
-- adjustment, every extraction fix, would apply to future renders only, and the
-- history it should have been re-run against would be gone. Raw events are what
-- make the learning rules revisable.
--
-- WHAT THE APPEND-ONLY MODEL ACTUALLY GUARANTEES
-- -----------------------------------------------
-- A recorded event cannot be rewritten. UPDATE is blocked by a trigger below,
-- not merely by the absence of a policy, because the service-role key bypasses
-- RLS entirely and a convention is not a guarantee.
--
-- DELETE is deliberately NOT blocked. A person has a right to have their data
-- erased, and `on delete cascade` from `user_profiles` has to be able to fire;
-- a trigger refusing it would make deleting an account impossible. The property
-- worth protecting is that history cannot be FALSIFIED, which is a statement
-- about UPDATE. Erasure removes evidence, it does not forge it.
--
-- WHY DUPLICATE APPROVALS ARE REFUSED
-- ------------------------------------
-- `preferenceDecisions` refuses to act on anything observed fewer than three
-- times, and that threshold is the only thing standing between "a person likes
-- this" and "a person clicked once". It silently stops working if one render
-- can contribute three occurrences: three impatient clicks on a download button
-- would push a preference over the bar by itself.
--
-- So the unique index below makes an approval idempotent per (person, kind,
-- render). Three occurrences then means three DIFFERENT renders, which is what
-- the threshold was always meant to mean.
--
-- Excluded from that rule: `repeat_edit` and `template_use`, where recurrence on
-- the same subject is the signal rather than noise.
-- ============================================================================

-- ── user_events ─────────────────────────────────────────────────────────────
-- Things a person actually did. The only input to this schema that is not the
-- system's opinion of its own output.
create table if not exists public.user_events (
  id            bigserial primary key,

  -- NOT NULL, unlike every other ownership column in this schema. Elsewhere
  -- nullable ownership keeps anonymous rendering legal; here an unattributed
  -- event is not merely ownerless, it is meaningless -- there is no person for
  -- the preference to belong to and nothing that could ever read it back.
  user_id       uuid not null references public.user_profiles(id) on delete cascade,

  -- The recording vocabulary, which is deliberately WIDER than the set the
  -- learning code acts on. `reject` is the external correction the audit found
  -- missing: a loop that only ever sees approvals reinforces whatever it
  -- already produces. Recording it now means the signal exists to learn from
  -- later, rather than starting from nothing on the day that rule is written.
  kind          text not null check (kind in (
                  'download', 'save', 'favorite', 'approve', 'repeat_edit',
                  'reject', 'template_use'
                )),

  -- The render this was about, when it was persisted. Nullable and set null on
  -- delete: persistence can be unavailable at render time while the user is
  -- still perfectly able to click download, and losing the human signal because
  -- the machine's record is missing would be the wrong failure direction.
  run_id        uuid references public.creative_runs(id) on delete set null,

  -- The engine's own id (gen_1790178671861_gh540), kept alongside run_id
  -- because it is what the browser holds and what arrives on the request. It
  -- survives when run_id could not be resolved, so an event is still
  -- attributable to a render afterwards.
  engine_generation_id text,

  -- Whatever the caller knew at the time: the template used, the surface the
  -- click came from. Open-shaped because this vocabulary will grow and a
  -- migration per signal type would discourage recording them.
  context       jsonb not null default '{}'::jsonb,

  occurred_at   timestamptz not null default now()
);

-- "What has this person done lately", which is the read every learning pass
-- starts from.
create index if not exists user_events_user_time_idx
  on public.user_events (user_id, occurred_at desc);

-- "What happened to this render", for attribution in the other direction.
create index if not exists user_events_run_idx
  on public.user_events (run_id);

-- "How often is this kind of signal arriving at all", which is the question
-- that tells an operator whether the memory is being fed.
create index if not exists user_events_kind_time_idx
  on public.user_events (kind, occurred_at desc);

-- One approval of a given kind per render per person. See the note above: this
-- is what keeps the three-occurrence threshold meaningful.
create unique index if not exists user_events_once_per_render_idx
  on public.user_events (user_id, kind, engine_generation_id)
  where engine_generation_id is not null
    and kind not in ('repeat_edit', 'template_use');

-- Append-only, enforced rather than assumed.
create or replace function public.reject_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'user_events is append-only: a recorded event cannot be rewritten';
end;
$$;

drop trigger if exists user_events_no_update on public.user_events;
create trigger user_events_no_update
  before update on public.user_events
  for each row execute function public.reject_event_mutation();

-- ── user_creative_profiles ──────────────────────────────────────────────────
-- One row per person: the header of what used to be `data/accounts/kits/*.json`.
--
-- Split from the preferences below because they have different cardinality and
-- different lifetimes. `observed_runs` is a property of the person; a
-- preference is a row that appears, accumulates and can be removed without the
-- profile going anywhere.
create table if not exists public.user_creative_profiles (
  user_id       uuid primary key references public.user_profiles(id) on delete cascade,

  -- Renders this person approved, in any way. Informational: no decision in the
  -- engine is gated on it, and `preferenceDecisions` reads only the per-
  -- preference occurrence count.
  observed_runs integer not null default 0 check (observed_runs >= 0),

  -- Set by the one-time import from the JSON files, null for everyone since.
  -- Kept so a profile whose counts came from a file rather than from recorded
  -- events is distinguishable from one that earned them here -- the file kits
  -- have no matching rows in user_events and never will, and a later audit
  -- should be able to see that rather than infer it.
  imported_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── user_preferences ────────────────────────────────────────────────────────
-- What this person keeps asking for. One row per preference.
--
-- THE AUTHORITY MODEL IS UNCHANGED AND LIVES IN THE APPLICATION.
-- `stated` and `occurrences` are stored here exactly as `UserKit` defines them,
-- and the rules that read them -- stated enters at user tier, observed enters at
-- strategy tier and low confidence after three occurrences -- stay in
-- `UserKit.preferenceDecisions`. This table is storage for that model, not a
-- second copy of it. A threshold encoded in SQL as well as TypeScript is two
-- thresholds that will eventually disagree.
create table if not exists public.user_preferences (
  id            bigserial primary key,
  user_id       uuid not null references public.user_creative_profiles(user_id) on delete cascade,

  area          text not null check (area in ('visual', 'design', 'workflow', 'quality')),

  -- The preference in the words it was recorded in.
  value         text not null check (length(value) between 1 and 200),

  -- The merge key. `recordPreference` matches case-insensitively, so the
  -- database has to agree or the same preference would land twice with
  -- different casing and each half would sit permanently below the threshold.
  -- Generated rather than written by the caller: a key the application computes
  -- is a key the application can forget to compute.
  value_key     text generated always as (lower(value)) stored,

  -- True only when the user said it. Never inferred. This is the field the
  -- authority ladder reads and the reason a guess about a person cannot
  -- present itself as something they told us.
  stated        boolean not null default false,

  -- How many distinct approvals produced this. Meaningful only for observed
  -- preferences; the uniqueness rule on user_events is what keeps it honest.
  occurrences   integer not null default 1 check (occurrences >= 0),

  -- What they are avoiding rather than seeking. Part of the identity of a
  -- preference, not an attribute of it: "cinematic" and "avoid cinematic" are
  -- two different preferences and must not merge.
  negative      boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, area, value_key, negative)
);

create index if not exists user_preferences_user_idx
  on public.user_preferences (user_id, area);

-- The retrieval predicate, matching the qualification rule in
-- `preferenceDecisions`. Partial so the index holds only preferences that could
-- actually be acted on.
create index if not exists user_preferences_qualified_idx
  on public.user_preferences (user_id)
  where stated = true or occurrences >= 3;

-- ── row level security ──────────────────────────────────────────────────────
alter table public.user_events             enable row level security;
alter table public.user_creative_profiles  enable row level security;
alter table public.user_preferences        enable row level security;

-- A person sees their own history and nobody else's. There is no org-wide
-- clause here on purpose: a creative profile describes a PERSON, not a brand,
-- and a teammate being able to read what someone keeps asking for is a
-- different product decision from being able to read the team's renders.
drop policy if exists user_events_self_read on public.user_events;
create policy user_events_self_read on public.user_events
  for select using (user_id = public.current_profile_id());

drop policy if exists user_creative_profiles_self_read on public.user_creative_profiles;
create policy user_creative_profiles_self_read on public.user_creative_profiles
  for select using (user_id = public.current_profile_id());

drop policy if exists user_preferences_self_read on public.user_preferences;
create policy user_preferences_self_read on public.user_preferences
  for select using (user_id = public.current_profile_id());

-- No INSERT, UPDATE or DELETE policy on any of the three, matching
-- creative_runs and everything in 0003.
--
-- It matters more here than anywhere else in the schema. A client able to write
-- to user_events could manufacture the evidence that every learning feature on
-- the roadmap reads -- not corrupting a row, but teaching the system a taste
-- nobody has. Writes go through the server, which records what it observed
-- rather than what it was told.
