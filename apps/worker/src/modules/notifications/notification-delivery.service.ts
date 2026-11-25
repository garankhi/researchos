import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOTIFICATION_FANOUT_JOB,
  PrismaService,
  notificationQueueScope,
} from '@researchos/database';
import {
  createQueueOptions,
  notificationRedisChannel,
} from '@researchos/queue';
import { Redis } from 'ioredis';

type Claim = { id: string; attempts: number };
type Outcome =
  | { status: 'SENT' }
  | { status: 'SKIPPED'; code: string }
  | { status: 'FAILED'; code: string; retry?: boolean };

const maxAttempts = 5;
const deliveryJobKind = 'notification-delivery';

@Injectable()
export class NotificationDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private readonly publisher: Redis;
  private readonly prefix: string;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.prefix = config.get<string>('QUEUE_PREFIX') ?? 'researchos';
    this.publisher = new Redis(
      createQueueOptions(config.getOrThrow<string>('REDIS_URL'), this.prefix)
        .connection,
    );
    this.publisher.on('error', () =>
      this.logger.warn('Notification publisher unavailable'),
    );
  }

  onModuleInit(): void {
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    this.publisher.disconnect();
    await this.running;
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.processBatch()
        .catch((error: unknown) =>
          this.logger.warn(
            `Could not process notification deliveries (${error instanceof Error ? error.name : 'unknown error'})`,
          ),
        )
        .finally(() => this.schedule(500));
    }, delay);
    this.timer.unref();
  }

  private async processBatch(): Promise<void> {
    const scope = notificationQueueScope(this.prefix);
    const claims = await this.prisma.$queryRaw<Claim[]>`
      WITH ready AS (
        SELECT d.id FROM notification_deliveries AS d
        JOIN notifications AS n ON n.id = d.notification_id
        JOIN notification_events AS e ON e.event_key = n.event_key
        JOIN background_jobs AS j ON j.idempotency_key = e.id::text
          AND j.kind = ${NOTIFICATION_FANOUT_JOB} AND j.queue_prefix = ${scope}
        WHERE d.channel = 'WEBSOCKET' AND (
          (d.status = 'PENDING' AND d.next_attempt_at <= now())
          OR (d.status = 'PROCESSING' AND d.locked_until <= now())
        )
        ORDER BY d.next_attempt_at, d.id LIMIT 10 FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE notification_deliveries AS d
      SET status = 'PROCESSING', attempts = d.attempts + 1,
        locked_until = now() + interval '5 minutes'
      FROM ready WHERE d.id = ready.id
      RETURNING d.id, d.attempts
    `;
    const results = await Promise.allSettled(
      claims.map((claim) => this.process(claim)),
    );
    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn(
        'One or more notification deliveries will be retried after the lease expires',
      );
    }
  }

  private async process(claim: Claim): Promise<void> {
    const delivery = await this.prisma.notification_deliveries.findUnique({
      where: { id: claim.id },
      include: { notification: true },
    });
    if (!delivery) return;
    const recipientId = delivery.notification.recipient_id;
    const preferences = await this.prisma.notification_preferences.findUnique({
      where: { user_id: recipientId },
    });
    const notification = delivery.notification;
    let outcome: Outcome;
    if (claim.attempts > maxAttempts) {
      outcome = { status: 'FAILED', code: 'delivery_lease_expired' };
    } else if (
      notification.archived_at ||
      preferences?.muted_types.includes(notification.event_type)
    ) {
      outcome = { status: 'SKIPPED', code: 'notification_muted' };
    } else {
      outcome =
        preferences?.websocket_enabled === false
          ? { status: 'SKIPPED', code: 'websocket_disabled' }
          : await this.publish(recipientId, notification.id);
    }
    await this.finish(claim, outcome);
  }

  private async publish(
    recipientId: string,
    notificationId: string,
  ): Promise<Outcome> {
    try {
      const subscribers = await this.publisher.publish(
        notificationRedisChannel(this.prefix),
        JSON.stringify({ recipientId, notificationId }),
      );
      if (subscribers > 0) return { status: 'SENT' };
    } catch {
      // The inbox stays available even when live delivery must retry.
    }
    return { status: 'FAILED', code: 'websocket_unavailable', retry: true };
  }

  private async finish(claim: Claim, outcome: Outcome): Promise<void> {
    const retry =
      outcome.status === 'FAILED' &&
      outcome.retry &&
      claim.attempts < maxAttempts;
    const code = outcome.status === 'SENT' ? null : outcome.code;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notification_deliveries.updateMany({
        where: { id: claim.id, status: 'PROCESSING', attempts: claim.attempts },
        data: {
          status: retry ? 'PENDING' : outcome.status,
          locked_until: null,
          last_error: code,
          sent_at: outcome.status === 'SENT' ? now : null,
          next_attempt_at: retry
            ? new Date(now.getTime() + 30_000 * 2 ** (claim.attempts - 1))
            : undefined,
        },
      });
      if (!count || outcome.status !== 'FAILED') return;
      if (!retry) {
        await tx.background_jobs.create({
          data: {
            kind: deliveryJobKind,
            idempotency_key: claim.id,
            queue_prefix: notificationQueueScope(this.prefix),
            payload: { deliveryId: claim.id },
            status: 'FAILED',
            error_code: code,
            attempts: claim.attempts,
            outbox: { create: { destination: 'DLQ', generation: 0 } },
          },
        });
      }
    });
  }
}
