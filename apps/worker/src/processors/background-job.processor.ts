import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService, type Prisma } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DIGEST_SEND_JOB,
  DURABLE_PROBE_JOB,
  JOB_ATTEMPTS,
  isBackgroundJobPayload,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';

type BackgroundJobOutcome =
  { result: Prisma.InputJsonValue } | { error: Error };

type BackgroundJobContext = {
  job: Prisma.background_jobsGetPayload<undefined>;
  attempts: number;
  tx: Prisma.TransactionClient;
};

type BackgroundJobHandler = (
  context: BackgroundJobContext,
) => BackgroundJobOutcome | Promise<BackgroundJobOutcome>;

const handlers = new Map<string, BackgroundJobHandler>([
  [DURABLE_PROBE_JOB, runDiagnosticProbe],
]);

function unsupportedJob(): BackgroundJobOutcome {
  return {
    error: new UnrecoverableError('Unsupported background job payload'),
  };
}

function runDiagnosticProbe({
  job,
  attempts,
}: BackgroundJobContext): BackgroundJobOutcome {
  const payload = job.payload as { failuresBeforeSuccess?: unknown } | null;
  const failures = payload?.failuresBeforeSuccess;
  if (
    typeof failures !== 'number' ||
    !Number.isInteger(failures) ||
    failures < 0 ||
    failures > JOB_ATTEMPTS
  ) {
    return unsupportedJob();
  }

  // Only the original generation simulates failures. A manual retry can succeed.
  if (job.generation === 0 && attempts <= failures) {
    return { error: new Error('Diagnostic probe simulated transient failure') };
  }

  return { result: { processedAt: new Date().toISOString() } };
}

@Processor(BACKGROUND_QUEUE, { concurrency: 2 })
export class BackgroundJobProcessor extends WorkerHost {
  private readonly logger = new Logger(BackgroundJobProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<BackgroundJobPayload>): Promise<void> {
    if (!isBackgroundJobPayload(job.data)) {
      throw new UnrecoverableError('Invalid background job reference');
    }
    const prefix = this.config.get<string>('QUEUE_PREFIX') ?? 'researchos';
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
        stored.queue_prefix !== prefix ||
        stored.generation !== job.data.generation ||
        stored.status !== 'PENDING'
      )
        return null;
      // An old digest wake-up may still be on this queue during deployment.
      // Its durable outbox entry will be dispatched to the digest queue.
      if (stored.kind === DIGEST_SEND_JOB) return null;

      const handler = handlers.get(stored.kind);

      const attempts = Math.min(
        Math.max(stored.attempts, job.attemptsMade) + 1,
        JOB_ATTEMPTS,
      );
      // DB-only handlers write via tx to commit their side effects with completion.
      // Return expected errors before writing, or throw to roll back partial writes.
      const outcome = handler
        ? await handler({ job: stored, attempts, tx })
        : unsupportedJob();
      const error = 'error' in outcome ? outcome.error : null;
      const terminal =
        error instanceof UnrecoverableError ||
        (error !== null && attempts >= JOB_ATTEMPTS);
      await tx.background_jobs.update({
        where: { id: stored.id },
        data: {
          attempts,
          updated_at: new Date(),
          status: terminal ? 'FAILED' : error ? 'PENDING' : 'COMPLETED',
          error_code: terminal ? 'job_failed' : null,
          ...('result' in outcome ? { result: outcome.result } : {}),
          ...(terminal
            ? {
                outbox: {
                  create: { generation: stored.generation, destination: 'DLQ' },
                },
              }
            : {}),
        },
      });
      return error;
    });
    // Throw only after persisting the failed attempt/DLQ transaction.
    if (failure) throw failure;
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }
}
