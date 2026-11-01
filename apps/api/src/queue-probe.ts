import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { createQueueOptions, SYSTEM_QUEUE } from '@researchos/queue';
import { AppModule } from './app.module.js';
import { JobsService } from './modules/jobs/jobs.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
app.enableShutdownHooks();
let events: QueueEvents | undefined;
try {
  const config = app.get(ConfigService);
  events = new QueueEvents(
    SYSTEM_QUEUE,
    createQueueOptions(
      config.getOrThrow<string>('REDIS_URL'),
      config.get<string>('QUEUE_PREFIX') ?? 'researchos',
      'worker',
    ),
  );
  events.on('error', (error: Error) => console.error(error.message));
  // waitUntilFinished checks an already-completed job as well as new events.
  const job = await app.get(JobsService).enqueueProbe();
  const result = await job.waitUntilFinished(events, 15_000);
  if (
    result.requestId !== job.data.requestId ||
    result.workerPid === process.pid
  ) {
    throw new Error('Queue probe result did not come from a separate worker');
  }
  console.log(
    JSON.stringify({ jobId: job.id, producerPid: process.pid, ...result }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Queue probe failed');
  process.exitCode = 1;
} finally {
  await events?.close();
  await app.close();
}
