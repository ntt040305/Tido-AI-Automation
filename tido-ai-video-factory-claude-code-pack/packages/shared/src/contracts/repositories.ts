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
import type {
  IntelligenceDocument,
  CreativeRequest,
  CreativeIntelligenceRow,
  CreativeBlueprintRow,
  DesignDecisionRow,
  RenderIterationRow,
  VisionReviewRow,
  PersistIntelligenceInput,
  PersistIntelligenceResult,
} from "../types/intelligence";
import type {
  ConceptInput,
  CreativeConceptRow,
  CreativePatternRow,
  LearnPatternsResult,
  ObservedPattern,
  PatternDimension,
  PatternQuery,
  RecordConceptsResult,
  SimilarPattern,
} from "../types/creative-memory";
import type {
  AssetEmbeddingRow,
  IndexAssetInput,
  IndexAssetResult,
  SimilarAsset,
  SimilarityQuery,
} from "../types/asset-semantics";
import type {
  AssetMemoryRow,
  RememberAssetInput,
  RememberAssetsResult,
} from "../types/asset-memory";
import type {
  RecordUserEventInput,
  RecordUserEventResult,
  UserEventRow,
  UserMemorySnapshot,
} from "../types/memory";

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
  /**
   * The row's UUID primary key.
   *
   * NOT the engine's generation id, which is not a UUID. Callers derive this
   * deterministically from the engine id so that recording the same render
   * twice updates one row instead of creating two.
   */
  id: string;
  /** The engine's own id (`gen_...`), kept so a row can be traced to its logs. */
  engineGenerationId?: string | null;
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

/**
 * Where the AI's reasoning is kept.
 *
 * `persist` takes everything one render produced in a single call rather than
 * offering six writes. Six awaits means six ways to half-succeed, and a run
 * with intelligence but no blueprint is indistinguishable from a render that
 * genuinely produced no blueprint -- which is exactly the ambiguity a learning
 * system must not inherit.
 */
export interface IntelligenceRepository {
  /**
   * Records the input side. Returns the request id so runs can point at it.
   *
   * Separate from the run because one brief legitimately produces several
   * renders -- a retry, a correction pass, a variant.
   */
  recordRequest(input: {
    orgId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    brief?: string | null;
    assetType?: string | null;
    aspectRatio?: string | null;
    assets?: IntelligenceDocument[];
    goals?: IntelligenceDocument;
  }): Promise<DbResult<CreativeRequest>>;

  /** Writes what one render decided. */
  persist(input: PersistIntelligenceInput): Promise<DbResult<PersistIntelligenceResult>>;

  /**
   * The same write, guaranteed not to throw.
   *
   * What the render path calls. By the time this runs the picture exists and
   * the user is waiting; losing the reasoning is a loss, losing the picture is
   * a failure, and the two are not comparable.
   */
  persistSafely(input: PersistIntelligenceInput): Promise<void>;

  /** One render's full reasoning, if this actor may see it. */
  getForRun(actor: Actor, runId: string): Promise<DbResult<{
    intelligence: CreativeIntelligenceRow | null;
    blueprint: CreativeBlueprintRow | null;
    decisions: DesignDecisionRow[];
    iterations: RenderIterationRow[];
    reviews: VisionReviewRow[];
  }>>;
}

/**
 * A person's own creative memory, and the human signals behind it.
 *
 * The one repository in this file whose input is not the system's opinion of
 * its own output. Everything else here records what the engine decided;
 * `recordEvent` records what a person did, which is the only thing in the
 * schema that can correct the engine rather than agree with it.
 *
 * Takes an `Actor` on every call for the usual reason -- a bare user id is
 * whatever arrived in a request body -- and for one specific to this table: an
 * event written against the wrong id does not merely misattribute a row, it
 * teaches the system somebody else's taste.
 */
export interface UserMemoryRepository {
  /**
   * Appends one human signal.
   *
   * Idempotent per (person, kind, render) for the kinds where repetition is
   * noise, so a double-clicked download is one approval. A refused duplicate
   * comes back as `duplicate: true` rather than as an error: nothing went
   * wrong, and the caller simply must not count it.
   */
  recordEvent(actor: Actor, input: RecordUserEventInput): Promise<DbResult<RecordUserEventResult>>;

  /** This person's stored memory, or null when they have none yet. */
  load(actor: Actor): Promise<DbResult<UserMemorySnapshot | null>>;

  /**
   * Writes merged memory back.
   *
   * Upserts and never deletes. The merge rules that produced the snapshot live
   * in the application, and a store that could drop a preference the rules
   * still hold would be making a creative decision from the storage layer.
   */
  save(actor: Actor, snapshot: UserMemorySnapshot): Promise<DbResult<UserMemorySnapshot>>;

  /**
   * Recent signals from this person, newest first.
   *
   * Exists so the learning rules stay revisable: a threshold change or a fixed
   * extractor can be re-run over the evidence instead of applying only to
   * renders that happen after the deploy.
   */
  events(actor: Actor, limit?: number): Promise<DbResult<UserEventRow[]>>;
}

/**
 * Where a person's uploaded assets are remembered, keyed by their bytes.
 *
 * Takes an `Actor` on every call, as everything here does. It matters more on
 * this table than most: a content hash is global -- two companies uploading the
 * same stock photograph produce the same digest -- so the actor is the only
 * thing separating one company's product library from another's.
 */
export interface AssetMemoryRepository {
  /**
   * Records what was learned about the assets on one render.
   *
   * Merges rather than overwrites. An analysis that came back thin must not
   * erase a fuller one recorded earlier: the row is a best reading of a real
   * object, and a memory that can get worse is worse than no memory, because
   * nothing downstream can tell which of the two it is holding.
   */
  remember(actor: Actor, assets: RememberAssetInput[]): Promise<DbResult<RememberAssetsResult>>;

  /** One asset by its hash, or null when this person has not uploaded it. */
  get(actor: Actor, contentHash: string): Promise<DbResult<AssetMemoryRow | null>>;

  /**
   * Several at once, for a render carrying more than one attachment.
   *
   * One round trip rather than one per asset: this table exists to be cheaper
   * than the vision call it replaces, and a lookup costing three sequential
   * queries erodes that before it starts.
   */
  getMany(actor: Actor, contentHashes: string[]): Promise<DbResult<AssetMemoryRow[]>>;

  /** This person's most recently used assets. */
  recent(actor: Actor, limit?: number): Promise<DbResult<AssetMemoryRow[]>>;
}

/**
 * Meaning-based lookup over assets already remembered by their bytes.
 *
 * Strictly additive to `AssetMemoryRepository`, which it does not touch. The
 * hash still decides what an asset IS; this only ranks what an asset is LIKE,
 * and every method returns scores rather than verdicts so the line between
 * them stays visible to the caller.
 */
export interface AssetSemanticsRepository {
  /**
   * Stores vectors for one asset.
   *
   * A facet whose text is unchanged is left alone rather than re-embedded:
   * the embedding call is the expensive part, and re-running it over identical
   * input spends money to produce the same vector.
   */
  index(actor: Actor, input: IndexAssetInput): Promise<DbResult<IndexAssetResult>>;

  /** Which facets this asset already has, so the caller can embed only the gaps. */
  facetsFor(actor: Actor, assetId: number): Promise<DbResult<AssetEmbeddingRow[]>>;

  /**
   * Nearest neighbours within this person's own library.
   *
   * Scoped by the owning asset's `user_id`, never by a copy of it. A content
   * hash is global and so is a vector: without that scope, "find me something
   * like this" would reach into every other customer's product photography.
   */
  similar(actor: Actor, query: SimilarityQuery): Promise<DbResult<SimilarAsset[]>>;
}

/**
 * What keeps working, and what each brief could have been.
 *
 * Phases 3.3 and 4. Neither half adds intelligence: the director already
 * reasons about routes and already says why it turned one down, and a pattern
 * is counted from rows this database already holds. This is where both stop
 * being discarded.
 */
export interface CreativeMemoryRepository {
  /**
   * Counts observations into patterns.
   *
   * Idempotent per run: a run already in a pattern's evidence reinforces
   * nothing. Without that, re-running extraction over history -- which is how
   * the extraction rules stay revisable -- would multiply every count by the
   * number of times it had been run.
   */
  learnPatterns(
    actor: Actor,
    observations: ObservedPattern[],
    orgId?: string | null,
  ): Promise<DbResult<LearnPatternsResult>>;

  /** Attaches meaning to a pattern already learned. Optional by design. */
  embedPattern(
    actor: Actor,
    patternId: number,
    sourceText: string,
    embedding: number[],
    model: string,
  ): Promise<DbResult<boolean>>;

  /** This workspace's patterns, strongest evidence first. */
  listPatterns(
    actor: Actor,
    dimension?: PatternDimension,
    limit?: number,
  ): Promise<DbResult<CreativePatternRow[]>>;

  /** Patterns near a brief by meaning, scoped to this workspace. */
  similarPatterns(actor: Actor, query: PatternQuery): Promise<DbResult<SimilarPattern[]>>;

  /**
   * Promotes every pattern learned from one run, because a human kept it.
   *
   * The only path by which `approved_count` ever rises. A render finishing is
   * evidence that something was MADE; approval is the separate, later, and much
   * scarcer signal that it was any good -- and keeping the two apart is what
   * stops the system learning from its own output.
   *
   * Idempotent per run: approving twice promotes once.
   */
  markRunApproved(actor: Actor, runId: string): Promise<DbResult<number>>;

  /**
   * The negative counterpart: every pattern whose evidence includes this run
   * gains one rejection. Idempotent per run through `rejected_runs`, so a second
   * reject click, or a reject after a regenerate, counts once.
   */
  markRunRejected(actor: Actor, runId: string): Promise<DbResult<number>>;

  /**
   * Records the directions a brief could have gone, and which one ran.
   *
   * Takes no actor: like everything in `IntelligenceRepository`, this is the
   * server writing down work it just did, and the run already knows who owns it.
   */
  recordConcepts(runId: string, concepts: ConceptInput[]): Promise<DbResult<RecordConceptsResult>>;

  /** One run's considered directions, if this actor may see the run. */
  conceptsForRun(actor: Actor, runId: string): Promise<DbResult<CreativeConceptRow[]>>;
}

/** Everything the application can reach. Obtained from one factory. */
export interface InfrastructureContext {
  identity: IdentityRepository;
  projects: ProjectRepository;
  runs: RunRepository;
  intelligence: IntelligenceRepository;
  memory: UserMemoryRepository;
  assets: AssetMemoryRepository;
  assetSemantics: AssetSemanticsRepository;
  creativeMemory: CreativeMemoryRepository;
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
