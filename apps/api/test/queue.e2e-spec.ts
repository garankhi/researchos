import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createQueueOptions,
  PROBE_JOB,
  SYSTEM_QUEUE,
  type ProbePayload,
  type ProbeResult,
} from '@researchos/queue';
import { AppModule } from '../src/app.module.js';
import { JobsService } from '../src/modules/jobs/jobs.service.js';

describe('API producer → Redis → standalone worker', () => {
  const previousPrefix = process.env.QUEUE_PREFIX;
  const prefix = `researchos-e2e-${randomUUID()}`;
  let app: INestApplicationContext | undefined;
  let producer: JobsService;
  let worker: ChildProcess | undefined;
  let events: QueueEvents | undefined;
  let queue: Queue<ProbePayload, ProbeResult> | undefined;
  let workerOutput = '';

  beforeAll(async () => {
    process.env.QUEUE_PREFIX = prefix;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    producer = app.get(JobsService);
    const config = app.get(ConfigService);
    const redisUrl = config.getOrThrow<string>('REDIS_URL');
    const options = createQueueOptions(redisUrl, prefix, 'worker');
    events = new QueueEvents(SYSTEM_QUEUE, options);
    queue = new Queue(SYSTEM_QUEUE, options);
    events.on('error', (error: Error) => {
      workerOutput += error.message;
    });
    queue.on('error', (error: Error) => {
      workerOutput += error.message;
    });
    await events.waitUntilReady();
    worker = spawn(
      process.execPath,
      [resolve(import.meta.dirname, '../../worker/dist/main.js')],
      {
        cwd: resolve(import.meta.dirname, '../../../'),
        env: {
          ...process.env,
          REDIS_URL: redisUrl,
          DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
          QUEUE_PREFIX: prefix,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
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
  });

  async function completed(requestId: string, failures = 0) {
    const job = await producer.enqueueProbe(requestId, failures);
    const result = await job
      .waitUntilFinished(events!, 20_000)
      .catch((error: Error) => {
        throw new Error(`${error.message}\nWorker output:\n${workerOutput}`, {
          cause: error,
        });
      });
    return { job, result };
  }

  it('processes a job in the real worker process and stores its result', async () => {
    const requestId = randomUUID();
    const { job, result } = await completed(requestId);
    expect(result).toMatchObject({
      requestId,
      workerPid: worker!.pid,
      attempt: 1,
    });
    expect(result.workerPid).not.toBe(process.pid);
    expect(await job.getState()).toBe('completed');
    const stored = await queue!.getJob(job.id!);
    expect(stored?.returnvalue).toEqual(result);
    expect(stored?.progress).toBe(100);
  });

  it('retries a transient failure and succeeds on the next attempt', async () => {
    const { job, result } = await completed(randomUUID(), 1);
    expect(result.attempt).toBe(2);
    const stored = await queue!.getJob(job.id!);
    expect(stored?.attemptsMade).toBe(2);
  });

  it('keeps one retained job when the producer submits the same ID again', async () => {
    const requestId = randomUUID();
    const { job, result } = await completed(requestId);
    const duplicate = await producer.enqueueProbe(requestId);
    expect(duplicate.id).toBe(job.id);
    expect(await duplicate.waitUntilFinished(events!, 5_000)).toEqual(result);
    expect((await queue!.getJob(job.id!))?.attemptsMade).toBe(1);
  });

  it('stops retrying after the configured attempt limit', async () => {
    const job = await producer.enqueueProbe(randomUUID(), 3);
    await expect(job.waitUntilFinished(events!, 20_000)).rejects.toThrow(
      'simulated transient failure',
    );
    const stored = await queue!.getJob(job.id!);
    expect(await stored!.getState()).toBe('failed');
    expect(stored?.attemptsMade).toBe(3);
  });

  it('rejects malformed payloads without retrying them', async () => {
    const job = await queue!.add(PROBE_JOB, {
      requestId: '',
      failuresBeforeSuccess: -1,
    });
    await expect(job.waitUntilFinished(events!, 10_000)).rejects.toThrow(
      'invalid probe payload',
    );
    expect((await queue!.getJob(job.id!))?.attemptsMade).toBe(1);
  });

  it('fails startup within a bounded time when Redis is unavailable', async () => {
    const isolatedProducer = new JobsService(
      new ConfigService({
        REDIS_URL: 'redis://127.0.0.1:1',
        QUEUE_PREFIX: prefix,
      }),
    );
    const started = Date.now();
    try {
      await expect(isolatedProducer.onModuleInit()).rejects.toThrow(
        /timed out|ECONNREFUSED|Connection is closed/,
      );
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await isolatedProducer.onModuleDestroy();
    }
  });

  afterAll(async () => {
    if (worker?.pid && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      const timeout = setTimeout(() => worker?.kill('SIGKILL'), 5_000);
      timeout.unref();
      worker.kill('SIGTERM');
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
    try {
      // Only delete this run's UUID-prefixed queue, never the application's queue.
      await queue?.obliterate({ force: true });
    } finally {
      await events?.close();
      await queue?.close();
      await app?.close();
      if (previousPrefix === undefined) delete process.env.QUEUE_PREFIX;
      else process.env.QUEUE_PREFIX = previousPrefix;
    }
  });
});
