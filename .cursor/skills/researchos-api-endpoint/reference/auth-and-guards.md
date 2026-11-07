# Auth, guards and access

The session guard, the role guard, the decorators, and how a new route
decides what it needs.

## The shape of it

Every request passes through the guards before it reaches a controller. The
guards are registered globally, so **a route is protected by default** and
opts out explicitly.

```text
apps/api/src/common/
  auth/
    auth-principal.ts      The request-scoped identity — a plain type
    session-resolver.ts    The contract the identity module implements
    session-cookie.ts      The cookie name and its options
  constants/
    roles.ts               The role names — ROLES.ADMIN, ROLES.RESEARCHER
  guards/
    session.guard.ts       Is there a valid session? → 401
    role.guard.ts          Does the caller hold the roles? → 403
  decorators/
    public.decorator.ts    @Public() — reachable without a session
    roles.decorator.ts     @Roles(ROLES.ADMIN) — the roles a route requires
    current-user-id.decorator.ts  @CurrentUserId() — the caller's id
```

The dependency graph is a tree with no cycle:

```text
common/auth/          <- the shared leaf: principal type + resolver contract
common/guards/        <- SessionGuard, RoleGuard (depend on the leaf only)
modules/identity/     <- SessionService, AccessService, the auth endpoints
```

`common/` names **no business entity** — no `Profile`, no `Opportunity`. A
domain name in the shared leaf would tie the whole app to one module, which
is the same rule `src/common/` follows in the backend.

## The session guard

`SessionGuard` answers one question: **is there a valid session behind this
request?**

```typescript
const token = this.readToken(request);       // the raw cookie value
if (!token) throw new UnauthorizedException();

const principal = await this.resolver.resolve(token);
if (!principal) throw new UnauthorizedException();

await this.resolver.refresh(principal.sessionId).catch(() => undefined);
(request as AuthenticatedRequest)[PRINCIPAL_REQUEST_KEY] = principal;
```

It hands the **raw** cookie value to the resolver and receives a principal.
It never hashes the token itself and never touches a session table — the
resolver owns all of that, which is what keeps `common/` free of the
identity module.

### What a missing session means

"Not signed in" is an **expected state**, not a failure of the server. A
missing cookie, a malformed cookie, an expired session and a revoked
session all mean the same thing to the caller, and all of them are
`UnauthorizedException` → a `401` with the generic `unauthorized` code.

The guard never throws a `500` for a missing cookie.

### Why the guard is an `APP_GUARD`

It is registered as a provider, not through
`app.useGlobalGuards(new SessionGuard(...))`. A guard that injects
`SESSION_RESOLVER` needs the DI container to resolve it, and a hand-built
instance has no container.

```typescript
// modules/identity/identity.module.ts
providers: [
  SessionService,
  { provide: SESSION_RESOLVER, useExisting: SessionService },
  { provide: APP_GUARD, useClass: SessionGuard },
  { provide: APP_GUARD, useClass: RoleGuard },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
]
```

`useExisting`, not `useClass`: the resolver is the **same** `SessionService`
instance the module provides. Two instances would mean two sources of truth
for the session rules.

The guards are registered in the **identity module**, because that is the
module that implements the resolver. A module that does not implement the
resolver does not register the guards.

### The refresh must not fail the request

The session was already validated when `refresh()` is called — it slides the
idle window forward. A failure there is a bookkeeping problem, not an
authentication problem, so the failure is swallowed:

```typescript
await this.resolver.refresh(principal.sessionId).catch(() => undefined);
```

The idle window slides **inside** the absolute expiry, never past it. The
database enforces the same rule with the check `ck_session_expiry`, so a
bug here can only fail the write, never extend a session.

## The role guard

`RoleGuard` answers a second question: **does the caller hold the roles the
route requires?**

```typescript
@Roles(ROLES.ADMIN)
@Get('users')
listUsers(): UsersDto { ... }
```

- A route with **no** `@Roles` is open to any signed-in caller — the session
  guard still applies.
- `@Roles(ROLES.ADMIN, ROLES.RESEARCHER)` requires **every** listed role, not one
  of them.
- A caller that is signed in but holds the wrong role gets a `403`
  (`ForbiddenException`) — not a `401`.

### Roles are read live, never snapshotted

The guard asks the resolver for the caller's effective roles on every
request, so a revoked grant takes effect on the **next request**, not on the
next login.

```typescript
const access = await this.resolver.effectiveRoles(principal.userId);
```

The principal carries the roles it had when the request was resolved, but
the guard does not trust that snapshot — it reads again. `RoleGuard` has
tests for exactly this: a role revoked after the session was issued is
refused on the very next request.

The `FACULTY` → `RESEARCHER` baseline and the explicit `ADMIN` grant are
resolved in the database, by the `effective_user_access` view. A caller
never has to know that rule.

### What the role guard is not

It is **not** a record-level check. "Is this user allowed to see *this*
output?" depends on the record — its owner, its group, its visibility — so
it stays in the owning module's **service**, where the record is known.

A guard that could answer that would have to know every domain entity, which
is exactly what `common/` must not do.

| Question | Where it is answered |
| --- | --- |
| Is there a valid session? | `SessionGuard` → `401` |
| Does the caller hold the required role? | `RoleGuard` → `403` |
| May this caller see *this record*? | the owning module's service → `403` |

## The decorators

### `@Public()`

Marks a route as reachable **without** a session.

```typescript
@Public()
@Post('auth/login')
async login(@Body() dto: LoginDto): Promise<MeDto> { ... }
```

The session guard is global, so every route passes through it. A route that
is open to everyone — the health probes, the demo endpoints, the login
itself — says so explicitly.

Without it, a public route would have to opt out of a global guard, which
means every public route needs its own `@UseGuards`, and the inverse
mistake goes unnoticed: a route that *should* be protected but is not,
because nobody remembered to add a guard.

The exemption is deliberately narrow. **A route is public only when it is
declared so.**

### `@Roles(...roles)`

Declares the roles a route requires. The guard refuses with a `403` when the
caller is signed in but does not hold every listed role.

The role names come from `ROLES` in `common/constants/roles.ts`:

```typescript
import { ROLES } from '../../common/constants/roles.js';

@Roles(ROLES.ADMIN)
```

A bare string literal is a compile error, because the decorator takes
`Role[]` and `Role` is derived from `ROLES`. The names are the same two
values the database's `access_role` enum carries.

### `@CurrentUserId()`

Injects the authenticated caller's user id into a handler parameter.

```typescript
@Get('me')
me(@CurrentUserId() userId: string): Promise<MeDto> {
  return this.authService.me(userId);
}
```

The parameter is `string`, **not** `string | undefined`: the session guard
has already refused the request when there is no principal, so a handler
behind it always has one. The decorator throws rather than handing
`undefined` to a service that would then have to guess.

## Adding a new route — the decision

| The route… | Needs |
| --- | --- |
| is open to everyone | `@Public()` |
| needs a signed-in caller | nothing — the session guard is global |
| needs a specific role | `@Roles(ROLES.ADMIN)` |
| needs the caller's id | `@CurrentUserId() userId: string` |
| is restricted per record | nothing at the route level; the **service** checks it |

Two rules follow:

1. **Never add `@UseGuards(SessionGuard)` to a route.** The guard is
   global. A per-route guard duplicates the protection and creates the
   impression that the routes without one are unprotected.
2. **Never write a manual permission check in the controller.** The
   controller accepts input, calls the service and returns the result.
   A check there is bypassable, duplicated, and invisible to the guard
   layer.

## The session cookie

The cookie is **opaque**: it holds a random token, never a JWT and never a
claim. Only the SHA-256 hash of the token is stored, so a database leak does
not hand out live sessions.

```typescript
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,      // JavaScript cannot read it — an XSS bug cannot steal it
  secure: true,        // never travels over plain HTTP
  sameSite: 'lax',     // does not ride a cross-site request
  path: '/',
} as const;
```

`secure` is on in **every** environment: on plain HTTP a browser refuses to
store a secure cookie, so a local development setup has to reach the API
over HTTPS or through a proxy that terminates TLS.

The cookie name lives in the shared leaf (`common/auth/session-cookie.ts`)
because it is part of the wire contract between the browser and the API —
the guard has to read the same cookie the login route writes.

## Swagger

A route behind the guards says so in the spec, so the frontend knows before
it calls:

```typescript
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not signed in.' })
@ApiForbiddenResponse({ description: 'The caller does not hold the required role.' })
```

- `@ApiBearerAuth()` on every route that needs a session.
- `@ApiUnauthorizedResponse` on every route behind a guard — a `401` is
  reachable.
- `@ApiForbiddenResponse` where a signed-in user can still be refused —
  either by the role guard or by a per-record check in the service.

A route that is deliberately public says so in a comment above the handler,
per `docs/api-convention.md`.

## Checklist

- [ ] The route is **not** protected by `@UseGuards(SessionGuard)` — the
      guard is global
      → [auth-and-guards.md](auth-and-guards.md#adding-a-new-route--the-decision)
- [ ] A public route carries `@Public()`; every other route is protected by
      default
      → [auth-and-guards.md](auth-and-guards.md#public)
- [ ] A route that needs a role carries `@Roles(...)`; the guard requires
      **every** listed role
      → [auth-and-guards.md](auth-and-guards.md#the-role-guard)
- [ ] A handler that needs the caller's id takes `@CurrentUserId() userId: string`
      → [auth-and-guards.md](auth-and-guards.md#the-decorators)
- [ ] A per-record check lives in the owning module's **service**, not in a
      guard and not in the controller
      → [auth-and-guards.md](auth-and-guards.md#what-the-role-guard-is-not)
- [ ] The controller has no manual permission check
      → [service.md](service.md#service)
- [ ] A route behind a guard declares `@ApiBearerAuth()` and
      `@ApiUnauthorizedResponse`; a route a signed-in caller can be refused
      from also declares `@ApiForbiddenResponse`
      → [controller.md](controller.md#authentication)
- [ ] `common/` names no business entity
      → [auth-and-guards.md](auth-and-guards.md#the-shape-of-it)

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| `@UseGuards(SessionGuard)` on a route | Duplicates the global protection and implies the routes without it are unprotected |
| A public route without `@Public()` | A `401` on a route that should be open |
| A protected route missing `@Public()` | The route is unreachable for signed-out callers |
| `@Roles(ROLES.ADMIN, ROLES.RESEARCHER)` read as "either" | The guard requires **every** listed role; a route that means "either" cannot use `@Roles` |
| A role check in the controller | Bypassable, duplicated, invisible to the guard layer |
| A per-record check in `common/guards/` | The guard has to know every domain entity — the boundary `common/` must not cross |
| Trusting `principal.roles` for a role check | The roles are a snapshot; a revoked grant would still pass until the next login |
| `useClass` instead of `useExisting` for `SESSION_RESOLVER` | Two resolver instances — two sources of truth for the session rules |
| `app.useGlobalGuards(new SessionGuard(...))` | No DI container, so the resolver cannot be injected |
| A failed `refresh()` failing the request | A bookkeeping error turns a valid session into a `401` |
| Sliding the idle window past the absolute expiry | A session outlives its bound — the database check `ck_session_expiry` rejects the write |
| A JWT or a claim in the cookie | The token is readable and replayable; only a hash of an opaque token is stored |
| `httpOnly: false` on the session cookie | An XSS bug can read the token |
| A 403 where a 401 is correct | `403` means "signed in but not allowed"; an unauthenticated caller gets `401` |
