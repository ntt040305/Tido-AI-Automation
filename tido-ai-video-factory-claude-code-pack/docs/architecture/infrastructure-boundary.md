# The infrastructure boundary

How TIDO separates its creative engine from the services that store things,
and why the separation is worth the indirection.

---

## The property being protected

For most of its life `lib/image-engine` had no path to an account, a token or
a database row. That was not an oversight — it is a security property with a
short proof: **a bug in the render pipeline cannot leak customer data,
because there is no customer data in reach.**

Adding persistence is the first change that genuinely threatens that, so the
boundary is enforced by tests rather than by convention. One walks every file
under `lib/image-engine` and fails the build on any import of Firebase,
Supabase, the database or the identity layer. Another greps `evolution/` for
the words *user, account, billing, session, history* — it fired once during
this migration, on a prompt heading that read `THIS USER'S PREFERENCES`, and
the fix was to rename rather than to weaken the test.

---

## Dependency diagram

```
┌──────────────────────────────────────────────────────────┐
│  apps/web                                                 │
│  routes · UI · AI pipeline · lib/image-engine             │
└───────────┬──────────────────────────────────┬───────────┘
            │ imports interfaces               │ calls factories
            ▼                                  ▼
┌───────────────────────────┐      ┌───────────────────────────┐
│  @tido/shared             │◄─────│  @tido/infrastructure     │
│  contracts · types · roles│      │  Firebase · Supabase      │
│  ZERO runtime deps        │      │  storage · migrations     │
└───────────────────────────┘      └─────────────┬─────────────┘
                                                 ▼
                                   ┌───────────────────────────┐
                                   │  Firebase Auth            │
                                   │  Supabase DB + Storage    │
                                   └───────────────────────────┘
```

Arrows point at what a package depends on. The important one is that
`@tido/infrastructure` points *at* `@tido/shared` — it implements contracts it
does not own. The application depends on the contract, never on the thing
satisfying it, so replacing Supabase is a new implementation plus three
changed factories, with nothing to edit in `apps/web`.

`lib/image-engine` sits inside `apps/web` and has no arrow at all. That is
the point.

---

## Package responsibilities

| Package | Owns | Must never |
|---|---|---|
| `@tido/shared` | Row types, repository interfaces, `DbResult`, `VerifiedIdentity`, `Actor`, role constants | Import Firebase, Supabase, a driver, or anything else at runtime — including `@types/node`, which is why `PutFileInput.body` is `Uint8Array` and not `Buffer` |
| `@tido/infrastructure` | Firebase Admin, the Supabase client, repository implementations, storage, SQL migrations | Be imported by `lib/image-engine`; be imported into a browser bundle |
| `apps/web` | Routes, UI, the creative pipeline | Import `firebase-admin` or `@supabase/supabase-js` directly; reach past `@tido/infrastructure`'s entry point |

---

## Authentication flow

```
browser ── Firebase SDK ──► ID token
    │
    └─ Authorization: Bearer <token> ──► route
                                          │
                       getIdentityProvider().identify(req)
                                          │
                        verifyIdToken(token, true)  ◄── also checks revocation
                                          │
                     VerifiedIdentity { firebaseUid, … }  or  null
```

Three rules hold here, and each has a test.

**Only a token is trusted.** Not a `userId` in a body, not a UID in a header,
not an email in a query string. Those are claims anyone can type.

**Failure means anonymous, not error.** Missing, malformed, expired, revoked,
provider-down — all resolve to `null`. This product renders for signed-out
visitors, so "nobody" is an ordinary state the whole application already
handles. Turning it into a 401 here would break anonymous generation.

**Revocation is checked.** `verifyIdToken(token, true)` costs a lookup and
means disabling an account takes effect on the next request rather than
whenever the token happens to expire.

---

## Database access flow

```
route ── getInfrastructure() ──► { identity, projects, runs }
             │
   resolveActor(VerifiedIdentity) ──► Actor { profile, memberships }
             │
   projects.list(actor, orgId)
             │
    ┌────────┴────────┐
    │ authorise FIRST │   isMember(actor, orgId)  → refuse, or
    └────────┬────────┘
             ▼
         then query
```

**Every method takes an `Actor`, never a user id.** An `Actor` can only be
produced by resolving a `VerifiedIdentity`, which can only be produced by
verifying a token. Passing an id from a request body does not compile — the
unsafe thing stops being expressible rather than being caught in review.

**Authorise before querying, not after.** A check living in a `where` clause
returns the right rows today and the wrong ones the first time someone edits
the filter. Tests read the source and assert the ordering.

### Two layers, neither sufficient alone

`0002_row_level_security.sql` keys its policies on `auth.jwt() ->> 'sub'`,
the Firebase UID. Those policies protect anything reached with a user's own
token.

They protect nothing reached with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses
RLS entirely by design. The server needs that key because an anonymous render
still produces a row and no policy can authorise a request carrying no
identity — so the repository layer supplies the tenancy RLS cannot.

RLS is the second line. The repository is the first.

### Verified, and what is still needed

The policies are deployed and **proven to isolate tenants** —
`pnpm --filter @tido/infrastructure verify:rls` sets `request.jwt.claims` and
the `authenticated` role exactly as PostgREST does, then checks that one
tenant cannot read or write another's rows. 13 checks, all passing against the
live database.

Two things are required before a real request exercises them:

1. **`SUPABASE_PUBLISHABLE_KEY`** — sent as `apikey` on user-scoped requests.
   Without it there is no user-scoped client and every request arrives as
   `service_role`, which bypasses RLS.
2. **Firebase registered as a third-party auth provider** in the Supabase
   dashboard, so the gateway accepts a Firebase ID token as the bearer.

Until both are in place the policies deny everything for `anon` and
`authenticated` — closed rather than open, which is the right failure
direction, but it means tenancy rests entirely on the repository layer.

---

## Storage flow

```
route ── getStorage() ──► put / signedUrl / remove ──► Supabase Storage
```

URLs are signed and expiring, not public: these are a customer's product
photographs and finished commercial work, and a permanent public URL for them
is a leak with a long tail.

**The image engine does not use this, deliberately.** It writes its own render
folders in `lib/image-engine/delivery`. Routing those through a storage
provider from this package would require the engine to import infrastructure
— breaking the boundary at the top of this document. Moving render artifacts
into object storage is future work that has to cross the boundary through a
route, never from inside the engine.

---

## Failure behaviour

Every layer degrades rather than throws. The application rendered pictures
for its whole life before any of this existed and must keep doing so.

| Condition | Result |
|---|---|
| No Firebase credentials | Everyone is anonymous. Rendering unaffected. |
| Invalid / expired / revoked token | `null`. Request proceeds as signed-out. |
| No Supabase credentials | `{ ok: false, unavailable: true }`. Nothing recorded. |
| Database down mid-render | `recordSafely` swallows it. The picture returns. |

`unavailable` is distinguished from a real error on purpose: an unconfigured
database on a laptop is expected and silent, while a failed query in
production is worth a log line.

---

## Future extension points

**Replacing Supabase.** Implement the interfaces in
`@tido/shared/contracts/repositories.ts` and change the three factories in
`packages/infrastructure/src/index.ts`. No route changes.

**Replacing Firebase.** Implement `IdentityProvider` and change
`getIdentityProvider()`. `user_profiles.firebase_uid` is the only column in
the schema naming the provider — every internal foreign key uses
`user_profiles.id`, so the migration is one column in one table.

**Adding a repository.** Declare the interface in `@tido/shared`, implement it
under `packages/infrastructure/src/supabase/`, expose it on
`InfrastructureContext`. Take an `Actor`, authorise before querying, and
return the same error for "not found" and "not yours" so the endpoint cannot
be used to discover which ids exist.

**Persisting creative intelligence** (Phase 2). The row shapes belong in
`@tido/shared`, the write belongs in the route that wraps
`PipelineRouter.run`, and it must follow `recordSafely` semantics. The engine
must not learn that a database exists.
