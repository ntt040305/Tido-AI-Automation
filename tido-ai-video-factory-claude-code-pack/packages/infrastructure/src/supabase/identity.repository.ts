import { getDb, unavailable, failed } from "./client";
import type {
  DbResult,
  VerifiedIdentity,
  UserProfile,
  Organization,
  WorkspaceMember,
  MemberRole,
  Actor,
  IdentityRepository,
} from "@tido/shared";
import { WRITER_ROLES, ADMIN_ROLES } from "@tido/shared";

/**
 * Accounts, organizations and membership.
 *
 * The one rule this file exists to enforce: **every caller must present a
 * verified identity, not a user id.** A function that took a `userId: string`
 * would accept whatever a request body contained, and the difference between
 * "the id of the person who proved who they are" and "an id someone typed" is
 * invisible at a call site. Taking `VerifiedIdentity` -- a type that can only
 * be produced by `verifyToken` -- makes the safe thing the only thing that
 * compiles.
 */

/**
 * Finds or creates the profile for a verified Firebase identity.
 *
 * Registration is a side effect of the first authenticated request rather than
 * a separate endpoint. There is then no signup path that can fall out of step
 * with Firebase, and no window in which someone holds a valid token but has no
 * row here.
 *
 * A personal organization is created alongside a new profile because every
 * piece of content in this schema hangs off an org. Without one, a solo user's
 * first project would have nowhere to live and the interface would have to
 * special-case orgless people everywhere.
 */
export async function upsertProfile(identity: VerifiedIdentity): Promise<DbResult<UserProfile>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const existing = await db
      .from("user_profiles")
      .select("*")
      .eq("firebase_uid", identity.firebaseUid)
      .maybeSingle();

    if (existing.error) return failed(existing.error);

    if (existing.data) {
      // Email and display name are mirrored from Firebase, which owns them.
      // Refreshed on sight so a rename in Firebase does not leave a stale
      // name here forever.
      //
      // Only fields the caller actually KNOWS are compared. `undefined` means
      // "not supplied", not "cleared": a caller holding only a UID used to
      // read as an account with no email and no name, and every signed-in
      // render wiped both. The cost of the rule: a name removed in Firebase
      // stays mirrored here, which is the harmless direction for a mirror.
      const patch: { email?: string | null; display_name?: string | null } = {};
      if (identity.email !== undefined && existing.data.email !== identity.email) {
        patch.email = identity.email;
      }
      if (identity.displayName !== undefined && existing.data.display_name !== identity.displayName) {
        patch.display_name = identity.displayName;
      }

      if (!Object.keys(patch).length) return { ok: true, data: existing.data as UserProfile };

      const updated = await db
        .from("user_profiles")
        .update(patch)
        .eq("id", existing.data.id)
        .select("*")
        .single();

      if (updated.error) return failed(updated.error);
      return { ok: true, data: updated.data as UserProfile };
    }

    const created = await db
      .from("user_profiles")
      .insert({
        firebase_uid: identity.firebaseUid,
        email: identity.email ?? null,
        display_name: identity.displayName ?? null,
      })
      .select("*")
      .single();

    if (created.error) {
      // Two first requests from a brand-new account (the page load and the
      // render) can both find no row and both insert. The loser's unique
      // violation means the profile now exists -- read it rather than treating
      // this person as anonymous for the render that lost.
      if ((created.error as { code?: string }).code === "23505") {
        const winner = await db
          .from("user_profiles")
          .select("*")
          .eq("firebase_uid", identity.firebaseUid)
          .maybeSingle();
        if (!winner.error && winner.data) return { ok: true, data: winner.data as UserProfile };
      }
      return failed(created.error);
    }
    const profile = created.data as UserProfile;

    const org = await db
      .from("organizations")
      .insert({
        name: identity.displayName || identity.email || "Personal workspace",
        is_personal: true,
      })
      .select("*")
      .single();

    if (!org.error && org.data) {
      await db.from("workspace_members").insert({
        org_id: (org.data as Organization).id,
        user_id: profile.id,
        role: "owner" satisfies MemberRole,
      });
    }

    return { ok: true, data: profile };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Turns a verified identity into an actor with its memberships loaded.
 *
 * Memberships are fetched once here rather than queried per check, so an
 * authorisation decision later in the request is a comparison against data
 * already in hand instead of another round trip.
 */
export async function resolveActor(identity: VerifiedIdentity): Promise<DbResult<Actor>> {
  const profileResult = await upsertProfile(identity);
  if (!profileResult.ok) return profileResult;

  const db = await getDb();
  if (!db) return unavailable();

  try {
    const memberships = await db
      .from("workspace_members")
      .select("*")
      .eq("user_id", profileResult.data.id);

    if (memberships.error) return failed(memberships.error);

    return {
      ok: true,
      data: {
        profile: profileResult.data,
        memberships: (memberships.data || []) as WorkspaceMember[],
      },
    };
  } catch (e) {
    return failed(e);
  }
}

/** The actor's role in an org, or null when they are not a member. */
export function roleIn(actor: Actor, orgId: string): MemberRole | null {
  return actor.memberships.find((m) => m.org_id === orgId)?.role ?? null;
}

export function isMember(actor: Actor, orgId: string): boolean {
  return roleIn(actor, orgId) !== null;
}

/** Owners, admins and members may create and change content. Viewers may not. */
export function canWrite(actor: Actor, orgId: string): boolean {
  const role = roleIn(actor, orgId);
  return role !== null && WRITER_ROLES.includes(role);
}

/** Only owners and admins may change the workspace itself. */
export function canAdminister(actor: Actor, orgId: string): boolean {
  const role = roleIn(actor, orgId);
  return role !== null && ADMIN_ROLES.includes(role);
}

/** The personal workspace created with the account, if it still exists. */
export function personalOrgId(actor: Actor): string | null {
  // Falls back to the earliest membership: a user who left or deleted their
  // personal org still needs somewhere for a new project to go.
  const owned = actor.memberships.filter((m) => m.role === "owner");
  return (owned[0] ?? actor.memberships[0])?.org_id ?? null;
}

export async function listOrganizations(actor: Actor): Promise<DbResult<Organization[]>> {
  const db = await getDb();
  if (!db) return unavailable();
  const ids = actor.memberships.map((m) => m.org_id);
  if (ids.length === 0) return { ok: true, data: [] };

  try {
    const res = await db.from("organizations").select("*").in("id", ids);
    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as Organization[] };
  } catch (e) {
    return failed(e);
  }
}
