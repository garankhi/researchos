import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from '@researchos/config';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import { expect, it } from 'vitest';

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
  const queue = new Queue(BACKGROUND_QUEUE, queueOptions);
  const deadLetterQueue = new Queue(DEAD_LETTER_QUEUE, queueOptions);
  let worker;
  let workerOutput = '';
  let databaseCreated = false;

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
      BEGIN RAISE EXCEPTION 'transient write failure fixture'; END $$;
      CREATE TRIGGER fail_event_write BEFORE INSERT ON research_updates
      FOR EACH ROW EXECUTE FUNCTION fail_event_write();
    `);
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
      "SELECT set_config('researchos.queue_prefix', $1, true)",
      [prefix],
    );
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
    expect(pending.every(({ queue_prefix }) => queue_prefix === prefix)).toBe(
      true,
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
    await producer.query(
      "SELECT set_config('researchos.queue_prefix', $1, true)",
      [prefix],
    );
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
    await observer.query('DROP TRIGGER fail_event_write ON research_updates');
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

    const job = pending[0];
    await observer.query('BEGIN');
    await observer.query(
      "UPDATE background_jobs SET status = 'PENDING', attempts = 0, generation = 1 WHERE id = $1",
      [job.job_id],
    );
    await observer.query(
      'INSERT INTO outbox(job_id, generation) VALUES ($1, 1)',
      [job.job_id],
    );
    await observer.query('COMMIT');
    await expect
      .poll(
        async () =>
          (
            await observer.query(
              'SELECT status FROM background_jobs WHERE id = $1',
              [job.job_id],
            )
          ).rows[0].status,
        { timeout: 10_000 },
      )
      .toBe('COMPLETED');
    expect(
      (await observer.query('SELECT 1 FROM research_updates')).rowCount,
    ).toBe(5);
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill('SIGTERM');
      await exited;
    }
    try {
      await queue.obliterate({ force: true });
      await deadLetterQueue.obliterate({ force: true });
    } finally {
      await Promise.all([
        producer.end(),
        observer.end(),
        queue.close(),
        deadLetterQueue.close(),
      ]);
      if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin.end();
    }
  }
}, 35_000);
