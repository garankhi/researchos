# RES-121: Opportunity endpoints (CRUD)

Ticket: [RES-121](https://thientm2727.atlassian.net/browse/RES-121)

Branch: `RES-121-opportunity-endpoints-crud`

Implemented: 2026-11-07

Rebased onto dev: 2026-11-08 (shared session authentication, domain models and migrations).

## What changed

Added the NestJS `OpportunitiesModule`, registered in the API composition root.
The controller handles transport and Swagger documentation; the service owns
permissions, persistence, publication rules and idempotency. Responses use the
existing success/error envelopes. No delete endpoint was requested by the ticket.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/opportunities` | Create a draft; optional `Idempotency-Key` |
| GET | `/opportunities` | Paginate and filter visible opportunities |
| GET | `/opportunities/:opportunityId` | Return a visible opportunity, otherwise 404 |
| PATCH | `/opportunities/:opportunityId` | Partially update an opportunity managed by the caller |

Extended dev's existing `research_opportunities` Prisma model with retry metadata.
The existing snake_case enums are exported with API-friendly aliases; no duplicate
model or enum maps to the same PostgreSQL object.
Create-request metadata lives on the opportunity itself; no new table is added.
Group/project policy checks use parameterized SQL. The PostgreSQL baseline remains the source of
foreign keys, triggers and CHECK constraints.

Regenerated `apps/api/openapi.json` and the Orval frontend client under
`apps/web/src/lib/api`. OpenAPI declares session-cookie authentication and response DTOs.
The code-generation task now builds its workspace dependencies first, so the
export uses the current generated database client and enums on a clean checkout.

## Authentication and permissions

All four routes use dev's global `SessionGuard` and the opaque
`researchos_session` cookie issued by its login flow. `@CurrentUserId()` reads
the server-resolved principal; this module registers no extra session guard.
The existing session resolver rejects expired/revoked sessions and inactive
accounts, refreshes idle expiry and enforces the LOCAL password-change gate
(`403 must_change_password`). Missing or invalid sessions return 401.
The request cannot supply the acting user or `creatorId` in its payload.

Create and PATCH require an effective active researcher, using the baseline's
`is_researcher` function. Personal opportunities need no group or project.
Creating in a group requires its active lead or a core member. Creating in a
project additionally requires its lead and a matching group scope. Group and
project IDs are immutable after creation, preventing PATCH from moving a record
into another scope.

PATCH follows the ticket's explicit rule: the creator, the active group's lead,
or a core member may edit. Collaborator/student membership alone grants no edit
permission, and ADMIN alone grants no bypass.

**One shared permission policy:** API visibility and editing now call the SQL
function `can_manage_opportunity`. The baseline source and deployment migration
define the same rule: an active researcher who is the creator, active group lead
or core member may manage the record. Application visibility and response
triggers already use that function, so those workflows agree with the API.
Project leadership alone does not grant editing rights on someone else's record.

Read visibility was not specified in the ticket. This implementation lets an
authenticated caller read non-draft, unarchived opportunities, plus drafts and
archived records they manage. Invisible detail requests return 404. List filtering
and counts apply the same visibility predicate before pagination.

## Input and publication rules

The API uses camelCase fields mapped to the ticket's snake_case database columns.
Create requires `title` and `opportunityKind`. A draft may have an empty title
or incomplete publication details, matching the database constraints.

- `responseSlaDays` defaults to 5 and must be a positive PostgreSQL integer.
- `targetAudience` defaults to `ANY_RESEARCHER`; `status` defaults to `DRAFT`.
- Create accepts only `DRAFT` (or an omitted status). A complete record with
  `OPEN`, `FILLED`, `CLOSED` or `EXPIRED` is still rejected with 400, matching
  PostgreSQL's draft-only insertion trigger.
- Every status other than `DRAFT` requires nonblank `title` and `description`,
  `applicationDeadline`, and `publishedAt`. PostgreSQL stamps `publishedAt` when
  an opportunity is opened; callers do not supply that timestamp.
- `expectedRole`, when present and non-null, must contain non-whitespace text.
- UUIDs, enum values, date strings, tag arrays and pagination are validated.
- Unknown fields, including `creatorId` and server-owned `publishedAt`, are rejected.
- PATCH rejects every `status` value, including `DRAFT` and null. It cannot
  reopen a closed opportunity or skip lifecycle transitions. Dedicated
  open/fill/close actions belong to RES-122 and are not added by this ticket.
- PATCH omission preserves a field; explicit null clears nullable fields.
  Non-nullable fields reject null.
- PATCH locks the opportunity row and validates the merged persisted record.
  Clearing a publication requirement on an already published record returns 400.

List accepts `page` (default 1), `pageSize` (default 20, maximum 100), `groupId`,
`projectId`, and `status`. Its payload is `{ items, page, pageSize, total }`.
Ordering uses descending creation time and UUID for stable ties. Reads use a
repeatable-read transaction so rows and counts share a database snapshot.
Responses expose the opportunity contract without internal audit timestamps.

## Idempotent creation

The optional `Idempotency-Key` must contain 1–200 characters, with nonblank text.
Keys are scoped to the authenticated creator. Reusing a key with the same JSON
payload returns the original response and creates no second opportunity; a
different payload returns 409. Object property order does not affect matching;
omitted defaults and explicitly supplied defaults are different payloads.

The existing `research_opportunities` table stores three internal nullable columns:

- `create_idempotency_key`: the caller's retry key.
- `create_request_hash`: the SHA-256 hash of the create payload.
- `create_response`: the original API payload, preserved across later edits.

A unique index on `(creator_id, create_idempotency_key)` scopes keys to each
creator. NULL keys allow ordinary creates without the header. These columns are
not exposed in response DTOs or accepted in request DTOs.

The service takes a transaction-scoped PostgreSQL advisory lock for the
actor/key pair. Opportunity insertion and metadata persistence commit or roll
back together. This persists across API restarts and serializes concurrent
retries from multiple API processes. PATCH preserves the original metadata, so
retries return the original response even after the opportunity is edited or
archived. Metadata has no automatic expiry and lives as long as the opportunity;
hard-deleting the row would also remove its retry history.

## Database setup

These APIs target the [ResearchOS SQL baseline](database/ResearchOS.sql), including
its users, sessions, groups, projects, enums, functions and opportunity CHECK
constraints. Generating the Prisma client alone does not install that baseline.

For a **new, disposable database**, initialize the baseline as documented in
[the database README](database/README.md). Do not replay its full initialization
SQL against an existing database.

Apply migrations through dev's standard Prisma workflow:

```sh
pnpm db:migrate:deploy
```

The additive migration is registered at
`packages/database/prisma/migrations/20261108000000_opportunity_idempotency/migration.sql`.
For an existing manually initialized database that is not managed by Prisma,
the equivalent standalone SQL remains available:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/database/migrations/RES-121-opportunity-idempotency.sql
```

The migration adds three nullable columns and a unique index to
`research_opportunities`. It creates no table, is safe to reapply, and does not
replace existing opportunity data.
It also replaces `can_manage_opportunity` with the shared creator/lead/core rule
in one transaction. The baseline SQL, its PostgreSQL feature source and DBML
policy note have been synchronized, and the SQL smoke assertion now reflects
the ticket's creator permission.
Prisma executes its registered migration; the copy under `docs/database/migrations`
is a manual alternative and is not discovered by Prisma.

Generate the client and build with the repository's normal pnpm commands.
Runtime needs `DATABASE_URL` pointing to this initialized PostgreSQL database.

## Example

Create a personal draft with a valid existing app session:

```http
POST /opportunities
Cookie: researchos_session=<app-session-token>
Idempotency-Key: personal-opportunity-001
Content-Type: application/json

{
  "title": "Research collaborators wanted",
  "opportunityKind": "RESEARCH_COLLABORATION",
  "requiredExpertiseTags": ["machine learning"]
}
```

Edit its details by PATCHing the returned ID:

```json
{
  "description": "Seeking collaborators for a research project.",
  "applicationDeadline": "2026-12-01T10:00:00Z"
}
```

The record remains a draft. Publishing uses the dedicated status action from
RES-122. Its implementation must enforce legal transitions, a future deadline,
publication completeness and server-owned publication timestamps. PATCH is not
an alternative publishing route.

## Verification

- `pnpm codegen`: passed; OpenAPI and frontend client regenerated.
- `pnpm build`: passed across API, worker, database, config and web.
- `pnpm lint`: passed with no warnings or errors.
- `pnpm test`: passed after rebasing onto dev, 353 tests total (247 API, 85 web,
  and 21 shared-package tests).
- `pnpm db:drift`: passed; the extended Prisma model matches the SQL baseline.
- `pnpm db:smoke`: all five suites passed against both the SQL source and the
  complete Prisma migration chain, including the new opportunity migration.
- Added 50 opportunity API unit tests covering request validation, researcher
  and scope denial, publication transitions, nullable PATCH fields, invisible
  details, pagination, persisted idempotency replay and conflicting payloads,
  replay after editing, and preservation of create metadata during PATCH.

Unit service tests use mocked Prisma calls; dev retains its shared session tests.
In addition, the repeatable
integration harness `apps/api/scripts/test-opportunities-postgres.mjs` passed
12 live checks against PostgreSQL 18.6 with the complete SQL baseline and actual
  Nest HTTP endpoints, including dev's real cookie-based identity module:

- Migration reapplication creates no additional tables.
- All three existing schema, auth and policy SQL smoke suites pass.
- Draft-only API creation agrees with PostgreSQL's insertion trigger.
- PATCH rejects all lifecycle statuses and publication timestamps.
- Creator, lead and core permissions agree across the API and SQL; collaborator,
  outsider, guest, ADMIN-only and inactive actors gain no bypass.
- Application response triggers accept permitted creators, leads and core members.
- Sessions enforce expiry, revocation and mandatory password change.
- Six concurrent retries create exactly one row; replay survives later editing,
  changed payloads return 409, and keys are scoped to their creator.
- Visibility, pagination and completeness of published records are enforced.

To reproduce, build workspace dependencies and point the harness at a **local**
PostgreSQL maintenance database. It creates a uniquely named temporary database,
loads the baseline, runs the checks, and drops only that temporary database in
cleanup. It refuses non-loopback hosts or a maintenance database other than
`postgres`; it never uses the application's `DATABASE_URL` as a test target.

```powershell
$env:RES121_TEST_POSTGRES_URL = 'postgresql://postgres@127.0.0.1:55432/postgres'
pnpm --filter api test:postgres
```

The PostgreSQL test account needs permission to create/drop databases and install
the baseline's `pg_trgm` extension. Local verification used portable PostgreSQL
binaries in the ignored workspace cache; no project dependency was added.

On this Windows environment, the system pnpm shim could not start pinned pnpm
12.15.0. Checks used that version's direct Node launcher and an ignored local
shim for child processes. The production build also needed access to SWC's
Windows native cache outside the filesystem sandbox. No package versions or
lockfile contents were changed for these environment workarounds.
