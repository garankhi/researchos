import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  createQueueOptions,
  PROBE_JOB,
  SYSTEM_QUEUE,
  type ProbePayload,
  type ProbeResult,
} from '@researchos/queue';

/** API-side producer. It enqueues work; it never runs the processor. */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue<ProbePayload, ProbeResult, typeof PROBE_JOB>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(
      SYSTEM_QUEUE,
      createQueueOptions(
        this.config.getOrThrow<string>('REDIS_URL'),
        this.config.get<string>('QUEUE_PREFIX') ?? 'researchos',
      ),
    );
    this.queue.on('error', (error: Error) => this.logger.error(error.message));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis connection timed out')),
            5_000,
          );
          timeout.unref();
        }),
      ]);
    } catch (error) {
      const queue = this.queue;
      this.queue = undefined;
      await queue.close().catch(() => {
        this.logger.warn(
          'Could not close the queue after initialization failed',
        );
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  enqueueProbe(requestId = randomUUID(), failuresBeforeSuccess = 0) {
    if (!this.queue) {
      throw new Error('Queue producer has not been initialized');
    }
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId) ||
      !Number.isInteger(failuresBeforeSuccess) ||
      failuresBeforeSuccess < 0 ||
      failuresBeforeSuccess > 3
    ) {
      throw new Error('Invalid queue probe parameters');
    }
    return this.queue.add(
      PROBE_JOB,
      { requestId, failuresBeforeSuccess },
      {
        jobId: requestId,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
