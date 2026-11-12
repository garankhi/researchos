# RES-163: Align the opportunity list pagination with the shared contract

Ticket: covered by the API convention cleanup on
`prepare-api-gaps-for-frontend`.

## Problem

`GET /opportunities` was the only list endpoint in the backend that did not
follow the shared pagination contract described in `docs/api-convention.md`
§11b. It diverged on three axes at once:

| Axis | Shared contract | `GET /opportunities` (before) |
| --- | --- | --- |
| Page size parameter | `limit` (default 20, max 100) | `pageSize` |
| Sort parameter | `sort` (`createdAt`, `-createdAt`, …) | absent |
| Response payload | `{ items, meta: PaginationMetaDto }` | `{ items, page, pageSize, total }` |

Everything else in the API — `/search`, `/follows`, `/research-groups`,
`/research-groups/:groupId/members`, `/research-groups/:groupId/directions`,
`/research-groups/:groupId/outputs`, `/users`,
`/external/openalex/works`, `/outputs`, `/taxonomy/topics`,
`/opportunities/:opportunityId/applications`, `/my/applications`,
`/research-groups/:groupId/applications` — used `PaginationQueryDto` and
`PaginatedResultDto`.

The flat `{ items, page, pageSize, total }` shape was the practical problem.
The frontend's `usePagination()` hook in `apps/web/src/utils/pagination.ts`
returns `{ page, limit, sort, query, ... }` and expects the list payload to
carry `meta` with `total`, `totalPages`, `hasNextPage` and
`hasPreviousPage`. The opportunity payload carried none of that, so a screen
built on the standard hook could not use it: there was no `total` to render
"page 1 of N", and no way to disable the "next page" button. The
`usePagination()` docblock in that file literally shows
`useOpportunitiesControllerFindAll(pagination.query)` as the example — an
example that did not typecheck against the generated client.

The second problem was silent breakage: `pageSize` is not a name any other
endpoint accepts, so a client written against the convention (`?page=2&limit=10`)
got `pageSize` ignored and the default page back, with no error to explain
why.

## Change

`GET /opportunities` now conforms to the shared contract.

### Query

`ListOpportunitiesQueryDto` now extends `PaginationQueryDto` instead of
declaring its own paging fields. It keeps its four filters — `groupId`,
`projectId`, `status`, `creatorId` — unchanged, and gains the three
standard paging parameters:

| Parameter | Default | Constraint |
| --- | --- | --- |
| `page` | 1 | `@Min(1)` |
| `limit` | 20 | `@Min(1)`, `@Max(100)` |
| `sort` | — | `@IsString()` |

`pageSize` is gone. A request that still sends it is ignored, not rejected —
an unknown query parameter is not an error in this API, so an old client
keeps working and simply gets the default page size.

### Sort

The endpoint accepts a `sort` key resolved against an allowlist, the same way
`/research-groups` and `/outputs` do it. The allowlist maps the camelCase
key and its snake_case twin onto a real column:

| Key | Column |
| --- | --- |
| `createdAt` / `created_at` | `research_opportunities.created_at` |
| `updatedAt` / `updated_at` | `research_opportunities.updated_at` |
| `applicationDeadline` / `application_deadline` | `research_opportunities.application_deadline` |
| `publishedAt` / `published_at` | `research_opportunities.published_at` |

A key outside the allowlist is refused with `validation_failed` (400) rather
than silently falling back to the default order — a silent fallback would
hide a client bug behind a wrong-looking list.

The sort is applied in SQL, not in Prisma. The visibility predicate
(`can_manage_opportunity` or `status <> 'DRAFT' AND archived_at IS NULL`) is
a raw SQL fragment, so the page of ids has to be selected in SQL anyway; the
sort rides along with it.

Two ordering details matter:

- **`application_deadline` and `published_at` sort `NULLS LAST`.** Both
  columns are nullable, and a plain `ORDER BY` puts nulls first in
  PostgreSQL for `ASC` and last for `DESC`. Sorting the null deadlines to
  the top of an "ending soonest" list would push exactly the opportunities
  without a deadline to the front, which is the opposite of useful.
- **Every sort gets a tiebreaker.** `created_at` is not unique, so the
  ordering also sorts by `id`. Without it, two records sharing a timestamp
  could come back in a different order on two consecutive pages, and the
  client would show one of them twice and miss the other.

### Response

`OpportunityPageDto` now extends `PaginatedResultDto<OpportunityResponseDto>`:

```json
{
  "items": [ /* OpportunityResponseDto[] */ ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 137,
    "totalPages": 7,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

`meta` is built with `buildPaginationMeta(page, limit, count, total)` — the
shared helper, so `totalPages`, `hasNextPage` and `hasPreviousPage` follow
the same definition as on every other list endpoint.

The `page`, `pageSize` and `total` fields at the top level are gone.
`total` still exists, but inside `meta`.

### Ordering preservation

The list query selects a page of **ids** in SQL (the visibility predicate is
raw SQL), then loads those rows through Prisma. Prisma's `findMany` does
not preserve the order of the input id list, so the service re-joins the
loaded rows onto the id list before mapping them to responses. Without that
step the page would come back in an arbitrary order and the `sort` parameter
would appear not to work.

## Contract

`apps/api/openapi.json` and the Orval client in `apps/web/src/lib/api/` were
regenerated. The generated types are now:

```typescript
export interface OpportunityPageDto {
  items: OpportunityResponseDto[];
  meta: PaginationMetaDto;
}
```

and the query params type carries `page`, `limit` and `sort` alongside the
four filters.

## Verification

- `pnpm --filter api test src/modules/opportunities/` — 163 tests pass.
- `pnpm test` — 13/13 workspace tasks pass; 545 API tests (up from 540, five
  new ones), 85 web tests.
- `pnpm --filter api openapi:check` — the document is up to date.
- `pnpm build`, `pnpm format:check`, `pnpm --filter api lint` — clean, no new
  warnings.

Five tests were added to cover the parts the change introduced:

- the SQL ordering is restored on the loaded rows, so the paged ids keep
  their order in the response;
- an unknown `sort` key is refused with `400 Bad Request`;
- `sort=applicationDeadline` emits `application_deadline ASC NULLS LAST`;
- `sort=-applicationDeadline` emits `application_deadline DESC NULLS LAST`;
- the default ordering is `o.created_at DESC, o.id DESC`.

Three existing tests were updated for the new payload shape.

## Note on the frontend

No frontend screen consumed `GET /opportunities` at the time of this change —
the generated client was the only reference. So there was no consumer to
migrate, and the `usePagination()` docblock example in
`apps/web/src/utils/pagination.ts` now describes code that actually
typechecks.
