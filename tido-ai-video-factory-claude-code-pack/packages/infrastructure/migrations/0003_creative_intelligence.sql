-- ============================================================================
-- 0003 · Creative intelligence persistence
--
-- The engine already produces all of this on every render and discards it when
-- the HTTP response is written. Nothing below asks the AI for anything new; it
-- gives the reasoning somewhere to live.
--
-- THE SHAPE DECISION
-- ------------------
-- Stable facts get columns; evolving contracts get JSONB.
--
-- The creative blueprint has changed shape in most phases of this project. Had
-- its 36 decision fields been normalised into columns, every improvement to the
-- creative layer would have required a migration, and the schema would be a
-- brake on the thing it exists to record. What earns a column here is what gets
-- filtered, joined or aggregated -- `analyzed_image`, `applied`, `confidence`,
-- `problem_count`, `selected_direction`. Everything else is a document.
--
-- ONE ROW PER DECISION, NOT ONE DOCUMENT PER RUN
-- -----------------------------------------------
-- `design_decisions` is the exception to the rule above, deliberately. The
-- question it exists to answer -- "does raising headline hierarchy actually
-- reduce observed problems?" -- is an aggregate over thousands of decisions.
-- That query is trivial over rows and painful over JSONB arrays.
--
-- OWNERSHIP IS INHERITED, NEVER DUPLICATED
-- -----------------------------------------
-- None of these tables carries org_id or user_id. They hang off creative_runs,
-- which already knows who owns a render, and copying that down would create
-- five more places for ownership to drift out of agreement with the run. RLS
-- below resolves visibility through the parent.
-- ============================================================================

-- ── creative_requests ───────────────────────────────────────────────────────
-- What the user asked for, as opposed to what any single render produced.
--
-- Separate from creative_runs because one brief legitimately produces several
-- renders: a retry, a correction pass, a variant. Folding them together would
-- mean either losing that relationship or duplicating the brief per attempt.
create table if not exists public.creative_requests (
  id            uuid primary key default gen_random_uuid(),

  -- Nullable for the same reason creative_runs' are: this product serves
  -- signed-out visitors and a NOT NULL here would make anonymous use a
  -- constraint violation.
  org_id        uuid references public.organizations(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  user_id       uuid references public.user_profiles(id) on delete set null,

  -- The brief in the user's own words. The retrieval key for "has this been
  -- attempted before", and the thing an embedding is later built from.
  brief         text,
  asset_type    text,
  aspect_ratio  text,

  -- Uploaded products, logos and references, by storage key and role. Not the
  -- bytes: those live in object storage, and a row is the wrong place for a
  -- photograph.
  assets        jsonb not null default '[]'::jsonb,

  -- Commercial intent: objective, audience, campaign context, copy the image
  -- must carry. Open-shaped because the brief form has changed repeatedly.
  goals         jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now()
);

create index if not exists creative_requests_org_created_idx
  on public.creative_requests (org_id, created_at desc);
create index if not exists creative_requests_user_created_idx
  on public.creative_requests (user_id, created_at desc);

-- Links an existing run to the request that produced it. Added rather than
-- required: every run already in the table predates this column and stays
-- valid without one.
alter table public.creative_runs
  add column if not exists request_id uuid references public.creative_requests(id) on delete set null;

create index if not exists creative_runs_request_idx
  on public.creative_runs (request_id);

-- ── creative_intelligence ───────────────────────────────────────────────────
-- What the system understood and chose, in the words shown to the user.
create table if not exists public.creative_intelligence (
  run_id              uuid primary key references public.creative_runs(id) on delete cascade,

  -- Lifted out of the document because it is queried constantly: it is the
  -- unit of "what direction do this user's kept renders share".
  selected_direction  text,

  -- The marketing strategy that ran before the director. Present on every
  -- render, stable and experiment alike -- and currently recomputed, at the
  -- cost of a model call, for briefs that have been seen before.
  strategy            jsonb,

  -- CreativeIntelligence: summary, direction, reasoning, audience insight,
  -- visual strategy, craft reasoning, concepts considered, undecided areas.
  intelligence        jsonb,

  -- The compiled prompt. Without it no render is reproducible and no
  -- regression is attributable to anything.
  prompt              text,

  created_at          timestamptz not null default now()
);

create index if not exists creative_intelligence_direction_idx
  on public.creative_intelligence (selected_direction);

-- ── creative_blueprints ─────────────────────────────────────────────────────
-- The 36-field blueprint, plus the design systems built from it.
--
-- This is the richest artifact the engine produces: every field carries value,
-- because, derived_from and confidence. It is, in effect, labelled training
-- data that the system has been generating and binning since it was written.
create table if not exists public.creative_blueprints (
  run_id       uuid primary key references public.creative_runs(id) on delete cascade,

  -- Six sections: concept, visual world, photography, design, layout, brand
  -- expression. Stored whole because the field list is still moving.
  blueprint    jsonb,

  -- TextSpec per role: relative scale, behavioural weight, tracking, alignment.
  typography   jsonb,
  -- Zones as frame percentages, grid, safe inset, eye path.
  layout       jsonb,
  composition  jsonb,

  -- What the uploaded product actually is, read from the vision pass that was
  -- already paid for. Keyed here by run; the reusable copy lives against the
  -- asset's content hash in a later phase.
  asset_dna    jsonb,

  -- How much of the blueprint was grounded rather than invented. Extracted so
  -- quality can be tracked over time without opening every document.
  grounded_score   numeric,
  missing_count    integer,

  created_at   timestamptz not null default now()
);

-- ── design_decisions ────────────────────────────────────────────────────────
-- One row per correction the design reasoning made, or declined to make.
create table if not exists public.design_decisions (
  id           bigserial primary key,
  run_id       uuid not null references public.creative_runs(id) on delete cascade,

  kind         text not null check (kind in ('typography', 'layout')),
  -- The text role or the layout zone this acted on.
  target       text,
  -- e.g. increase_headline_hierarchy, move_cta_to_safe_area.
  action       text not null,

  -- What was wrong, and what was done about it, in the designer's words.
  problem      text,
  decision     text,
  reason       text,

  -- The concrete move. Text rather than numeric because a layout change is a
  -- coordinate pair and a typography change is a scale.
  value_from   text,
  value_to     text,

  confidence   text check (confidence in ('high', 'medium', 'low')),

  -- False when confidence was too low to act. Declined decisions are KEPT: a
  -- system that records only what it did looks more certain than it is, and
  -- "considered, not confident enough" is the more useful signal to a
  -- professional reviewing the work.
  applied      boolean not null default false,

  created_at   timestamptz not null default now()
);

create index if not exists design_decisions_run_idx on public.design_decisions (run_id);
-- The index that makes the aggregate cheap: "which actions, at which
-- confidence, actually reduced problems".
create index if not exists design_decisions_action_idx
  on public.design_decisions (action, applied, confidence);

-- ── render_iterations ───────────────────────────────────────────────────────
-- V1, V2, and why one of them was kept.
create table if not exists public.render_iterations (
  id            bigserial primary key,
  run_id        uuid not null references public.creative_runs(id) on delete cascade,

  version       integer not null check (version >= 1),
  image_path    text,
  prompt        text,

  -- The correction block sent to the renderer for this version. Null on V1,
  -- which had nothing to correct.
  instruction   text,

  -- How many problems a review found in THIS version. The number the
  -- comparison is decided on.
  problem_count integer,

  -- True for the version actually served to the user. Exactly one per run
  -- should be true; a second render that came back worse is recorded and not
  -- selected, which is the outcome worth being able to count.
  selected      boolean not null default false,

  created_at    timestamptz not null default now(),
  unique (run_id, version)
);

create index if not exists render_iterations_run_idx on public.render_iterations (run_id);

-- ── vision_reviews ──────────────────────────────────────────────────────────
-- What a model saw when it looked at the finished pixels.
create table if not exists public.vision_reviews (
  id             bigserial primary key,
  run_id         uuid not null references public.creative_runs(id) on delete cascade,

  -- Which render version was examined.
  version        integer not null default 1,

  -- THE field that matters, and the reason it is a column rather than a key
  -- inside `findings`. False whenever nothing actually looked. Every consumer
  -- downstream will reasonably read it as "this was seen", and a loop that
  -- trusts an unseen verdict will happily correct a render nobody examined.
  analyzed_image boolean not null default false,

  -- Which provider looked, and at which bytes. A finding is traceable to the
  -- image it came from, or it is not evidence.
  provider       text,
  image_hash     text,

  -- strengths, issues, typography_problems, layout_problems, product_accuracy,
  -- improvement_actions.
  findings       jsonb not null default '{}'::jsonb,

  -- Extracted so trends are one query rather than a JSONB walk.
  problem_count  integer not null default 0,

  -- Present when nothing looked, saying why.
  unavailable_reason text,

  created_at     timestamptz not null default now()
);

create index if not exists vision_reviews_run_idx on public.vision_reviews (run_id);
create index if not exists vision_reviews_analyzed_idx
  on public.vision_reviews (analyzed_image, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Visibility is inherited from the run, resolved through one function so the
-- rule lives in a single place rather than being restated five times.
--
-- SECURITY DEFINER so the lookup is not itself filtered by the policy on
-- creative_runs, which would recurse.
create or replace function public.can_see_run(target_run uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.creative_runs r
     where r.id = target_run
       and (
         (r.org_id is not null and public.is_org_member(r.org_id))
         or (r.user_id is not null and r.user_id = public.current_profile_id())
       )
  );
$$;

alter table public.creative_requests      enable row level security;
alter table public.creative_intelligence  enable row level security;
alter table public.creative_blueprints    enable row level security;
alter table public.design_decisions       enable row level security;
alter table public.render_iterations      enable row level security;
alter table public.vision_reviews         enable row level security;

drop policy if exists creative_requests_read on public.creative_requests;
create policy creative_requests_read on public.creative_requests
  for select using (
    (org_id is not null and public.is_org_member(org_id))
    or (user_id is not null and user_id = public.current_profile_id())
  );

drop policy if exists creative_intelligence_read on public.creative_intelligence;
create policy creative_intelligence_read on public.creative_intelligence
  for select using (public.can_see_run(run_id));

drop policy if exists creative_blueprints_read on public.creative_blueprints;
create policy creative_blueprints_read on public.creative_blueprints
  for select using (public.can_see_run(run_id));

drop policy if exists design_decisions_read on public.design_decisions;
create policy design_decisions_read on public.design_decisions
  for select using (public.can_see_run(run_id));

drop policy if exists render_iterations_read on public.render_iterations;
create policy render_iterations_read on public.render_iterations
  for select using (public.can_see_run(run_id));

drop policy if exists vision_reviews_read on public.vision_reviews;
create policy vision_reviews_read on public.vision_reviews
  for select using (public.can_see_run(run_id));

-- No INSERT or UPDATE policies anywhere above, matching creative_runs.
-- Everything here is written by the server about work it just did. A client
-- able to write here could fabricate the history that every learning feature
-- in later phases will read, which would poison the memory rather than merely
-- corrupt a row.
