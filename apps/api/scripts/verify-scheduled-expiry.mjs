import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  SYSTEM_QUEUE,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';

export async function verifyScheduledExpiry({
  db,
  databaseUrl,
  redisUrl,
  ownerId,
}) {
  const prefix = `opportunity-expiry-test-${randomUUID()}`;
  const options = createQueueOptions(redisUrl, prefix);
  const work = new Queue(BACKGROUND_QUEUE, options);
  const schedules = new Queue('opportunity-expiry', options);
  const queues = [
    work,
    schedules,
    ...[SYSTEM_QUEUE, DEAD_LETTER_QUEUE, RESEARCH_UPDATES_QUEUE].map(
      (name) => new Queue(name, options),
    ),
  ];
  const workers = new Set();
  let workerOutput = '';

  async function until(label, predicate) {
    const timeout = Date.now() + 20_000;
    while (Date.now() < timeout) {
      if (await predicate()) return;
      await wait(100);
    }
    throw new Error(`${label} timed out\n${workerOutput}`);
  }

  function startWorker() {
    const worker = spawn(
      process.execPath,
      [fileURLToPath(new URL('../../worker/dist/main.js', import.meta.url))],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        windowsHide: true,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          REDIS_URL: redisUrl,
          QUEUE_PREFIX: prefix,
          OPPORTUNITY_EXPIRY_INTERVAL_MS: '1000',
          OPPORTUNITY_EXPIRY_BATCH_SIZE: '1',
          DIGEST_SMTP_ENABLED: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    workers.add(worker);
    for (const stream of [worker.stdout, worker.stderr]) {
      stream.on('data', (chunk) => {
        workerOutput += chunk.toString();
      });
    }
    worker.on('error', (error) => {
      workerOutput += error.message;
    });
  }

  async function stopWorkers() {
    await Promise.all(
      [...workers].map(async (worker) => {
        if (worker.exitCode !== null || worker.signalCode !== null) return;
        const exited = once(worker, 'exit');
        const timeout = setTimeout(() => worker.kill('SIGKILL'), 5_000);
        timeout.unref();
        worker.kill();
        try {
          await exited;
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
    workers.clear();
  }

  async function createOpportunity() {
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO research_opportunities
        (creator_id, title, description, opportunity_kind, application_deadline)
        VALUES ($1, 'Scheduled expiry', 'Worker fixture', 'RESEARCH_COLLABORATION', now()+interval '1 day')
        RETURNING id`,
      [ownerId],
    );
    await db.query(
      "UPDATE research_opportunities SET status='OPEN' WHERE id=$1",
      [row.id],
    );
    return row.id;
  }

  async function setDue(id) {
    await db.query(
      'UPDATE research_opportunities SET application_deadline=clock_timestamp() WHERE id=$1',
      [id],
    );
  }

  async function state(id) {
    const {
      rows: [row],
    } = await db.query(
      `SELECT o.status,
        EXISTS (SELECT 1 FROM search_index s WHERE s.entity_id=o.id AND s.entity_type='OPPORTUNITY') AS indexed,
        (SELECT count(*)::int FROM audit_logs a WHERE a.entity_id=o.id::text
          AND a.payload->>'toStatus'='EXPIRED') AS audits
      FROM research_opportunities o WHERE o.id=$1`,
      [id],
    );
    return row;
  }

  try {
    const overdue = await createOpportunity();
    const boundary = await createOpportunity();
    const extended = await createOpportunity();
    startWorker();
    await until(
      'idle schedule tick completed',
      async () => (await schedules.getCompletedCount()) > 0,
    );
    const { rowCount: idleJobs } = await db.query(
      'SELECT 1 FROM background_jobs WHERE queue_prefix=$1',
      [prefix],
    );
    assert.equal(
      idleJobs,
      0,
      'idle ticks must not create durable jobs or outbox rows',
    );
    await stopWorkers();
    for (const id of [overdue, boundary, extended]) await setDue(id);

    // Hold the row across competing workers, then commit the new deadline.
    const extension = new db.constructor({ connectionString: databaseUrl });
    await extension.connect();
    try {
      await extension.query('BEGIN');
      await extension.query(
        "UPDATE research_opportunities SET application_deadline=clock_timestamp()+interval '1 day' WHERE id=$1",
        [extended],
      );
      startWorker();
      startWorker();
      await until(
        'two workers registered',
        async () => (await work.getWorkersCount()) >= 2,
      );
      await until(
        'two bounded batches committed',
        async () =>
          (await state(overdue)).status === 'EXPIRED' &&
          (await state(boundary)).status === 'EXPIRED',
      );
      await extension.query('COMMIT');
    } finally {
      await extension.end();
    }
    assert.deepEqual(await state(extended), {
      status: 'OPEN',
      indexed: true,
      audits: 0,
    });
    for (const id of [overdue, boundary]) {
      assert.deepEqual(await state(id), {
        status: 'EXPIRED',
        indexed: false,
        audits: 1,
      });
    }
    const { rowCount: correctAudit } = await db.query(
      `SELECT 1 FROM audit_logs a JOIN research_opportunities o ON a.entity_id=o.id::text
       WHERE o.id = ANY($1::uuid[]) AND a.actor_id IS NULL
         AND (a.payload->>'effectiveExpiryAt')::timestamptz = o.application_deadline
         AND (a.payload->>'processedAt')::timestamptz = a.created_at
         AND a.created_at >= date_trunc('milliseconds', o.application_deadline)`,
      [[overdue, boundary]],
    );
    assert.equal(correctAudit, 2);
    const { rows: completed } = await db.query(
      "SELECT * FROM background_jobs WHERE queue_prefix=$1 AND status='COMPLETED' AND (result->>'changed')::int = 1",
      [prefix],
    );
    assert.equal(completed.length, 2);
    // Resend the durable reference after BullMQ forgets the transport job.
    const [sweep] = completed;
    const transportId = backgroundTransportId(sweep.id, sweep.generation);
    await until(
      'original transport job completed',
      async () => (await work.getJobState(transportId)) === 'completed',
    );
    assert.equal(await work.remove(transportId), 1);
    await work.add(
      'execute',
      { jobId: sweep.id, generation: sweep.generation },
      { jobId: transportId },
    );
    await until(
      'duplicate delivery consumed',
      async () => (await work.getJobState(transportId)) === 'completed',
    );
    assert.equal((await state(overdue)).audits, 1);

    await stopWorkers();
    const restart = await createOpportunity();
    await setDue(restart);
    assert.deepEqual(await state(restart), {
      status: 'OPEN',
      indexed: true,
      audits: 0,
    });
    await db.query(`
      CREATE FUNCTION reject_expiry_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Integration fixture rolls back expiry audit';
      END $$;
      CREATE TRIGGER reject_expiry_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW WHEN (NEW.payload->>'toStatus'='EXPIRED')
      EXECUTE FUNCTION reject_expiry_audit();
    `);
    startWorker();
    await until(
      'failed sweep visible in the durable job store',
      async () =>
        (
          await db.query(
            "SELECT 1 FROM background_jobs WHERE queue_prefix=$1 AND status='FAILED' AND attempts=3",
            [prefix],
          )
        ).rowCount > 0,
    );
    assert.deepEqual(await state(restart), {
      status: 'OPEN',
      indexed: true,
      audits: 0,
    });
    await db.query('DROP TRIGGER reject_expiry_audit ON audit_logs');
    await until(
      'restart catches up successfully',
      async () => (await state(restart)).status === 'EXPIRED',
    );
    assert.deepEqual(await state(restart), {
      status: 'EXPIRED',
      indexed: false,
      audits: 1,
    });
  } finally {
    await stopWorkers();
    await Promise.all(
      queues.map(async (queue) => {
        try {
          await queue.obliterate({ force: true });
        } finally {
          await queue.close();
        }
      }),
    );
  }
}
