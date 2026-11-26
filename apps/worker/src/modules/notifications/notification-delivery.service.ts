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
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Redis } from 'ioredis';

type Claim = { id: string; attempts: number };
type Outcome =
  | { status: 'SENT'; providerId?: string }
  | { status: 'SKIPPED'; code: string }
  | { status: 'FAILED'; code: string; retry?: boolean; revoke?: boolean };

const maxAttempts = 5;
const deliveryJobKind = 'notification-delivery';

function providerError(error: unknown): Outcome {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'messaging/registration-token-not-registered':
    case 'messaging/invalid-registration-token':
      return { status: 'FAILED', code: 'invalid_device_token', revoke: true };
    case 'messaging/server-unavailable':
    case 'messaging/internal-error':
    case 'messaging/message-rate-exceeded':
    case 'messaging/device-message-rate-exceeded':
      return { status: 'FAILED', code: 'fcm_unavailable', retry: true };
    case 'messaging/authentication-error':
    case 'messaging/mismatched-credential':
      return { status: 'FAILED', code: 'fcm_credentials_invalid' };
    default:
      return { status: 'FAILED', code: 'fcm_outcome_unknown' };
  }
}

@Injectable()
export class NotificationDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private readonly publisher: Redis;
  private readonly prefix: string;
  private readonly firebase?: App;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.prefix = config.get<string>('QUEUE_PREFIX') ?? 'researchos';
    if (config.get<string>('NOTIFICATION_FCM_ENABLED') === 'true') {
      this.firebase = initializeApp(
        {
          credential: cert({
            projectId: config.getOrThrow<string>('NOTIFICATION_FCM_PROJECT_ID'),
            clientEmail: config.getOrThrow<string>(
              'NOTIFICATION_FCM_CLIENT_EMAIL',
            ),
            privateKey: config
              .getOrThrow<string>('NOTIFICATION_FCM_PRIVATE_KEY')
              .replaceAll('\\n', '\n'),
          }),
        },
        'researchos-notification-delivery',
      );
    }
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
    if (this.firebase) await deleteApp(this.firebase);
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
        WHERE (d.status = 'PENDING' AND d.next_attempt_at <= now())
          OR (d.status = 'PROCESSING' AND d.locked_until <= now())
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
      include: { device: true, notification: true },
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
    } else if (delivery.channel === 'WEBSOCKET') {
      outcome =
        preferences?.websocket_enabled === false
          ? { status: 'SKIPPED', code: 'websocket_disabled' }
          : await this.publish(recipientId, notification.id);
    } else if (
      !this.firebase ||
      preferences?.push_enabled === false ||
      !delivery.device?.is_active ||
      delivery.device.user_id !== recipientId
    ) {
      outcome = { status: 'SKIPPED', code: 'push_unavailable' };
    } else {
      try {
        const providerId = await getMessaging(this.firebase).send({
          token: delivery.device.token,
          notification: { title: notification.title, body: notification.body },
          data: { id: notification.id, link: notification.link },
        });
        outcome = { status: 'SENT', providerId };
      } catch (error) {
        outcome = providerError(error);
      }
    }
    await this.finish(
      claim,
      outcome,
      recipientId,
      delivery.device?.id,
      delivery.device?.token,
    );
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

  private async finish(
    claim: Claim,
    outcome: Outcome,
    recipientId: string,
    deviceId?: string,
    token?: string,
  ): Promise<void> {
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
          provider_message_id:
            outcome.status === 'SENT' ? outcome.providerId : undefined,
          sent_at: outcome.status === 'SENT' ? now : null,
          next_attempt_at: retry
            ? new Date(now.getTime() + 30_000 * 2 ** (claim.attempts - 1))
            : undefined,
        },
      });
      if (!count || outcome.status !== 'FAILED') return;
      if (outcome.revoke && deviceId && token) {
        await tx.push_devices.updateMany({
          where: { id: deviceId, user_id: recipientId, token, is_active: true },
          data: { is_active: false, revoked_at: now, updated_at: now },
        });
      }
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
