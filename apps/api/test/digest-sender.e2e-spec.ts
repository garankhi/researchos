import 'reflect-metadata';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from '@researchos/config';
import {
  BackgroundJobsService,
  PrismaService,
  type Prisma,
} from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  DIGEST_SEND_JOB,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  MailMessage,
  MailOutcome,
} from '../../worker/dist/modules/notifications/mail-provider.js';
import { JobStatusService } from '../dist/modules/jobs/job-status.service.js';

const workspace = resolve(import.meta.dirname, '../../..');
const accepted = {
  accepted: true,
  messageId: 'fixture-message',
} satisfies MailOutcome;

describe('digest sender: PostgreSQL → outbox → Redis → standalone worker', () => {
  const prefix = `digest-e2e-${randomUUID()}`;
  const database = prefix.replaceAll('-', '_');
  type Request = MailMessage & { requestId: number };
  const received: Request[] = [];
  const originalPrefix = process.env.QUEUE_PREFIX;
  let admin: PrismaService;
  let prisma: PrismaService;
  let jobs: BackgroundJobsService;
  let databaseUrl: string;
  let queue: Queue;
  let dlq: Queue;
  let worker: ChildProcess | undefined;
  let created = false;
  let workerOutput = '';
  let author: string;
  let publicOutput: string;
  let privateOutput: string;
  let draftOutput: string;
  let projectEvent: string;

  beforeAll(async () => {
    await ConfigModule.forRoot({
      envFilePath: resolveEnvFilePaths(resolve(workspace, 'apps/api')),
    });
    const originalUrl = process.env.DATABASE_URL!;
    const url = new URL(originalUrl);
    url.pathname = `/${database}`;
    databaseUrl = url.href;
    admin = new PrismaService();
    // The test database is disposable because released revisions and terminal
    // digest items are intentionally immutable in the normal schema.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    created = true;
    process.env.DATABASE_URL = databaseUrl;
    try {
      prisma = new PrismaService();
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
    const schema = await readFile(
      resolve(workspace, 'docs/database/ResearchOS.sql'),
      'utf8',
    );
    const sql = schema.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
    await prisma.$executeRawUnsafe(
      `DO $fixture$ BEGIN EXECUTE $schema$${sql}$schema$; END $fixture$;`,
    );
    process.env.QUEUE_PREFIX = prefix;
    jobs = new BackgroundJobsService(prisma);
    const options = createQueueOptions(process.env.REDIS_URL!, prefix);
    queue = new Queue(BACKGROUND_QUEUE, options);
    dlq = new Queue(DEAD_LETTER_QUEUE, options);

    author = await createUser();
    publicOutput = await createOutput(
      '<b>Released & "$&"</b>',
      'FPTU_COMMUNITY',
    );
    privateOutput = await createOutput('Private work', 'PRIVATE');
    draftOutput = await createOutput('Unreleased draft');
    const project = await prisma.research_projects.create({
      data: {
        title: 'Unsupported project',
        lead_id: author,
        project_type: 'COLLABORATIVE_RESEARCH',
      },
    });
    projectEvent = (
      await prisma.research_updates.create({
        data: {
          event_key: randomUUID(),
          event_type: 'PROJECT_UPDATED',
          actor_id: author,
          project_id: project.id,
        },
      })
    ).id;
    await startWorker();
  });

  afterAll(async () => {
    await stopWorker();
    await queue?.obliterate({ force: true });
    await dlq?.obliterate({ force: true });
    await queue?.close();
    await dlq?.close();
    await prisma?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}"`);
    await admin?.$disconnect();
    if (originalPrefix === undefined) delete process.env.QUEUE_PREFIX;
    else process.env.QUEUE_PREFIX = originalPrefix;
  });

  async function startWorker() {
    worker = fork(
      resolve(workspace, 'apps/worker/test/fixtures/digest-worker.mjs'),
      {
        cwd: workspace,
        execArgv: [],
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          QUEUE_PREFIX: prefix,
          DIGEST_SMTP_ENABLED: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      },
    );
    worker.on('message', (mail) => received.push(mail as Request));
    worker.stderr?.on('data', (data: Buffer) => {
      workerOutput += data.toString();
    });
    await vi.waitFor(
      async () => {
        expect(await queue.getWorkersCount(), workerOutput).toBeGreaterThan(0);
      },
      { timeout: 15_000 },
    );
  }

  async function stopWorker() {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null)
      return;
    const exited = once(worker, 'exit');
    worker.kill('SIGKILL');
    await exited;
    worker = undefined;
  }

  async function createUser(type: 'FACULTY' | 'STAFF' = 'FACULTY') {
    const id = randomUUID();
    await prisma.users.create({
      data: {
        id,
        user_type: type,
        email: `${id}@example.test`,
        full_name: 'Digest fixture',
        department_unit: 'Testing',
      },
    });
    return id;
  }

  async function createOutput(
    title: string,
    visibility?: 'PRIVATE' | 'FPTU_COMMUNITY',
  ) {
    const output = await prisma.research_outputs.create({
      data: { owner_id: author, created_by: author, visibility },
    });
    const timestamp = new Date();
    const revision = await prisma.output_revisions.create({
      data: {
        output_id: output.id,
        revision_no: 1,
        title,
        created_by: author,
        ...(visibility
          ? {
              created_at: timestamp,
              released_by: author,
              released_at: timestamp,
            }
          : {}),
      },
    });
    if (visibility) {
      await prisma.research_outputs.update({
        where: { id: output.id },
        data: {
          sharing_status: 'SHARED',
          first_shared_at: new Date(),
          current_release_id: revision.id,
        },
      });
    }
    const event = await prisma.research_updates.findFirst({
      where: { output_id: output.id },
    });
    if (event) return event.id;
    return (
      await prisma.research_updates.create({
        data: {
          event_key: randomUUID(),
          event_type: 'OUTPUT_SHARED',
          actor_id: author,
          output_id: output.id,
          revision_id: revision.id,
        },
      })
    ).id;
  }

  async function prepare(
    tx: Prisma.TransactionClient,
    userId: string,
    events: string[],
  ) {
    const now = Date.now();
    const delivery = await tx.digest_deliveries.create({
      data: {
        user_id: userId,
        period_start: new Date(now - 604_800_000),
        period_end: new Date(now),
      },
    });
    for (const event of events) {
      await tx.$executeRaw`INSERT INTO digest_items (delivery_id, event_id, content_snapshot) VALUES (${delivery.id}::uuid, ${event}::uuid, '{"title":"stale private snapshot"}'::jsonb)`;
    }
    const job = await jobs.submitInTransaction(
      tx,
      userId,
      DIGEST_SEND_JOB,
      delivery.id,
      { deliveryId: delivery.id },
    );
    return { delivery, job };
  }

  async function fixture(language?: string, events = [publicOutput]) {
    const user = await createUser();
    await prisma.digest_preferences.create({
      data: { user_id: user, enabled: true, language },
    });
    return prisma.$transaction((tx) => prepare(tx, user, events));
  }

  function status(id: string) {
    return prisma.digest_deliveries.findUniqueOrThrow({ where: { id } });
  }

  async function waitStatus(id: string, expected: string) {
    await expect
      .poll(async () => (await status(id)).status, {
        timeout: 8_000,
        message: workerOutput,
      })
      .toBe(expected);
    return status(id);
  }

  async function waitMail(index: number) {
    await expect
      .poll(() => received.length, { timeout: 8_000, message: workerOutput })
      .toBeGreaterThan(index);
    return received[index]!;
  }

  function respond(index: number, outcome: MailOutcome) {
    worker!.send({ requestId: received[index]!.requestId, outcome });
  }

  async function releaseBackoff(deliveryId: string, jobId: string) {
    await prisma.digest_deliveries.update({
      where: { id: deliveryId },
      data: { next_attempt_at: new Date(0) },
    });
    await prisma.outbox.updateMany({
      where: { job_id: jobId, destination: 'WORK' },
      data: { dispatched_at: new Date(0) },
    });
  }

  it('commits the reference and outbox with the delivery or rolls everything back', async () => {
    const user = await createUser();
    await expect(
      prisma.$transaction(async (tx) => {
        await prepare(tx, user, [publicOutput]);
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect(
      await prisma.digest_deliveries.count({ where: { user_id: user } }),
    ).toBe(0);
    expect(
      await prisma.background_jobs.count({ where: { owner_id: user } }),
    ).toBe(0);
  });

  it('prunes private/draft items, escapes the live snapshot, and records acceptance after opt-out', async () => {
    const index = received.length;
    const { delivery, job } = await fixture(undefined, [
      publicOutput,
      privateOutput,
      draftOutput,
      projectEvent,
    ]);
    const mail = await waitMail(index);
    expect(mail.subject).toBe('ResearchOS weekly digest');
    expect(mail.html).toContain(
      '&lt;b&gt;Released &amp; &quot;$&amp;&quot;&lt;/b&gt;',
    );
    expect(mail.html).not.toMatch(
      /stale private snapshot|Unreleased draft|Private work/,
    );
    const duplicate = await queue.add(
      'execute',
      { jobId: job.id, generation: 0 },
      { jobId: randomUUID() },
    );
    await expect.poll(() => duplicate.getState()).toBe('completed');
    expect(received).toHaveLength(index + 1);
    await prisma.digest_preferences.update({
      where: { user_id: delivery.user_id },
      data: { enabled: false },
    });
    respond(index, accepted);
    expect((await waitStatus(delivery.id, 'SENT')).attempts).toBe(1);
    expect(
      await prisma.digest_items.count({ where: { delivery_id: delivery.id } }),
    ).toBe(1);
    const redelivery = await queue.add(
      'execute',
      { jobId: job.id, generation: 0 },
      { jobId: randomUUID() },
    );
    await expect.poll(() => redelivery.getState()).toBe('completed');
    expect(received).toHaveLength(index + 1);
  });

  it('honors explicit Vietnamese and cancels when all prepared items are unauthorized', async () => {
    const index = received.length;
    const vietnamese = await fixture('vi');
    expect((await waitMail(index)).subject).toBe('Bản tin tuần ResearchOS');
    respond(index, accepted);
    await waitStatus(vietnamese.delivery.id, 'SENT');
    const empty = await fixture('en', [privateOutput]);
    expect((await waitStatus(empty.delivery.id, 'CANCELLED')).attempts).toBe(0);
    expect(received).toHaveLength(index + 1);
  });

  it('drops a title made private while the prepared snapshot is being written', async () => {
    const index = received.length;
    const eventId = await createOutput('Revoked title', 'FPTU_COMMUNITY');
    const event = await prisma.research_updates.findUniqueOrThrow({
      where: { id: eventId },
    });
    const recipient = await createUser();
    await prisma.digest_preferences.create({
      data: { user_id: recipient, enabled: true },
    });
    const { delivery } = await prisma.$transaction(async (tx) => {
      const prepared = await prepare(tx, recipient, [eventId]);
      await tx.digest_deliveries.update({
        where: { id: prepared.delivery.id },
        data: { next_attempt_at: new Date(Date.now() + 60_000) },
      });
      return prepared;
    });

    const itemLocked = Promise.withResolvers<void>();
    const releaseItem = Promise.withResolvers<void>();
    const holdItem = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT delivery_id FROM digest_items WHERE delivery_id = ${delivery.id}::uuid FOR UPDATE`;
        itemLocked.resolve();
        await releaseItem.promise;
      },
      { timeout: 10_000 },
    );
    try {
      await Promise.race([itemLocked.promise, holdItem]);
      await prisma.digest_deliveries.update({
        where: { id: delivery.id },
        data: { next_attempt_at: new Date(0) },
      });
      await expect
        .poll(
          async () => {
            const rows = await prisma.$queryRaw<{ blocked: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%UPDATE digest_items%'
          ) AS blocked
        `;
            return rows[0]?.blocked;
          },
          { timeout: 3_000 },
        )
        .toBe(true);
      await prisma.research_outputs.update({
        where: { id: event.output_id! },
        data: { visibility: 'PRIVATE' },
      });
    } finally {
      releaseItem.resolve();
      await holdItem;
    }

    expect((await waitStatus(delivery.id, 'CANCELLED')).attempts).toBe(1);
    expect(received).toHaveLength(index);
    expect(
      await prisma.digest_items.count({ where: { delivery_id: delivery.id } }),
    ).toBe(0);
  });

  it('retries unknown outcomes at ledger backoff and caps attempts across generic reprocessing', async () => {
    const index = received.length;
    const { delivery, job } = await fixture('fr');
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await waitMail(index + attempt - 1)).subject).toBe(
        'ResearchOS weekly digest',
      );
      respond(index + attempt - 1, {
        accepted: false,
        code: attempt === 1 ? 'smtp_transient' : 'smtp_unknown',
      } satisfies MailOutcome);
      const failed = await waitStatus(delivery.id, 'FAILED');
      expect(failed.attempts).toBe(attempt);
      if (attempt < 5) {
        expect(failed.next_attempt_at.getTime() - Date.now()).toBeGreaterThan(
          59_000 * 2 ** (attempt - 1),
        );
        await releaseBackoff(delivery.id, job.id);
      }
    }
    await expect
      .poll(
        async () =>
          (await dlq.getJob(backgroundTransportId(job.id, 0)))?.data.jobId,
        { timeout: 8_000 },
      )
      .toBe(job.id);
    const polling = new JobStatusService(jobs, prisma);
    expect(await polling.findOwned(delivery.user_id, job.id)).toMatchObject({
      status: 'FAILED',
      attempts: 5,
    });
    expect(await polling.retryOwned(delivery.user_id, job.id)).toMatchObject({
      attempts: 5,
    });
    await expect
      .poll(
        async () =>
          (await dlq.getJob(backgroundTransportId(job.id, 1)))?.data.jobId,
        { timeout: 8_000 },
      )
      .toBe(job.id);
    expect((await status(delivery.id)).attempts).toBe(5);
    expect(received).toHaveLength(index + 5);
  });

  it('dead-letters a permanent rejection after the first attempt', async () => {
    const index = received.length;
    const { delivery, job } = await fixture();
    await waitMail(index);
    respond(index, { accepted: false, code: 'smtp_permanent' });
    const failed = await waitStatus(delivery.id, 'FAILED');
    expect(failed.attempts).toBe(1);
    expect(failed.last_error).toBe('smtp_permanent');
    await expect
      .poll(() => dlq.getJob(backgroundTransportId(job.id, 0)))
      .toBeDefined();
  });

  it.each(['inactive', 'revoked'] as const)(
    'cancels for an %s recipient',
    async (state) => {
      const index = received.length;
      const recipient = await createUser('STAFF');
      const { delivery } = await prisma.$transaction(async (tx) => {
        const grant = await tx.user_role_assignments.create({
          data: {
            user_id: recipient,
            role: 'RESEARCHER',
            grant_source: 'SYSTEM',
            granted_at: new Date(Date.now() - 1_000),
          },
        });
        await tx.digest_preferences.create({
          data: { user_id: recipient, enabled: true },
        });
        const prepared = await prepare(tx, recipient, [publicOutput]);
        if (state === 'inactive') {
          await tx.users.update({
            where: { id: recipient },
            data: { is_active: false },
          });
        } else {
          await tx.user_role_assignments.update({
            where: { id: grant.id },
            data: { revoked_at: new Date(), revoked_by: author },
          });
        }
        return prepared;
      });
      expect((await waitStatus(delivery.id, 'CANCELLED')).attempts).toBe(0);
      expect(received).toHaveLength(index);
    },
  );

  it('rejects a stale completion while a newer lease is processing', async () => {
    const index = received.length;
    const { delivery, job } = await fixture();
    await waitMail(index);
    await expireLease(delivery.id);
    const current = await queue.add(
      'execute',
      { jobId: job.id, generation: 0 },
      { jobId: randomUUID() },
    );
    await waitMail(index + 1);
    respond(index, { accepted: false, code: 'smtp_permanent' });
    await expect
      .poll(() => queue.getJob(backgroundTransportId(job.id, 0)))
      .toBeUndefined();
    expect((await status(delivery.id)).status).toBe('PROCESSING');
    respond(index + 1, accepted);
    await expect.poll(() => current.getState()).toBe('completed');
    expect((await waitStatus(delivery.id, 'SENT')).attempts).toBe(2);
  });

  async function expireLease(id: string) {
    await prisma.$executeRaw`UPDATE digest_deliveries SET locked_until = clock_timestamp() + interval '250 milliseconds', next_attempt_at = now() WHERE id = ${id}::uuid`;
    await vi.waitFor(async () => {
      const [row] = await prisma.$queryRaw<
        [{ expired: boolean }]
      >`SELECT locked_until <= clock_timestamp() AS expired FROM digest_deliveries WHERE id = ${id}::uuid`;
      expect(row.expired).toBe(true);
    });
  }

  it('recovers a crashed worker after the lease and Redis job are lost', async () => {
    const index = received.length;
    const { delivery, job } = await fixture();
    await waitMail(index);
    await stopWorker();
    await queue.obliterate({ force: true });
    await expireLease(delivery.id);
    await prisma.outbox.updateMany({
      where: { job_id: job.id, destination: 'WORK' },
      data: { dispatched_at: new Date(0) },
    });
    await startWorker();
    await waitMail(index + 1);
    respond(index + 1, accepted);
    expect((await waitStatus(delivery.id, 'SENT')).attempts).toBe(2);
  });
});
