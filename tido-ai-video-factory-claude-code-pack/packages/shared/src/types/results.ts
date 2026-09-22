/**
 * What every infrastructure call returns.
 *
 * A value, never a throw. Infrastructure in this product is optional by
 * design: the application rendered pictures for its whole life before it had
 * a database, and must keep doing so when the database is unreachable. A
 * result type forces every caller to decide what "unavailable" means for them
 * instead of discovering it as an unhandled rejection in production.
 */
export type DbResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /**
       * True when the backing service simply is not configured or reachable.
       *
       * Distinguished from a real error because the two deserve different
       * responses: an unconfigured database on a developer's machine is
       * expected and silent, while a failed query in production is worth a
       * log line.
       */
      unavailable?: boolean;
    };
