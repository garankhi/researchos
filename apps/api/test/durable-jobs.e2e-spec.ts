import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackgroundJobsService, PrismaService } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  DURABLE_PROBE_JOB,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Exercise the same compiled Nest metadata and providers as the deployed apps.
import { AppModule } from '../dist/app.module.js';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from '../dist/common/interceptors/api-response.interceptor.js';
import { OutboxService } from '../../worker/dist/modules/jobs/outbox.service.js';
import { createHttpTestClient } from './http-test-client.js';

describe('durable jobs: HTTP → PostgreSQL outbox → Redis → standalone worker', () => {
  const previousPrefix = process.env.QUEUE_PREFIX;
  const prefix = `durable-e2e-${randomUUID()}`;
  const owners = [randomUUID(), randomUUID(), randomUUID()];
  const tokens = owners.map(() => randomUUID());
  // These fixture grants should already be effective on the PostgreSQL clock.
  const grantedAt = new Date(0);
  const cookie = (index = 0) => `researchos_session=${tokens[index]}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: BackgroundJobsService;
  let config: ConfigService;
  let queue: Queue;
  let dlq: Queue;
  let worker: ChildProcess | undefined;
  let workerOutput = '';
  const { request, close } = createHttpTestClient();

  beforeAll(async () => {
    process.env.QUEUE_PREFIX = prefix;
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorFormat: 'grouped',
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    jobs = app.get(BackgroundJobsService);
    config = app.get(ConfigService);
    const options = createQueueOptions(
      config.getOrThrow<string>('REDIS_URL'),
      prefix,
    );
    queue = new Queue(BACKGROUND_QUEUE, options);
    dlq = new Queue(DEAD_LETTER_QUEUE, options);
    for (let index = 0; index < owners.length; index++) {
      await prisma.users.create({
        data: {
          id: owners[index]!,
          user_type: 'STAFF',
          email: `${owners[index]}@durable-e2e.invalid`,
          full_name: 'Queue fixture',
          department_unit: 'Testing',
          local_credentials: {
            create: {
              password_hash: 'unused-fixture-hash',
              must_change_password: false,
            },
          },
        },
      });
      if (index < 2)
        await prisma.user_role_assignments.create({
          data: {
            user_id: owners[index]!,
            role: 'ADMIN',
            grant_source: 'SYSTEM',
            granted_at: grantedAt,
          },
        });
      const tokenHash = createHash('sha256')
        .update(tokens[index]!)
        .digest('hex');
      await prisma.$executeRaw`
        INSERT INTO user_sessions (
          user_id, auth_method, session_token_hash, authenticated_at,
          expires_at, idle_expires_at
        ) VALUES (
          ${owners[index]}::uuid, 'LOCAL', ${tokenHash}, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '30 minutes'
        )
      `;
    }
  });

  function submit(failuresBeforeSuccess = 0, idempotencyKey = randomUUID()) {
    return request(app.getHttpServer())
      .post('/jobs/probes')
      .set('Cookie', cookie())
      .send({ idempotencyKey, failuresBeforeSuccess });
  }

  async function waitStatus(id: string, status: string) {
    await expect
      .poll(
        async () =>
          (await prisma.background_jobs.findUnique({ where: { id } }))?.status,
        { timeout: 20_000, interval: 100, message: workerOutput },
      )
      .toBe(status);
    return prisma.background_jobs.findUniqueOrThrow({ where: { id } });
  }

  async function startWorker() {
    worker = spawn(
      process.execPath,
      [resolve(import.meta.dirname, '../../worker/dist/main.js')],
      {
        cwd: resolve(import.meta.dirname, '../../../'),
        windowsHide: true,
        env: {
          ...process.env,
          DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
          REDIS_URL: config.getOrThrow<string>('REDIS_URL'),
          QUEUE_PREFIX: prefix,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    worker.stdout?.on('data', (data: Buffer) => {
      workerOutput += data.toString();
    });
    worker.stderr?.on('data', (data: Buffer) => {
      workerOutput += data.toString();
    });
    worker.on('error', (error: Error) => {
      workerOutput += error.message;
    });
    await expect
      .poll(() => queue.getWorkersCount(), { timeout: 15_000 })
      .toBeGreaterThan(0);
  }

  async function stopWorker() {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      const timer = setTimeout(() => worker?.kill('SIGKILL'), 5_000);
      timer.unref();
      worker.kill('SIGTERM');
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    worker = undefined;
  }

  it('creates, lists, and removes follows with real authorization and target visibility', async () => {
    const [callerId, targetId] = owners as [string, string, string];
    const groupId = randomUUID();
    const fieldId = randomUUID();
    const subfieldId = randomUUID();
    const topicId = randomUUID();
    const post = (entityType: string, entityId: string, owner = 0) =>
      request(app.getHttpServer())
        .post('/follows')
        .set('Cookie', cookie(owner))
        .send({ entityType, entityId });
    const list = (owner = 0) =>
      request(app.getHttpServer())
        .get('/follows?limit=1')
        .set('Cookie', cookie(owner));
    const remove = (entityType: string, entityId: string) =>
      request(app.getHttpServer())
        .delete(`/follows/${entityType}/${entityId}`)
        .set('Cookie', cookie());

    try {
      await prisma.user_role_assignments.createMany({
        data: [callerId, targetId].map((user_id) => ({
          user_id,
          role: 'RESEARCHER' as const,
          grant_source: 'SYSTEM' as const,
          granted_at: grantedAt,
        })),
      });
      await prisma.researcher_profiles.create({ data: { user_id: targetId } });
      await prisma.research_groups.create({
        data: {
          id: groupId,
          code: groupId,
          name: 'Follow fixture',
          lead_id: targetId,
        },
      });
      await prisma.research_fields.create({
        data: { id: fieldId, name: fieldId, external_id: fieldId },
      });
      await prisma.research_subfields.create({
        data: {
          id: subfieldId,
          field_id: fieldId,
          name: subfieldId,
          external_id: subfieldId,
        },
      });
      await prisma.research_topics.create({
        data: {
          id: topicId,
          subfield_id: subfieldId,
          name: 'Follow topic',
          created_by: targetId,
        },
      });

      await request(app.getHttpServer()).get('/follows').expect(401);
      await post('GROUP', groupId, 2).expect(403);
      const invalid = await post('UNKNOWN', 'invalid').expect(400);
      expect(invalid.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'entityType', messages: ['entity_type_invalid'] },
          { field: 'entityId', messages: ['entity_id_uuid'] },
        ]),
      );
      const unsupported = await post('OUTPUT', randomUUID()).expect(400);
      expect(unsupported.body.message).toBe('follow_target_type_unsupported');
      const selfFollow = await post(
        'RESEARCHER',
        callerId.toUpperCase(),
      ).expect(400);
      expect(selfFollow.body.message).toBe('follow_self');
      await post('RESEARCHER', targetId).expect(404);
      await post('GROUP', randomUUID()).expect(404);
      await prisma.researcher_profiles.update({
        where: { user_id: targetId },
        data: { profile_confirmed_at: new Date() },
      });
      await post('RESEARCHER', targetId).expect(201);
      await post('TOPIC', topicId).expect(201);
      const concurrent = await Promise.all([
        post('GROUP', groupId),
        post('GROUP', groupId),
      ]);
      expect(
        concurrent.map(({ status }) => status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      expect((await list().expect(200)).body.data.meta.total).toBe(3);
      expect((await list(1).expect(200)).body.data.meta.total).toBe(0);

      await prisma.research_groups.update({
        where: { id: groupId },
        data: { is_active: false, archived_at: new Date() },
      });
      await prisma.researcher_profiles.update({
        where: { user_id: targetId },
        data: { profile_confirmed_at: null },
      });
      const page = (await list().expect(200)).body.data;
      expect(page.meta.total).toBe(1);
      expect(page.items).toMatchObject([
        {
          entityType: 'TOPIC',
          entityId: topicId,
          displayName: 'Follow topic',
          state: 'ACTIVE',
        },
      ]);
      await remove('UNKNOWN', groupId).expect(400);
      await remove('GROUP', groupId).expect(204);
      await remove('GROUP', groupId).expect(204);
      await remove('RESEARCHER', targetId).expect(204);
      await remove('TOPIC', topicId).expect(204);
      expect((await list().expect(200)).body.data.meta.total).toBe(0);
    } finally {
      await prisma.user_follows.deleteMany({
        where: { follower_id: callerId },
      });
      await prisma.research_topics.deleteMany({ where: { id: topicId } });
      await prisma.research_subfields.deleteMany({ where: { id: subfieldId } });
      await prisma.research_fields.deleteMany({ where: { id: fieldId } });
      await prisma.research_groups.deleteMany({ where: { id: groupId } });
      await prisma.researcher_profiles.deleteMany({
        where: { user_id: targetId },
      });
      await prisma.user_role_assignments.deleteMany({
        where: { user_id: { in: [callerId, targetId] }, role: 'RESEARCHER' },
      });
    }
  });

  it('enforces real session, role, input validation and owner isolation', async () => {
    await request(app.getHttpServer())
      .post('/jobs/probes')
      .send({ idempotencyKey: randomUUID() })
      .expect(401)
      .catch((error: Error) => {
        throw new Error('anonymous submit', { cause: error });
      });
    await request(app.getHttpServer())
      .get(`/jobs/${randomUUID()}`)
      .expect(401)
      .catch((error: Error) => {
        throw new Error('anonymous read', { cause: error });
      });
    await request(app.getHttpServer())
      .post(`/jobs/${randomUUID()}/retry`)
      .expect(401)
      .catch((error: Error) => {
        throw new Error('anonymous retry', { cause: error });
      });
    await request(app.getHttpServer())
      .post('/jobs/probes')
      .set('Cookie', cookie(2))
      .send({ idempotencyKey: randomUUID() })
      .expect(403)
      .catch((error: Error) => {
        throw new Error('viewer submit', { cause: error });
      });
    await request(app.getHttpServer())
      .get('/jobs/invalid')
      .set('Cookie', cookie())
      .expect(400)
      .catch((error: Error) => {
        throw new Error('invalid UUID', { cause: error });
      });
    await request(app.getHttpServer())
      .post('/jobs/probes')
      .set('Cookie', cookie())
      .send({ idempotencyKey: randomUUID(), ownerId: owners[1] })
      .expect(400)
      .catch((error: Error) => {
        throw new Error('owner spoof', { cause: error });
      });
    await submit(4)
      .expect(400)
      .catch((error: Error) => {
        throw new Error('invalid count', { cause: error });
      });
    const key = randomUUID();
    const accepted = await submit(0, key).expect(202);
    expect(accepted.body).toMatchObject({
      success: true,
      message: '',
      data: { status: 'PENDING', attempts: 0 },
    });
    const { id, statusUrl } = accepted.body.data;
    expect(statusUrl).toBe(`/jobs/${id}`);
    expect((await submit(0, key).expect(202)).body.data.id).toBe(id);
    await submit(1, key).expect(409);
    await request(app.getHttpServer())
      .get(statusUrl)
      .set('Cookie', cookie())
      .expect(200);
    // The job exists, so another caller is denied access rather than told
    // the job is missing: 404 is reserved for a job that does not exist.
    await request(app.getHttpServer())
      .get(statusUrl)
      .set('Cookie', cookie(1))
      .expect(403);
    await request(app.getHttpServer())
      .get(statusUrl)
      .set('Cookie', cookie(2))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${statusUrl}/retry`)
      .set('Cookie', cookie(1))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${statusUrl}/retry`)
      .set('Cookie', cookie(2))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${statusUrl}/retry`)
      .set('Cookie', cookie())
      .expect(409);
  });

  it('rolls back the owning data write, job and outbox together', async () => {
    const key = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.users.update({
          where: { id: owners[0] },
          data: { full_name: 'Rolled back' },
        });
        const job = await jobs.submitInTransaction(
          tx,
          owners[0]!,
          DURABLE_PROBE_JOB,
          key,
          { failuresBeforeSuccess: 0 },
        );
        // Other transactions cannot see or dispatch the uncommitted job.
        expect(
          await prisma.background_jobs.findUnique({ where: { id: job.id } }),
        ).toBeNull();
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect(
      await prisma.background_jobs.count({ where: { idempotency_key: key } }),
    ).toBe(0);
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: owners[0] } }))
        .full_name,
    ).toBe('Queue fixture');
  });

  it('serializes concurrent idempotent requests into one job and outbox row', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        jobs.submit(owners[0]!, DURABLE_PROBE_JOB, key, {
          failuresBeforeSuccess: 0,
        }),
      ),
    );
    expect(new Set(results.map((job) => job.id)).size).toBe(1);
    expect(
      await prisma.outbox.count({ where: { job_id: results[0]!.id } }),
    ).toBe(1);
  });

  it('keeps publication pending after Redis failure and safely runs concurrent dispatchers', async () => {
    const job = await jobs.submit(owners[0]!, DURABLE_PROBE_JOB, randomUUID(), {
      failuresBeforeSuccess: 0,
    });
    const offline = new OutboxService(
      prisma,
      new ConfigService({
        REDIS_URL: 'redis://127.0.0.1:1',
        QUEUE_PREFIX: prefix,
      }),
    );
    try {
      await expect(offline.dispatchBatch()).rejects.toThrow();
    } finally {
      await offline.onModuleDestroy();
    }
    expect(
      (await prisma.outbox.findFirstOrThrow({ where: { job_id: job.id } }))
        .dispatched_at,
    ).toBeNull();
    const first = new OutboxService(prisma, config);
    const second = new OutboxService(prisma, config);
    try {
      await Promise.all([first.dispatchBatch(), second.dispatchBatch()]);
      expect(
        await queue.getJob(backgroundTransportId(job.id, 0)),
      ).toBeDefined();
      // Simulate add succeeding while the dispatch transaction rolled back.
      await prisma.outbox.updateMany({
        where: { job_id: job.id },
        data: { dispatched_at: null },
      });
      await first.dispatchBatch();
      expect(
        (await queue.getJobs(['waiting'])).filter(
          (entry) => entry.data.jobId === job.id,
        ),
      ).toHaveLength(1);
    } finally {
      await first.onModuleDestroy();
      await second.onModuleDestroy();
    }
  });

  it('processes persisted jobs after worker startup, then deduplicates after Redis retention', async () => {
    const accepted = await submit().expect(202);
    const id = accepted.body.data.id as string;
    await startWorker();
    const completed = await waitStatus(id, 'COMPLETED');
    const transportId = backgroundTransportId(id, 0);
    await expect
      .poll(async () => (await queue.getJob(transportId))?.getState(), {
        timeout: 10_000,
      })
      .toBe('completed');
    await (await queue.getJob(transportId))!.remove();
    await queue.add(
      'execute',
      { jobId: id, generation: 0 },
      { jobId: transportId },
    );
    await expect
      .poll(async () => (await queue.getJob(transportId))?.getState(), {
        timeout: 10_000,
      })
      .toBe('completed');
    const duplicate = await prisma.background_jobs.findUniqueOrThrow({
      where: { id },
    });
    expect(duplicate.result).toEqual(completed.result);
    expect(duplicate.attempts).toBe(1);
    const polled = await request(app.getHttpServer())
      .get(`/jobs/${id}`)
      .set('Cookie', cookie())
      .expect(200);
    expect(polled.body.data.status).toBe('COMPLETED');
    expect(polled.body.data).not.toHaveProperty('payload');
  });

  it('persists terminal failure, publishes a DLQ record and reprocesses one generation', async () => {
    const accepted = await submit(3).expect(202);
    const id = accepted.body.data.id as string;
    const failed = await waitStatus(id, 'FAILED');
    expect(failed.attempts).toBe(3);
    expect(failed.error_code).toBe('job_failed');
    await expect
      .poll(() => dlq.getJob(backgroundTransportId(id, 0)), { timeout: 10_000 })
      .toBeDefined();
    const retries = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post(`/jobs/${id}/retry`)
          .set('Cookie', cookie()),
      ),
    );
    expect(
      retries.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([202, 409]);
    const completed = await waitStatus(id, 'COMPLETED');
    expect(completed.generation).toBe(1);
    expect(completed.attempts).toBe(1);
    expect(await dlq.getJob(backgroundTransportId(id, 0))).toBeDefined();
    // A stale transport delivery cannot rerun an earlier failed generation.
    const old = await queue.getJob(backgroundTransportId(id, 0));
    await old?.remove();
    await queue.add(
      'execute',
      { jobId: id, generation: 0 },
      { jobId: backgroundTransportId(id, 0) },
    );
    await expect
      .poll(
        async () =>
          (await queue.getJob(backgroundTransportId(id, 0)))?.getState(),
        { timeout: 10_000 },
      )
      .toBe('completed');
    expect(
      (await prisma.background_jobs.findUniqueOrThrow({ where: { id } }))
        .result,
    ).toEqual(completed.result);
  });

  it('resumes dispatch after worker restart and repairs missing or stalled-failed transport jobs', async () => {
    await stopWorker();
    const first = await jobs.submit(
      owners[0]!,
      DURABLE_PROBE_JOB,
      randomUUID(),
      { failuresBeforeSuccess: 0 },
    );
    const second = await jobs.submit(
      owners[0]!,
      DURABLE_PROBE_JOB,
      randomUUID(),
      { failuresBeforeSuccess: 0 },
    );
    const repair = await jobs.submit(
      owners[0]!,
      DURABLE_PROBE_JOB,
      randomUUID(),
      { failuresBeforeSuccess: 0 },
    );
    // Simulate vanished Redis state and a BullMQ terminal failure that happened
    // outside the handler (e.g. stalled limit). Neither uses failure events.
    await prisma.outbox.updateMany({
      where: { job_id: { in: [second.id, repair.id] } },
      data: { dispatched_at: new Date(0) },
    });
    const failedTransport = await queue.add(
      'execute',
      { jobId: repair.id, generation: 0 },
      { jobId: backgroundTransportId(repair.id, 0) },
    );
    // Use a real Worker to reach BullMQ's failed state without the DB handler.
    const { Worker } = await import('bullmq');
    const failedWorker = new Worker(
      BACKGROUND_QUEUE,
      async () => {
        throw new Error('stalled fixture');
      },
      {
        ...createQueueOptions(
          config.getOrThrow<string>('REDIS_URL'),
          prefix,
          'worker',
        ),
        concurrency: 1,
      },
    );
    try {
      await expect
        .poll(
          async () => (await queue.getJob(failedTransport.id!))?.getState(),
          { timeout: 10_000 },
        )
        .toBe('failed');
    } finally {
      await failedWorker.close();
    }
    await startWorker();
    await waitStatus(first.id, 'COMPLETED');
    await waitStatus(second.id, 'COMPLETED');
    await waitStatus(repair.id, 'FAILED');
    await expect
      .poll(() => dlq.getJob(backgroundTransportId(repair.id, 0)), {
        timeout: 10_000,
      })
      .toBeDefined();
  });

  afterAll(async () => {
    await stopWorker();
    try {
      await queue?.obliterate({ force: true });
      await dlq?.obliterate({ force: true });
      if (prisma) {
        await prisma.background_jobs.deleteMany({
          where: { owner_id: { in: owners } },
        });
        await prisma.user_sessions.deleteMany({
          where: { user_id: { in: owners } },
        });
        await prisma.user_role_assignments.deleteMany({
          where: { user_id: { in: owners } },
        });
        await prisma.users.deleteMany({ where: { id: { in: owners } } });
      }
    } finally {
      await queue?.close();
      await dlq?.close();
      await app?.close();
      close();
      if (previousPrefix === undefined) delete process.env.QUEUE_PREFIX;
      else process.env.QUEUE_PREFIX = previousPrefix;
    }
  });
});
