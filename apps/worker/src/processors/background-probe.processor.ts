import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DURABLE_PROBE_JOB,
  JOB_ATTEMPTS,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';

@Processor(BACKGROUND_QUEUE, { concurrency: 2 })
export class BackgroundProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(BackgroundProbeProcessor.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<BackgroundJobPayload>): Promise<void> {
    if (
      !/^[0-9a-f-]{36}$/i.test(job.data?.jobId ?? '') ||
      !Number.isSafeInteger(job.data?.generation) ||
      job.data.generation < 0
    ) {
      throw new UnrecoverableError('Invalid background job reference');
    }
    const failure = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM background_jobs WHERE id = ${job.data.jobId}::uuid FOR UPDATE
      `;
      if (!rows.length) return null;
      const stored = await tx.background_jobs.findUniqueOrThrow({
        where: { id: job.data.jobId },
      });
      // A duplicate, stale generation, or redelivery after Redis retention is
      // harmless even if BullMQ no longer remembers the original transport ID.
      if (
        stored.queue_prefix !==
          (this.config.get<string>('QUEUE_PREFIX') ?? 'researchos') ||
        stored.generation !== job.data.generation ||
        stored.status !== 'PENDING'
      )
        return null;
      const payload = stored.payload as { failuresBeforeSuccess?: unknown };
      const failures = payload?.failuresBeforeSuccess;
      const invalid =
        stored.kind !== DURABLE_PROBE_JOB ||
        !Number.isInteger(failures) ||
        typeof failures !== 'number' ||
        failures < 0 ||
        failures > JOB_ATTEMPTS;
      const attempts = Math.min(
        Math.max(stored.attempts, job.attemptsMade) + 1,
        JOB_ATTEMPTS,
      );
      // Generation zero can simulate exhaustion; explicit reprocessing of a
      // diagnostic job succeeds, demonstrating recovery without editing input.
      const failed =
        invalid || (stored.generation === 0 && attempts <= Number(failures));
      const terminal = invalid || (failed && attempts >= JOB_ATTEMPTS);
      await tx.background_jobs.update({
        where: { id: stored.id },
        data: {
          attempts,
          updated_at: new Date(),
          status: terminal ? 'FAILED' : failed ? 'PENDING' : 'COMPLETED',
          error_code: terminal ? 'job_failed' : null,
          ...(!failed
            ? { result: { processedAt: new Date().toISOString() } }
            : {}),
          ...(terminal
            ? {
                outbox: {
                  create: { generation: stored.generation, destination: 'DLQ' },
                },
              }
            : {}),
        },
      });
      // Real DB-only handlers must perform side effects inside this transaction
      // with the completion update. External providers need a stable business key.
      return failed ? { invalid } : null;
    });
    // Throw only after persisting the failed attempt/DLQ transaction.
    if (failure?.invalid)
      throw new UnrecoverableError('Unsupported background job payload');
    if (failure)
      throw new Error('Diagnostic probe simulated transient failure');
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }
}
