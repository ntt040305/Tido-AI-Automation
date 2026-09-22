-- ============================================================================
-- 0002 · Row Level Security
--
-- The Phase 0 audit called this the highest-leverage decision in the project,
-- so the reasoning is recorded here rather than in a ticket.
--
-- Supabase RLS expects a Supabase JWT. A Firebase ID token is not one, and
-- there were three ways through:
--
--   1. Third-party auth  -- register Firebase as an external issuer, so
--                           auth.jwt() carries the Firebase claims directly.
--   2. Token exchange    -- verify Firebase server-side, mint a Supabase JWT.
--   3. Service role only -- the server holds the service key and enforces
--                           tenancy in application code.
--
-- These policies implement (1). They read the Firebase UID from the `sub`
-- claim, which is what Supabase puts there once Firebase is registered as a
-- third-party auth provider in the project settings.
--
-- Option (3) was rejected as the primary mechanism. It is the one a team
-- drifts into under time pressure, and it makes a single forgotten
-- `where org_id = ...` a cross-tenant leak with nothing behind it.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- The service_role key bypasses RLS entirely, by design in Postgres. Server
-- code that uses it is therefore NOT protected by anything below. That is why
-- the repository layer takes an explicit actor and resolves membership itself:
-- these policies are the second line, not the only one. Neither layer is
-- sufficient alone and the pair is the point.
--
-- REQUIRED DASHBOARD STEP
-- -----------------------
-- Until Firebase is registered as a third-party auth provider in the Supabase
-- project, anon/authenticated clients match no policy and see nothing. That is
-- the correct failure direction -- closed, not open -- but it does mean these
-- policies are inert until that configuration is done.
-- ============================================================================

alter table public.user_profiles    enable row level security;
alter table public.organizations    enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects         enable row level security;
alter table public.creative_runs    enable row level security;

-- ── helpers ─────────────────────────────────────────────────────────────────

-- The caller's internal id, resolved from the Firebase UID in the token.
-- Returns null for an unauthenticated request, which makes every policy below
-- fail closed without needing to special-case it.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.user_profiles
   where firebase_uid = nullif(auth.jwt() ->> 'sub', '')
   limit 1;
$$;

-- Membership as a function so the rule lives in one place. SECURITY DEFINER so
-- the lookup itself is not filtered by the policy on workspace_members, which
-- would otherwise recurse.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.org_id = target_org
       and m.user_id = public.current_profile_id()
  );
$$;

create or replace function public.has_org_role(target_org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.org_id = target_org
       and m.user_id = public.current_profile_id()
       and m.role = any(roles)
  );
$$;

-- ── user_profiles ───────────────────────────────────────────────────────────
-- A person sees their own row and nobody else's. Profiles are not listable:
-- there is no policy that returns another user's row, so member directories
-- must be built through a view that exposes only what a teammate needs.
drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read on public.user_profiles
  for select using (id = public.current_profile_id());

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update on public.user_profiles
  for update using (id = public.current_profile_id())
          with check (id = public.current_profile_id());

-- No INSERT policy. Profiles are created by the server on first verified
-- token, so a client cannot mint one for a UID it does not own.

-- ── organizations ───────────────────────────────────────────────────────────
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update on public.organizations
  for update using (public.has_org_role(id, array['owner','admin']))
          with check (public.has_org_role(id, array['owner','admin']));

-- ── workspace_members ───────────────────────────────────────────────────────
drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members
  for select using (public.is_org_member(org_id));

-- Only owners and admins change who is in a workspace.
drop policy if exists workspace_members_admin_write on public.workspace_members;
create policy workspace_members_admin_write on public.workspace_members
  for all using (public.has_org_role(org_id, array['owner','admin']))
      with check (public.has_org_role(org_id, array['owner','admin']));

-- ── projects ────────────────────────────────────────────────────────────────
drop policy if exists projects_member_read on public.projects;
create policy projects_member_read on public.projects
  for select using (public.is_org_member(org_id));

-- A viewer can read but not create or change. The check clause matters as much
-- as the using clause: without it a member could move a project into an org
-- they do not belong to.
drop policy if exists projects_member_write on public.projects;
create policy projects_member_write on public.projects
  for all using (public.has_org_role(org_id, array['owner','admin','member']))
      with check (public.has_org_role(org_id, array['owner','admin','member']));

-- ── creative_runs ───────────────────────────────────────────────────────────
-- Two ways to see a run: it belongs to an org you are in, or it is yours.
-- The second clause covers renders made before an org was attached.
--
-- Anonymous runs (org_id and user_id both null) match neither and are
-- invisible to every authenticated client. They are reachable only by the
-- server, which is the correct outcome: nobody owns them, so nobody may claim
-- them by signing in.
drop policy if exists creative_runs_read on public.creative_runs;
create policy creative_runs_read on public.creative_runs
  for select using (
    (org_id is not null and public.is_org_member(org_id))
    or (user_id is not null and user_id = public.current_profile_id())
  );

-- Runs are written by the server after generation, never by a client. There is
-- deliberately no INSERT or UPDATE policy: a client that could write here
-- could fabricate history, which is the input to every learning feature on the
-- roadmap.
