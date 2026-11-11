import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { resolveEnvFilePaths } from '@researchos/config';
import { UNASSIGNED_RESEARCH_UPDATE_SCOPE } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { expect, it } from 'vitest';
import { createHttpTestClient } from './http-test-client.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);

it('publishes committed research updates, retries, and deduplicates replay', async () => {
  await ConfigModule.forRoot({
    envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..')),
  });
  const source = new URL(process.env.DATABASE_URL);
  source.pathname = '/postgres';
  source.searchParams.delete('schema');
  const databaseName = `res113_${randomUUID().replaceAll('-', '')}`;
  const database = new URL(source);
  database.pathname = `/${databaseName}`;
  const prefix = databaseName;
  const admin = new Client({ connectionString: source.href });
  const producer = new Client({ connectionString: database.href });
  const observer = new Client({ connectionString: database.href });
  const queueOptions = createQueueOptions(process.env.REDIS_URL, prefix);
  const legacyQueue = new Queue(BACKGROUND_QUEUE, queueOptions);
  const queue = new Queue(RESEARCH_UPDATES_QUEUE, queueOptions);
  const deadLetterQueue = new Queue(DEAD_LETTER_QUEUE, queueOptions);
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalQueuePrefix = process.env.QUEUE_PREFIX;
  let app;
  let worker;
  let workerOutput = '';
  let databaseCreated = false;
  const { request, close } = createHttpTestClient();

  const rejectEventWrites = () =>
    observer.query(`
      CREATE TRIGGER fail_event_write BEFORE INSERT ON research_updates
      FOR EACH ROW EXECUTE FUNCTION fail_event_write();
  `);
  const acceptEventWrites = () =>
    observer.query('DROP TRIGGER fail_event_write ON research_updates');

  async function startWorker() {
    worker = spawn(
      process.execPath,
      [resolve(import.meta.dirname, '../../worker/dist/main.js')],
      {
        cwd: resolve(import.meta.dirname, '../../../'),
        windowsHide: true,
        env: {
          ...process.env,
          DATABASE_URL: database.href,
          QUEUE_PREFIX: prefix,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    worker.stdout.on('data', (chunk) => {
      workerOutput += chunk.toString();
    });
    worker.stderr.on('data', (chunk) => {
      workerOutput += chunk.toString();
    });
    await expect
      .poll(() => queue.getWorkersCount(), { timeout: 10_000 })
      .toBeGreaterThan(0);
  }

  async function sessionCookie(userId) {
    const token = randomUUID();
    await observer.query(
      `INSERT INTO local_credentials(user_id, password_hash, must_change_password)
       VALUES ($1, 'unused-fixture-hash', false)`,
      [userId],
    );
    await observer.query(
      `INSERT INTO user_sessions(
        user_id, auth_method, session_token_hash, authenticated_at, expires_at, idle_expires_at
      ) VALUES ($1, 'LOCAL', $2, now(), now() + interval '1 hour', now() + interval '30 minutes')`,
      [userId, createHash('sha256').update(token).digest('hex')],
    );
    return `researchos_session=${token}`;
  }

  try {
    await admin.connect();
    // All identifiers are generated here and all fixtures are confined to this database.
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await producer.connect();
    await observer.connect();
    await producer.query(
      await readFile(
        new URL('../../../docs/database/ResearchOS.sql', import.meta.url),
        'utf8',
      ),
    );
    await observer.query(`
      CREATE FUNCTION fail_event_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'write failure fixture'; END $$;
    `);
    await rejectEventWrites();
    const actor = randomUUID();
    const output = randomUUID();
    const revision = randomUUID();
    const nextRevision = randomUUID();
    const group = randomUUID();
    const opportunity = randomUUID();
    const seminar = randomUUID();
    const rolledBackSeminar = randomUUID();
    const scheduleSeminar = (id) =>
      producer.query(
        `
      INSERT INTO research_seminars(
        id, organizer_id, title, seminar_type, scheduled_at, published_at, location_or_link
      ) VALUES (
        $1, $2, 'Fixture seminar', 'RESEARCH_SEMINAR', now() + interval '1 day', now(), 'Fixture room'
      )
    `,
        [id, actor],
      );

    await producer.query('BEGIN');
    await producer.query(
      `
      INSERT INTO users(id, user_type, email, full_name, department_unit)
      VALUES ($1, 'FACULTY', 'outbox@example.invalid', 'Outbox fixture', 'Testing')
    `,
      [actor],
    );
    await producer.query(
      "INSERT INTO research_groups(id, code, name, lead_id) VALUES ($1, 'fixture', 'Fixture group', $2)",
      [group, actor],
    );
    await producer.query(
      "INSERT INTO research_outputs(id, owner_id, created_by, visibility) VALUES ($1, $2, $2, 'FPTU_COMMUNITY')",
      [output, actor],
    );
    await producer.query(
      "INSERT INTO output_revisions(id, output_id, revision_no, title, created_by, released_by, released_at) VALUES ($1, $2, 1, 'Initial release', $3, $3, now())",
      [revision, output, actor],
    );
    await producer.query(
      "UPDATE research_outputs SET sharing_status = 'SHARED', first_shared_at = now(), current_release_id = $1 WHERE id = $2",
      [revision, output],
    );
    await producer.query(
      `
      INSERT INTO group_output_links (
        output_id, group_id, requested_revision_id, requested_by, status,
        decided_by, decided_at, accepted_revision_id, accepted_by, accepted_at
      ) VALUES ($1, $2, $3, $4, 'ACCEPTED', $4, now(), $3, $4, now())
    `,
      [output, group, revision, actor],
    );
    await producer.query(
      "INSERT INTO output_revisions(id, output_id, revision_no, title, created_by, released_by, released_at) VALUES ($1, $2, 2, 'Second release', $3, $3, now())",
      [nextRevision, output, actor],
    );
    await producer.query(
      'UPDATE research_outputs SET current_release_id = $1 WHERE id = $2',
      [nextRevision, output],
    );
    await producer.query(
      `
      INSERT INTO research_opportunities(id, creator_id, title, opportunity_kind, expected_role, description, application_deadline)
      VALUES ($1, $2, 'Fixture opportunity', 'PROJECT_FORMATION', 'Researcher', 'Fixture', now() + interval '1 day')
    `,
      [opportunity, actor],
    );
    await producer.query(
      "UPDATE research_opportunities SET status = 'OPEN' WHERE id = $1",
      [opportunity],
    );
    await scheduleSeminar(seminar);
    const { rows: pending } = await producer.query(`
      SELECT p.*, j.queue_prefix FROM pending_research_updates p
      JOIN background_jobs j ON j.id = p.job_id ORDER BY event_key
    `);
    expect(pending.map(({ event_type }) => event_type).sort()).toEqual([
      'OPPORTUNITY_OPENED',
      'OUTPUT_LINKED_TO_GROUP',
      'OUTPUT_REVISION_RELEASED',
      'OUTPUT_SHARED',
      'SEMINAR_PUBLISHED',
    ]);
    expect(pending.map(({ queue_prefix }) => queue_prefix)).toEqual(
      Array(5).fill(UNASSIGNED_RESEARCH_UPDATE_SCOPE),
    );
    expect((await observer.query('SELECT 1 FROM outbox')).rowCount).toBe(0);
    expect(
      (await observer.query('SELECT 1 FROM research_updates')).rowCount,
    ).toBe(0);
    expect(await queue.getJobs(['waiting', 'active', 'delayed'])).toHaveLength(
      0,
    );
    await producer.query('SAVEPOINT protect_references');
    await expect(
      producer.query('DELETE FROM research_seminars WHERE id = $1', [seminar]),
    ).rejects.toMatchObject({ code: '23001' });
    await producer.query('ROLLBACK TO SAVEPOINT protect_references');
    await producer.query('COMMIT');

    await producer.query('BEGIN');
    await scheduleSeminar(rolledBackSeminar);
    await producer.query('ROLLBACK');
    expect(
      (
        await observer.query(
          'SELECT 1 FROM background_jobs WHERE idempotency_key = $1',
          [`seminar:${rolledBackSeminar}`],
        )
      ).rowCount,
    ).toBe(0);

    // The pre-RES-113 dispatcher only sees rows matching QUEUE_PREFIX.
    expect(
      (
        await observer.query(
          `SELECT o.id FROM outbox o JOIN background_jobs j ON j.id = o.job_id
         WHERE j.queue_prefix = $1 AND o.dispatched_at IS NULL`,
          [prefix],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await observer.query('SELECT 1 FROM research_updates')).rowCount,
    ).toBe(0);
    await startWorker();

    await expect
      .poll(
        async () => {
          const transport = await queue.getJob(
            backgroundTransportId(pending[0].job_id, 0),
          );
          return transport?.attemptsMade ?? 0;
        },
        { timeout: 8_000, interval: 25 },
      )
      .toBeGreaterThan(0);
    await acceptEventWrites();
    await expect
      .poll(
        async () =>
          (
            await observer.query(
              "SELECT 1 FROM background_jobs WHERE status = 'COMPLETED'",
            )
          ).rowCount,
        { timeout: 10_000, message: workerOutput },
      )
      .toBe(5);
    const { rows: published } = await observer.query(`
      SELECT event_key, event_type, actor_id, output_id, revision_id, group_id,
        opportunity_id, seminar_id, occurred_at FROM research_updates ORDER BY event_key
    `);
    expect(published).toEqual(
      pending.map(
        ({ job_id: _jobId, queue_prefix: _prefix, ...event }) => event,
      ),
    );
    expect(
      (await observer.query('SELECT 1 FROM pending_research_updates')).rowCount,
    ).toBe(0);

    // Simulate redelivery of a completed generation through the actual queue.
    const transportId = backgroundTransportId(pending[0].job_id, 0);
    expect(await legacyQueue.getJob(transportId)).toBeUndefined();
    const completedTransport = await queue.getJob(transportId);
    await expect.poll(() => completedTransport.getState()).toBe('completed');
    await completedTransport.remove();
    const replay = await queue.add(
      'execute',
      { jobId: pending[0].job_id, generation: 0 },
      { jobId: transportId },
    );
    await expect.poll(() => replay.getState()).toBe('completed');
    expect(
      (await observer.query('SELECT 1 FROM research_updates')).rowCount,
    ).toBe(5);

    const failingSeminar = randomUUID();
    await rejectEventWrites();
    await scheduleSeminar(failingSeminar);
    const failedEventKey = `seminar:${failingSeminar}`;
    const {
      rows: [failedJob],
    } = await observer.query(
      'SELECT job_id, occurred_at FROM pending_research_updates WHERE event_key = $1',
      [failedEventKey],
    );
    const failedTransportId = backgroundTransportId(failedJob.job_id, 0);
    await expect
      .poll(async () => (await queue.getJob(failedTransportId))?.getState(), {
        timeout: 8_000,
      })
      .toBe('failed');
    // Advance the dispatch timestamp past the normal reconciliation interval.
    await observer.query(
      "UPDATE outbox SET dispatched_at = now() - interval '1 minute' WHERE job_id = $1",
      [failedJob.job_id],
    );
    await expect
      .poll(() => deadLetterQueue.getJob(failedTransportId), { timeout: 8_000 })
      .toBeDefined();
    await acceptEventWrites();

    const operator = randomUUID();
    await observer.query(
      `INSERT INTO users(id, user_type, email, full_name, department_unit)
       VALUES ($1, 'STAFF', 'operator@example.invalid', 'Operator', 'Testing')`,
      [operator],
    );
    await observer.query(
      "INSERT INTO user_role_assignments(user_id, role, grant_source) VALUES ($1, 'ADMIN', 'SYSTEM')",
      [operator],
    );
    const ownerCookie = await sessionCookie(actor);
    const operatorCookie = await sessionCookie(operator);
    process.env.DATABASE_URL = database.href;
    process.env.QUEUE_PREFIX = prefix;
    const { AppModule } = await import('../dist/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    const api = request(app.getHttpServer());
    const jobUrl = `/jobs/${failedJob.job_id}`;
    await api.post(`${jobUrl}/retry`).set('Cookie', ownerCookie).expect(403);
    expect(
      (await api.get(jobUrl).set('Cookie', operatorCookie).expect(200)).body
        .status,
    ).toBe('FAILED');
    await api.post(`${jobUrl}/retry`).set('Cookie', operatorCookie).expect(202);
    await expect
      .poll(
        async () =>
          (await api.get(jobUrl).set('Cookie', operatorCookie).expect(200)).body
            .status,
        { timeout: 8_000 },
      )
      .toBe('COMPLETED');
    const publishedAfterRecovery = await observer.query(
      'SELECT occurred_at FROM research_updates WHERE event_key = $1',
      [failedEventKey],
    );
    expect(publishedAfterRecovery.rows).toEqual([
      { occurred_at: failedJob.occurred_at },
    ]);
  } finally {
    close();
    await app?.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalQueuePrefix === undefined) delete process.env.QUEUE_PREFIX;
    else process.env.QUEUE_PREFIX = originalQueuePrefix;
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill('SIGTERM');
      await exited;
    }
    try {
      await queue.obliterate({ force: true });
      await legacyQueue.obliterate({ force: true });
      await deadLetterQueue.obliterate({ force: true });
    } finally {
      await Promise.all([
        producer.end(),
        observer.end(),
        queue.close(),
        legacyQueue.close(),
        deadLetterQueue.close(),
      ]);
      if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin.end();
    }
  }
}, 35_000);
