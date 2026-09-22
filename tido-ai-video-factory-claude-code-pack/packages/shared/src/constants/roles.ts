export type OrgPlan = "free" | "pro" | "agency";
export type MemberRole = "owner" | "admin" | "member" | "viewer";
export type PipelineId = "stable" | "experiment";

/**
 * Roles allowed to create or change content. A viewer reads only.
 *
 * Lives in the shared package because both layers check it: the repository
 * enforces it against the service-role connection, and the application reads
 * it to decide whether to render a disabled button. One definition means the
 * two cannot drift into disagreeing about what a member may do.
 */
export const WRITER_ROLES: readonly MemberRole[] = ["owner", "admin", "member"] as const;

/** Roles allowed to change the workspace itself. */
export const ADMIN_ROLES: readonly MemberRole[] = ["owner", "admin"] as const;
