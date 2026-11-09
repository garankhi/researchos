# RES-126: Group member endpoints (add/remove/role)

Ticket: [RES-126](https://researchosfptu.atlassian.net/browse/RES-126)

Parent: [RES-68: Groups — Members CRUD](https://researchosfptu.atlassian.net/browse/RES-68)

Branch: `RES-126-group-member-endpoints-add-remove-role`

Implemented: 2026-11-09

## What changed

Added `GroupMembersController` and `GroupMembersService` to the existing
`GroupsModule`. The controller handles routing, request validation and Swagger
documentation; the service owns membership permissions, persistence and error
mapping. Memberships use nested routes because each record belongs to a group.

| Method | Route | Behavior | Success |
| --- | --- | --- | --- |
| GET | `/research-groups/:groupId/members` | Paginate the private member list | 200 |
| POST | `/research-groups/:groupId/members` | Add an existing user with a specified role | 201 |
| PATCH | `/research-groups/:groupId/members/:userId` | Change an existing member's role | 200 |
| DELETE | `/research-groups/:groupId/members/:userId` | Remove a membership | 204, no response body |

GET was added alongside the three write routes to expose the member list with
the ticket's access restriction. Group details continue to use the existing
public-profile endpoint and do not include the member list.

Reused the existing `group_members` Prisma model and PostgreSQL
`group_member_role` enum. Exported the enum as `GroupMemberRole` from
`@researchos/database` for DTO validation and permission checks. Regenerated
`apps/api/openapi.json` and the Orval frontend client under
`apps/web/src/lib/api`. The member management UI belongs to RES-127.

## Authentication and permissions

All routes use the existing global `SessionGuard` and the opaque
`researchos_session` cookie. `@CurrentUserId()` reads the authenticated principal;
the request body cannot supply the acting user. Missing or invalid sessions
return 401. The shared session resolver also enforces session expiry, revocation,
inactive-account rejection and the mandatory password-change gate.

| Caller | Read member list | Add, change role or remove |
| --- | --- | --- |
| Group lead | Yes, even without a `group_members` row | Yes |
| `CORE_MEMBER` | Yes | Yes |
| `COLLABORATOR` | Yes | No, 403 |
| `STUDENT_MEMBER` | Yes | No, 403 |
| Non-member | No, 403 | No, 403 |

ADMIN or RESEARCHER access alone grants no membership-management bypass. The
service checks the lead ID and actual group membership rather than calling
`can_manage_group`, whose SQL policy covers active researcher leads only and
does not include the core-member permission required by this ticket.

The following rules also apply:

- The caller cannot add themselves, including when their UUID uses different
  letter casing. This returns 403 before inserting a membership.
- Adding an existing membership returns 409; the composite primary key prevents
  duplicate rows, including concurrent additions.
- The lead's membership cannot be removed while `research_groups.is_active` is
  true. This returns 409. Once the group is inactive, the ordinary removal rule
  applies.
- Removing a membership does not delete the user or change the group's
  `lead_id`. Changing a member role also leaves `lead_id` unchanged.
- Archive state does not independently deny membership operations in this
  implementation; lead/member authorization still applies. Active-lead removal
  protection specifically follows `is_active`.

## Input and response rules

The API uses camelCase fields mapped to the existing snake_case columns.

- POST requires `userId` and `role`.
- PATCH requires `role`; it cannot change the membership's user or group.
- Roles are exactly `CORE_MEMBER`, `COLLABORATOR` and `STUDENT_MEMBER`.
- Path IDs and POST `userId` must be UUIDs. Lead and self-addition comparisons
  normalize UUID casing.
- Missing, null or unknown roles are rejected with 400.
- Unknown body fields, including `groupId`, `callerId` and `joinedAt`, are
  rejected by the shared validation pipe.
- The target user must exist. Adding a user does not provision an account, grant
  platform roles or require that user to already be a researcher.
- `joined_at` is assigned by the database on insertion and preserved when the
  role changes.

POST and PATCH return this payload inside the existing success envelope:

```json
{
  "success": true,
  "data": {
    "groupId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "userId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "role": "COLLABORATOR",
    "joinedAt": "2026-11-09T00:00:00.000Z"
  },
  "message": ""
}
```

List accepts `page` (default 1), `limit` (default 20, maximum 100) and `sort`.
Supported sort keys are `joinedAt`, `role` and `userId`; prefix a key with `-`
for descending order. The default is ascending `joinedAt`, with ascending
`userId` as the tie-breaker. Unknown sort keys return 400.

The list payload is `{ items, meta }` inside the success envelope. Metadata
contains `page`, `limit`, `total`, `totalPages`, `hasNextPage` and
`hasPreviousPage`, following the shared pagination contract.

## Errors

Errors use the existing API error envelope and generic localized codes; no new
domain codes or locale entries were required.

| Status | Code | Cases |
| --- | --- | --- |
| 400 | `validation_failed` | Invalid UUID, role, pagination, sort key or body fields |
| 401 | `unauthorized` | Missing or invalid session |
| 403 | `forbidden` | Insufficient group permissions or self-addition |
| 404 | `not_found` | Missing group; missing target user on add; missing membership on update/remove |
| 409 | `conflict` | Duplicate membership or removal of an active group's lead |

Group existence is checked before membership authorization. Authorization is
checked before target-user lookup or mutation. Prisma unique violations
(`P2002` / SQLSTATE `23505`) map to 409. Missing-record and foreign-key failures
(`P2025`, `P2003` / SQLSTATE `23503`) map to 404. Unexpected errors propagate to
the shared exception filter.

## Transactions and database setup

Each operation runs in an interactive Prisma transaction. Write operations lock
the parent `research_groups` row with parameterized `SELECT ... FOR UPDATE`
before checking permissions and changing membership. This serializes membership
writes for that group and coordinates them with updates to its lead or archive
state. Permission checks are repeated inside each transaction.

Member-list reads take `FOR SHARE` on the parent row and hold it until the count
and page have been read. This prevents these membership endpoints from changing
the list or revoking the caller's membership between authorization and reading.
These locks coordinate this service's operations; direct database writers must
follow the same locking contract to provide the same guarantee.

The existing schema supplies:

- Composite primary key `(group_id, user_id)` on `group_members`.
- Foreign keys to `research_groups` and `users`.
- The role enum and database-generated `joined_at` timestamp.

No schema changes or migrations were added. Runtime requires `DATABASE_URL`
pointing to an initialized ResearchOS PostgreSQL database. See the
[database README](../database/README.md) for setup and the
[API convention](../api-convention.md) for transport contracts.

## Example

As the lead or a core member, add an existing user:

```http
POST /research-groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/members
Cookie: researchos_session=<app-session-token>
Content-Type: application/json

{
  "userId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "role": "COLLABORATOR"
}
```

Change that member's role:

```http
PATCH /research-groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/members/cccccccc-cccc-4ccc-8ccc-cccccccccccc
Cookie: researchos_session=<app-session-token>
Content-Type: application/json

{
  "role": "CORE_MEMBER"
}
```

Read the first page, with the newest memberships first:

```http
GET /research-groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/members?page=1&limit=20&sort=-joinedAt
Cookie: researchos_session=<app-session-token>
```

Remove the member:

```http
DELETE /research-groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/members/cccccccc-cccc-4ccc-8ccc-cccccccccccc
Cookie: researchos_session=<app-session-token>
```

Successful deletion returns 204 with no body. Repeating deletion returns 404.
The example UUIDs must be replaced with existing group and user IDs.

## Verification

Checks performed during implementation on 2026-11-09:

- `pnpm codegen`: passed; OpenAPI and frontend client regenerated.
- `pnpm --filter api openapi:check`: passed; the committed-path OpenAPI artifact
  matches the current controller and DTO contract.
- API build: passed as part of OpenAPI generation and the drift check.
- `pnpm --filter worker build`: passed.
- `pnpm lint`: passed across the workspace with no warnings or errors.
- `pnpm test`: passed across the workspace, including 310 API tests and 85 web
  tests. The new membership suite contains 25 tests.
- `git diff --check`: passed for the implementation changes.
- `pnpm build`: attempted, but the web build failed while loading the SWC native
  binding because the Windows cache directories were inaccessible or rejected
  by SWC ownership/permission checks. A temporary cache override also failed.
  Full web production-build verification remains outstanding.

The 25 new tests cover lead/core permissions; collaborator, student and outsider
denial; private-list access; self-addition and active-lead protection with
uppercase UUIDs; inactive-lead removal; missing groups, users and memberships;
duplicate-key mapping; pagination and sorting; and invalid request payloads.

The service tests use mocked Prisma transactions. They do not establish live
PostgreSQL locking behavior or exercise the new routes through a running HTTP
server. Shared session tests and the real OpenAPI document rules also passed;
no new PostgreSQL integration harness was added for this ticket.

On this Windows environment, checks used pnpm 12.15.0's direct Node launcher
because the system pnpm shim could not launch the pinned version. No package
versions or lockfile contents were changed for the workaround.

Pre-commit review on 2026-11-09 reran workspace tests and lint successfully
(Turbo reused the passing results for unchanged inputs), and rebuilt the API
while checking OpenAPI drift. The web-build limitation above remains unresolved.
