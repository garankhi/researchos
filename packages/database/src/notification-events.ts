import { createHash } from 'node:crypto';
import type { Prisma } from './generated/prisma/client.js';
import type {
  notification_subject_type,
  notification_type,
} from './generated/prisma/enums.js';

export const NOTIFICATION_FANOUT_JOB = 'notification-fanout';

export function notificationQueueScope(prefix: string): string {
  return `@notification:${createHash('sha256').update(prefix).digest('hex')}`;
}

export async function stageNotificationEvent(
  tx: Prisma.TransactionClient,
  event: {
    key: string;
    type: notification_type;
    actorId: string | null;
    subjectType: notification_subject_type;
    subjectId: string;
    payload?: Prisma.InputJsonObject;
  },
  prefix = process.env.QUEUE_PREFIX ?? 'researchos',
): Promise<void> {
  await tx.$executeRaw`
    WITH staged AS (
      INSERT INTO notification_events (
        event_key, event_type, actor_id, subject_type, subject_id, payload
      ) VALUES (
        ${event.key}, ${event.type}::notification_type, ${event.actorId}::uuid,
        ${event.subjectType}::notification_subject_type, ${event.subjectId}::uuid,
        ${JSON.stringify(event.payload ?? {})}::jsonb
      )
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    ), job AS (
      INSERT INTO background_jobs (owner_id, kind, idempotency_key, payload, queue_prefix)
      SELECT NULL, ${NOTIFICATION_FANOUT_JOB}, id::text,
        jsonb_build_object('eventId', id), ${notificationQueueScope(prefix)}
      FROM staged
      RETURNING id
    )
    INSERT INTO outbox (job_id, generation)
    SELECT id, 0 FROM job
  `;
}
