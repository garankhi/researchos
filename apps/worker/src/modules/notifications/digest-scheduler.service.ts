import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  BackgroundJobsService,
  PrismaService,
  type Prisma,
} from '@researchos/database';
import { DIGEST_SEND_JOB } from '@researchos/queue';
import type { Queue } from 'bullmq';

export const DIGEST_SCHEDULER_QUEUE = 'digest-scheduler';
export const DIGEST_SCHEDULER_JOB = 'schedule-weekly-digests';
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const RECIPIENT_BATCH_SIZE = 100;

type StagedDelivery = {
  id: string;
  items: {
    output_id: string;
    event_id: string;
    matched_reasons: Prisma.InputJsonArray;
    content_snapshot: Prisma.InputJsonObject;
  }[];
};

@Injectable()
export class DigestScheduler implements OnApplicationBootstrap {
  private readonly prefix: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BackgroundJobsService) private readonly jobs: BackgroundJobsService,
    @InjectQueue(DIGEST_SCHEDULER_QUEUE) private readonly queue: Queue,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.prefix = config.get<string>('QUEUE_PREFIX') ?? 'researchos';
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      DIGEST_SCHEDULER_JOB,
      { every: SWEEP_INTERVAL_MS },
      {
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      },
    );
  }

  async schedule(now: Date) {
    let after: string | undefined;
    for (;;) {
      const recipients: { user_id: string }[] =
        await this.prisma.digest_preferences.findMany({
          where: {
            enabled: true,
            user_id: after ? { gt: after } : undefined,
            users: { is_active: true, user_follows: { some: {} } },
          },
          orderBy: { user_id: 'asc' },
          select: { user_id: true },
          take: RECIPIENT_BATCH_SIZE,
        });
      for (const { user_id } of recipients) {
        await this.stageDelivery(user_id, now);
      }
      if (recipients.length < RECIPIENT_BATCH_SIZE) return;
      after = recipients.at(-1)?.user_id;
    }
  }

  private async stageDelivery(userId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      // Lock the preference while staging so an opt-out and a sweep serialize.
      // Convert both local Monday boundaries separately to account for DST.
      const [delivery] = await tx.$queryRaw<StagedDelivery[]>`
        WITH preference AS MATERIALIZED (
          SELECT p.user_id, COALESCE(tz.name, 'Asia/Ho_Chi_Minh') AS timezone
          FROM digest_preferences p
          LEFT JOIN pg_timezone_names tz ON tz.name = p.timezone
          WHERE p.user_id = ${userId}::uuid AND p.enabled AND is_researcher(p.user_id)
          FOR SHARE OF p
        ), local_week AS (
          SELECT user_id, timezone,
            date_trunc('week', ${now}::timestamptz AT TIME ZONE timezone) AS monday
          FROM preference
        ), period AS MATERIALIZED (
          SELECT user_id, (monday - interval '1 week') AT TIME ZONE timezone AS period_start,
            monday AT TIME ZONE timezone AS period_end
          FROM local_week
        ), matches AS MATERIALIZED (
          SELECT r.output_id, e.id AS event_id, e.occurred_at,
            jsonb_build_object('title', r.title, 'revision_id', r.revision_id) AS content_snapshot,
            jsonb_build_object('entityType', f.entity_type, 'entityId', f.entity_id) AS reason
          FROM period p
          JOIN research_updates e ON e.occurred_at >= p.period_start AND e.occurred_at < p.period_end
          JOIN visible_output_releases(p.user_id) r ON r.output_id = e.output_id
          JOIN user_follows f ON f.follower_id = p.user_id
          WHERE e.event_type IN ('OUTPUT_SHARED', 'OUTPUT_REVISION_RELEASED', 'OUTPUT_LINKED_TO_GROUP')
            AND NOT EXISTS (
              SELECT 1 FROM digest_deliveries d
              WHERE (d.user_id, d.period_start, d.period_end) = (p.user_id, p.period_start, p.period_end)
            )
            AND (
              (f.entity_type = 'RESEARCHER' AND f.entity_id = r.owner_id AND e.group_id IS NULL)
              OR (f.entity_type = 'GROUP' AND (e.group_id IS NULL OR e.group_id = f.entity_id) AND (
                r.scope_group_id = f.entity_id OR EXISTS (
                  SELECT 1 FROM group_output_links l
                  WHERE l.output_id = r.output_id AND l.group_id = f.entity_id
                    AND l.status = 'ACCEPTED' AND l.removed_at IS NULL
                )
              ))
              OR (f.entity_type = 'TOPIC' AND EXISTS (
                SELECT 1 FROM output_topics t
                WHERE t.revision_id = r.revision_id AND t.topic_id = f.entity_id
              ))
            )
        ), latest AS (
          SELECT DISTINCT ON (output_id) output_id, event_id, content_snapshot
          FROM matches ORDER BY output_id, occurred_at DESC, event_id DESC
        ), reasons AS (
          SELECT output_id, jsonb_agg(DISTINCT reason ORDER BY reason) AS matched_reasons
          FROM matches GROUP BY output_id
        ), delivery AS (
          INSERT INTO digest_deliveries (user_id, period_start, period_end)
          SELECT user_id, period_start, period_end FROM period WHERE EXISTS (SELECT 1 FROM latest)
          ON CONFLICT (user_id, period_start, period_end) DO NOTHING
          RETURNING id
        )
        SELECT id, (
          SELECT jsonb_agg(to_jsonb(latest) || to_jsonb(reasons) ORDER BY output_id)
          FROM latest JOIN reasons USING (output_id)
        ) AS items FROM delivery
      `;
      if (!delivery) return;

      await tx.digest_items.createMany({
        data: delivery.items.map((item) => ({
          delivery_id: delivery.id,
          subject_type: 'OUTPUT',
          subject_id: item.output_id,
          event_id: item.event_id,
          matched_reasons: item.matched_reasons,
          content_snapshot: item.content_snapshot,
        })),
      });
      await this.jobs.submitInTransaction(
        tx,
        userId,
        DIGEST_SEND_JOB,
        delivery.id,
        { deliveryId: delivery.id },
        this.prefix,
      );
    });
  }
}
