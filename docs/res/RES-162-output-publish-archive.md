# RES-162: Output draft revision, publish and archive endpoints

Ticket: [RES-162](https://researchosfptu.atlassian.net/browse/RES-162).

Implemented on `prepare-api-gaps-for-frontend`. No database migration is
required: this uses the existing `research_outputs`, `output_revisions` and
`field_provenance` tables, the existing triggers, and the existing partial
unique index `uq_output_editable_draft`.

## Why these three endpoints exist

The database already described the whole lifecycle, but nothing in
`apps/api` ever wrote it. `OpenAlexCandidatesService.accept` transitions a
work from `CANDIDATE` to `ACCEPTED` and stops there — the work stays
`DRAFT` and `PRIVATE`, so it lives in the owner's profile and in no shared
surface. The accept flow *promises* a publish step ("share now?") and
`docs/database.md` §5.1.1 names the endpoint that was supposed to exist:

```text
user pull OpenAlex → candidate → user REVIEW
                                          ├── REJECT → claim REJECTED
                                          └── ACCEPT → claim CONFIRMED + import_state=ACCEPTED
                                                        ↓ system asks "share now?"
                                                  DRAFT + PRIVATE  or  PUBLISH
                                                                        ↓
                                                    release revision + SHARED + visibility
                                                                        ↓
                                                        Discovery + Search + Follow/Digest
```

Three endpoints close that gap. They are **origin-blind**: a work that came
from an OpenAlex pull and a work created natively inside the platform walk
the exact same three steps, because `import_state` records where a work came
from while `sharing_status` records whether it is shared. The two axes never
contradict each other, so there is nothing to merge and nothing to keep in
sync.

| Method | Route | Purpose | Success |
| --- | --- | --- | --- |
| PATCH | `/outputs/:outputId/revision` | Correct the metadata of the editable draft revision | 200 |
| POST | `/outputs/:outputId/publish` | Release the draft, share the work under a chosen visibility | 200 |
| POST | `/outputs/:outputId/archive` | Take a published work out of every shared surface | 200 |

All three require a valid session and live `RESEARCHER` access
(`@Roles('RESEARCHER')`). The caller's id comes from the session; clients
cannot select another user. Missing authentication returns 401, a
signed-in caller without researcher access returns 403.

## 1. `PATCH /outputs/:outputId/revision`

Edits the **editable draft** of a work — the revision with
`released_at IS NULL`. A released revision is immutable, so a work that was
already published has no editable revision here.

Body (every field optional — a partial update sends only what changed):

```json
{
  "title": "Deep Learning for Medical Image Classification",
  "abstract": "In this paper, we propose a novel deep convolutional network...",
  "venue": "IEEE Transactions on Medical Imaging",
  "publicationYear": 2026,
  "externalUrl": "https://doi.org/10.1109/TMI.2026.1234567",
  "outputType": "PAPER"
}
```

A nullable field sent as `null` clears the stored value. An absent field
keeps its stored value. The response is the updated revision, in the same
shape as `GET /outputs/:outputId/revisions`.

`authorsSnapshot` is deliberately **not** editable here. The snapshot is
shared with `output_authors` and with the accept path's authorship
resolution (`resolveAuthorId` matches the caller's ORCID against it), so
editing it would break the authorship mapping for co-authors. Editing the
authorship list is a separate concern with its own rules.

### The human-wins lock

Every corrected field is locked for the field-provenance writer through
`ProvenanceService.confirmField`, inside the same transaction as the write.
A locked field creates (or updates) a `field_provenance` row with
`source = 'HUMAN'` and `is_locked = true`.

This is the point of the endpoint: a later OpenAlex re-pull would otherwise
overwrite the title a researcher just corrected. The lock is one-way — human
wins over machine — and `ProvenanceService` is the only writer that sets
`is_locked`, so a machine sync can never unlock a field.

Only the fields with a provenance mapping are locked: `title`, `abstract`,
`venue` and `publication_year`. `externalUrl` and `outputType` have no
provenance row today (the OpenAlex ingest writes six fields, and
`external_url` is not among them), so correcting them changes the value
without a lock.

## 2. `POST /outputs/:outputId/publish`

The single visibility action. Body:

```json
{ "visibility": "FPTU_COMMUNITY" }
```

or

```json
{ "visibility": "RESEARCH_GROUP", "accessGroupId": "55555555-5555-4555-8555-555555555555" }
```

`PRIVATE` is **not** a publish option. `PRIVATE` means "not shared", and
publishing *is* the act of sharing, so an unpublished work is the private
state rather than a publish target. The DTO rejects it with
`visibility_invalid`.

The two visibility values map onto the database check
`ck_output_access_scope`:

| `visibility` | `access_group_id` | Who sees it |
| --- | --- | --- |
| `FPTU_COMMUNITY` | NULL | the whole FPTU community |
| `RESEARCH_GROUP` | the group the caller belongs to | that group's members |

A mismatched pair — a group visibility with no group, or a community
visibility with one — is refused with `output_visibility_invalid` (400)
before anything is written. The database would refuse it too, but a
readable error beats a constraint violation.

The access group is checked with `is_group_member(caller, group)`, so a
work cannot be pointed at a group the caller is not a member of
(`output_access_group_invalid`, 400).

### The publish transaction

One transaction, four writes, in the order the triggers require:

| # | Write | Protecting constraint |
| --- | --- | --- |
| 1 | release the draft revision: `released_at`, `released_by` | trigger `guard_revision` — only a managing researcher may release, and the title must not be blank |
| 2 | `research_outputs.current_release_id` → the revision just released | trigger `guard_output_release` — the pin must point at a **released** revision of this output |
| 3 | `sharing_status = 'SHARED'`, `first_shared_at = now()` | check `ck_shared_output` — a shared work needs an owner, a pin and a first-shared timestamp |
| 4 | `visibility` and `access_group_id` | check `ck_output_access_scope` |

The transaction has to be atomic because the database refuses every partial
state: a released revision with no pin, a shared work with no release, a
shared work with no owner.

`first_shared_at` is set to the database clock (`clock_timestamp()`), so
the server and the database agree on when the work was shared.

`import_state` is **not** touched. The work stays `ACCEPTED` — import
state records the origin, sharing status records the current state.

`publication_status` on the revision is **not** touched either. It answers
"has this version appeared in a journal or at a conference?", which is not
the same question as "is this shared inside the university?". A preprint
shared internally is `UNPUBLISHED` and `SHARED` at the same time, exactly as
`docs/database/DB-FLOWS.vi.md` describes. `docs/database.md` §5.1.1 lists
setting it to `PUBLISHED` as step 5 of the publish transaction; this
implementation does not do that, because the academic publication status is
not derivable from the act of sharing and guessing it would put a false
claim in the search index.

The database trigger `emit_research_update` enqueues an `OUTPUT_SHARED`
event (or `OUTPUT_REVISION_RELEASED` on a re-release) into
`research_updates`, so the Follow/Digest flow sees the work without the API
knowing about it. The trigger `sync_search_index_output` writes the work
into `search_index` because `sharing_status = 'SHARED'` — this is the
moment the work becomes findable in Search/Discovery.

## 3. `POST /outputs/:outputId/archive`

Takes a published work out of every shared surface. No body.

```text
sharing_status = 'SHARED' → 'ARCHIVED', archived_at = now()
```

Archiving is the **only** way to un-share. The trigger `guard_output_release`
refuses to reset a shared work back to `DRAFT`:

```sql
IF TG_OP='UPDATE' AND OLD.first_shared_at IS NOT NULL AND
  (NEW.first_shared_at IS DISTINCT FROM OLD.first_shared_at OR NEW.sharing_status='DRAFT')
THEN RAISE EXCEPTION 'Previously shared output cannot reset its history to draft; archive it';
```

The sharing history is not erasable, so the API offers no un-share route.
`first_shared_at` is preserved by the archive, so the work keeps the record
of when it was first shared.

The check `ck_output_archive` ties the status to the timestamp
(`(sharing_status = 'ARCHIVED') = (archived_at IS NOT NULL)`), so both land
in the same update.

The work keeps its revisions, its authorship claims and its group links.
Only its visibility ends: `sync_search_index_output` removes it from
`search_index` because `sharing_status <> 'SHARED'`, and the released
output views stop returning it.

## Who may do what

Only the **owner** may edit, publish or archive a work. The database
predicate is `can_manage_output(actor, output)`, which is
`is_researcher(actor) AND owner_id = actor`. Co-authors listed on
`output_authors` do **not** gain the right to publish: `owner_id` is the
researcher who claimed the work, and co-authorship does not transfer
ownership.

The service reads `owner_id` directly and refuses with
`output_not_owner` (403) — the check lives in the service, never in the
controller, because it is a per-record check and the record is known only
there.

## Errors

Every code is registered in `packages/error-codes/src/domain.ts` under
`outputs` and has an entry in `apps/web/src/messages/en.json` and
`apps/web/src/messages/vi.json` under `errors.codes.domain`. The frontend's
catalog check (`apps/web/src/utils/error-codes.spec.ts`) fails the build if
one of them is missing.

| Code | Status | Raised when |
| --- | --- | --- |
| `output_not_found` | 404 | the output does not exist |
| `output_not_owner` | 403 | the caller is not the owner of the work |
| `output_not_publishable` | 400 / 409 | the title is blank (400), or the work has no editable draft (409) |
| `output_already_published` | 409 | the work is already `SHARED` |
| `output_not_archived` | 409 | the work is not `SHARED`, so it cannot be archived |
| `output_revision_locked` | 409 | the revision is released and cannot be edited |
| `output_revision_not_found` | 404 | the output has no editable draft revision |
| `output_visibility_invalid` | 400 | the visibility and the access group do not match |
| `output_access_group_invalid` | 400 | the caller is not a member of the access group |

Field-level validation codes (`revision_title_too_long`, `abstract_invalid`,
`venue_invalid`, `publication_year_invalid`, `external_url_invalid`,
`output_type_invalid`, `visibility_invalid`, `access_group_id_invalid`,
`access_group_id_required`) live under `errors.codes.fields` in both
locales.

## Files changed

- `apps/api/src/modules/outputs/dto/update-output-revision.dto.ts`: the
  editable metadata of a draft revision.
- `apps/api/src/modules/outputs/dto/publish-output.dto.ts`: the visibility
  decision.
- `apps/api/src/modules/outputs/outputs.service.ts`: `updateRevision`,
  `publish`, `archive`, plus the `loadResponse` and `now` helpers.
- `apps/api/src/modules/outputs/outputs.controller.ts`: the three routes.
- `apps/api/src/modules/outputs/outputs.module.ts`: imports
  `ProvenanceModule`.
- `apps/api/src/modules/outputs/outputs-mutations.spec.ts`: 17 tests for the
  three write paths.
- `apps/api/src/modules/outputs/outputs.controller.spec.ts`: the existing
  read suite gains the `ProvenanceService` provider.
- `packages/error-codes/src/domain.ts`: the eight new domain codes.
- `apps/web/src/messages/en.json`, `apps/web/src/messages/vi.json`: the
  domain codes and the field codes.
- `apps/api/openapi.json`: regenerated API contract.
- `apps/web/src/lib/api/`: regenerated Orval client and models.

## Verification

| Check | Result |
| --- | --- |
| `pnpm build` | Passed across all eight packages. |
| `pnpm lint` | Passed across the workspace. The one remaining warning in the outputs module (`groupId` unused in `outputs.controller.spec.ts`) predates this change. |
| `pnpm format:check` | Passed. |
| `pnpm test` | Passed: 540 API tests across 36 files, 85 web tests across eight files, and the shared-package checks. |
| New endpoint tests | 17 tests passed, included in the API suite above. |
| OpenAPI rules | Passed in the full API suite (`src/openapi-rules.spec.ts`). |
| OpenAPI freshness | `pnpm --filter api openapi:check` passed after regeneration. |
| PostgreSQL integration | Not run; no local PostgreSQL/Docker available. |

The tests exercise the service at a mocked Prisma boundary: they verify the
transaction order, the exact writes, the owner check, the visibility/group
validation, the state refusals, and the provenance lock that each corrected
field receives. They do not run against PostgreSQL, so the trigger and
check-constraint behaviour is verified by reading the migration, not by
executing it.

The workspace packages must be built before the API suite runs, because the
API imports `@researchos/database` and `@researchos/error-codes` through
their built `dist` output. A stale `dist` fails the API suite at import
time with errors that look like missing exports rather than a stale build.

## Change checklist

- [x] Correct the metadata of a work's editable draft revision.
- [x] Lock every corrected field against later automated syncs.
- [x] Release the draft, pin it and share the work in one transaction.
- [x] Take the visibility decision from the caller and validate the access
      group against the caller's memberships.
- [x] Archive a published work and preserve its sharing history.
- [x] Register the domain codes and their wording in both locales.
- [x] Regenerate the OpenAPI document and the Orval client.
- [x] Add 17 passing tests and document the implementation.
- [x] Pass build, lint, format and the full test suite.
- [ ] Run real PostgreSQL integration checks when a test database is
      available.
