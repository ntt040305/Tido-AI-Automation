# Data Model and API

## Entities

Workspace, User, Client, Brand, Product, Project, ProjectVersion, ProductionProfile, BriefVersion, CreativeTreatmentVersion, ScriptVersion, CreativeApproval, Scene, SceneSpecificationVersion, TechniqueCard, TechniqueCardVersion, Asset, AssetDerivative, ProductionPlan, Provider, ProviderModel, ProviderCapability, PricingSnapshot, GenerationJob, JobAttempt, QCRecord, VoiceProfile, VoiceRender, MusicTrack, MusicEdit, SFXAsset, TimelineVersion, OutputVersion, CostLedgerEntry, AuditLog.

## Relationships

- Project có một active Production Profile.
- Versions immutable.
- Approved Script tham chiếu locked Brief.
- SceneSpecification tham chiếu Approved Script và Technique Card versions.
- Production Plan tham chiếu SceneSpec và Pricing Snapshot.
- Generation Job chỉ thuộc một scene version.
- Output tham chiếu chính xác scene/audio/graphic/timeline versions.

## Commands

CreateProject, UpdateBriefDraft, ConfirmBrief, GenerateCreative, ReviseCreative, ApproveCreative, BuildSceneSpecifications, PlanProduction, StartProduction, RetryScene, SelectFallback, ComposeOutput, RunFinalQC, ApproveOutput, CreateVariant, CancelProject.

## Events

BriefConfirmed, CreativeGenerated, CreativeApproved, SceneSpecificationsCreated, ProductionPlanned, SceneJobSubmitted, SceneJobCompleted, SceneQCFailed, SceneAccepted, VoiceRendered, MusicSelected, CompositionCompleted, FinalQCCompleted, ProjectCompleted.

## API conventions

- REST + OpenAPI trong MVP.
- idempotency key.
- optimistic concurrency.
- cursor pagination.
- signed upload/download.
- internal worker authentication.
- normalized errors: code/category/retryable/userMessage.
