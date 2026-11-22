# Opportunity expiry and application pipeline

[RES-156](https://researchosfptu.atlassian.net/browse/RES-156) and [RES-167](https://researchosfptu.atlassian.net/browse/RES-167) can ship independently. Both rely on the database deadline guard for new submissions.

## RES-156

- [x] Register a recurring BullMQ job from the standalone worker and enqueue durable sweep work through the PostgreSQL outbox.
- [x] Skip durable job creation when no open opportunity is due at the scheduler tick.
- [x] Claim indexed batches of overdue `OPEN` opportunities using PostgreSQL time. Commit expiry, search-index cleanup, and the audit together. Record the effective deadline and the processing time.
- [x] Remove expiry writes from opportunity reads and edits. Keep the database-time guards on opening, filling, and submitting a new application.
- [x] Add live cases for expiry without HTTP traffic, the cutoff, bounded batches, competing workers, duplicate delivery, audit rollback, search cleanup, and restart catch-up.
- [x] Run the live PostgreSQL and Redis cases on a database built from the Prisma migration chain.

## RES-167

- [x] Add an explicit single-applicant setting. Default existing and new opportunities to manual fill unless their manager opts in while the opportunity is in draft.
- [x] Add `ACCEPTED` as a terminal decision. Commit the acceptance, group membership, and any eligible automatic fill atomically. Preserve active membership roles and make acceptance retries idempotent.
- [x] Add the localized opportunity detail and application form. Add acceptance confirmation to the Group Hub and display the decision in the applicant’s profile.
- [x] Return the caller’s application status on opportunity detail reads so the form stays hidden after a successful submission and reload.
- [x] Serialize acceptance with group archiving and membership changes. Recheck management authority before writing membership.
- [x] Regenerate Prisma, OpenAPI, and Orval contracts. Add HTTP cases for decision authorization and idempotency, live PostgreSQL cases for concurrent acceptance and membership, and browser cases for apply and Group Hub cache refresh.
- [x] Run the live PostgreSQL acceptance cases.
- [x] Run the Group Hub browser suite, including keyboard application and status after reload on desktop and mobile.
- [ ] Verify mobile acceptance, mutation failure feedback, and the applicant profile's accepted badge and response note.

## Lifecycle decisions

New applications stop at the stored deadline even while a sweep is pending. Managers can still respond to pending applications after the deadline. Acceptance can fill an unarchived single-applicant opportunity only while it is `OPEN` and before its cutoff. After the cutoff, acceptance can create the membership and the sweep still owns the `EXPIRED` transition. Single-applicant opportunities allow one acceptance. Invitations and declines remain terminal decisions on that application.

An active membership keeps its role. Acceptance restores a removed membership as `MEMBER`. Personal opportunities return no group membership.

## Worker configuration and rollout

The standalone worker registers one schedule per `QUEUE_PREFIX`. Use the same `OPPORTUNITY_EXPIRY_INTERVAL_MS` and `OPPORTUNITY_EXPIRY_BATCH_SIZE` on each worker in that queue namespace. Defaults are 60,000 ms and 250 opportunities per batch. Under normal operation with capacity for all due rows, expiry commits within one scheduler interval plus outbox dispatch and batch processing. The idle outbox polls every 500 ms. Locked rows, backlogs, downtime, and retries can increase lag. Overdue rows are picked up by later batches.

Apply the [opportunity pipeline migration](../../packages/database/prisma/migrations/20261120100000_opportunity_pipeline/migration.sql), start the worker, and verify a committed expiry without opportunity API traffic before deploying the API that removes request-time expiry writes. Check the worker's completion and failure logs for counts, maximum lag, and attempt number. Terminal failures are visible in the existing dead-letter queue. An administrator can retry the durable job through the existing jobs API.

## Verification commands

- `pnpm codegen`, `pnpm lint`, and `pnpm test` exercise the generated contracts and workspace checks. `pnpm --filter api --filter worker build` builds the two deployable Nest applications. Run `pnpm build` for the full workspace build.
- Set `RES121_TEST_POSTGRES_URL` to a loopback PostgreSQL maintenance URL whose database is `postgres`. After building the worker, also set `RES156_TEST_REDIS_URL` to a test Redis instance. Run `pnpm --filter api test:postgres`. The script applies the full Prisma migration chain to a disposable database and uses an isolated Redis prefix for the standalone workers.
- Start the web app on port 3100 with the default API origin, then run `pnpm --filter web test:group-hub:browser`. The browser script uses mocked HTTP responses to verify the desktop and mobile apply flow and Group Hub acceptance.

## Verification results

- Passed workspace code generation, lint with API warnings, and tests. The API ran 590 tests, the web app ran 117, and the worker ran 16.
- Passed API and worker builds, web TypeScript checking, and syntax checks for the integration scripts.
- Passed all 19 live checks on PostgreSQL 18.6 with Redis and standalone workers. The acceptance cases verified caller-specific application status, concurrent authorization changes, a single winner under concurrent decisions, idempotent retries, preservation of an existing role, and post-cutoff acceptance. The expiry cases verified idle ticks, no-traffic expiry, bounded batches, duplicate delivery, a concurrent deadline extension, audit rollback, and restart catch-up.
- Passed the Group Hub browser suite on Edge against the local web server. The full Next.js production build was previously blocked by Windows SWC native-cache permissions.
