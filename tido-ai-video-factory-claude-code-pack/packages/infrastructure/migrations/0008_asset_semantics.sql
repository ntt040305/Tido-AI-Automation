-- ============================================================================
-- 0008 · Asset semantics
--
-- 0006 made an uploaded asset findable by its bytes. That answers exactly one
-- question -- "have I seen this exact file before" -- and it answers it
-- perfectly. It cannot answer "have I seen this PRODUCT before", because a
-- second photograph of the same cup is a different file, and a hash is
-- discontinuous by design: one flipped byte and it is a stranger.
--
-- HASH IS IDENTITY. EMBEDDING IS MEANING. THEY ARE NOT INTERCHANGEABLE.
-- ----------------------------------------------------------------------
-- Nothing in 0006 changes. `asset_memory.content_hash` remains the identity of
-- an asset and remains the only thing that decides whether two uploads are the
-- same row. This table hangs beside it and answers a different, softer
-- question, and its answers are RANKINGS rather than facts.
--
-- That distinction has to survive contact with the code above it. A hash match
-- is a certainty; a cosine of 0.91 is an opinion, and an opinion that gets
-- treated as a certainty is how a system confidently attaches one customer's
-- product description to a different product.
--
-- WHY THREE FACETS AND NOT ONE VECTOR
-- ------------------------------------
-- The three questions this phase names are genuinely different:
--
--   same product          -> is this the same OBJECT?      (form, material,
--                            finish, condition, scale)
--   visually similar      -> does it LOOK alike?           (palette, surface
--                            detail, finish, colour)
--   same style family     -> is it TREATED alike?          (composition, light
--                            behaviour, tonal range)
--
-- One vector over all of it would rank the same way for all three, so "find me
-- the same product" and "find me the same style" would return one list in one
-- order -- and the feature would quietly be a single feature wearing three
-- names. Separate facets cost more embedding calls and are the only way the
-- three questions can disagree, which is the entire point of asking them
-- separately.
--
-- Each facet is built ONLY from fields the analyzer actually observed. There is
-- no category table, no industry lookup, and no style taxonomy: two cups with
-- different finishes land in different places because their surfaces were
-- observed to differ, not because anything was looked up about cups.
--
-- WHY OWNERSHIP IS NOT DUPLICATED HERE
-- -------------------------------------
-- No `user_id` column. It would make the vector index trivially filterable and
-- it would also be a second place for ownership to drift out of agreement with
-- `asset_memory`, which 0003 already argued against and which matters more on
-- this table than most: a row that disagrees about its owner is a row that
-- returns one customer's product in another customer's search.
--
-- So visibility is resolved through the parent, and the cost of that join is
-- measured rather than assumed -- `verify-asset-semantics.mjs` runs the real
-- query against a populated table and fails if it stops using an index.
-- ============================================================================

create extension if not exists vector;

create table if not exists public.asset_embeddings (
  id           bigserial primary key,

  -- The asset this describes. Cascades, so a forgotten asset forgets its
  -- meaning at the same moment it forgets its bytes.
  asset_id     bigint not null references public.asset_memory(id) on delete cascade,

  -- Which question this vector answers. See the note above.
  facet        text not null check (facet in ('identity', 'appearance', 'style')),

  -- 768 dimensions, matching `IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS` and the
  -- existing `EmbeddingService`. Fixed in the type rather than checked in code:
  -- a vector of the wrong width is not a degraded result, it is an error, and
  -- cosine against it is meaningless rather than merely wrong.
  embedding    vector(768) not null,

  -- The exact text that was embedded.
  --
  -- Kept because an embedding is otherwise unauditable. When a search returns
  -- something surprising, the only way to tell a bad vector from a bad input is
  -- to read what went in -- and without this column that question has no
  -- answer, only opinions about it.
  source_text  text not null check (length(source_text) between 1 and 4000),

  -- Which model produced it. Vectors from two models are not comparable, and a
  -- table that mixed them would return confident nonsense with no way to see
  -- why. The application refuses to compare across models; this records what
  -- would have to be re-embedded if the model changed.
  model        text not null,
  dims         integer not null check (dims > 0),

  created_at   timestamptz not null default now(),

  -- One vector per question per asset.
  unique (asset_id, facet)
);

-- The retrieval index.
--
-- HNSW rather than IVFFlat: IVFFlat needs a training pass over representative
-- data to build its lists, and it degrades badly when built on an empty or tiny
-- table -- which is exactly the state this one starts in and will stay in for
-- some time. HNSW is incrementally built and needs no training set.
--
-- Cosine ops, matching `CosineSimilarity` in the engine, so a score computed in
-- the database and a score computed in process mean the same thing.
create index if not exists asset_embeddings_vector_idx
  on public.asset_embeddings
  using hnsw (embedding vector_cosine_ops);

-- "Everything this asset knows about itself", the lookup that turns a hash hit
-- into a set of query vectors.
create index if not exists asset_embeddings_asset_idx
  on public.asset_embeddings (asset_id, facet);

-- ── row level security ──────────────────────────────────────────────────────
alter table public.asset_embeddings enable row level security;

-- Visibility is the parent's. One place decides who owns an asset, and it is
-- the same place that decided it in 0006.
drop policy if exists asset_embeddings_self_read on public.asset_embeddings;
create policy asset_embeddings_self_read on public.asset_embeddings
  for select using (
    exists (
      select 1
        from public.asset_memory am
       where am.id = asset_embeddings.asset_id
         and am.user_id = public.current_profile_id()
    )
  );

-- No INSERT, UPDATE or DELETE policy, matching every table since 0003.
--
-- A client able to write a vector here could place its own asset next to
-- anything it liked in every future similarity search -- not by making a false
-- claim, which review might catch, but by moving a point in a space nobody
-- reads directly.

-- ── the search ──────────────────────────────────────────────────────────────
-- A function rather than a view or a client-side query, because PostgREST
-- cannot express `<=>` and the alternative is pulling every one of a person's
-- vectors over the wire to sort them in Node. That works at ten assets and
-- stops working at ten thousand, which is the wrong shape of thing to discover
-- later.
--
-- SECURITY INVOKER (the default), and execute is revoked from anon and
-- authenticated below. The server calls this with the service role and passes
-- the owner explicitly, exactly as the repository layer does everywhere else:
-- RLS is the second line here, not the first.
create or replace function public.search_asset_embeddings(
  p_user     uuid,
  p_facet    text,
  p_query    vector(768),
  p_model    text,
  p_limit    integer default 10,
  p_min      double precision default -1,
  p_exclude  bigint default null
)
returns table (
  asset_id     bigint,
  content_hash text,
  facet        text,
  score        double precision,
  role         text,
  branch       text,
  source_text  text,
  times_seen   integer,
  last_seen_at timestamptz
)
language sql
stable
as $$
  select
    am.id,
    am.content_hash,
    ae.facet,
    -- `<=>` is cosine DISTANCE, so similarity is 1 minus it. Reported rather
    -- than thresholded into a boolean: where the line falls is a product
    -- decision, and a query that hid the number would make it unarguable.
    (1 - (ae.embedding <=> p_query))::double precision as score,
    am.role,
    am.branch,
    ae.source_text,
    am.times_seen,
    am.last_seen_at
  from public.asset_embeddings ae
  join public.asset_memory am on am.id = ae.asset_id
  where am.user_id = p_user
    and ae.facet = p_facet
    -- Vectors from two models are not comparable, and mixing them returns
    -- confident nonsense with nothing in the result to show why.
    and ae.model = p_model
    and (p_exclude is null or am.id <> p_exclude)
    and (1 - (ae.embedding <=> p_query)) >= p_min
  order by ae.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

-- Server-only, matching every write path since 0003. A client able to call
-- this with another person's id would read their whole library.
revoke all on function public.search_asset_embeddings(uuid, text, vector, text, integer, double precision, bigint) from public;
revoke all on function public.search_asset_embeddings(uuid, text, vector, text, integer, double precision, bigint) from anon;
revoke all on function public.search_asset_embeddings(uuid, text, vector, text, integer, double precision, bigint) from authenticated;
