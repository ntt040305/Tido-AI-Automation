# @tido/shared

Types, interfaces and constants that `apps/web` and `@tido/infrastructure`
both need to name.

**No runtime dependencies, deliberately.** Importing this can never drag a
database driver or an auth SDK into a bundle that had no business holding
one.

## Contents

| Path | What |
|------|------|
| `types/results.ts` | `DbResult<T>` — failure as a value, never a throw |
| `types/identity.ts` | `VerifiedIdentity`, `IdentityProvider` |
| `types/database.ts` | Row shapes, matching the SQL exactly |
| `constants/roles.ts` | `MemberRole`, `WRITER_ROLES`, `ADMIN_ROLES` |
| `contracts/repositories.ts` | `Actor` and the repository interfaces |
| `contracts/storage.ts` | `StorageProvider` |

## The point of the interfaces

`apps/web` imports these and never sees `supabase.from(...)`, a SQL string or
a connection. Swapping the backend is a new implementation over in
`@tido/infrastructure`, with nothing to edit in the application.

`VerifiedIdentity` and `Actor` are the load-bearing types. Repository methods
take an `Actor` rather than a `userId: string`, because a bare id is whatever
arrived in a request body and there is no way to tell a verified one from a
typed one at a call site.
