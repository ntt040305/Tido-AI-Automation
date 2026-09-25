-- ============================================================================
-- 0009 · Creative patterns
--
-- Phase 3.3. What keeps working, learned from what was actually made.
--
-- NOT A TEMPLATE LIBRARY
-- ----------------------
-- The brief is explicit and the distinction is the whole design: the system
-- must not copy templates. So a row here is never an instruction. It is an
-- OBSERVATION WITH ITS EVIDENCE ATTACHED -- "this pairing appeared in 11 runs,
-- 4 of which a human kept" -- and the retrieval layer is required to present it
-- at low confidence, beneath the brief in front of it.
--
-- That is why `support_count` and `approved_count` are columns rather than a
-- computed nicety. A pattern with two examples and a pattern with two hundred
-- are different claims, and a store that could not tell them apart would let
-- the first one steer a render with the authority of the second.
--
-- WHAT A PATTERN IS EXTRACTED FROM
-- ---------------------------------
-- Only from rows this database already holds -- `creative_intelligence`,
-- `creative_blueprints`, `design_decisions`, `vision_reviews` -- joined to
-- `user_events` for whether a person kept the result. Nothing is invented and
-- no new analysis runs. That also makes the whole thing BACKFILLABLE: when the
-- extraction rules improve, they are re-run over history rather than applying
-- only to renders made after the deploy.
--
-- OWNERSHIP FOLLOWS creative_runs, NOT user_preferences
-- ------------------------------------------------------
-- A creative pattern is a property of a body of work, and a body of work
-- belongs to a workspace: two designers at one agency should learn from each
-- other's kept renders. A personal preference is the opposite -- it describes a
-- person and must not leak to a teammate, which is why 0005 scoped it to a
-- user and this scopes to an org, falling back to a user for work made before
-- an org existed.
--
-- THE FAILURE THIS SCHEMA IS BUILT AGAINST
-- -----------------------------------------
-- Convergence. A memory that always returns its most common pattern makes every
-- brand's output look the same, which is precisely what Template Intelligence
-- is supposed to prevent. `support_count` is therefore not a ranking key on its
-- own, and `verify-creative-patterns.mjs` measures how many distinct patterns
-- survive retrieval rather than only whether the top one is popular.
-- ============================================================================

create table if not exists public.creative_patterns (
  id             bigserial primary key,

  -- Exactly one of these is set. Mirrors `creative_runs`, whose rows are the
  -- evidence, so a pattern can never be visible to someone who could not see
  -- the work it was learned from.
  org_id         uuid references public.organizations(id) on delete cascade,
  user_id        uuid references public.user_profiles(id) on delete cascade,

  -- Which part of a design this describes. Constrained so a typo becomes an
  -- error rather than a silently unqueryable third spelling of "typography".
  dimension      text not null check (dimension in (
                   'direction',      -- the creative route chosen
                   'composition',    -- how the frame is arranged
                   'typography',     -- type treatment
                   'layout',         -- where things sit
                   'lighting',       -- how light behaves
                   'structure',      -- the creative device the idea uses
                   'combination'     -- two dimensions that recur together
                 )),

  value          text not null check (length(value) between 1 and 300),
  -- The merge key, generated rather than supplied. Matches the case-insensitive
  -- comparison the extractor does, so one pattern cannot become two rows that
  -- each sit below the support threshold forever.
  value_key      text generated always as (lower(value)) stored,

  -- ── the evidence ─────────────────────────────────────────────────────────
  -- Runs that exhibited this pattern.
  support_count  integer not null default 1 check (support_count >= 0),
  -- Of those, the ones a human actually kept. THE number that matters, and the
  -- one that is hardest to earn: it requires a `user_events` row, which
  -- requires somebody to have clicked something.
  approved_count integer not null default 0 check (approved_count >= 0),
  -- Vision problems counted across those runs. A pattern that recurs AND
  -- accumulates problems is worth surfacing as a warning, not as guidance.
  problem_count  integer not null default 0 check (problem_count >= 0),

  -- Which runs, capped. Kept so a claim can be traced back to the work rather
  -- than believed because a counter says so.
  evidence_runs  jsonb not null default '[]'::jsonb,

  -- ── meaning (Phase 3.4) ──────────────────────────────────────────────────
  -- Nullable: a pattern is completely usable by exact match before anything
  -- embeds it, and an embedder outage must not stop patterns being learned.
  embedding      vector(768),
  embedding_model text,
  source_text    text,

  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),

  -- Ownership is exactly one of the two.
  constraint creative_patterns_one_owner check (
    (org_id is not null and user_id is null) or (org_id is null and user_id is not null)
  )
);

-- One row per pattern per owner. Two partial indexes rather than one
-- constraint, because a unique index over a nullable column treats every null
-- as distinct -- which would let the same personal pattern land unboundedly
-- many times.
create unique index if not exists creative_patterns_org_key
  on public.creative_patterns (org_id, dimension, value_key)
  where org_id is not null;

create unique index if not exists creative_patterns_user_key
  on public.creative_patterns (user_id, dimension, value_key)
  where user_id is not null;

-- "What does this workspace keep doing", the read every retrieval starts from.
create index if not exists creative_patterns_org_dim_idx
  on public.creative_patterns (org_id, dimension, approved_count desc, support_count desc);

create index if not exists creative_patterns_user_dim_idx
  on public.creative_patterns (user_id, dimension, approved_count desc, support_count desc);

-- Semantic neighbours. Partial, because most rows have no vector early on and
-- an index over nulls is dead weight.
create index if not exists creative_patterns_vector_idx
  on public.creative_patterns
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ── row level security ──────────────────────────────────────────────────────
alter table public.creative_patterns enable row level security;

-- The same two ways in that `creative_runs` allows, and for the same reason:
-- the evidence for a pattern is a set of runs, so anyone who may read the
-- pattern must already be able to read the work behind it.
drop policy if exists creative_patterns_read on public.creative_patterns;
create policy creative_patterns_read on public.creative_patterns
  for select using (
    (org_id is not null and public.is_org_member(org_id))
    or (user_id is not null and user_id = public.current_profile_id())
  );

-- No INSERT, UPDATE or DELETE policy, matching every table since 0003. A
-- client able to write here could manufacture a "successful pattern" nobody
-- ever produced and have the creative layer treat it as learned experience.

-- ── retrieval ───────────────────────────────────────────────────────────────
-- Nearest patterns by meaning, scoped to one owner.
--
-- Server-only and owner-filtered inside the query, exactly as
-- `search_asset_embeddings` is, and for the same reason: a post-filter on a
-- small limit returns an empty page while the rows it dropped belonged to
-- someone else.
create or replace function public.search_creative_patterns(
  p_org       uuid,
  p_user      uuid,
  p_query     vector(768),
  p_model     text,
  p_dimension text default null,
  p_limit     integer default 10,
  p_min       double precision default -1
)
returns table (
  id             bigint,
  dimension      text,
  value          text,
  score          double precision,
  support_count  integer,
  approved_count integer,
  problem_count  integer,
  source_text    text
)
language sql
stable
as $$
  select
    cp.id,
    cp.dimension,
    cp.value,
    (1 - (cp.embedding <=> p_query))::double precision as score,
    cp.support_count,
    cp.approved_count,
    cp.problem_count,
    cp.source_text
  from public.creative_patterns cp
  where cp.embedding is not null
    -- Vectors from two models are not comparable.
    and cp.embedding_model = p_model
    and (
      (p_org is not null and cp.org_id = p_org)
      or (p_user is not null and cp.user_id = p_user)
    )
    and (p_dimension is null or cp.dimension = p_dimension)
    and (1 - (cp.embedding <=> p_query)) >= p_min
  order by cp.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

revoke all on function public.search_creative_patterns(uuid, uuid, vector, text, text, integer, double precision) from public;
revoke all on function public.search_creative_patterns(uuid, uuid, vector, text, text, integer, double precision) from anon;
revoke all on function public.search_creative_patterns(uuid, uuid, vector, text, text, integer, double precision) from authenticated;
