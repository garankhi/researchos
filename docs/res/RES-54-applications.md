# RES-54: Applications and Received Interests

Ticket: [RES-54](https://researchosfptu.atlassian.net/browse/RES-54).
Included with RES-101 and RES-130 on
`RES-101-research-interest-endpoints`.

## API contract

All three routes require a valid session and live researcher access. Admin-only
accounts cannot bypass this requirement.

| Method | Route | Purpose | Success |
| --- | --- | --- | --- |
| POST | `/opportunities/:opportunityId/applications` | Apply with an `applicantNote` | 201 |
| GET | `/opportunities/:opportunityId/applications` | Owner's Received Interests list | 200 |
| GET | `/my/applications` | Caller's submitted applications | 200 |

POST body:

```json
{ "applicantNote": "I can contribute experience in distributed systems." }
```

The note is required, trimmed, nonblank, and at most 10,000 characters. Caller ID,
status, submission time and response deadline are server-managed; clients cannot
supply them. Applications start as `PENDING` using the database default.

The received list uses the canonical PostgreSQL `can_manage_opportunity` policy:
the creator, or an active group's lead or group leaders with researcher access,
can read it. Other callers receive **403**, including applicants requesting a received
list they do not own. A nonexistent opportunity returns 404. `/my/applications`
always filters by the session's caller ID and accepts no applicant filter.

Both list endpoints accept `page` (default 1), `limit` (default 20, maximum 100),
and `sort` (`appliedAt`, `responseDueAt`, or `-` descending variants). Results
default to newest first, using ID as a stable tie-breaker, with `items` and the
shared pagination `meta`. Responses use the standard success envelope.

## Eligibility, duplicate handling and concurrency

- Only an unarchived, `OPEN` opportunity with a future application deadline can
  receive an application. Other states and expired deadlines return 409.
- The creator cannot apply to their own opportunity: 403. This rule compares
  identity, not group management roles.
- Repeat applications return 409 regardless of the earlier application status,
  including `WITHDRAWN`, as the ticket specifies one per researcher/opportunity.
- POST locks the opportunity row with `FOR UPDATE`, coordinating with existing
  status/deadline edits and serializing duplicate submissions through these
  endpoints. It checks all historical applications before inserting.
- The existing database unique index excludes withdrawn applications. The API's
  stricter history check prevents reapplication after withdrawal without changing
  that existing schema or other writers' database policy.
- Duplicate constraint violations map to 409. Database eligibility/deadline
  trigger failures, foreign-key races and serialization conflicts map to 409.
  Missing opportunities are 404; malformed input is 400.

## SLA snapshot and countdown

The existing `guard_application` PostgreSQL trigger sets `applied_at` from
`clock_timestamp()` and calculates `response_due_at` using the opportunity's
`response_sla_days` at insertion, with the schema's Asia/Ho_Chi_Minh calendar
arithmetic. Prisma requires a `response_due_at` input; the service supplies a
provisional value which the trigger replaces. The API returns the persisted
timestamps from the insert, so later SLA changes do not rewrite earlier deadlines.
No migration is required.

Each application exposes:

- `id`, `opportunityId`, `applicantId`, `applicantNote`, and the Prisma application
  status enum.
- `responseNote`, `respondedBy`, `appliedAt`, `responseDueAt`, `respondedAt`, and
  `withdrawnAt`; absent response/withdrawal metadata is null.
- `countdownAsOf`: database time used for this response.
- `remainingSeconds`: rounded-up, nonnegative seconds remaining for `PENDING`
  applications; null for responded/withdrawn applications.
- `isOverdue`: true only when a pending application's response deadline has
  been reached.

All items in a list share one database-clock reading. The client clock does not
decide the SLA. The application deadline controls whether submissions are allowed;
the response deadline controls the countdown. They are separate timestamps.

Respond/withdraw actions belong to other tickets and are not added by RES-54.

## Implementation and validation

- `apps/api/src/modules/opportunities/applications.controller.ts`: the three
  documented, protected routes.
- `applications.service.ts`: locking, eligibility, duplicate checks, canonical
  received-list authorization, paging and database-clock countdowns.
- `dto/application.dto.ts`: application input, response and page schemas.
- `opportunities.module.ts`: feature registration.
- `packages/database/src/index.ts`: exposes the existing application status enum.
- `applications.spec.ts`: 12 HTTP contract tests with real Nest routing,
  validation and guards, and a mocked Prisma boundary.
- OpenAPI and generated web clients: refreshed through `pnpm codegen`.

Tests cover all route access checks, caller identity, persisted SLA timestamps,
server countdowns, every non-open state, deadline/archive rejection, missing
opportunities, self-application, duplicate histories, unique/trigger conflicts,
received-list 403/404 semantics, caller-only lists, pagination/sorting, overdue
and terminal-state countdowns, and protected-field spoofing.

The session has no local PostgreSQL listener or Docker executable. Real database
trigger, policy and concurrent-submission tests could not be run. The existing
migrations were inspected, and HTTP tests verify service behavior at the mocked
Prisma boundary.

Final combined workspace verification results:

| Check | Result |
| --- | --- |
| `pnpm codegen` | Passed; API schema and all generated frontend clients refreshed. |
| `pnpm build` | Passed for all eight packages, including production web build. |
| `pnpm lint` | Passed across the workspace. Existing API warnings remain; none in the new directions/applications code. |
| `pnpm test` | Passed: 480 API tests across 33 files, 85 web tests across eight files, and shared-package checks. |
| New HTTP tests | 11 direction tests and 12 application tests passed. |
| OpenAPI rules | Passed in the full API suite. |
| PostgreSQL integration | Not run; no local PostgreSQL/Docker available. |

The workspace packages must be built before the API suite runs, because the API
imports `@researchos/database` and `@researchos/error-codes` through their
built `dist` output. A stale `dist` fails the API suite at import time with
errors that look like missing exports rather than a stale build.

## Checklist

- [x] Apply with a validated note and server-owned identity.
- [x] Reject self-applications, duplicate histories and unavailable opportunities.
- [x] Preserve database-calculated SLA snapshots.
- [x] Restrict Received Interests through the canonical ownership policy.
- [x] Scope My Applications to the caller and compute countdowns on the server.
- [x] Bound pagination and expose complete OpenAPI/client contracts.
- [x] Add 12 passing HTTP tests and document the implementation.
- [x] Pass code generation, full workspace build, lint and tests for the combined PR.
- [ ] Run real PostgreSQL integration/concurrency checks when a test database is available.
