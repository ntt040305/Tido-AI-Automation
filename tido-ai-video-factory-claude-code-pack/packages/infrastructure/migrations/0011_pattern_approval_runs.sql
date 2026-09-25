-- ============================================================================
-- 0011 · Which runs actually earned a pattern's approval
--
-- 0009 gave `creative_patterns` an `approved_count`, and that counter is the
-- single most load-bearing number in the learning system: it is the only one
-- backed by a human act rather than by the system's opinion of its own output.
--
-- A bare counter cannot defend itself. Approval arrives separately from the
-- render -- a person clicks download minutes or days later -- and nothing in a
-- plain integer can tell a second signal for the same render from a genuine
-- second render. 0005 solved exactly this for `user_events` with a uniqueness
-- index; the promotion path needs its own answer, because it is a different
-- write arriving at a different time.
--
-- So the runs that have already been credited are recorded. Approving the same
-- render twice promotes once, and re-running any backfill is safe.
-- ============================================================================

alter table public.creative_patterns
  add column if not exists approved_runs jsonb not null default '[]'::jsonb;

comment on column public.creative_patterns.approved_runs is
  'Run ids already credited to approved_count. Keeps promotion idempotent: one human act per run, however many times the signal arrives.';
