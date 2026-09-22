# @tido/infrastructure

Firebase identity, Supabase persistence, and file storage. The only package
that knows a database exists.

## Why it is separate

`apps/web` and `lib/image-engine` must be able to run without any of this.
The application rendered pictures for its whole life before it had a
database, and that has to remain true: every function here returns a value
rather than throwing, and "not configured" is an ordinary answer.

The separation is also a security property. The image engine has no path to
an account, a token or a row — a render bug therefore cannot reach customer
data, because there is no customer data in reach. A test walks
`lib/image-engine` and fails the build on any import of this package.

## Dependency direction

```
apps/web  ──────►  @tido/shared   (interfaces, row types, roles)
                        ▲
@tido/infrastructure ───┘          (implements them)
```

The application depends on the contract, never on the thing satisfying it.
Replacing Supabase means writing new implementations of the interfaces in
`@tido/shared` and changing the three factories in `src/index.ts`. No route
changes.

## Public surface

Nothing outside this package should import from `src/` directly.

```ts
import { getIdentityProvider, getInfrastructure, getStorage } from "@tido/infrastructure";

const who = await getIdentityProvider().identify(req);   // VerifiedIdentity | null
const { projects, runs } = getInfrastructure();
```

Repository calls take an `Actor`, never a user id. An `Actor` can only be
produced by resolving a `VerifiedIdentity`, which can only be produced by
verifying a token — so "an id from a request body" stops being expressible
rather than being caught in review.

## Migrations

SQL in `migrations/`, applied in filename order.

```
0001_identity_and_tenancy.sql   user_profiles, organizations,
                                workspace_members, projects, creative_runs
0002_row_level_security.sql     RLS policies keyed on the Firebase claim
```

Apply with `supabase db push`, or by running each file in order against the
project. They are idempotent (`if not exists`, `drop policy if exists`), so
re-running is safe.

### One configuration step these migrations cannot do

The policies in `0002` read the Firebase UID from `auth.jwt() ->> 'sub'`,
which requires **Firebase registered as a third-party auth provider** in the
Supabase project settings. Until that is done they match nothing for
anon/authenticated clients — closed rather than open, which is the right
failure direction, but it does mean the policies are inert.

### The service role caveat

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS completely. Server code using it is
**not** protected by `0002`. That is why the repositories authorise in
application code as well: RLS is the second line, the repository is the
first, and neither is sufficient alone.

## Environment

See `.env.example`. Every variable is optional; absent credentials degrade to
signed-out and unrecorded.
