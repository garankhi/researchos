---
status: proposed
date: 2026-11-12
---

# Gap 6 — The OpenAlex pull over HTTP

Status: proposed, awaiting review.

This closes the last of the six gaps in the Story B profile-page plan
(`/home/thien/.cursor/plans/profile-page.plan.md`). Gaps 1–5 are implemented
and green.

## 1. Problem

The pull logic exists and is unit-tested, but nothing reaches it over HTTP:

- `OpenAlexLookupService.findCandidates` resolves the researcher in OpenAlex and
  lists their works. It writes nothing.
- `OpenAlexLookupService.findWorksForAuthor` / `findWorksByAuthorName` are the
  second step of the name path.
- `OpenAlexIngestService.ingestWork` / `ingestWorks` / `upsertWork` writes the
  candidate output, its draft revision, the authorship rows, the external id, the
  `SUGGESTED` claim and the provenance rows.

`apps/api/src/modules/openalex/openalex.module.ts` registers only
`OpenAlexCandidatesController`. Nothing injects the lookup or the ingest, so the
pull is unreachable and the candidate queue can never populate — the seed writes
`import_state: 'NONE'`.

Three obstacles stand between the current code and a working pull. They are
listed here first because each one forces a structural change.

## 2. The identity model — two equal paths

**The rule: a researcher is identified by an OpenAlex author id, or by name plus
affiliation. ORCID is not a canonical path.**

`researcher_profiles.orcid_id` stays in the schema and the existing ORCID
matching code stays in place, but the pull does not branch on it and the job
payload does not carry it. A researcher who has an ORCID and a researcher who
does not take exactly the same route through the system; the only difference is
how the OpenAlex author is identified.

| | **Author-id path** | **Name + affiliation path** |
| --- | --- | --- |
| Researcher supplies | an OpenAlex author id (`A5023888391`) | their name, plus the affiliation to match against |
| OpenAlex call | `GET /works?filter=author.id:<id>` | `GET /authors?search:<name>`, then `GET /works?filter=raw_author_name.search:"<name>",raw_affiliation_strings.search:<affiliation>` |
| The researcher picks their author | no — the id *is* the choice | yes — from the candidate list, by id |
| Candidate confidence | high when the authorship also carries an ORCID | the name alone is **not** authoritative; the researcher still ticks each work |
| Authorship position on a work | the authorship whose `author.id` equals the chosen id | the authorship whose `author.id` equals the chosen id (the same rule — see §4) |
| Works the researcher wrote | attributed to them at ingest | attributed to them at ingest |

Both paths:

- produce the same `CandidateWorkPreview` shape,
- write the same candidate rows, the same `SUGGESTED` claim and the same
  provenance rows,
- require the same researcher decision before a work becomes `ACCEPTED`.

The difference is **confidence**, not **capability**. The name path starts from
a name, which collides across Vietnamese names, so the researcher picks their
author explicitly before anything is pulled. After that pick the two paths are
the same code path with the same author id. The preview's `confirmed` flag is
informational — it reports whether the matched authorship also carries an
ORCID — and no code path branches on it to decide what gets written.

### 2.1 Where the author id comes from on the name path

The name path is two steps, and both are canonical:

1. `GET /external/openalex/authors` searches OpenAlex authors by the
   researcher's name and returns candidates with an `affiliationMatch` flag
   computed against `users.department_unit`.
2. The researcher picks one. That pick **is** an OpenAlex author id, so from
   step 2 on the two paths converge — the name path becomes the author-id path.

This is why the two paths are equal: the name path is not a separate pipeline
with a weaker end, it is the author-id path with one extra, explicitly
human-confirmed step in front of it.

**The job is the exception.** `POST /pull` with only a name does not require
the researcher to have picked an author first — the job resolves the name to
an author itself, by taking the one candidate whose affiliation matches
(§6.1). The explicit pick is still available and is the way out of an
ambiguous name, but it is not required for the pull to work.

### 2.2 What is stored

The chosen author id must survive from the pull to the accept, because the
accept is where the authorship position is resolved. It is recorded in two
places:

| Where | What | Why |
| --- | --- | --- |
| `output_revisions.authors_snapshot` (per authorship entry) | `authorId` | the work's own authorships — shared by every researcher who claimed it |
| `publication_claims.match_source` | `OPENALEX:AUTHOR_ID:<id>` | the researcher's own match — which author id *they* matched against |

`output_authors.user_id` is the third record, and it is the one that matters
most: it is the actual authorship link, written at ingest.

**Both paths write the same `match_source` shape.** The name path resolves its
name to an author id *before* the ingest (§6.1), so by the time the claim is
written both paths have a concrete author id and both write
`OPENALEX:AUTHOR_ID:<id>`. The channel that produced it — the researcher
picked the id, or the job resolved the name — is recorded in the job result
(§6.2) and reflected in the preview's `confirmed` flag, not in the claim. One
shape to read, one shape to parse.

`match_source` is a free `varchar(50)` today and holds `OPENALEX:<work id>`.
That value moves to the provenance `source_ref` (`OPENALEX:<work id>` is exactly
what `source_ref` is for), and `match_source` becomes the identity channel.

**The `varchar(50)` bound is not a constraint.** `OPENALEX:AUTHOR_ID:A5023888391`
is 29 characters; the longest realistic OpenAlex author id is `A` plus ten
digits, so the channel plus the id fits.

See §7 for where the id is read back from and why.

## 3. The three obstacles

### 3.1 The worker cannot reach the OpenAlex code

`OpenAlexClient`, `OpenAlexLookupService` and `OpenAlexIngestService` live in
`apps/api/src/modules/openalex/`. `apps/worker/src/app.module.ts` states that the
two apps "neither imports the other's source", and `docs/queues.md` repeats it.
The worker needs the ingest, so the ingest has to move somewhere both can
import.

**Resolution — a new workspace package `packages/openalex`.**

It holds:

- `OpenAlexClient` — the HTTP client and the raw-payload shaping.
- The shaped types (`OpenAlexAuthor`, `OpenAlexWork`, `OpenAlexWorkAuthor`,
  `OpenAlexWorksPage`).
- `OpenAlexLookupService` — resolve the author, list the works.
- `OpenAlexIngestService` — upsert the candidate, its revision, the authorship
  rows, the external id, the claim and the provenance.
- `ProvenanceService` — it is the one API-owned collaborator of the ingest, and
  it is pure: it writes `field_provenance` rows inside a caller-supplied
  transaction and has no HTTP surface and no API-specific behaviour.

`apps/api/src/modules/openalex/` keeps its module, its controller and its
service classes, but they become thin re-exports of the package's classes. The
existing unit tests in `apps/api/src/modules/openalex/*.spec.ts` keep passing —
they import the service names from the same paths and construct them the same
way, with one exception noted in §10.1. `apps/worker` depends on
`@researchos/openalex` directly.

The package follows the shape of `packages/storage` and `packages/queue`: a
`src/index.ts` public surface, a `tsconfig.json` with `module: nodenext`, a
`tsconfig.build.json` that excludes specs, and a `vitest.config.ts`.

The package depends on `@researchos/database` (for `Prisma.TransactionClient`),
`@researchos/error-codes` (for the domain codes) and `@nestjs/common` (for
`HttpStatus` and `Injectable`). It does **not** depend on `@nestjs/config` — the
client's configuration is passed in, so the worker and the API can configure it
differently.

#### The two helpers the package needs from `apps/api/src/common/`

The OpenAlex code raises `CodedHttpException` and reads PostgreSQL failures.
Both helpers live in `apps/api/src/common/errors/`, which the package cannot
import — `apps/api` is an app, not a package, and nothing may depend on an
app's source.

- `CodedHttpException` is 20 lines and depends only on `@nestjs/common` and
  `@researchos/error-codes`. It moves to the package as
  `packages/openalex/src/coded-http-exception.ts`, and `apps/api`'s
  `common/errors/error-codes.ts` re-exports it so the API's existing imports
  keep working.
- `readDatabaseFailure` is 150 lines and depends on nothing at all — it is
  pure. It is used by the ingest only for the provenance constraint mapping,
  which moves with `ProvenanceService`. It moves to
  `packages/openalex/src/database-errors.ts` for the same reason, and
  `apps/api`'s `common/errors/database-errors.ts` re-exports it.

Both are re-exports rather than copies, so there is exactly one definition of
each. The API's `common/errors/` files keep their public names, so the 27 files
that import them do not change.

### 3.2 The job runner holds a transaction across external HTTP

`BackgroundJobRunner.process` in
`apps/worker/src/processors/background-job.processor.ts` does, in one
`prisma.$transaction(...)`:

1. `SELECT id FROM background_jobs WHERE id = ... FOR UPDATE` — holds a row lock.
2. Reads the stored job, checks the queue scope, generation and status.
3. Runs the handler.
4. Writes the terminal status, and creates the DLQ outbox row on failure.

The default interactive-transaction timeout is 5 seconds. An OpenAlex pull
pages a whole bibliography (100 works per page, `perPage` capped at 200) and
runs one transaction per work. It would blow the timeout while holding the row
lock — and the lock is held for the whole pull.

**Resolution — two kinds of handler.**

The runner splits into:

- **Transactional handlers** (DB-only). Unchanged: they run inside the
  transaction, so their side effects commit with the completion status, and a
  thrown error rolls both back. `DURABLE_PROBE_JOB` and `RESEARCH_UPDATE_JOB`
  stay in this class.
- **External handlers** (call a third party). They run **outside** the
  transaction, and the terminal status is recorded in a second, short
  transaction afterwards.

The claim protocol stays identical for both kinds, so duplicate delivery and
stale generations are still rejected:

1. A short transaction claims the job row `FOR UPDATE`, verifies the scope,
   generation and `PENDING` status, and increments `attempts`. It does **not**
   run the handler.
2. The handler runs — outside any transaction for the external kind.
3. A second short transaction writes the terminal status, the result, and the
   DLQ outbox row.

The window between (1) and (3) is the trade: the row lock is released while the
external call is in flight, so a second delivery of the same generation could
pass the claim check while the first is still running.

Two mechanisms bound that:

- **BullMQ itself** gives one job id one active lock, so a redelivery only
  happens after BullMQ has declared the first delivery stalled — which means
  the first worker is gone or wedged, not merely slow.
- **The handler is idempotent**, which §9 already requires of every background
  job. The ingest already is: a re-import returns the same `outputId` with
  `created = false` and only bumps `synced_at`, and an existing `CONFIRMED` or
  `REJECTED` claim is left alone.

The claim transaction increments `attempts` and commits it, so a redelivery
consumes an attempt rather than running for free. The attempt ceiling is
`JOB_ATTEMPTS` (3), enforced both by the `ck_background_job_attempts` check
constraint and by BullMQ's `attempts` option — the same number on both sides.

For the external kind the failure accounting is unchanged: a non-terminal error
leaves the job `PENDING` for the next attempt, a terminal error or the last
attempt writes `FAILED` and creates the DLQ outbox row.

The handler map becomes an instance field rather than a module-level `Map`, so
handlers can inject NestJS services (`OpenAlexClient`, `OpenAlexIngestService`,
`PrismaService`).

### 3.2.1 A long job also has to survive BullMQ's stall detector

Splitting the transaction fixes the database timeout, but the job is still
running inside BullMQ, and BullMQ has its own clock.

`packages/queue/src/index.ts` sets no worker options, so
`@nestjs/bullmq`'s `Worker` uses BullMQ's defaults:

| Option | Default | Meaning |
| --- | --- | --- |
| `lockDuration` | 30 000 ms | how long the job's Redis lock survives |
| `lockRenewTime` | `lockDuration / 2` = 15 000 ms | how often the lock is renewed |
| `stalledInterval` | 30 000 ms | how often the worker checks for stalled jobs |
| `maxStalledCount` | 1 | how many stalls a job survives before it fails |

The lock renewal is automatic — BullMQ's `LockManager` extends the lock for
every job it is currently processing, on a timer, while the handler runs. So a
handler that takes ten minutes keeps its lock and is **not** counted as
stalled. The defaults are therefore safe for a long pull.

But this is a property of the defaults, not of the code, and the pull is the
first job in the system whose runtime is unbounded. The design makes the
dependence explicit:

- The `BackgroundJobProcessor` registers with an explicit
  `lockDuration` and `maxStalledCount`, so the numbers are stated in the code
  rather than inherited silently:

```ts
@Processor(BACKGROUND_QUEUE, {
  concurrency: 2,
  // A pull pages a whole bibliography; the lock must outlive it, and the
  // job may stall once (a worker restart) without failing the pull.
  lockDuration: 10 * 60_000,
  maxStalledCount: 2,
})
```

- A pull that is still running when the lock is lost is **not** failed by
  BullMQ — `maxStalledCount: 2` lets it be redelivered, and the handler is
  idempotent, so the redelivery re-does the work safely.

- The `attempts` counter in `background_jobs` is capped at `JOB_ATTEMPTS` (3) by
  the `ck_background_job_attempts` check constraint, and BullMQ's
  `attempts: JOB_ATTEMPTS` in `defaultJobOptions` matches. The two counters are
  deliberately the same number, so neither side can retry more than the other
  expects.

### 3.2.2 The outbox dispatcher's redelivery rule

`apps/worker/src/modules/jobs/outbox.service.ts` re-dispatches a `WORK` outbox
row when the job is still `PENDING` and the row was dispatched more than 30
seconds ago:

```sql
AND (o.dispatched_at IS NULL OR (
  o.destination = 'WORK' AND j.status = 'PENDING'
  AND o.generation = j.generation
  AND o.dispatched_at < now() - interval '30 seconds'
))
```

For a long pull this fires repeatedly — the job stays `PENDING` for the whole
pull. The dispatcher then looks the transport id up in Redis:

```ts
const existing = await queue.getJob(transportId);
```

The job is still there and its state is `active`, not `failed`, so the
dispatcher does **not** re-add it. It only refreshes `dispatched_at`. No
duplicate job is created.

This is safe because the transport id is `<logical-job-id>-<generation>` and
BullMQ's `jobId` option makes `queue.add` idempotent for that id. The 30-second
redelivery rule is a safety net for the case where Redis lost the job, and the
idempotency key keeps it from duplicating work.

### 3.3 A researcher without a matching authorship cannot accept anything

`OpenAlexCandidatesService.resolveAuthorId` finds the caller's authorship
position by matching `profile.orcid_id` against the draft revision's
`authors_snapshot`:

```ts
const needle = normalizeOrcid(profile?.orcid_id ?? null);
const order = toSnapshotOrder(revision?.authors_snapshot, needle);
if (order === null) {
  throw new CodedHttpException(
    domainErrorCodes.openalex.authorNotFound,
    HttpStatus.NOT_FOUND,
  );
}
```

With no ORCID the order resolves to `null` and the accept throws
`404 openalex_author_not_found`. The candidate sits in the queue forever.

**Resolution — match on the OpenAlex author id.**

The authorship position is resolved from the work's own authorships, matching
the `authorId` the researcher pulled under:

```ts
const order = toSnapshotOrderByAuthorId(
  revision?.authors_snapshot,
  claimedAuthorId,   // the id the researcher's pull used
);
```

`claimedAuthorId` comes from the researcher's own claim's `match_source` — see
§7 for why the claim and not the snapshot, and for the fallback chain.

So the rule is: **the OpenAlex author id is the primary key for author
attribution; ORCID is a legacy fallback for works pulled before this change.**

`ck_confirmed_claim_author` still holds — a `CONFIRMED` claim names its
`output_authors` row, and the position is resolved to a real row before the
write.

## 4. The authors snapshot has to carry the author id

Today the snapshot entry is:

```json
{ "name": "Nguyen Van An", "order": 1, "orcid": null, "isCorresponding": true }
```

`OpenAlexWorkAuthor` already carries `authorId` — the client sets it from
`authorship.author.id` — but the ingest drops it when it writes the snapshot.

The snapshot entry becomes:

```json
{
  "name": "Nguyen Van An",
  "order": 1,
  "orcid": null,
  "authorId": "https://openalex.org/A5023888391",
  "isCorresponding": true
}
```

`author_id` is `null` for an unlinked authorship — OpenAlex has works whose
authorship carries no author id. Those entries simply never match, and the
researcher's position on such a work stays unresolved, exactly as it does today
for a missing ORCID.

`authors_snapshot` is JSONB, so this is a **data-shape change, not a schema
change**: no migration, no column added. But every writer of the snapshot has to
include `authorId`, and every reader has to tolerate its absence — the snapshot
written by an older pull has no `authorId` key, and `toSnapshotOrderByAuthorId`
must treat a missing key as "no match" rather than crash.

The `output_authors` table gets the same treatment: `output_authors` has no
OpenAlex author id column today. The link from an authorship row to its OpenAlex
author is made by the snapshot, which is where it belongs — the snapshot is the
work's own record of who wrote it.

### 4.1 The ingest writes the pull's author id into the claim

The snapshot records the work's authorships. The claim records what *this*
researcher matched. Both are written by the ingest, in the same transaction as
the work, so they can never disagree.

`OpenAlexIngestService.upsertWork` takes the pull's identity as an extra
argument:

```ts
async upsertWork(
  userId: string,
  work: OpenAlexWork,
  identity: { authorId: string | null },
): Promise<IngestResult>
```

and uses it for two things:

1. **The authorship link.** `matchAuthorOrder` becomes
   `matchAuthorOrderByAuthorId(work, identity.authorId)` — it finds the
   authorship whose `authorId` equals the pull's author id, and that position
   is linked to the researcher's `output_authors` row at ingest time. The ORCID
   match stays as a fallback for a work whose authorships carry no author id.

2. **The claim's `match_source`.** The `SUGGESTED` claim is written with
   `match_source = 'OPENALEX:AUTHOR_ID:<id>'`. This is the value §7 reads back.

The name path has an author id by the time it reaches the ingest — the job
resolves the name to an author (see §6.1), so the ingest always has a concrete
author id to match against. The difference between the two paths at ingest time
is only which id was used.

**This is why the two paths are equal at the data layer.** After the ingest,
both paths have produced the same rows: the same candidate output, the same
draft revision, the same authorship link to the researcher, the same
`SUGGESTED` claim with the same `match_source` shape, the same provenance.

## 5. The routes

A new `OpenAlexPullController` on the `external/openalex` prefix, with the same
`@ApiCookieAuth()` and the same session guard as
`OpenAlexCandidatesController`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/external/openalex/authors` | The caller's candidate authors, with `affiliationMatch`. The entry point for the name path. |
| `GET` | `/external/openalex/works/available?authorId=` | Live works for a picked author, unconfirmed. The preview before pulling. |
| `POST` | `/external/openalex/pull` | Body `{ authorId?, authorName?, affiliation? }`. Queues the pull. **202** + `JobDto`. |

**Naming.** `GET /external/openalex/works` already means the **stored** candidate
queue. The live preview must not reuse that path, so `works/available` is the
preview and `works` stays the queue.

### 5.1 `GET /external/openalex/authors`

Query: `{ name?, department? }`.

Both optional, but at least one must be present — the search needs something to
search on. `name` defaults to the caller's `users.full_name`; `department`
defaults to `users.department_unit`.

Response: `{ items: [{ id, displayName, orcid, worksCount, affiliations, affiliationMatch }] }`.

`affiliationMatch` is true when any of the author's affiliations contains the
department text, case-insensitively. It is a hint for the researcher, not a
filter: the response returns every candidate regardless.

This route calls OpenAlex on every request. It is a live preview, like
`works/available`, and the caller is expected to call it rarely — the pull
itself is the durable path.

### 5.2 `GET /external/openalex/works/available`

Query: `{ authorId }` — required.

Response: `{ items: [{ workId, shortId, title, doi, publicationYear, outputType, venue, confirmed }] }`.

`confirmed` is true when the authorship carrying the supplied author id also
carries an ORCID — OpenAlex has linked that authorship to a verified
identifier, so the work is attributable with high confidence. When the
authorship has no ORCID, the match rests on the author id alone and
`confirmed` is false.

The response is unpaginated by design: it is the preview the researcher picks
from, and the full bibliography is what the pull consumes. The call pages
through OpenAlex internally.

### 5.3 `POST /external/openalex/pull`

Body:

```jsonc
{
  "authorId": "A5023888391",       // optional — the author-id path
  "authorName": "Nguyen Van An",   // optional — the name path
  "affiliation": "FPT University"  // optional — defaults to FPT_UNIVERSITY_AFFILIATION
}
```

Header: `Idempotency-Key`, 1–200 characters, actor-scoped. The same key with a
different payload returns `409`.

Validation:

- `authorId` present → the author-id path.
- `authorId` absent and `authorName` present → the name path.
- Both absent → `authorName` defaults to the caller's `users.full_name`; if that
  is blank, `400` with a new code `openalex_author_required`.
- `authorId` and `authorName` both present → `400 openalex_author_ambiguous`.
  The two paths are alternatives, not a combination.

Response: `202` with `JobDto` — `{ id, status, attempts, statusUrl }` — where
`statusUrl` is `/jobs/<id>`, the same URL the existing jobs endpoint serves.

### 5.4 The job payload

```jsonc
{
  "mode": "AUTHOR_ID" | "NAME",
  "authorId": "A5023888391",        // AUTHOR_ID
  "authorName": "Nguyen Van An",    // NAME
  "affiliation": "FPT University"   // NAME
}
```

The payload is the durable record of what was asked for. It must be
self-contained: the handler cannot re-read the researcher's profile and
re-derive the name, because the profile may have changed between the submit
and the run, and a pull must pull what was asked for.

## 6. The durable job

New kind `OPENALEX_PULL_JOB` in `@researchos/database`, next to
`RESEARCH_UPDATE_JOB`.

Submitted through the existing `BackgroundJobsService.submit(ownerId, kind,
key, payload)`, which writes the job row and the `WORK` outbox row in one
transaction. The worker dispatcher picks it up, exactly like every other
durable job.

The handler:

1. Validates the payload shape. A payload it does not recognise is
   `UnrecoverableError` — a bad payload never becomes a retry loop.
2. Resolves the OpenAlex author:
   - `AUTHOR_ID` → the id from the payload.
   - `NAME` → search OpenAlex authors by name, then take the candidate whose
     affiliations match the payload's affiliation. **The name path does not
     guess.** If no candidate matches the affiliation, the job fails with
     `openalex_author_not_found` rather than pulling an arbitrary author's
     works.
3. Pages the works for that author with the `author.id:<id>` filter. Both paths
   use it, because the name path has already resolved to an author id (§6.1).
4. Calls `upsertWork(userId, work, identity)` per work, where `identity` is
   `{ authorId }` — the resolved author id. Each upsert is its own
   transaction, so one bad work does not lose the rest of the pull.
5. Records the result: `{ mode, authorId, worksScanned, candidatesCreated,
   candidatesUpdated }`.

The handler is **idempotent**: a re-run re-resolves the same author, re-pages
the same works, and each `upsertWork` returns the same `outputId` with
`created = false`. A `CONFIRMED` or `REJECTED` claim is never resurrected.

### 6.1 Why the name path resolves the affiliation rather than guessing

The name path searches OpenAlex by name and gets several candidates. Picking the
first one would pull another researcher's bibliography — the exact failure the
`affiliationMatch` flag exists to prevent.

So the job resolves the name path the same way a researcher would: among the
candidates, take the one whose affiliations match. If exactly one matches, it
is unambiguous. If several match, the job fails with
`openalex_author_ambiguous` and the researcher resolves it by calling the
pull with an explicit `authorId` — which is the whole point of having the
author-id path as a first-class equal.

**The name path resolves to an author id before it fetches anything.** The
resolved id is then used for the works filter (`author.id:<id>`) rather than
the name filter, and it is that id which the ingest matches the authorship
against. So the two paths converge inside the job, before the ingest — which
is why §4.1 can say the name path also has a concrete author id at ingest
time.

The name + affiliation filter (`raw_author_name.search` +
`raw_affiliation_strings.search`) remains available as a fallback for works
whose authorship carries no OpenAlex author id — the same unlinked-authorship
case the client's `searchWorksByAuthorName` already covers. It is not the
name path's primary filter, because a filter on a raw byline cannot be
resolved to an author id, and the author id is what the ingest matches
against.

### 6.2 The job result

`background_jobs.result` is JSONB. The result is informational — the client
polls `statusUrl` for the status, not for the payload. The counts let the UI
say "12 works pulled, 3 already known" without a second round trip.

The result also records **how the author was identified**, which is the one
thing the claim does not:

```jsonc
{
  "mode": "AUTHOR_ID",        // or "NAME"
  "authorId": "A5023888391",  // the id the pull actually used
  "worksScanned": 42,
  "candidatesCreated": 12,
  "candidatesUpdated": 30
}
```

On the name path, `mode` is `NAME` and `authorId` is the id the job resolved
the name to. So the UI can say "we found your OpenAlex author A5023888391 by
name and affiliation" without the client having to make a second call.

## 7. The candidate accept path

`OpenAlexCandidatesService.resolveAuthorId` changes to resolve the position
from the OpenAlex author id, with the ORCID as a fallback for works pulled
before this change:

```ts
private async resolveAuthorId(
  tx: Prisma.TransactionClient,
  userId: string,
  outputId: string,
  claim: { author_id: string | null } | null,
): Promise<string> {
  if (claim?.author_id) return claim.author_id;

  const linked = await tx.output_authors.findFirst({
    where: { output_id: outputId, user_id: userId },
    select: { id: true },
  });
  if (linked) return linked.id;

  const revision = await tx.output_revisions.findFirst({
    where: { output_id: outputId, released_at: null },
    select: { authors_snapshot: true },
  });

  // Primary: the OpenAlex author id this researcher's pull used.
  const claimed = toSnapshotOrderByAuthorId(
    revision?.authors_snapshot,
    await this.claimedAuthorId(tx, userId, outputId),
  );

  // Fallback: the researcher's own authorship position, when the claim
  // carries no author id (a pull made before this change).
  const order = claimed ?? (await this.soleAuthorshipOrder(tx, userId, outputId, revision));

  if (order === null) {
    throw new CodedHttpException(
      domainErrorCodes.openalex.authorNotFound,
      HttpStatus.NOT_FOUND,
    );
  }
  // ... the rest is unchanged: claim the free position or report a conflict
}
```

The ORCID match is not in this chain any more: it is the *last* fallback, and
only for a snapshot written before the author id existed, whose authorship
entries carry an `orcid` but no `authorId`.

```ts
const order =
  claimed ??
  (await this.soleAuthorshipOrder(...)) ??
  toSnapshotOrder(revision?.authors_snapshot, normalizeOrcid(profileOrcid));
```

`claimedAuthorId` reads the author id the researcher pulled with, out of the
claim's `match_source` when it carries `OPENALEX:AUTHOR_ID:<id>`.

**Why the claim and not the snapshot.** The snapshot records which OpenAlex
authors wrote *the work* — it is shared by every researcher who claimed it. The
claim is per-researcher: it records what *this* researcher matched against.
So the accept reads the author's id from the researcher's own claim, and then
finds that id's position in the shared snapshot. Nothing else can answer the
question "which of these authors is our researcher".

**Why `match_source` and not a new column.** `match_source` is a free-text
column that this code already owns — it holds `REVIEW` from the accept and
reject paths and `OPENALEX:<work id>` from the ingest today. Repurposing it to
name the identity channel costs no migration.

The reader accepts exactly one shape — `OPENALEX:AUTHOR_ID:<id>` — and anything
else yields no id, which sends the resolution down the fallbacks. A malformed
value can never make the code claim the wrong authorship, because the id is
compared against the snapshot's own `authorId` values before it is used. The
`varchar(50)` bound is not a constraint:
`OPENALEX:AUTHOR_ID:A5023888391` is 29 characters.

**A cleaner alternative, and why it is not proposed here:** a dedicated
`output_external_ids` row with `source = 'OPENALEX_AUTHOR'` and
`external_id = <author id>`, linked to the output. That is a real first-class
link, index-backed, and it survives a re-pull. It is not proposed because it
adds a table shape that only this feature needs, and because the claim's
`match_source` already carries the information.

**The rule for revisiting it:** if the author-id link turns out to be needed by
more than the pull and the accept, it should become a proper
`output_external_ids` row rather than staying a string inside `match_source`.

**The fallback that makes the name path work end to end.** When the claim does
not carry an author id — a pull made before this change — the position is
resolved from the snapshot's own author ids: if the researcher has exactly one
authorship position among the work's authors, that is their position.

This is the common case for a solo author, and for a paper where their name is
distinctive enough that OpenAlex linked it.

When it is not unambiguous (a co-authored paper where two authors share a name),
the position stays unresolved and the accept fails with the existing
`openalex_author_not_found`. The researcher resolves it by accepting from the
live preview instead, which carries the authorship list.

### 7.1 The accept button on a name-path candidate

The candidate list (`GET /external/openalex/works`) carries the authors as
names only, read out of the snapshot. For a researcher deciding whether a work
is theirs, the names are enough — but the *decision* needs the position.

The candidate DTO gains the authorship positions, so the UI can show which
position the researcher would claim:

```jsonc
{
  "id": "...",
  "title": "...",
  "authors": ["Nguyen Van An", "Tran Thi B"],
  "claimedAuthorOrder": 1,   // null when the position cannot be resolved
  "claimStatus": "SUGGESTED"
}
```

`claimedAuthorOrder` is null exactly when the accept would fail with
`openalex_author_not_found`. The UI can then say "we could not tell which
authorship is yours" instead of offering a button that 404s.

## 8. Error codes

New domain codes in `packages/error-codes/src/domain.ts`, under `openalex`:

| Code | Status | Meaning |
| --- | --- | --- |
| `openalex_author_required` | 400 | The pull body carries neither an author id nor a usable name. |
| `openalex_author_ambiguous` | 400 / 409 | Both paths were supplied, or the name matched several authors. |
| `openalex_pull_not_allowed` | 403 | The caller is not an active researcher. |

`openalex_author_ambiguous` is used at two levels: `400` when the request
itself supplies both paths, `409` when the *job* finds several matching
authors. The job's `error_code` column is a `varchar(64)`, so it stores the
same string.

Each code gets an entry in `apps/web/src/messages/en.json` and
`apps/web/src/messages/vi.json` under `errors.codes.domain`, in the same
change.

The existing `openalex_author_not_found` and `openalex_author_conflict` keep
their meaning and their status.

## 9. Idempotency and retry

- `POST /pull` requires an `Idempotency-Key` header. The same key with the
  same payload returns the same job; a different payload returns `409`. This
  is `BackgroundJobsService.submit`'s existing behaviour, unchanged.
- The job is retry-bounded at 3 attempts with exponential backoff, the same
  `JOB_ATTEMPTS` the queue package already defines.
- The handler is idempotent: re-running it produces the same `outputId`s and
  never resurrects a `CONFIRMED` or `REJECTED` claim.
- A payload the handler does not recognise is `UnrecoverableError` — it fails
  immediately rather than burning three attempts.

## 10. What changes, file by file

### 10.1 New package `packages/openalex`

```
packages/openalex/
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts                    public surface
    openalex.types.ts           moved from apps/api
    openalex.client.ts          moved from apps/api, config injected
    openalex-lookup.service.ts  moved from apps/api
    openalex-ingest.service.ts  moved from apps/api
    provenance.service.ts       moved from apps/api/modules/provenance
    provenance.constants.ts     OPENALEX_FIELD_PROVENANCE
    coded-http-exception.ts     moved from apps/api/common/errors
    database-errors.ts          moved from apps/api/common/errors
```

`openalex.client.ts` currently reads `ConfigService` in its constructor. The
package takes a plain options object instead:

```ts
export interface OpenAlexClientOptions {
  baseUrl?: string;
  mailto?: string;
}
```

`apps/api` keeps injecting `ConfigService` and passes the options through, so
the API's behaviour is unchanged. The worker reads the same environment
variables directly.

**The API's existing specs do not all survive the move unchanged.** The client
spec constructs the client with a `ConfigService`:

```ts
const config = { get: (key: string) => values[key] } as unknown as ConfigService;
return new OpenAlexClient(config);
```

With the options-object constructor this becomes `new OpenAlexClient({ baseUrl,
mailto })`. The lookup, ingest and provenance specs construct their services
with plain mocks and are unaffected.

So the move is **not** zero-diff on the test files: `openalex.client.spec.ts`
needs its constructor call updated. Every other spec keeps passing untouched,
because the service names, their constructors and their behaviour are the same.

### 10.2 `apps/api/src/modules/openalex/`

- `openalex.module.ts` — imports the package's classes instead of defining
  them, and registers the new pull controller.
- `openalex.client.ts`, `openalex-ingest.service.ts`,
  `openalex-lookup.service.ts`, `openalex.types.ts` — become re-exports:
  `export { OpenAlexClient } from '@researchos/openalex';`
- `openalex-pull.controller.ts` — **new**.
- `openalex-pull.service.ts` — **new**: the three routes' business logic.
- `dto/` — **new**: `list-openalex-authors.query.dto.ts`,
  `list-available-works.query.dto.ts`, `pull-openalex.dto.ts`,
  `openalex-author-response.dto.ts`, `available-work-response.dto.ts`.

The existing `*.spec.ts` files keep working, because the service names and
their constructors do not change — except the client spec, as §10.1 notes.

### 10.3 `apps/api/src/modules/provenance/` and `apps/api/src/common/errors/`

- `provenance.service.ts` becomes a re-export of the package's service;
  `provenance.module.ts` keeps providing it so `apps/api`'s other modules do
  not change. `OPENALEX_FIELD_PROVENANCE` moves with it.
- `common/errors/error-codes.ts` re-exports `CodedHttpException` from the
  package; `common/errors/database-errors.ts` re-exports
  `readDatabaseFailure`. Both keep their current public names, so the 27
  files that import them do not change.

### 10.4 `apps/worker/src/processors/background-job.processor.ts`

- The module-level `backgroundJobHandlers` map becomes an instance field on
  `BackgroundJobRunner`, populated in the constructor from injected services.
- The handler map gains a kind marker: transactional or external.
- `process` splits into claim → run → record, as described in §3.2.
- `BackgroundJobProcessor` gets explicit `lockDuration` and
  `maxStalledCount`, as described in §3.2.1.

### 10.5 `apps/worker/src/modules/jobs/jobs.module.ts`

Registers the OpenAlex handler, and the module gains the package's
dependencies.

### 10.6 `packages/database/src/background-jobs.service.ts`

Adds `export const OPENALEX_PULL_JOB = 'openalex-pull';`.

### 10.7 `packages/error-codes/src/domain.ts`

Adds the three codes from §8.

### 10.8 `apps/web/src/messages/{en,vi}.json`

Adds the matching catalog entries.

### 10.9 `apps/api/openapi.json`, `apps/web/src/lib/api/`

Regenerated: `pnpm --filter api openapi` then `pnpm --filter web orval`.

### 10.10 Workspace wiring

- `pnpm-workspace.yaml` already globs `packages/*`, so the new package is
  picked up with no change.
- The root `package.json` build and test scripts need the new package added,
  following how `packages/queue` and `packages/storage` are listed.
- `packages/openalex` is added to `apps/api`'s and `apps/worker`'s
  `dependencies` as `workspace:*`.

## 11. Not in this change

- The onboarding flow. The pull's body shape is identical for both, so
  onboarding later calls the same route with no API change.
- `POST /outputs/:outputId/publish`. An accepted OpenAlex candidate still
  stops at `DRAFT` + `PRIVATE`. The profile page is read-only, so it does not
  block the story — but it caps the re-claim flow end to end.
- ORCID removal. `orcid_id` stays in the schema and the ORCID matching stays
  as a fallback for works pulled before this change. It is simply not a path
  the pull offers.
- The `interest_circles` / `research_interests` write paths. The interests
  *read* endpoint from Gap 2 is enough for the profile page.

## 12. Verification

- `pnpm --filter api test` — the existing 492 tests keep passing, plus the new
  pull controller/service tests.
- `pnpm --filter worker test` — new tests for the runner split: a transactional
  handler still rolls back with its side effects, an external handler's status
  is recorded in a second transaction, and a duplicate delivery is rejected.
- `pnpm --filter openalex test` — the package's own tests: the client, the
  lookup, the ingest, the provenance writer.
- `pnpm --filter api openapi` and `pnpm --filter web orval` — the contract is
  regenerated and committed.
- `packages/openalex` lint passes with `oxlint --type-aware`.

### 12.1 The tests that matter most

Three behaviours are worth their own tests, because each one is a place where a
regression would be silent:

1. **The name path resolves to an author id and the ingest links the
   authorship.** A pull by name that writes a candidate with *no* authorship
   linked to the researcher is the failure mode that made the original code
   unusable. The test asserts `output_authors.user_id` is set on the right
   `author_order`.
2. **The accept resolves the position from the author id, not the ORCID.** A
   researcher with no ORCID accepts a candidate and the claim becomes
   `CONFIRMED` with a non-null `author_id`.
3. **The external handler's status is recorded even when the handler throws.**
   The job must not be left `PENDING` forever, and the DLQ outbox row must be
   written on the terminal attempt.

## 13. Open questions

1. **Should the name path be allowed to pull without an affiliation match?**
   This design says no — an unmatched name fails the job, and the researcher
   resolves it with an explicit `authorId`. The alternative is to pull the
   best-guess candidate and let the researcher reject the wrong works, which
   is more forgiving but risks a bibliography full of someone else's papers.

2. **Should `GET /external/openalex/authors` be cached?**
   It calls OpenAlex on every request. A short TTL cache would cut the load,
   but it adds a cache layer that has to be invalidated. The route is a
   preview the researcher calls rarely, so no cache is proposed.

3. **Should the author id become a real `output_external_ids` row?**
   §7 keeps it in the claim's `match_source` for now, and states the rule for
   revisiting it: if more than the pull and the accept need it, it becomes a
   first-class row with `source = 'OPENALEX_AUTHOR'`.
