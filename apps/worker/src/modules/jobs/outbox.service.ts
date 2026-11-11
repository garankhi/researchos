import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaService,
  RESEARCH_UPDATE_JOB,
  UNASSIGNED_RESEARCH_UPDATE_SCOPE,
} from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { researchUpdateScope } from './research-update-scope.js';

/** DB row locks coordinate dispatchers. A crash after add but before commit
 * republishes the same transport ID; the processor also deduplicates in SQL. */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopping = false;
  private readonly connection: Redis;
  private readonly work: Queue;
  private readonly researchUpdates: Queue;
  private readonly deadLetters: Queue;
  private readonly prefix: string;
  private readonly researchScope: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const options = createQueueOptions(
      config.getOrThrow<string>('REDIS_URL'),
      config.get<string>('QUEUE_PREFIX') ?? 'researchos',
    );
    this.prefix = options.prefix!;
    this.researchScope = researchUpdateScope(this.prefix);
    this.connection = new Redis(options.connection);
    const queueOptions = { ...options, connection: this.connection };
    this.work = new Queue(BACKGROUND_QUEUE, queueOptions);
    this.researchUpdates = new Queue(RESEARCH_UPDATES_QUEUE, queueOptions);
    this.deadLetters = new Queue(DEAD_LETTER_QUEUE, queueOptions);
    for (const queue of [this.work, this.researchUpdates, this.deadLetters]) {
      queue.on('error', (error: Error) => this.logger.error(error.message));
    }
  }

  onModuleInit(): void {
    this.schedule(0);
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.active = this.dispatchBatch()
        .catch((error: unknown) =>
          this.logger.error(
            error instanceof Error ? error.message : 'Outbox dispatch failed',
          ),
        )
        .finally(() => this.schedule(500));
    }, delay);
    this.timer.unref();
  }

  async dispatchBatch(): Promise<void> {
    // An unconnected BullMQ client's readiness promise keeps reconnecting even
    // with maxRetriesPerRequest=1. Bound that wait before taking any SQL locks.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          this.work.waitUntilReady(),
          this.researchUpdates.waitUntilReady(),
          this.deadLetters.waitUntilReady(),
        ]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Outbox Redis connection timed out')),
            5_000,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    await this.assignResearchUpdates();
    // Publication uses fail-fast producer connections, never an unbounded
    // worker connection while holding a database transaction open.
    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            job_id: string;
            generation: number;
            destination: string;
            dispatched_at: Date | null;
            queue_prefix: string;
          }[]
        >`
        SELECT o.*, j.queue_prefix
        FROM outbox o JOIN background_jobs j ON j.id = o.job_id
        WHERE j.queue_prefix IN (${this.prefix}, ${this.researchScope})
          AND o.available_at <= now() AND (
          o.dispatched_at IS NULL OR (
            o.destination = 'WORK' AND j.status = 'PENDING'
            AND o.generation = j.generation
            AND o.dispatched_at < now() - interval '30 seconds'
          )
        ) ORDER BY o.available_at LIMIT 10 FOR UPDATE OF o SKIP LOCKED
      `;
        for (const row of rows) {
          const work =
            row.queue_prefix === this.researchScope
              ? this.researchUpdates
              : this.work;
          const queue = row.destination === 'DLQ' ? this.deadLetters : work;
          const transportId = backgroundTransportId(row.job_id, row.generation);
          const existing = await queue.getJob(transportId);
          if (
            row.destination === 'WORK' &&
            existing &&
            (await existing.getState()) === 'failed'
          ) {
            // Includes jobs BullMQ failed after exceeding its stalled-job limit,
            // or a process/database failure on the final attempt.
            const changed = await tx.background_jobs.updateMany({
              where: {
                id: row.job_id,
                generation: row.generation,
                status: 'PENDING',
              },
              data: {
                status: 'FAILED',
                error_code: 'job_failed',
                updated_at: new Date(),
              },
            });
            if (changed.count)
              await tx.outbox.createMany({
                data: [
                  {
                    job_id: row.job_id,
                    generation: row.generation,
                    destination: 'DLQ',
                  },
                ],
                skipDuplicates: true,
              });
          } else if (!existing) {
            await queue.add(
              row.destination === 'DLQ' ? 'dead-letter' : 'execute',
              {
                jobId: row.job_id,
                generation: row.generation,
              },
              {
                jobId: transportId,
                ...(row.destination === 'DLQ'
                  ? { removeOnComplete: false, removeOnFail: false }
                  : {}),
              },
            );
          }
          await tx.outbox.update({
            where: { id: row.id },
            data: { dispatched_at: new Date() },
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  private async assignResearchUpdates(): Promise<void> {
    // Commit routing before publishing to Redis so a worker can safely handle
    // a transport job even if dispatch crashes before marking it published.
    await this.prisma.$executeRaw`
      WITH unassigned AS (
        SELECT j.id FROM outbox o JOIN background_jobs j ON j.id = o.job_id
        WHERE o.dispatched_at IS NULL AND o.destination = 'WORK'
          AND o.available_at <= now() AND o.generation = j.generation
          AND j.kind = ${RESEARCH_UPDATE_JOB}
          AND j.queue_prefix = ${UNASSIGNED_RESEARCH_UPDATE_SCOPE}
        ORDER BY o.available_at, o.id LIMIT 10 FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE background_jobs j SET queue_prefix = ${this.researchScope}
      FROM unassigned WHERE j.id = unassigned.id
    `;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.active;
    this.connection.disconnect();
    await Promise.all([
      this.work.close(),
      this.researchUpdates.close(),
      this.deadLetters.close(),
    ]);
  }
}
