-- ============================================================================
-- 0007 · Record WHEN an asset was analysed, so model_calls can stop lying
--
-- THE DEFECT THIS FIXES
-- ---------------------
-- `asset_memory.model_calls` exists to make one claim checkable: the gap
-- between it and `times_seen` is the vision work the memory saved. As shipped
-- in 0006 it counted something else.
--
-- The application decided "a model ran" from
-- `VisualDNA.provenance.derived_from_image`. That flag is true of a REUSED
-- analysis as well as a fresh one -- `VisualDNAAnalyzer` returns the previous
-- object unchanged when the image hashes still match, provenance and all. So a
-- render that hit the in-process cache, made no call and cost nothing was
-- recorded as a call.
--
-- Found by running two real renders of the same image and reading the server
-- log against the row: the log said `reusing analysis for unchanged images`
-- and the row said `model_calls: 2`. Both renders were counted, the saving
-- showed as zero, and the number that justifies this table was wrong in the
-- direction that flatters it.
--
-- THE FIX
-- -------
-- `analyzed_at` is already on the provenance and is the analyser's own
-- timestamp for the analysis, carried forward untouched on a reuse. Storing it
-- makes the question answerable without guessing: a sighting whose
-- `analyzed_at` matches what is already recorded reused an existing analysis,
-- and only a new timestamp is a new call.
--
-- Nullable, because rows written before this migration have no timestamp to
-- backfill and inventing one would be worse than admitting the gap. A null
-- means "not known", and the application treats an unknown as a reuse rather
-- than a call -- the conservative direction, since over-counting savings is
-- the failure this migration exists to correct.
-- ============================================================================

alter table public.asset_memory
  add column if not exists analyzed_at timestamptz;

comment on column public.asset_memory.analyzed_at is
  'VisualDNA.provenance.analyzed_at for the analysis this row holds. A sighting carrying the same timestamp reused that analysis and cost no vision call.';
