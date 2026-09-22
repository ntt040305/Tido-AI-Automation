/**
 * Who is making a request.
 *
 * Deliberately narrow. This is everything the application is allowed to know
 * about a person from their token, and it is produced in exactly one place --
 * the infrastructure's token verifier. Nothing else may construct one.
 *
 * That constraint is the whole design. A function taking `userId: string`
 * accepts whatever a request body contained; a function taking
 * `VerifiedIdentity` can only be handed something a real verification
 * produced, so "an id someone typed" stops being expressible at the type
 * level rather than being caught by review.
 */
export interface VerifiedIdentity {
  /** The Firebase UID. The only identifier from the auth provider anything sees. */
  firebaseUid: string;
  email?: string;
  displayName?: string;
  emailVerified: boolean;
}

/** Verifies bearer tokens. The only thing in the system that decides identity. */
export interface IdentityProvider {
  /**
   * Resolves a token to a person, or null.
   *
   * Null for every failure -- missing, malformed, expired, revoked, provider
   * down. This product serves signed-out visitors, so "nobody" is an ordinary
   * answer the whole application already handles; turning it into an error
   * would break anonymous generation.
   */
  verifyToken(token: string | null | undefined): Promise<VerifiedIdentity | null>;

  /** The same question, asked of a request. Saves every call site parsing headers. */
  identify(req: { headers: { get(name: string): string | null } }): Promise<VerifiedIdentity | null>;

  /** False when credentials are absent, so callers can skip work that needs them. */
  isConfigured(): boolean;
}
