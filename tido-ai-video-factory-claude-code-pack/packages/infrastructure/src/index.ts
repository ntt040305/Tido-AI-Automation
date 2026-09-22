import type {
  IdentityProvider,
  InfrastructureContext,
  IdentityRepository,
  ProjectRepository,
  RunRepository,
  StorageProvider,
} from "@tido/shared";

import { isFirebaseConfigured } from "./firebase/admin";
import { verifyToken, identifyRequest } from "./firebase/verify";
import { isDatabaseConfigured } from "./supabase/client";
import { resolveActor, listOrganizations } from "./supabase/identity.repository";
import * as projects from "./supabase/projects.repository";
import * as runs from "./supabase/runs.repository";
import { supabaseStorage } from "./storage/supabase-storage";

/**
 * @tido/infrastructure — the only module that knows a database exists.
 *
 * Everything here satisfies an interface declared in `@tido/shared`. The
 * application imports the interfaces and calls the factories below; it never
 * sees `supabase.from(...)`, a SQL string, a connection, or `firebase-admin`.
 *
 * Why factories rather than exporting the modules directly
 * --------------------------------------------------------
 * Because the return type is then the interface, not the implementation. A
 * route that receives an `InfrastructureContext` cannot reach past it into a
 * Supabase-specific helper even by accident, and swapping the backend becomes
 * a change to these three functions with nothing to edit in `apps/web`.
 *
 * SERVER ONLY. This package pulls in `firebase-admin` and the service-role
 * Supabase key, which bypasses Row Level Security entirely. `supabase/client`
 * throws on import in a browser rather than letting that ship quietly.
 */

export function getIdentityProvider(): IdentityProvider {
  return {
    verifyToken,
    identify: identifyRequest,
    isConfigured: isFirebaseConfigured,
  };
}

export function getInfrastructure(): InfrastructureContext {
  const identity: IdentityRepository = { resolveActor, listOrganizations };

  const projectRepo: ProjectRepository = {
    list: projects.listProjects,
    get: projects.getProject,
    create: projects.createProject,
    update: projects.updateProject,
  };

  const runRepo: RunRepository = {
    record: runs.recordRun,
    recordSafely: runs.recordRunSafely,
    listForOrg: runs.listRunsForOrg,
    get: runs.getRun,
  };

  return {
    identity,
    projects: projectRepo,
    runs: runRepo,
    isConfigured: isDatabaseConfigured,
  };
}

export function getStorage(): StorageProvider {
  return supabaseStorage;
}

/**
 * The authorisation rules, re-exported.
 *
 * Pure functions over an already-loaded `Actor`, so the application can ask
 * "may this person write here" to decide whether to render a control, without
 * a round trip and without duplicating the rule. The repository enforces the
 * same functions server-side, so the two cannot disagree.
 */
export { roleIn, isMember, canWrite, canAdminister, personalOrgId } from "./supabase/identity.repository";

/**
 * Header parsing, exported because it is genuinely useful on its own and
 * because a caller that needs it would otherwise reach into the package.
 */
export { bearerToken } from "./firebase/verify";

/** Whether persistence is available. Callers skip work that needs it. */
export { isDatabaseConfigured } from "./supabase/client";
