import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  OPPORTUNITY_EXPIRY_JOB,
  PrismaService,
  stageNotificationEvent,
  type Prisma,
} from '@researchos/database';
import type { Queue } from 'bullmq';

export const OPPORTUNITY_EXPIRY_QUEUE = 'opportunity-expiry';

function positiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  max: number,
) {
  const value = Number(config.get<string>(key) ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${key} must be an integer between 1 and ${max}`);
  }
  return value;
}

@Injectable()
export class OpportunityExpiryService implements OnApplicationBootstrap {
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly prefix: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(OPPORTUNITY_EXPIRY_QUEUE) private readonly queue: Queue,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.intervalMs = positiveInteger(
      config,
      'OPPORTUNITY_EXPIRY_INTERVAL_MS',
      60_000,
      86_400_000,
    );
    this.batchSize = positiveInteger(
      config,
      'OPPORTUNITY_EXPIRY_BATCH_SIZE',
      250,
      1_000,
    );
    this.prefix = config.get<string>('QUEUE_PREFIX') ?? 'researchos';
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(OPPORTUNITY_EXPIRY_JOB, {
      every: this.intervalMs,
    });
  }

  async enqueue(tickId: string) {
    // A replay of the same tick can only create one durable job and work entry.
    await this.prisma.$executeRaw`
      WITH sweep AS (
        INSERT INTO background_jobs (kind, idempotency_key, payload, queue_prefix)
        SELECT ${OPPORTUNITY_EXPIRY_JOB}, ${tickId}, ${JSON.stringify({ batchSize: this.batchSize })}::jsonb, ${this.prefix}
        WHERE EXISTS (
          SELECT 1 FROM research_opportunities
          WHERE status = 'OPEN' AND application_deadline <= statement_timestamp()
        )
        ON CONFLICT (queue_prefix, kind, idempotency_key) WHERE owner_id IS NULL DO NOTHING
        RETURNING id
      )
      INSERT INTO outbox (job_id, generation) SELECT id, 0 FROM sweep
    `;
  }
}

export async function expireOpportunityBatch(
  tx: Prisma.TransactionClient,
  batchSize: number,
) {
  const expired = await tx.$queryRaw<
    Array<{ id: string; deadline: Date; effective_expiry: string }>
  >`
    WITH due AS (
      SELECT id
      FROM research_opportunities
      WHERE status = 'OPEN' AND application_deadline <= statement_timestamp()
      ORDER BY application_deadline, id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE research_opportunities o SET status = 'EXPIRED'
    FROM due
    WHERE o.id = due.id AND o.status = 'OPEN' AND o.application_deadline <= statement_timestamp()
    RETURNING o.id, o.application_deadline AS deadline, to_jsonb(o.application_deadline) #>> '{}' AS effective_expiry
  `;
  const [processing] = await tx.$queryRaw<
    [{ now: Date }]
  >`SELECT clock_timestamp() AS now`;
  if (expired.length) {
    for (const { id, effective_expiry } of expired) {
      await stageNotificationEvent(tx, {
        key: `opportunity-expired:${id}:${effective_expiry}`,
        type: 'OPPORTUNITY_EXPIRED',
        actorId: null,
        subjectType: 'OPPORTUNITY',
        subjectId: id,
        payload: { link: `/opportunities/${id}` },
      });
    }
    await tx.auditLog.createMany({
      data: expired.map(({ id, effective_expiry }) => ({
        actorId: null,
        action: 'OPPORTUNITY_STATUS_CHANGED',
        entity: 'research_opportunities',
        entityId: id,
        createdAt: processing.now,
        payload: {
          fromStatus: 'OPEN',
          toStatus: 'EXPIRED',
          reason: 'APPLICATION_DEADLINE_REACHED',
          effectiveExpiryAt: effective_expiry,
          processedAt: processing.now.toISOString(),
        },
      })),
    });
  }
  return {
    changed: expired.length,
    maxLagMs: expired.reduce(
      (max, row) =>
        Math.max(max, processing.now.getTime() - row.deadline.getTime()),
      0,
    ),
  };
}
