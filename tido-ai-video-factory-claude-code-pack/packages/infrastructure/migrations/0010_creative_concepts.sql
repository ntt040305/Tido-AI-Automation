-- ============================================================================
-- 0010 · Creative concepts
--
-- Phase 4. The directions a brief could have gone, and why one was taken.
--
-- WHAT THIS DOES *NOT* BUILD
-- ---------------------------
-- A concept engine. There already is one. `CreativeDirectorV1` is handed a set
-- of routes, reasons about them, and returns a judgment that already carries
-- `routes_offered`, the chosen `route` with its `core_idea`, `visual_language`
-- and `why_this_route`, and a `rejected_reason` naming the strongest direction
-- it turned down.
--
-- All of that is produced on every experiment render and then thrown away. The
-- only survivor is `creative_intelligence.selected_direction` -- a single
-- string, with no record of what it was chosen OVER or why.
--
-- So this migration adds no intelligence. It gives the reasoning that already
-- exists somewhere to live, which is the difference between a system that
-- decided something and a system that can be asked why.
--
-- WHY REJECTIONS ARE ROWS AND NOT A FOOTNOTE
-- -------------------------------------------
-- A director who records only what they chose looks more certain than they
-- were. The rejected routes are the actual content of a creative decision --
-- "cinematic premium, turned down because the product's surface is matte and
-- would die under that treatment" says something a chosen label never can.
--
-- They are also the only way a later phase can learn which directions keep
-- losing for which kinds of brief. A table of winners cannot answer that, and
-- one row per route is what makes the question a query instead of a study.
--
-- SELECTION IS RECORDED, NOT RE-DECIDED
-- --------------------------------------
-- `selected` marks the director's own choice. Nothing in this schema or the
-- code above it re-ranks the routes afterwards: a second opinion layered on top
-- would mean two things deciding the creative direction, and the one that
-- actually reached the prompt would be whichever ran last.
-- ============================================================================

create table if not exists public.creative_concepts (
  id            bigserial primary key,

  -- Hangs off the run, like everything in 0003, so ownership is inherited
  -- rather than copied and cannot drift out of agreement with it.
  run_id        uuid not null references public.creative_runs(id) on delete cascade,

  -- The route as the director named it. Lifted out of the document because
  -- "which directions keep winning" is the aggregate this table exists for.
  route         text not null check (length(route) between 1 and 200),

  -- What happens in the frame, and how it is rendered. The director's own
  -- words -- these are what make a stored concept readable by a person months
  -- later, rather than a label nobody can reconstruct.
  core_idea        text,
  visual_language  text,
  -- Why this route suits THIS brief. Empty on a route that was only offered.
  why_this_route   text,

  -- Exactly one route per run is the one that ran. Enforced by a partial
  -- unique index below rather than by convention, because "which one did we
  -- actually make" must have one answer.
  selected      boolean not null default false,

  -- Why this one was turned down. Only ever set on a route that was not
  -- selected; a reason attached to the winner is a contradiction, and the
  -- check keeps it from being written.
  rejected_reason text,

  -- Where the route came from: the list the director was offered, or the one
  -- it wrote itself. Distinguishing them matters -- a direction the director
  -- invented is a stronger signal than one it picked off a menu.
  origin        text not null default 'offered'
                check (origin in ('offered', 'authored')),

  created_at    timestamptz not null default now(),

  constraint creative_concepts_reason_only_on_rejected check (
    selected = false or rejected_reason is null
  ),
  -- One row per route per run.
  unique (run_id, route)
);

-- "What did this run consider", the read that reconstructs a decision.
create index if not exists creative_concepts_run_idx
  on public.creative_concepts (run_id);

-- "Which directions keep being chosen, and which keep losing" -- the aggregate
-- Phase 3.3 reads to turn a repeated choice into a pattern.
create index if not exists creative_concepts_route_idx
  on public.creative_concepts (route, selected);

-- Exactly one selected route per run.
create unique index if not exists creative_concepts_one_selected
  on public.creative_concepts (run_id)
  where selected = true;

-- ── row level security ──────────────────────────────────────────────────────
alter table public.creative_concepts enable row level security;

drop policy if exists creative_concepts_read on public.creative_concepts;
create policy creative_concepts_read on public.creative_concepts
  for select using (public.can_see_run(run_id));

-- No INSERT, UPDATE or DELETE policy, matching 0003. These rows are the
-- system's account of its own reasoning; a client able to edit them could
-- rewrite why a decision was made after seeing the result.
