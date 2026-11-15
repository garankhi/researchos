# RES-159: Group Hub page

Ticket: [RES-159](https://researchosfptu.atlassian.net/browse/RES-159)

Branch: `RES-159-groups-group-hub-page-info-members-directions-outputs-opportunities-applications`

Implemented: 2026-11-15

## Confirmed requirements

- The localized `/[locale]/groups/[groupId]` route requires login. Students must
  use their institutional account so access goes through ResearchOS identity
  verification. "Public" means signed-in outsiders, not anonymous Internet
  access. Faculty and other authorized accounts retain access. This feature does
  not infer identity from an email suffix or introduce a separate login system.
- All DELETE actions currently exposed by the UI preserve records. Normal hub
  controls never permanently delete database rows. Permanent deletion is reserved
  for administrator/database-manager maintenance; no purge endpoint or purge
  button is introduced here. Even an admin calling these normal DELETE routes
  gets soft deletion.

## Delivered behavior

| Section | Readonly view | Management |
| --- | --- | --- |
| Information | Name, code, description, active/archive state | Lead/admin edits, archive and restore |
| Members | Active enriched roster, profile links, avatar initials | Lead or active `GROUP_LEADER` adds, archives, changes roles |
| Directions | Active directions with field/subfield/topic path | Lead or active `GROUP_LEADER` publishes with topic picker; designated lead edits/archives |
| Outputs | Accepted links, hydrated at the accepted revision | Designated lead requests links, selects released revisions, accepts/rejects pending requests, removes accepted links |
| Opportunities | Open postings | Group managers create group postings; individual posting controls follow the server's permission flag |
| Applications | Hidden | Eligible group managers see manageable inbound applications and invite to discuss or decline, with a response note |

All content management requires effective `RESEARCHER` access. Group-info editing
also supports admins according to the existing API. The designated group lead is
`research_groups.lead_id`; delegated `GROUP_LEADER` membership does not grant
designated-lead direction editing or output curation.

The shell, feature types, hooks, section components and forms live under
`apps/web/src/features/groups/`. Its `index.ts` is the public import surface.
The Next.js route resolves asynchronous parameters inside Suspense. Existing
profile group cards link to the hub. The repository's UI, API, forms and
localization skills guide the implementation.

Skeletons, per-section empty/error states and retry controls handle loading and
failures. Forms use React Hook Form, Zod and shared form controls. Mutations show
success in the snackbar and failures inline, including field validation codes.
All new interface text is present in English and Vietnamese. Layouts use shared
Chakra tokens and responsive properties for light/dark themes.

## Soft deletion and migration

New migration:

`packages/database/prisma/migrations/20261115120000_group_hub_soft_delete/migration.sql`

| UI action | Stored result |
| --- | --- |
| Archive group | `is_active=false`, `archived_at` set |
| Archive opportunity | `archived_at` set |
| Archive membership (`DELETE .../members/:userId`) | Membership row retained with `archived_at` set |
| Archive direction (`DELETE .../directions/:directionId`) | Direction row retained with `archived_at` set; project foreign keys preserved |
| Remove output link (`DELETE .../outputs/:outputId`) | Link row retained with `status=REMOVED` |
| Remove profile interest (`DELETE /interests/:id`) | Existing behavior retains the row with `status=REJECTED` |

The UI audit covered actual feature calls, rather than only the generated client.
The two remaining hard-delete paths were membership and direction removal; both
now archive. The HTTP DELETE methods and 204 responses stay compatible.

Archived memberships are excluded from roster reads, group list filters,
archived-group access checks, direction permissions and output-list permissions.
The shared `is_group_member` and `can_manage_opportunity` SQL functions also
exclude them, so removal revokes private-output access and management authority.
The lead-removal guard, self-add 403 and active-duplicate 409 remain enforced.
Adding a previously archived member restores the existing membership instead of
inserting a duplicate. Archived directions cannot be edited and are excluded from
lists and counts. Soft deletion keeps project references valid.

The Prisma schema, DBML source, PostgreSQL feature source and generated
`docs/database/ResearchOS.sql` are updated together. Partial indexes support active
membership and direction reads. Existing historical migrations are unchanged.

**Deployment:** apply the new migration before deploying the new API, using the
normal reviewed migration process (`pnpm db:migrate:deploy`). These API changes
reference the new columns. On 2026-11-15, the user-authorized local database
`researchos` at `localhost:55432` was empty. All 14 repository migrations,
including RES-159, were applied using `prisma migrate deploy`. The follow-up
status reports that the schema is up to date. No application records were
deleted and no seed was run. Other environments still require their own deploy.

## Opportunity authorization

The previous shared database function permitted a creator/group manager to manage
a project-scoped opportunity without leading the project. The migration now
defines scope-specific authority:

- Personal opportunity: its creator.
- Group-only opportunity: the active group's lead or an unarchived
  `GROUP_LEADER` member.
- Project-scoped opportunity: the active project's lead, with matching group
  scope and an active group when group-scoped. Creator/group-manager shortcuts
  do not bypass project leadership.

The shared function controls API writes, visibility and application response
authorization. Creation continues to check the supplied group and project scope.
Removing a group manager's membership no longer leaves creator-based access to
group-only postings.

Opportunity list/detail responses expose caller-specific `canManage`. Each posting
uses this server flag for edit, archive and lifecycle buttons. The API still
authorizes every mutation independently. The existing `DRAFT -> OPEN -> FILLED ->
CLOSED` lifecycle is preserved. Dates entered in browser local time are submitted
as ISO timestamps; expiry remains server-owned.

## Outputs and pagination

`GET /research-groups/:groupId/outputs` allows signed-in outsiders to read active
groups' accepted links. Inactive/archived groups require current membership or
the designated lead. Only active group managers receive the review queue. An
optional `status=ACCEPTED|PENDING` filter is applied before pagination and counting;
readonly pending-queue requests return 403. A shared group-row lock keeps the
visibility check stable against concurrent archive/lead/membership changes.

The showcase and queue fetch separate pages. Link responses remain link-only;
cards hydrate output details and revisions, matching `acceptedRevisionId` for
showcase cards and `requestedRevisionId` for queue cards. They never substitute
the latest release for a missing pin. Output visibility remains enforced by the
output API. N+1 hydration is retained as allowed for the MVP.

The link form now offers visible shared works, including works owned by other
researchers, and lets the lead select a released revision. Own-work requests can
be auto-accepted; other eligible work requests become `PENDING`. There is no native
output editor or external ingestion in this feature.

Hub collections and the output picker initially fetch 20 records, then fetch more
only on request. `callerMembershipRole` in group-detail responses determines
delegated leadership even when the caller is on a later roster page. Accepted
and pending output pages stay separate so filtering does not hide records on
unloaded pages. Server state stays in TanStack Query; cache keys include caller
and group IDs. Mutations invalidate affected hub/list queries.

## Contract and tooling changes

- Existing output DTO schemas and generated alias files are preserved. Output
  cards use runtime string checks for nullable abstract/URL values, following
  the existing client contract without restructuring it.
- OpenAPI and the Orval API client are regenerated, rather than edited manually.
- The boundary lint rule permits public feature barrels while continuing to
  reject private cross-feature imports, with six regression cases.
- The form-lint test loads its expensive configuration in a bounded setup hook,
  rather than consuming an individual assertion's five-second timeout.
- Unrelated API/test lint cleanup was reverted to keep the change focused on
  this ticket. The pre-existing lint warnings remain; no lint rule was disabled.

Scope reduction requested after review: restored all 11 existing generated
output/revision alias files and eight existing source/test files. There are no
tracked-file deletions. The one additive soft-delete migration is unchanged;
no additional schema migration was introduced during scope reduction.

## Verification

Passed on the final validation run:

- Code generation and DBML editor diagnostics/SQL export.
- Full workspace production build and web TypeScript checking.
- Full workspace lint: no errors; pre-existing API warnings are retained after
  reverting unrelated cleanup.
- Default concurrent `pnpm test`: all 13 tasks pass, including **582 API tests**
  and **109 web tests**, plus the worker/shared-package suites. Serial execution
  is no longer required to avoid the old form-lint assertion timeout.
- Storybook build and **15 interaction/accessibility tests** across five files.
- Production-route browser checks for readonly/lead/delegated views, pinned
  revisions, other researchers' output submissions, archive confirmations,
  field validation, pagination, per-posting management flags, loading/empty/error
  states, recovery, English/Vietnamese, mobile and light/dark themes. No page
  errors or mobile horizontal overflow were observed.

Storybook still emits third-party Vite advisories about `use client` directives
and large documentation chunks. Its build and browser checks pass; production
Next.js uses its own build pipeline. These advisories were not silenced by
changing dependencies or disabling checks.

The browser regression script is
`apps/web/scripts/check-group-hub.mjs`. With the built web app running on port
3100, run `pnpm --filter web test:group-hub:browser`. It uses synthetic HTTP
responses and checks readonly/lead/delegated access, pinned revisions, non-owned
output requests, archive controls, validation, pagination, posting permissions,
error recovery, Vietnamese mobile layout and both themes. It never writes real
application records. `PLAYWRIGHT_CHANNEL=chrome` selects installed Chrome when
Playwright-managed Chromium is unavailable. Screenshots/results go under the
ignored `apps/web/.cache/` directory.

For real PostgreSQL verification, set `RES159_TEST_POSTGRES_URL` to a loopback
maintenance connection whose database is `postgres`, then run
`pnpm --filter api test:group-hub:postgres`. The script creates a uniquely named
scratch database, applies historical migrations plus this upgrade, checks data
retention, membership revocation/restoration, project-scope authorization and
retained direction references, then drops only its scratch database.

**PostgreSQL verification completed on 2026-11-15:** all six scratch-database
integration checks passed before migrating the local application database.
These verify upgrade data retention, project/group management permissions,
membership archive/restoration, retained direction references and archived-project
restrictions. The scratch database was cleaned up by the test. After deploying,
both nullable `archived_at` columns, both partial indexes and all 14 applied
migration records were verified in the local application database. Membership
and direction tables remain empty. Unit/HTTP tests still mock persistence and
browser checks mock HTTP; a browser flow against the live API is separate.

The workstation's global pnpm launcher was broken, so validation uses the existing
local `pnpm.mjs` entry point. Native builds require the normal user compiler
cache. No package versions, lockfile, production browser settings or global pnpm
settings were changed.
