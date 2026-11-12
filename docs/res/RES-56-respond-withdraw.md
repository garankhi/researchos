# RES-56: Respond and withdraw actions

Ticket: [RES-56](https://researchosfptu.atlassian.net/browse/RES-56)

Parent: [RES-37](https://researchosfptu.atlassian.net/browse/RES-37)

Branch: `feat/RES-56-applications`

Implemented: 2026-11-12

## What changed

Added the two application actions from RES-54's follow-up: the owner answers a
pending application, and the applicant withdraws one.

| Method | Route | Caller | Success |
| --- | --- | --- | --- |
| POST | `/applications/:applicationId/respond` | The opportunity's manager | 200, updated application |
| POST | `/applications/:applicationId/withdraw` | The applicant | 200, updated application |

Both routes live in `ApplicationsController` beside the existing apply, received
and mine routes. They are actions, not new resources, so they return 200 rather
than Nest's default POST status of 201. Responses reuse `ApplicationResponseDto`
inside the existing success envelope, so a caller sees the same application shape
it already knows from the lists.

`respond` writes the decision, the owner's note and the responder.
`withdraw` writes the terminal `WITHDRAWN` status. Neither deletes the row: a
withdrawn application keeps its row and its history, and both actions stop the
SLA countdown by moving the application out of `PENDING`.

No new tables, enums or migrations were added. The existing `guard_application`
trigger and the `ck_application_response` and `ck_application_withdrawal` checks
already describe exactly these two transitions.

## Authentication and authorization

Both routes use the existing global `SessionGuard` and the `researchos_session`
cookie. `@CurrentUserId()` reads the authenticated actor from the server-resolved
principal. Missing or invalid sessions return 401; the shared password-change
gate continues to apply. The controller carries the existing `@Roles('RESEARCHER')`
declaration, so a session without live researcher access returns 403.

| Caller | May respond | May withdraw |
| --- | --- | --- |
| Opportunity creator with active researcher access | Yes | No |
| Active, unarchived group's lead with active researcher access | Yes | No |
| Active, unarchived group's core member with active researcher access | Yes | No |
| The applicant, while the application is pending | No | Yes |
| Outsider or ADMIN-only account | No, 403 | No, 403 |

Responding uses the canonical PostgreSQL policy `can_manage_opportunity(actor,
opportunity)`, the same function that gates the received list and the
opportunity status actions. This is what the ticket calls "the group lead, the
core members and the opportunity's creator". Reading the policy from the
database rather than duplicating it in TypeScript means the API refuses exactly
the callers the database would refuse, and the trigger's own check of
`can_manage_opportunity(NEW.responded_by, NEW.opportunity_id)` agrees with it.

Withdrawing is restricted to the applicant. The owner cannot withdraw on the
applicant's behalf — that is what responding is for. The check compares the
persisted `applicant_id` with the caller, so a client cannot withdraw somebody
else's application by supplying a different identifier.

The ticket's "core members" wording maps to the database's `GROUP_LEADER` role
scope inside `can_manage_group`: the API does not introduce a second definition
of who may respond.

## Respond

```http
POST /applications/cccccccc-cccc-4ccc-8ccc-cccccccccccc/respond
Cookie: researchos_session=<app-session-token>
Content-Type: application/json

{ "decision": "INVITED_TO_DISCUSS", "responseNote": "Let us meet next week." }
```

The body is required and is validated by `RespondApplicationDto`:

| Field | Rules |
| --- | --- |
| `decision` | Required. `INVITED_TO_DISCUSS` or `DECLINED`. |
| `responseNote` | Optional. Free text, trimmed, at most 10,000 characters. A blank note is stored as null. |

`PENDING` and `WITHDRAWN` are not answers, so they are rejected by validation
with 400. A client cannot set `respondedBy`, `respondedAt`, `appliedAt`,
`status` or any other server-owned field; unknown body fields are rejected
wholesale by the global `ValidationPipe`.

Only a `PENDING` application can be answered. Answering one that is already
`INVITED_TO_DISCUSS` or `DECLINED` returns 409, and answering a withdrawn
application returns 409 as well — the ticket's "already answered is 409" rule,
with the withdrawn case reported as its own code so the client can tell them
apart.

## Withdraw

```http
POST /applications/cccccccc-cccc-4ccc-8ccc-cccccccccccc/withdraw
Cookie: researchos_session=<app-session-token>
```

The route takes no body and reads no body fields. The caller cannot use a body
to select a different application or a different actor.

Only the applicant may withdraw, and only while the application is pending.
Withdrawing twice returns 409 rather than a silent success, as the ticket
requires. Withdrawing an application that was already answered returns 409 as
well: the ticket only permits withdrawing a pending application.

## Database enforcement

The API checks what it can before writing, and the database keeps the final
word. The existing `guard_application` trigger enforces, on every update:

- Only a `PENDING` application may transition, and only to `WITHDRAWN`,
  `INVITED_TO_DISCUSS` or `DECLINED`. A second transition raises SQLSTATE
  `23514`.
- The identity columns and the SLA snapshot — `id`, `opportunity_id`,
  `applicant_id`, `applicant_note`, `applied_at`, `response_due_at` — are
  immutable.
- A withdrawal gets `withdrawn_at` from `clock_timestamp()`; a response gets
  `responded_at` from `clock_timestamp()`. The API does not send these values
  and cannot fake them.
- A response's `responded_by` must satisfy `can_manage_opportunity`, so a
  client cannot answer on somebody else's behalf even by bypassing the API.

The `ck_application_response` check requires that a `PENDING` or `WITHDRAWN`
application has no `responded_by` and no `responded_at`, and that an
`INVITED_TO_DISCUSS` or `DECLINED` application has both, with
`responded_at >= applied_at`. The `ck_application_withdrawal` check requires
`withdrawn_at` when the status is `WITHDRAWN` and forbids it otherwise.

Because the trigger writes the timestamps, the API returns the values PostgreSQL
actually persisted, read back from the update's `RETURNING` clause. The
countdown is computed against the database clock, so the response and the
withdrawal timestamps are the database's own, not the API server's.

The API's conditional update — `updateManyAndReturn` restricted to rows still
`PENDING` — is what makes a concurrent action safe. Two requests cannot both
see the application as pending: the second one matches no row and receives 409.
The row lock taken before the read serializes the same guarantee at the
transaction level.

## Errors

Errors use the shared API error envelope. The codes are domain codes, so the
web app resolves them from the message catalog rather than showing the server's
English.

| Status | Code | Cases |
| --- | --- | --- |
| 400 | `validation_failed` | Invalid UUID; missing or unknown `decision`; response note too long; unknown body fields |
| 401 | `unauthorized` | Missing or invalid session |
| 403 | `forbidden` | Caller may not manage the opportunity, or does not own the application |
| 403 | `application_access_denied` | The caller cannot respond to or withdraw this application |
| 404 | `application_not_found` | The application does not exist |
| 409 | `application_already_answered` | The application was already answered, or a response lost the race |
| 409 | `application_already_withdrawn` | The application was already withdrawn, or a withdrawal lost the race |
| 409 | `application_invalid_state` | The database refused the transition (SQLSTATE `23514`) |

The domain codes are registered in `packages/error-codes/src/domain.ts` under
`applications`, and translated in `apps/web/src/messages/en.json` and
`apps/web/src/messages/vi.json` under `errors.codes.domain`.

## Implementation

- `apps/api/src/modules/opportunities/applications.controller.ts`: the two
  protected routes, with Swagger documentation.
- `apps/api/src/modules/opportunities/applications.service.ts`: `respond` and
  `withdraw`, the row lock, the conditional update, and the database-failure
  mapping that turns a trigger refusal into 409.
- `apps/api/src/modules/opportunities/dto/respond-application.dto.ts`: the
  decision enum and the response body validation.
- `packages/error-codes/src/domain.ts`: the five application error codes.
- `apps/web/src/messages/{en,vi}.json`: the matching catalog entries.
- `apps/api/src/modules/opportunities/applications.spec.ts`: 29 HTTP contract
  tests covering both actions.
- `apps/api/openapi.json` and `apps/web/src/lib/api`: regenerated through
  `pnpm codegen`.

## Verification

| Check | Result |
| --- | --- |
| `pnpm codegen` | Passed; OpenAPI document and the Orval client regenerated. |
| `pnpm --filter api build` | Passed. |
| `pnpm --filter api test` | Passed: 497 API tests across 33 files. |
| `pnpm lint` | Passed across the workspace; only the pre-existing API warnings remain. |
| `pnpm build` | Passed for all packages. |
| `pnpm test` | Passed across the workspace. |
| PostgreSQL integration | Not run; no local PostgreSQL or Docker available in this environment. |

The HTTP tests use a real Nest application, controller, service and session
guard, with a mocked session resolver and a mocked Prisma boundary. They verify
the routes, the guards, the validation, the authorization, the conflict cases
and the exact write the service performs — but they do not prove live
PostgreSQL trigger behavior, the `FOR UPDATE` serialization, or that the
database accepts the written rows. Those need a real database.

The workspace packages must be built before the API suite runs, because the API
imports `@researchos/database` and `@researchos/error-codes` through their
built `dist` output. A stale `dist` fails the API suite at import time with
errors that look like missing exports rather than a stale build.

## Checklist

- [x] Answer a pending application with `INVITED_TO_DISCUSS` or `DECLINED`.
- [x] Set `response_note`, `responded_by` and a database-stamped `responded_at`.
- [x] Withdraw a pending application as its applicant, setting `WITHDRAWN` and
      a database-stamped `withdrawn_at`.
- [x] Restrict responding to the opportunity's manager and withdrawing to the
      applicant.
- [x] Return 409 for an already answered application and for a second
      withdrawal.
- [x] Keep the withdrawn row and its history.
- [x] Add the domain error codes and both locales' catalog entries.
- [x] Regenerate the OpenAPI document and the frontend client.
- [x] Add 29 passing HTTP tests and document the implementation.
- [ ] Run real PostgreSQL trigger and concurrency checks when a test database is
      available.
