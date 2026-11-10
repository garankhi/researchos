import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService, type Prisma } from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DIGEST_SEND_JOB,
  DURABLE_PROBE_JOB,
  JOB_ATTEMPTS,
  isJobUuid,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';
import { DigestSender } from '../modules/notifications/digest-sender.service.js';

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

type ExternalJobHandler = (
  ref: BackgroundJobPayload,
  prefix: string,
) => Promise<void>;

type RegisteredJobHandler =
  | { mode: 'transactional'; run: BackgroundJobHandler }
  | { mode: 'external'; run: ExternalJobHandler };

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
  private readonly handlers: Map<string, RegisteredJobHandler>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DigestSender) digestSender: DigestSender,
  ) {
    super();
    this.handlers = new Map<string, RegisteredJobHandler>([
      [DURABLE_PROBE_JOB, { mode: 'transactional', run: runDiagnosticProbe }],
      [
        DIGEST_SEND_JOB,
        {
          mode: 'external',
          run: (ref, prefix) => digestSender.process(ref, prefix),
        },
      ],
    ]);
  }

  async process(job: Job<BackgroundJobPayload>): Promise<void> {
    if (
      !isJobUuid(job.data?.jobId) ||
      !Number.isSafeInteger(job.data?.generation) ||
      job.data.generation < 0
    ) {
      throw new UnrecoverableError('Invalid background job reference');
    }
    const prefix = this.config.get<string>('QUEUE_PREFIX') ?? 'researchos';
    const result = await this.prisma.$transaction(async (tx) => {
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
      const handler = this.handlers.get(stored.kind);
      // External handlers acquire their own lease once this row lock is released.
      if (handler?.mode === 'external') return handler.run;

      const attempts = Math.min(
        Math.max(stored.attempts, job.attemptsMade) + 1,
        JOB_ATTEMPTS,
      );
      // DB-only handlers write via tx to commit their side effects with completion.
      // Return expected errors before writing, or throw to roll back partial writes.
      const outcome = handler
        ? await handler.run({ job: stored, attempts, tx })
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
    if (typeof result === 'function') await result(job.data, prefix);
    else if (result) throw result;
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }
}
