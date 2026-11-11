# RES-101: Research interest endpoints

Ticket: [RES-101](https://researchosfptu.atlassian.net/browse/RES-101)

Implemented on `RES-101-research-interest-endpoints`, rebased onto fetched
`origin/dev` at `b66f1c8` on November 12, 2026. The rebase completed without
conflicts. No database migration is required: this uses the existing
`research_interests` table, uniqueness constraint, and researcher guard trigger.

## API contract

Every route requires a valid session and the live `RESEARCHER` role. An admin
without researcher access receives 403. The caller's ID comes from the session;
clients cannot select another user. Missing authentication returns 401.

| Method | Route | Input | Success | Behavior |
| --- | --- | --- | --- | --- |
| GET | `/interests` | None | 200 | Lists the caller's interests in every status, newest declaration first, then ID for stable ties. |
| POST | `/interests` | `{ "topicId": "<uuid>" }` | 201 | Declares an active topic as `DECLARED/ACTIVE/HUMAN`. |
| PATCH | `/interests/:id` | `{ "status": "ACTIVE" }` or `{ "status": "REJECTED" }` | 200 | Accepts/restores or rejects an owned interest. |
| DELETE | `/interests/:id` | None | 204, empty body | Marks an owned interest `REJECTED`; retains its row. |

POST and PATCH responses expose `id`, `userId`, `topicId`, `sourceType`, `status`,
`provenanceTag`, `evidenceNote`, `declaredAt`, and nullable `reviewedAt`. Dates are
ISO 8601 strings. GET returns an array of this shape. Production responses use
the shared `{ "success": true, "data": ..., "message": "" }` envelope, except
DELETE's empty 204 response.

The response DTO uses Prisma's exported `interest_source` and `interest_status`
enums in Swagger decorators, alongside the existing provenance enum. The PATCH
schema describes the status enum and explains that only `ACTIVE` and `REJECTED`
are accepted; validation rejects `SUGGESTED` because suggestions are system-managed.

## State and history

- Manual selection always creates `DECLARED/ACTIVE`, even for an externally
  sourced taxonomy topic. The API sets `HUMAN` provenance and `reviewed_at`;
  PostgreSQL supplies `declared_at`.
- Inference creation belongs to the inference pipeline. These endpoints expose
  existing `INFERRED/SUGGESTED` rows for review but cannot create them.
- Accepting an inferred suggestion changes only status and review time. Its
  `INFERRED` source, provenance, evidence, topic, and declaration time survive.
- PATCH to `REJECTED` and DELETE retain negative feedback. Rejected interests
  remain visible in GET and continue to occupy the unique user/topic pair.
- To restore an interest, PATCH its existing ID to `ACTIVE`. POST for an existing
  user/topic pair returns 409, including suggested or rejected rows.
- Repeating the same decision preserves its review timestamp. Activation still
  validates topic availability. Rejection works even after a topic is deactivated.
- Evidence and provenance are read-only in this API; clients cannot spoof them,
  source, ownership, or timestamps. Extra payload keys are rejected by the shared
  validation pipe.

## Errors and ownership

| Condition | HTTP status |
| --- | --- |
| Invalid path/topic UUID, missing fields, null/unsupported status, extra input keys | 400 |
| Missing session | 401 |
| Caller lacks researcher access | 403 |
| Topic exists but is inactive when declaring or activating | 400 |
| Topic does not exist | 404 |
| Interest does not exist or belongs to another user | 404 |
| User/topic unique constraint violation | 409 |

Both lookup and update include `user_id` to enforce ownership. Prisma `P2002`
maps to 409, including concurrent duplicate declarations; `P2025` during an
update maps to 404 if the row disappears. Other database failures propagate to
the shared exception filter. Error responses use the existing generic localized
codes (`validation_failed`, `unauthorized`, `forbidden`, `not_found`, `conflict`).

## Files changed

- `apps/api/src/modules/interests/`: controller, service, module, request/response
  DTOs, and HTTP contract tests.
- `apps/api/src/app.module.ts`: registers the interests module.
- `packages/database/src/index.ts`: exports the two existing Prisma interest enums.
- `apps/api/openapi.json`: regenerated API contract.
- `apps/web/src/lib/api/interests/` and `apps/web/src/lib/api/models/`: generated
  React Query hooks and DTO types, plus generated barrel exports.
- This document: API behavior, review semantics, errors, and verification.
- `.gitignore`: allows this ticket document to be versioned under the otherwise
  ignored `docs/res` directory.

## Verification

The 11 new tests exercise real Nest routing, session/role guards, UUID and body
validation, and service behavior with a mocked Prisma boundary. They cover all
four endpoints, ownership isolation, duplicate conflicts, missing/inactive topics,
source/evidence preservation, soft rejection, repeated rejection, a disappearing
row, and attempts to modify protected metadata. They do not run against PostgreSQL.

Commands:

```text
pnpm codegen
pnpm build
pnpm lint
pnpm test
pnpm --filter api test src/modules/interests/interests.spec.ts
```

On this Windows machine, the global `pnpm.ps1` is blocked by execution policy,
and the global CMD shim resolves an invalid executable. Commands were run via
`node C:/Users/phamm/AppData/Local/pnpm/.tools/pnpm/12.15.0/node_modules/pnpm/bin/pnpm.mjs`
with the same arguments, without changing machine policy or repository settings.

Results:

| Check | Result |
| --- | --- |
| `pnpm codegen` | Passed; OpenAPI and Orval artifacts regenerated. |
| `pnpm build` | Passed across all eight packages. The first sandboxed attempt failed on SWC cache permissions; rerunning with access to the existing native cache passed. |
| `pnpm lint` | Passed across the workspace. API lint was rerun after final changes; remaining warnings are in existing files, with none in the interests module. |
| `pnpm test` | Passed across the workspace: API 457 tests across 31 files; web 85 tests across eight files; shared-package tests passed. |
| Interests HTTP contract | All 11 tests passed, also included in the API suite above. |
| OpenAPI freshness | `node apps/api/scripts/export-openapi.mjs --check` passed. |
| Rebase ancestry | `git merge-base --is-ancestor origin/dev HEAD` passed. |
| Whitespace | `git diff --check` passed. |

The first full test run caught missing Swagger response, parameter, and property
descriptions. These were added, generated artifacts were refreshed, and the final
full test run passed including the repository's OpenAPI rules test.

## Change checklist

- [x] Rebase the feature branch onto fetched `origin/dev`.
- [x] Register all four authenticated, researcher-only endpoints.
- [x] Scope reads and writes to the caller.
- [x] Validate topic existence and active state on declaration/activation.
- [x] Map duplicate user/topic declarations to 409.
- [x] Retain rejected rows and preserve inferred metadata on acceptance.
- [x] Expose Prisma enums and timestamp/nullability metadata in OpenAPI.
- [x] Regenerate the OpenAPI document and web client.
- [x] Add and pass 11 HTTP contract tests.
- [x] Document the implementation under `docs/res`.
- [x] Complete code generation, workspace build, lint, and tests.
