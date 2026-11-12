# RES-130: Research direction endpoints and publishing

Ticket: [RES-130](https://researchosfptu.atlassian.net/browse/RES-130).
Included with RES-101 and RES-54 on
`RES-101-research-interest-endpoints`.

## Behavior

Directions are published on creation. The existing `group_directions` table has
no draft/status/published-at fields, and the ticket specifies only CRUD routes,
so POST is the publish operation. No additional publication lifecycle or schema
migration is introduced.

| Method | Route | Access | Success |
| --- | --- | --- | --- |
| POST | `/research-groups/:groupId/directions` | Researcher who is group lead or group leader | 201 |
| GET | `/research-groups/:groupId/directions` | Any signed-in user for an active group; lead/members for an inactive or archived group | 200 |
| PATCH | `/research-groups/:groupId/directions/:directionId` | Researcher who leads the group | 200 |
| DELETE | `/research-groups/:groupId/directions/:directionId` | Researcher who leads the group | 204, empty body |

The lead-only edit/delete rule follows the ticket's non-lead 403 rule. Publishing
is the explicit exception for group leaders — a membership row whose role is
`GROUP_LEADER`. Admin status alone does not bypass these rules. An inactive or
archived group cannot publish/edit/delete directions.

POST accepts:

```json
{
  "title": "Reliable distributed systems",
  "description": "Fault tolerance and reproducible evaluation",
  "topicId": "<optional-active-topic-uuid>"
}
```

`title` is required, trimmed, nonblank, and at most 255 characters. `description`
is optional, at most 10,000 characters, and normalized to null when blank.
`topicId` is optional and nullable. Directions can exist without taxonomy links.
PATCH accepts the same fields optionally; null clears the description or topic,
while an omitted field retains its current value. A null title is invalid.

Responses expose `id`, `groupId`, `topicId`, `title`, `description`, `createdAt`,
and `topicPath`. The path is null for unlinked directions; otherwise it contains
`field`, `subfield`, and `topic`, each with an `id` and `name`. Existing links
remain readable after a taxonomy topic is deactivated; new links require active
topics.

GET accepts `page` (default 1), `limit` (default 20, maximum 100), and `sort`
(`createdAt`, `title`, or their `-` descending forms). Default sorting is newest
first with ID as a deterministic tie-breaker. The payload contains `items` and
the shared pagination `meta`. Responses use the standard API success envelope,
except DELETE's empty 204 response.

## Integrity and errors

- Missing session: 401. Missing researcher role on writes or insufficient group
  authority: 403. An unrelated admin cannot publish or edit directions.
- Missing group, missing direction within that group, or missing topic: 404.
- Invalid UUID, invalid/oversize title or description, inactive topic, unknown
  payload fields, invalid pagination or unsupported sort: 400.
- Inactive/archived group mutation or deleting a direction referenced by a
  project: 409. Foreign-key and transaction conflicts also map to 409.
- Reads/writes hold a parent group share lock during authorization and the
  operation, coordinating with the existing lead/membership changes.
- Updates and deletes use the composite `(directionId, groupId)` key, preventing
  a direction from another group from being modified through this route.

## Implementation and validation

- `apps/api/src/modules/groups/group-directions.controller.ts`: four routes and
  complete Swagger response/parameter documentation.
- `group-directions.service.ts`: authorization, topic validation, scoped writes,
  pagination and full taxonomy-path mapping.
- `dto/group-direction.dto.ts`: input validation and response contracts.
- `groups.module.ts`: module registration.
- `group-directions.spec.ts`: 11 HTTP tests using real Nest routing, validation,
  session/role guards and a mocked Prisma boundary.
- `apps/api/openapi.json` and generated web client: refreshed with `pnpm codegen`.

The tests cover authentication, researcher access, lead/group-leader/plain-member
rules, publication without a topic, taxonomy paths, private archived-group reads,
archived-group write conflicts, missing/inactive resources, scoped edits/deletes,
clearing optional fields, referenced-direction conflicts, and invalid input.

Validation commands for the combined PR:

```text
pnpm codegen
pnpm build
pnpm lint
pnpm test
node apps/api/scripts/export-openapi.mjs --check
```

Final workspace results are recorded with RES-54. PostgreSQL integration tests
were not run: this session has no local PostgreSQL listener or Docker executable.
The HTTP tests mock the database boundary and do not prove real database locking
behavior.

## Checklist

- [x] Publish directions as a lead/group leader; edit/delete as lead.
- [x] Support optional topics and full taxonomy paths.
- [x] Enforce group scope, membership permissions and archive restrictions.
- [x] Validate payloads and bound pagination.
- [x] Map missing resources and relational conflicts to documented statuses.
- [x] Add 11 passing HTTP tests and regenerate the API/client contracts.
- [x] Document interpretation of publishing without adding schema state.
