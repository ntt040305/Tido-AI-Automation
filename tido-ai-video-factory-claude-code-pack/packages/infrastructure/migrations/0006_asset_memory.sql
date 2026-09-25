-- ============================================================================
-- 0006 · Asset memory
--
-- The Phase 3 audit found `asset_dna` stored as one column on
-- `creative_blueprints`, keyed per RUN. That records what a render thought
-- about an uploaded photograph and throws away the fact that it is the same
-- photograph next time -- so a customer's own product is re-analysed by a
-- vision model on every single render, forever.
--
-- This gives the reading a home keyed by the thing that is actually stable:
-- the bytes.
--
-- WHY THE KEY IS THE FULL SHA-256 AND NOT THE ENGINE'S HASH
-- ---------------------------------------------------------
-- `VisualDNAAnalyzer.hash` truncates sha-256 to 16 hex characters. That is the
-- right trade for an in-process cache that lives for one server's lifetime and
-- whose worst case is a wasted call. It is the wrong trade for a durable store:
-- 64 bits collide by birthday at a few billion assets, and a collision here
-- does not waste a call, it hands one customer's product analysis to another
-- customer's render.
--
-- So the primary key is the whole digest. The engine's short hash is kept
-- alongside as `prepared_hash`, indexed, because it is computed AFTER
-- normalisation and therefore matches across re-encodes of the same
-- photograph -- a genuinely useful second way in, and one that is only ever a
-- hint, never an identity.
--
-- WHY MEMORY IS PER PERSON AND NOT GLOBAL
-- ----------------------------------------
-- A content hash is global by nature: two companies uploading the same stock
-- photograph produce the same digest. Sharing one row would analyse it once
-- for everybody, which is the larger saving -- and it would also mean one
-- customer's row is read by another customer's render, and that the existence
-- of a hash is discoverable by anyone who can guess it.
--
-- The saving is not worth that. The repeat that actually matters is one person
-- using their own product photograph across many renders, and `(user_id,
-- content_hash)` captures all of it while leaving nothing shared.
--
-- WHY user_id IS NOT NULL
-- -----------------------
-- Matching `user_events` in 0005, and for the same reason: a memory nobody
-- owns can never be retrieved. An anonymous upload is analysed and not
-- remembered, which is honest -- rather than accumulating an unowned pool that
-- any later account could be pointed at.
--
-- WHY THIS TABLE IS NOT APPEND-ONLY
-- ----------------------------------
-- Unlike `user_events`, a row here is a current best reading of one object and
-- is meant to improve. `times_seen` climbs, `last_seen_at` moves, and a thin
-- observation is replaced by a fuller one. What it must never do is get worse,
-- which the application enforces by merging rather than overwriting -- an
-- analysis that came back empty must not erase one that did not.
-- ============================================================================

create table if not exists public.asset_memory (
  id             bigserial primary key,

  user_id        uuid not null references public.user_profiles(id) on delete cascade,

  -- The whole sha-256 of the bytes as uploaded, lower-case hex. Constrained to
  -- its exact length so a truncated hash cannot be written here by a caller
  -- that reached for the engine's short one by mistake.
  content_hash   text not null check (content_hash ~ '^[0-9a-f]{64}$'),

  -- The engine's own hash, of the NORMALISED buffer. A hint for finding the
  -- same photograph re-encoded, never an identity. Nullable: it only exists
  -- when the analyzer actually ran.
  prepared_hash  text,

  -- The role the caller assigned (PRODUCT, LOGO, ...) and the analyzer branch
  -- it maps to. Both kept: the role is what the request said, the branch is
  -- what was actually looked at, and they answer different questions.
  role           text not null,
  branch         text not null check (branch in ('product', 'logo', 'reference')),

  mime_type      text,
  byte_size      integer check (byte_size is null or byte_size >= 0),

  -- What a model saw: the VisualDNA observed branch for THIS asset. Facts
  -- about the object, quoted from the observation.
  observed       jsonb not null default '{}'::jsonb,

  -- What AssetDNA read from those facts: form, material, palette, texture,
  -- personality and what the surface supports or contradicts.
  --
  -- Deliberately excludes `supporting`, which AssetDNA also produces. That
  -- describes what else the director put in the frame and is a property of a
  -- RENDER, not of the photograph -- storing it here would make one brief's
  -- staging look like a permanent fact about the customer's product.
  treatment      jsonb,

  -- Vision calls this row represents. Climbs only when a model actually ran,
  -- so the gap between it and `times_seen` is exactly the work the memory
  -- saved -- which is the number this table exists to make true.
  model_calls    integer not null default 0 check (model_calls >= 0),
  times_seen     integer not null default 1 check (times_seen >= 1),

  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),

  unique (user_id, content_hash)
);

-- "This person's recent assets", for a library view.
create index if not exists asset_memory_user_seen_idx
  on public.asset_memory (user_id, last_seen_at desc);

-- The re-encode hint. Partial: most rows have one, and a null here means the
-- analyzer never ran rather than that the asset has no hash.
create index if not exists asset_memory_prepared_idx
  on public.asset_memory (user_id, prepared_hash)
  where prepared_hash is not null;

-- "What kinds of asset does this person upload", the aggregate a later phase
-- reads to tell a product photograph library from a logo library.
create index if not exists asset_memory_branch_idx
  on public.asset_memory (user_id, branch);

-- ── row level security ──────────────────────────────────────────────────────
alter table public.asset_memory enable row level security;

drop policy if exists asset_memory_self_read on public.asset_memory;
create policy asset_memory_self_read on public.asset_memory
  for select using (user_id = public.current_profile_id());

-- No INSERT, UPDATE or DELETE policy, matching 0003 and 0005.
--
-- A client able to write here could describe its own uploaded product in
-- whatever terms it liked and have the engine treat that as an OBSERVATION --
-- the one tier of authority in this system that outranks reasoning, precisely
-- because it is supposed to have come from pixels. Writes go through the
-- server, which records what a model saw.
