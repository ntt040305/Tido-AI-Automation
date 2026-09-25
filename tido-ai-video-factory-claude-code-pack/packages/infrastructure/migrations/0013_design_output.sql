-- ============================================================================
-- 0013 · Professional design output: the design document, and brand kits
--
-- Phase 5. Additive only. No new table.
--
-- THE DESIGN DOCUMENT LIVES ON THE BLUEPRINT ROW
-- -----------------------------------------------
-- A design document is the editable structure a render was made from: canvas,
-- layers, positions, styling, the client's exact text. It is one per run, it
-- is derived from the blueprint, typography and layout already stored on
-- `creative_blueprints`, and it must be visible to exactly the people who can
-- see the run. `creative_blueprints` already has all three properties:
--
--   - primary key AND foreign key `run_id -> creative_runs(id) on delete cascade`
--     (0003), so a document cannot exist without its run and dies with it;
--   - RLS `creative_blueprints_read` through `can_see_run(run_id)` (0003), so
--     the document inherits run ownership and cannot drift from it;
--   - no INSERT/UPDATE policy, so only the server writes it.
--
-- A separate table would have restated each of those, which is the drift 0003
-- argued against. One nullable column.
--
-- BRAND KITS LIVE ON PROJECTS
-- ---------------------------
-- 0001 created `projects.brand_context` for exactly this -- "brand name,
-- palette, standing rules" -- org-scoped, with member-read and writer-write RLS
-- (0002) and the FK `creative_runs.project_id -> projects(id)` already linking a
-- render to the brand it was made for. A Brand Kit is a project whose
-- `brand_context` carries a `brand_kit` document. The only addition is an index
-- that lists a workspace's kits without scanning its other projects.
-- ============================================================================

alter table public.creative_blueprints
  add column if not exists design_document jsonb;

comment on column public.creative_blueprints.design_document is
  'Phase 5 editable design document: canvas, layers (image/text/background/effect) with position, size, rotation, opacity, z-index and style; text layers carry the client''s exact text. Derived from the same layout and typography the render prompt was written from.';

-- "Renders that produced a design document", for auditing coverage.
create index if not exists creative_blueprints_has_document_idx
  on public.creative_blueprints (created_at desc)
  where design_document is not null;

-- A workspace's brand kits, newest first. Partial: most projects are not kits.
create index if not exists projects_brand_kit_idx
  on public.projects (org_id, updated_at desc)
  where brand_context ? 'brand_kit';

comment on column public.projects.brand_context is
  'Brand identity. A Brand Kit (Phase 5.4) is stored under the key brand_kit: name, colors, fonts, style rules and an optional normalised logo.';
