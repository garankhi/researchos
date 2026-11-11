# RES-52: Opportunity status actions (open/fill/close)

Ticket: [RES-52](https://researchosfptu.atlassian.net/browse/RES-52)

Parent: [RES-50: Opportunity CRUD + status Open/Filled/Closed](https://researchosfptu.atlassian.net/browse/RES-50)

Branch: `RES-52-opportunity-status-actions`

Implemented: 2026-11-10

Rebased onto dev: 2026-11-10 (`3af2c48`).

## What changed

Added three action routes to the existing `OpportunitiesController`, a shared
`transitionStatus` method and timestamp-based expiry to `OpportunitiesService`. The controller handles
transport and Swagger documentation; the service checks permissions, validates
the transition and saves the status change with an audit entry.

| Method | Route | Transition | Success |
| --- | --- | --- | --- |
| POST | `/opportunities/:opportunityId/open` | `DRAFT → OPEN` | 200, updated opportunity |
| POST | `/opportunities/:opportunityId/fill` | `OPEN → FILLED` | 200, updated opportunity |
| POST | `/opportunities/:opportunityId/close` | `FILLED → CLOSED` | 200, updated opportunity |

An `OPEN` opportunity automatically becomes `EXPIRED` when the current server
timestamp is at or after its application deadline. This is checked on opportunity
reads, edits and authorized status actions; no separate expire endpoint is needed.

These are actions, not new resources, so they explicitly return 200 rather than
Nest's default POST status of 201. Responses use `OpportunityResponseDto` inside
the existing success envelope. Regenerated `apps/api/openapi.json` and the Orval
client in `apps/web/src/lib/api/opportunities/opportunities.ts`.

No new tables, enums, migrations, error codes or UI controls were added.

## Authentication and permissions

All routes use the existing global `SessionGuard` and the `researchos_session`
cookie. `@CurrentUserId()` reads the authenticated actor from the server-resolved
principal. Missing or invalid sessions return 401; the shared password-change
gate continues to apply.

Each action requires an active researcher account and permission from the
existing PostgreSQL function `can_manage_opportunity(actor, opportunity)`.

| Caller | May change status |
| --- | --- |
| Opportunity creator with active researcher access | Yes |
| Active, unarchived group's lead with active researcher access | Yes |
| Active, unarchived group's core member with active researcher access | Yes |
| Collaborator or student member without another qualifying permission | No, 403 |
| Outsider or ADMIN-only account | No, 403 |

The creator permission is independent of group membership. Group leadership or
core membership does not bypass the researcher requirement. Project leadership
alone grants no additional status permission.

## Transition and publication rules

The manual lifecycle follows the ticket's sequence:

```text
DRAFT --open--> OPEN --fill--> FILLED --close--> CLOSED
                 |
                 +--deadline reached--> EXPIRED
```

- Every action accepts only its specified source status. Repeating an action,
  skipping a step, reopening, or reversing a transition returns 409.
- In particular, `close` requires `FILLED`; closing directly from `OPEN` returns
  409 in this implementation.
- Archived opportunities reject all three actions with 409 after authorization.
- Only `OPEN` records expire. A null deadline does not match the expiry check;
  database constraints already require a deadline for a published opportunity.
- `EXPIRED` is terminal for the three manual actions: none reopens it. Extending
  an expired record's deadline through PATCH does not restore `OPEN`.
- Existing PATCH validation continues to reject `status`, so editing cannot
  bypass the action routes.

Opening additionally requires a nonblank title, a nonblank description and an
application deadline strictly in the future. Missing or invalid publication
details return 400 before mutation.

The existing `normalize_opportunity` database trigger stamps `published_at`
when the opportunity opens, preserving an existing value if present. The API
does not accept a publication timestamp through these actions and updates only
`status`. PostgreSQL checks the deadline again against its own clock and
enforces `ck_published_opportunity`, including the non-null publication timestamp.
Filling and closing preserve that timestamp.

The existing search-index triggers process the status update in the same
transaction: an open, unarchived opportunity is indexed, while filled and closed
opportunities are removed from the index. The service adds no separate index
refresh job.

## Timestamp-based expiry

The comparison uses `application_deadline <= new Date()` on the API server.
Both values represent absolute instants, so timezone offsets do not alter the
comparison. Equality counts as expired.

- List requests expire overdue `OPEN` records before applying filters, counting
  or selecting a page. An `OPEN`-filtered list therefore excludes them at that
  request's expiry check; an `EXPIRED` filter includes the saved rows.
- Detail requests synchronize expiry for the requested ID before reading it.
- PATCH synchronizes expiry before editing and again within the edit transaction.
  Moving an open record's deadline into the past returns an `EXPIRED` payload.
- Authorized status actions check the deadline after locking the record. If it
  is overdue, they save expiry and its audit entry, commit, then return 409 for
  the requested manual action. Throwing before commit would undo expiry.
- Conditional `updateManyAndReturn` changes only rows still `OPEN` with a reached
  deadline. Only returned IDs receive an audit entry, avoiding duplicate expiry
  history on repeated requests or competing expiry checks.

Expiry and its audit insertion run in the same Prisma transaction. The existing
search-index trigger removes each expired opportunity from the index when that
transaction commits. Applications and publication timestamps are preserved.

This is request-time expiry, with no scheduler or worker. Without an opportunity
request, a stored row and its search-index entry can remain `OPEN` after the
deadline until a later opportunity list, detail, edit or authorized status action
performs the check. It does not promise a background update at the exact deadline.
The comparison trusts the API server's clock.

## Input and response rules

The action is selected by the URL, and `opportunityId` must be a valid UUID.
The endpoints require no request body and do not read body fields. The caller
cannot use a body to select a different target status or actor.

On success, the existing opportunity payload is returned:

```json
{
  "success": true,
  "data": {
    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "groupId": null,
    "projectId": null,
    "creatorId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "title": "Research collaborators wanted",
    "opportunityKind": "RESEARCH_COLLABORATION",
    "targetAudience": "ANY_RESEARCHER",
    "expectedRole": null,
    "requiredExpertiseTags": [],
    "description": "Seeking collaborators for a research project.",
    "responseSlaDays": 5,
    "status": "OPEN",
    "applicationDeadline": "2026-12-01T10:00:00.000Z",
    "publishedAt": "2026-11-10T03:00:00.000Z",
    "archivedAt": null
  },
  "message": ""
}
```

The example timestamps are illustrative. The actual publication timestamp is
assigned by PostgreSQL.

## Errors

Errors use the shared API error envelope and existing generic localized codes.

| Status | Code | Cases |
| --- | --- | --- |
| 400 | `validation_failed` | Invalid UUID; missing publication details; deadline not in the future; PostgreSQL check/trigger violation |
| 401 | `unauthorized` | Missing or invalid session |
| 403 | `forbidden` | Missing active researcher access or opportunity management permission |
| 404 | `not_found` | Opportunity does not exist after the researcher check |
| 409 | `conflict` | Wrong source status, repeated action or archived opportunity |

The shared opportunity write wrapper now maps PostgreSQL SQLSTATE `23514`
through `readDatabaseFailure` to 400. This also covers a deadline that expires
between the service's validation and the database update. Unexpected failures,
including an unavailable audit table, propagate to the shared exception filter.

## Transactions and audit history

Every action executes in one interactive Prisma transaction:

1. Require active researcher access.
2. Lock the opportunity row using parameterized `SELECT ... FOR UPDATE OF o`
   and check `can_manage_opportunity`.
3. Read the persisted record, validate its source status and archive state, and
   check publication requirements when opening.
4. Update only the opportunity's status.
5. Insert an `AuditLog` entry and return the updated opportunity.

The row lock coordinates status actions with other actions and the existing
PATCH implementation. A repeated request waits for the earlier transaction,
then sees the resulting status and returns 409 before writing another audit
entry. The transaction rolls back the status update if audit insertion fails.

Audit entries use the existing `audit_logs` table:

| Field | Value |
| --- | --- |
| `actor_id` | Authenticated actor's user ID |
| `action` | `OPPORTUNITY_STATUS_CHANGED` |
| `entity` | `research_opportunities` |
| `entity_id` | Persisted opportunity ID |
| `payload` | `{ "fromStatus": "DRAFT", "toStatus": "OPEN" }`, using actual statuses |
| `created_at` | Existing database timestamp default |

History can be queried through the existing Prisma `auditLog` model or SQL:

```sql
SELECT actor_id, action, payload, created_at
FROM audit_logs
WHERE entity = 'research_opportunities'
  AND entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND action = 'OPPORTUNITY_STATUS_CHANGED'
ORDER BY created_at, id;
```

No public audit-history endpoint is added by this ticket.

Automatic expiry uses the same action and entity values, with `actor_id = NULL`
to identify a system transition. Its payload is:

```json
{
  "fromStatus": "OPEN",
  "toStatus": "EXPIRED",
  "reason": "APPLICATION_DEADLINE_REACHED"
}
```

## Database setup

Runtime requires `DATABASE_URL` pointing to an initialized ResearchOS PostgreSQL
database, including its opportunity policy functions and triggers. The existing
initial Prisma migration supplies `audit_logs`; loading only the domain SQL
baseline is insufficient if that initial migration's infrastructure is missing.
No migration was needed for this change.

Use the repository's normal setup and migration workflow; see the
[database README](../database/README.md) and
[API convention](../api-convention.md).

## Example

First create a draft and set its title, description and future application
deadline through the existing CRUD endpoints. Then, using an authorized session:

```http
POST /opportunities/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/open
Cookie: researchos_session=<app-session-token>
```

When the opportunity is filled:

```http
POST /opportunities/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/fill
Cookie: researchos_session=<app-session-token>
```

Close the filled opportunity:

```http
POST /opportunities/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/close
Cookie: researchos_session=<app-session-token>
```

Replace the example UUID with an existing opportunity ID. Each successful action
returns 200 with the updated opportunity; repeating it returns 409.

## Verification

Checks performed during implementation on 2026-11-10, before the latest rebase:

- `pnpm codegen`: passed; API build, OpenAPI and client generation completed.
- `pnpm --filter api openapi:check`: passed.
- `pnpm --filter worker build`: passed.
- `pnpm lint`: passed across the workspace with no warnings or errors.
- `pnpm test`: passed across the workspace, including 320 API tests and 85 web
  tests. The new status-action suite contains 35 tests.
- `pnpm build`: attempted; the web build failed loading the SWC native binding
  because Windows cache ownership/permissions were rejected
  (`ERR_SWC_NATIVE_CACHE`). Full web production-build verification remains
  outstanding.

After rebasing onto `dev` at `3af2c48`:

- `pnpm codegen`: passed again, including the API build.
- Targeted status-action, opportunity-service and real OpenAPI-rule suites:
  59 tests passed across three files.
- During the subsequent requirements review, `pnpm test` passed across the
  rebased workspace, including 354 API tests and 85 web tests.
- During that review, `pnpm lint` passed with six existing unbound-method
  warnings in the provenance tests inherited from `dev`. No RES-52 lint warnings
  were reported.
- `git diff --check`: passed for the implementation changes.

The original 35 tests cover legal transitions, every invalid source status, archive
rejection, publication requirements, researcher and management denial, missing
records, audit insertion failure, database constraint mapping, session rejection,
UUID validation, HTTP 200 responses and repeated-action 409 responses.

Timestamp-based expiry adds 13 tests, for 48 tests in the status-action suite.
They cover before/at/after-deadline comparisons, preservation of other statuses,
system audit entries, repeated reads, expiry before list filtering, committing
expiry before a fill conflict, audit failure, and both deadline-shortening and
deadline-extension PATCH behavior. The two opportunity service/status suites
passed together with 71 tests after this addition.

After adding expiry, `pnpm codegen`, `pnpm --filter api openapi:check`, workspace
lint and workspace tests passed again. The API suite now has 367 passing tests;
the web suite has 85. Lint still reports the six inherited provenance-test
warnings described above. API compilation passed during generation and the
OpenAPI drift check. The earlier web-build limitation remains unresolved.

The HTTP tests use a real Nest application, controller, service and session guard,
with a mocked session resolver and mocked Prisma persistence. They do not prove
live PostgreSQL locking, trigger timestamps or rollback behavior. No live
PostgreSQL integration check was run for this ticket. Full web production-build
verification remains blocked by the SWC environment issue noted above.

Checks used the pinned pnpm 12.15.0 direct Node launcher because the system shim
could not launch it. No package versions or lockfile contents were changed.
