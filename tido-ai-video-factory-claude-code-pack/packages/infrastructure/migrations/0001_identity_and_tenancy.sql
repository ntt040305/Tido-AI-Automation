-- ============================================================================
-- 0001 · Identity and tenancy
--
-- Firebase owns identity. This database owns everything else.
--
-- The join between them is exactly one column: user_profiles.firebase_uid.
-- No other table references a Firebase UID, and every internal foreign key
-- points at user_profiles.id instead. Changing identity provider later is then
-- a migration of one column in one table rather than of the whole schema.
--
-- Tenancy is org-scoped from the first migration rather than retrofitted.
-- Agencies are in the product's stated scope, and adding an org_id to tables
-- that already hold production rows means rewriting every foreign key under
-- load. A solo user simply gets a personal organization of one.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── user_profiles ───────────────────────────────────────────────────────────
-- The bridge. One row per Firebase account, created on first verified request
-- rather than by a signup endpoint, so there is no second registration path to
-- keep in step with Firebase.
create table if not exists public.user_profiles (
  id            uuid primary key default gen_random_uuid(),
  firebase_uid  text not null unique,
  -- Mirrored for display and support lookups only. Authentication never reads
  -- this column; Firebase is the only thing that decides who someone is.
  email         text,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.user_profiles.firebase_uid is
  'The only Firebase identifier stored anywhere in this schema.';

create index if not exists user_profiles_firebase_uid_idx
  on public.user_profiles (firebase_uid);

-- ── organizations ───────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Not an entitlement check. Billing logic lives in the application; this is
  -- a label so a query can segment by plan.
  plan        text not null default 'free'
                check (plan in ('free', 'pro', 'agency')),
  -- True for the org created automatically alongside an account. Kept so the
  -- interface can hide workspace management from someone who never asked for
  -- a team.
  is_personal boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── workspace_members ───────────────────────────────────────────────────────
-- Membership is the unit of authorisation. Every access check in the
-- repository layer resolves to "is there a row here", which keeps the rule in
-- one place instead of spread across call sites.
create table if not exists public.workspace_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  role       text not null default 'member'
               check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- ── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  created_by    uuid references public.user_profiles(id) on delete set null,
  name          text not null,
  -- Brand name, palette, standing rules. JSONB because this is a contract that
  -- has changed shape in every phase of this product so far, and columns would
  -- mean a migration each time it improves.
  brand_context jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_org_idx on public.projects (org_id);

-- ── creative_runs ───────────────────────────────────────────────────────────
-- The spine: one row per generation.
--
-- Deliberately narrow. The large reasoning payloads (blueprint, intelligence,
-- the compiled prompt) belong in run_intelligence in a later migration, so
-- this table stays cheap to scan for the questions actually asked of it --
-- what did this project produce, how long did it take, which flags were on.
--
-- user_id and org_id are nullable ON PURPOSE. This product renders for
-- signed-out visitors and must keep doing so; a NOT NULL here would make
-- anonymous generation a schema violation.
create table if not exists public.creative_runs (
  id               uuid primary key,
  org_id           uuid references public.organizations(id) on delete set null,
  project_id       uuid references public.projects(id) on delete set null,
  user_id          uuid references public.user_profiles(id) on delete set null,

  concept          text,
  asset_type       text,
  aspect_ratio     text,

  -- Which pipeline served this render, and which features were on. Without
  -- these a surprising output cannot be attributed to anything.
  pipeline         text not null default 'stable'
                     check (pipeline in ('stable', 'experiment')),
  pipeline_version text,
  features_enabled text[] not null default '{}',

  status           text not null,
  success          boolean not null default false,
  duration_ms      integer,
  error_code       text,

  -- Storage key, not bytes. Images live in object storage.
  image_path       text,

  -- Set when the vision loop renders a correction pass, so a second attempt is
  -- traceable to the render it was correcting rather than looking like an
  -- unrelated generation.
  parent_run_id    uuid references public.creative_runs(id) on delete set null,

  created_at       timestamptz not null default now()
);

create index if not exists creative_runs_org_created_idx
  on public.creative_runs (org_id, created_at desc);
create index if not exists creative_runs_user_created_idx
  on public.creative_runs (user_id, created_at desc);
create index if not exists creative_runs_project_idx
  on public.creative_runs (project_id);

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch on public.user_profiles;
create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
