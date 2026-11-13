import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  DIGEST_QUEUE,
  DIGEST_SEND_JOB,
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
  private readonly digestWork?: Queue;
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
    if (config.get<string>('DIGEST_SMTP_ENABLED') === 'true') {
      this.digestWork = new Queue(DIGEST_QUEUE, queueOptions);
    }
    for (const queue of [
      this.work,
      this.researchUpdates,
      this.deadLetters,
      this.digestWork,
    ]) {
      queue?.on('error', (error: Error) => this.logger.error(error.message));
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
          this.digestWork?.waitUntilReady(),
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
            kind: string;
            queue_prefix: string;
          }[]
        >`
        SELECT o.*, j.kind, j.queue_prefix
        FROM outbox o JOIN background_jobs j ON j.id = o.job_id
        LEFT JOIN digest_deliveries d ON d.id = CASE
          WHEN j.kind = ${DIGEST_SEND_JOB} AND j.payload->>'deliveryId' ~*
            '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
          THEN (j.payload->>'deliveryId')::uuid END AND d.user_id = j.owner_id
        WHERE j.queue_prefix IN (${this.prefix}, ${this.researchScope})
          AND o.available_at <= now() AND (
          o.dispatched_at IS NULL OR (
            o.destination = 'WORK' AND j.status = 'PENDING'
            AND o.generation = j.generation
            AND o.dispatched_at < now() - interval '30 seconds'
          )
        ) AND (
          o.destination <> 'WORK' OR j.kind <> ${DIGEST_SEND_JOB} OR (
            j.queue_prefix = ${this.prefix} AND ${this.digestWork !== undefined}
            AND (d.id IS NULL OR d.status IN ('SENT', 'CANCELLED') OR (
              d.next_attempt_at <= now() AND (d.locked_until IS NULL OR d.locked_until <= now())
            ))
          )
        ) ORDER BY o.available_at LIMIT 10 FOR UPDATE OF o SKIP LOCKED
      `;
        for (const row of rows) {
          const digest = row.kind === DIGEST_SEND_JOB;
          const work =
            row.queue_prefix === this.researchScope
              ? this.researchUpdates
              : this.work;
          const queue =
            row.destination === 'DLQ'
              ? this.deadLetters
              : digest
                ? this.digestWork
                : work;
          if (!queue) continue;
          const transportId = backgroundTransportId(row.job_id, row.generation);
          const existing = await queue.getJob(transportId);
          if (
            row.destination === 'WORK' &&
            !digest &&
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
                  : digest
                    ? {
                        attempts: 1,
                        removeOnComplete: true,
                        removeOnFail: true,
                      }
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

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.active;
    this.connection.disconnect();
    await Promise.all([
      this.work.close(),
      this.researchUpdates.close(),
      this.deadLetters.close(),
      this.digestWork?.close(),
    ]);
  }
}
