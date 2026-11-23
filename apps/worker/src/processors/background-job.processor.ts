import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  PrismaService,
  OPPORTUNITY_EXPIRY_JOB,
  RESEARCH_UPDATE_JOB,
  type Prisma,
} from '@researchos/database';
import {
  BACKGROUND_QUEUE,
  DIGEST_SEND_JOB,
  DURABLE_PROBE_JOB,
  JOB_ATTEMPTS,
  RESEARCH_UPDATES_QUEUE,
  isBackgroundJobPayload,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';
import { expireOpportunityBatch } from '../modules/jobs/opportunity-expiry.service.js';
import { researchUpdateScope } from '../modules/jobs/research-update-scope.js';

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

const backgroundJobHandlers = new Map<string, BackgroundJobHandler>([
  [DURABLE_PROBE_JOB, runDiagnosticProbe],
  [OPPORTUNITY_EXPIRY_JOB, runOpportunityExpiry],
  [RESEARCH_UPDATE_JOB, publishResearchUpdate],
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

async function publishResearchUpdate({
  job,
  tx,
}: BackgroundJobContext): Promise<BackgroundJobOutcome> {
  const payload = job.payload as { eventKey?: unknown } | null;
  if (
    typeof payload?.eventKey !== 'string' ||
    payload.eventKey !== job.idempotency_key
  ) {
    return unsupportedJob();
  }

  const [published] = await tx.$queryRaw<Array<{ event_key: string }>>`
    WITH pending AS (
      DELETE FROM pending_research_updates
      WHERE job_id = ${job.id}::uuid AND event_key = ${payload.eventKey}
      RETURNING *
    )
    INSERT INTO research_updates (
      event_key, event_type, actor_id, output_id, revision_id,
      group_id, opportunity_id, seminar_id, occurred_at
    )
    SELECT event_key, event_type, actor_id, output_id, revision_id,
      group_id, opportunity_id, seminar_id, occurred_at FROM pending
    ON CONFLICT (event_key) DO NOTHING
    RETURNING event_key
  `;

  if (!published) {
    const existing = await tx.research_updates.findUnique({
      where: { event_key: payload.eventKey },
      select: { event_key: true },
    });
    if (!existing) return unsupportedJob();
  }
  return { result: { eventKey: payload.eventKey } };
}

async function runOpportunityExpiry({
  job,
  tx,
}: BackgroundJobContext): Promise<BackgroundJobOutcome> {
  const batchSize = (job.payload as { batchSize?: number } | null)?.batchSize;
  if (
    job.owner_id !== null ||
    typeof batchSize !== 'number' ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 1_000
  ) {
    return unsupportedJob();
  }
  await tx.$executeRaw`SAVEPOINT opportunity_expiry`;
  try {
    const result = await expireOpportunityBatch(tx, batchSize);
    await tx.$executeRaw`RELEASE SAVEPOINT opportunity_expiry`;
    return { result };
  } catch {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT opportunity_expiry`;
    return { error: new Error('Opportunity expiry batch failed') };
  }
}

@Injectable()
export class BackgroundJobRunner {
  private readonly logger = new Logger(BackgroundJobRunner.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async process(job: Job<BackgroundJobPayload>, scope: string): Promise<void> {
    if (!isBackgroundJobPayload(job.data)) {
      throw new UnrecoverableError('Invalid background job reference');
    }
    const completed = await this.prisma.$transaction(async (tx) => {
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
        stored.queue_prefix !== scope ||
        stored.generation !== job.data.generation ||
        stored.status !== 'PENDING'
      )
        return null;
      // An old digest wake-up may still be on this queue during deployment.
      // Its durable outbox entry will be dispatched to the digest queue.
      if (stored.kind === DIGEST_SEND_JOB) return null;

      const attempts = Math.min(
        Math.max(stored.attempts, job.attemptsMade) + 1,
        JOB_ATTEMPTS,
      );
      const handler = backgroundJobHandlers.get(stored.kind);
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
      return { error, outcome, attempts, terminal, kind: stored.kind };
    });
    if (completed?.kind === OPPORTUNITY_EXPIRY_JOB) {
      if ('result' in completed.outcome) {
        this.logger.log({
          event: 'opportunity_expiry_completed',
          metrics: completed.outcome.result,
        });
      } else {
        this.logger.warn({
          event: 'opportunity_expiry_failed',
          jobId: job.data.jobId,
          attempt: completed.attempts,
          terminal: completed.terminal,
        });
      }
    }
    // Throw only after persisting the failed attempt/DLQ transaction.
    if (completed?.error) throw completed.error;
  }
}

abstract class ScopedBackgroundProcessor extends WorkerHost {
  private readonly logger = new Logger(this.constructor.name);

  constructor(
    private readonly runner: BackgroundJobRunner,
    private readonly scope: string,
  ) {
    super();
  }

  process(job: Job<BackgroundJobPayload>): Promise<void> {
    return this.runner.process(job, this.scope);
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }
}

@Processor(BACKGROUND_QUEUE, { concurrency: 2 })
export class BackgroundJobProcessor extends ScopedBackgroundProcessor {
  constructor(
    @Inject(BackgroundJobRunner) runner: BackgroundJobRunner,
    @Inject(ConfigService) config: ConfigService,
  ) {
    super(runner, config.get<string>('QUEUE_PREFIX') ?? 'researchos');
  }
}

@Processor(RESEARCH_UPDATES_QUEUE, { concurrency: 2 })
export class ResearchUpdateProcessor extends ScopedBackgroundProcessor {
  constructor(
    @Inject(BackgroundJobRunner) runner: BackgroundJobRunner,
    @Inject(ConfigService) config: ConfigService,
  ) {
    super(
      runner,
      researchUpdateScope(config.get<string>('QUEUE_PREFIX') ?? 'researchos'),
    );
  }
}
