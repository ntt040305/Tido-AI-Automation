-- ============================================================================
-- 0012 · Creative Director: evaluated concepts, and negative evidence
--
-- Phase 4. Additive only: two tables gain columns, nothing is dropped, no new
-- table, and the RLS policies from 0009 and 0010 already cover every column
-- added here (a policy governs rows, not columns).
--
-- WHY creative_concepts NEEDS MORE THAN IT HAS
-- --------------------------------------------
-- 0010 stored a route, its idea, how it renders and why it fits. Phase 4 asks
-- each concept for three more craft decisions -- composition, typography,
-- lighting -- and for an EVALUATION: a score, strengths, weaknesses and a risk,
-- with the signals each rests on. None of that has a column, and folding it
-- into `why_this_route` would make the one field a person reads unreadable.
--
--   details     the director's own words per candidate: composition,
--               typography, lighting, and its six-part assessment. A document
--               because the director's contract keeps growing.
--   evaluation  the evaluator's output: strengths, weaknesses, risk, the
--               memory signals it used, and -- on the selected row -- why this
--               direction was chosen and by whom.
--   score       lifted out of `evaluation`, because "which routes keep
--               scoring low for this kind of brief" is an aggregate.
--
-- WHY creative_patterns NEEDS A NEGATIVE COUNTER
-- ----------------------------------------------
-- Until now a pattern could only accumulate approvals. A loop that only ever
-- sees approval reinforces whatever it already produces -- the closed loop the
-- Phase 3 audit named. `rejected_count` records renders a person explicitly
-- rejected, or regenerated without keeping; `rejected_runs` makes that
-- idempotent per run exactly as 0011 made approvals idempotent.
--
-- Thresholds are NOT encoded here. They live in `@tido/shared` next to
-- MIN_PATTERN_SUPPORT, for the reason 0005 gave: a threshold in SQL and in
-- TypeScript is two thresholds that will eventually disagree.
-- ============================================================================

alter table public.creative_concepts
  add column if not exists details    jsonb,
  add column if not exists evaluation jsonb,
  add column if not exists score      numeric(4,3);

alter table public.creative_concepts
  drop constraint if exists creative_concepts_score_range;
alter table public.creative_concepts
  add constraint creative_concepts_score_range check (score is null or (score >= 0 and score <= 1));

-- "Which routes keep scoring well", per route.
create index if not exists creative_concepts_route_score_idx
  on public.creative_concepts (route, score desc)
  where score is not null;

alter table public.creative_patterns
  add column if not exists rejected_count integer not null default 0,
  add column if not exists rejected_runs  jsonb   not null default '[]'::jsonb;

alter table public.creative_patterns
  drop constraint if exists creative_patterns_rejected_nonnegative;
alter table public.creative_patterns
  add constraint creative_patterns_rejected_nonnegative check (rejected_count >= 0);

comment on column public.creative_patterns.rejected_runs is
  'Run ids already counted in rejected_count. One negative signal per run, however many times it arrives.';
comment on column public.creative_concepts.evaluation is
  'DirectionEvaluator output: strengths, weaknesses, risk, signals; on the selected row, the selection reasoning.';
