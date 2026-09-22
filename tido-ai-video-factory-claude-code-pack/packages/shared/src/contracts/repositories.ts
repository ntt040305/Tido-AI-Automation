import type { DbResult } from "../types/results";
import type { VerifiedIdentity } from "../types/identity";
import type { MemberRole } from "../constants/roles";
import type {
  UserProfile,
  Organization,
  WorkspaceMember,
  Project,
  CreativeRun,
} from "../types/database";

/**
 * What the application is allowed to ask of persistence.
 *
 * These interfaces are the boundary. The application imports from this file
 * and never sees `supabase.from(...)`, a SQL string, or a connection — which
 * means a change of database is a new implementation over here rather than an
 * edit to every route.
 *
 * The recurring shape is `(actor, ...)`. Nothing takes a bare user id, because
 * a bare id is whatever arrived in a request body and there is no way to tell
 * a verified one from a typed one at a call site. An `Actor` can only be
 * produced by resolving a `VerifiedIdentity`, so passing the wrong thing stops
 * compiling instead of quietly reading someone else's rows.
 */

/**
 * A caller, resolved: their profile plus every workspace they belong to.
 *
 * Memberships are carried on the object rather than re-queried per check, so
 * an authorisation decision is a comparison against data already in hand.
 */
export interface Actor {
  profile: UserProfile;
  memberships: WorkspaceMember[];
}

export interface IdentityRepository {
  /**
   * Finds or creates the profile behind a verified identity, and loads its
   * memberships.
   *
   * Creation on first sight rather than through a signup endpoint: there is
   * then no registration path that can fall out of step with the auth
   * provider, and no window where a valid token has no row behind it.
   */
  resolveActor(identity: VerifiedIdentity): Promise<DbResult<Actor>>;

  listOrganizations(actor: Actor): Promise<DbResult<Organization[]>>;
}

export interface ProjectRepository {
  list(actor: Actor, orgId: string): Promise<DbResult<Project[]>>;
  /**
   * One project, if this actor may see it.
   *
   * Implementations must return the same error for "does not exist" and "not
   * yours". Distinguishing them turns the endpoint into a way to discover
   * which project ids are real.
   */
  get(actor: Actor, projectId: string): Promise<DbResult<Project>>;
  create(
    actor: Actor,
    input: { orgId: string; name: string; brandContext?: Record<string, unknown> },
  ): Promise<DbResult<Project>>;
  update(
    actor: Actor,
    projectId: string,
    changes: { name?: string; brandContext?: Record<string, unknown> },
  ): Promise<DbResult<Project>>;
}

/** What the application hands over when a render finishes. */
export interface RecordRunInput {
  /** The engine's own generation id, reused as the primary key. */
  id: string;
  /** All three are optional: an anonymous render belongs to nobody. */
  orgId?: string | null;
  projectId?: string | null;
  userId?: string | null;

  concept?: string | null;
  assetType?: string | null;
  aspectRatio?: string | null;

  pipeline: "stable" | "experiment";
  pipelineVersion?: string | null;
  featuresEnabled?: string[];

  status: string;
  success: boolean;
  durationMs?: number | null;
  errorCode?: string | null;

  imagePath?: string | null;
  parentRunId?: string | null;
}

export interface RunRepository {
  /**
   * Records a finished generation.
   *
   * Takes no actor: the server is recording work it just did, not a client
   * claiming something happened. A client able to write here could fabricate
   * the history that every learning feature will later read.
   */
  record(input: RecordRunInput): Promise<DbResult<CreativeRun>>;

  /**
   * The same write, guaranteed not to throw.
   *
   * What routes on the render path call. By the time this runs the picture
   * exists and the user is waiting; a database problem is an analytics
   * problem, and making that the shape of the API beats hoping every call
   * site remembers a try/catch.
   */
  recordSafely(input: RecordRunInput): Promise<void>;

  listForOrg(actor: Actor, orgId: string, limit?: number): Promise<DbResult<CreativeRun[]>>;
  get(actor: Actor, runId: string): Promise<DbResult<CreativeRun>>;
}

/** Everything the application can reach. Obtained from one factory. */
export interface InfrastructureContext {
  identity: IdentityRepository;
  projects: ProjectRepository;
  runs: RunRepository;
  /** False when the database is not configured. Every call still returns a result. */
  isConfigured(): boolean;
}

/** Pure authorisation helpers. Exported so both layers agree on the rules. */
export interface AccessRules {
  roleIn(actor: Actor, orgId: string): MemberRole | null;
  isMember(actor: Actor, orgId: string): boolean;
  canWrite(actor: Actor, orgId: string): boolean;
  canAdminister(actor: Actor, orgId: string): boolean;
}
