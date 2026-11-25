import { Prisma } from '@researchos/database';
import { isJobUuid } from '@researchos/queue';
import { UnrecoverableError } from 'bullmq';

type Event = Prisma.notification_eventsGetPayload<undefined>;

const copy = {
  CHAT_MENTION: ['Bạn được nhắc đến', 'You were mentioned'],
  DIRECT_MESSAGE: ['Tin nhắn trực tiếp mới', 'New direct message'],
  OUTPUT_SHARED: ['Công trình mới được chia sẻ', 'A research work was shared'],
  REVISION_RELEASED: [
    'Công trình có phiên bản mới',
    'A new revision was released',
  ],
  OUTPUT_LINKED: [
    'Công trình được liên kết với nhóm',
    'A work was linked to a group',
  ],
  OPPORTUNITY_OPENED: ['Cơ hội nghiên cứu mới', 'New research opportunity'],
  SEMINAR_PUBLISHED: ['Hội thảo nghiên cứu mới', 'New research seminar'],
  GROUP_MEMBER_ADDED: [
    'Bạn được thêm vào nhóm nghiên cứu',
    'You were added to a research group',
  ],
  GROUP_MEMBER_REMOVED: [
    'Bạn được gỡ khỏi nhóm nghiên cứu',
    'You were removed from a research group',
  ],
  GROUP_OUTPUT_REQUESTED: [
    'Có yêu cầu liên kết công trình',
    'A work link was requested',
  ],
  GROUP_OUTPUT_ACCEPTED: [
    'Yêu cầu liên kết được chấp nhận',
    'Your work link was accepted',
  ],
  GROUP_OUTPUT_REJECTED: [
    'Yêu cầu liên kết bị từ chối',
    'Your work link was rejected',
  ],
  APPLICATION_RECEIVED: ['Có đơn ứng tuyển mới', 'New application received'],
  APPLICATION_ACCEPTED: [
    'Đơn ứng tuyển được chấp nhận',
    'Your application was accepted',
  ],
  APPLICATION_DECLINED: [
    'Đơn ứng tuyển bị từ chối',
    'Your application was declined',
  ],
  APPLICATION_WITHDRAWN: [
    'Đơn ứng tuyển đã được rút',
    'An application was withdrawn',
  ],
  OPPORTUNITY_EXPIRED: [
    'Cơ hội nghiên cứu đã hết hạn',
    'A research opportunity expired',
  ],
  FOLLOW: ['Bạn có người theo dõi mới', 'You have a new follower'],
  CONVERSATION_PARTICIPANT_ADDED: [
    'Bạn được thêm vào cuộc trò chuyện',
    'You were added to a conversation',
  ],
} satisfies Partial<Record<Event['event_type'], [string, string]>>;

/**
 * The two locales the notification copy is written in.
 */
type NotificationLocale = 'en' | 'vi';

/**
 * Normalizes a locale tag to one of the two copy variants.
 *
 * A regional tag such as `en-GB` resolves to English, and anything the copy
 * does not exist for resolves to Vietnamese.
 */
function normalizeLocale(value: string | undefined): NotificationLocale {
  return value?.trim().toLowerCase().startsWith('en') ? 'en' : 'vi';
}

/**
 * Resolves the locale a recipient's notification is rendered in.
 *
 * The registered push device wins because it describes the screen the
 * notification is actually read on. A recipient without a device falls back
 * to the locale on their notification preferences, so an account that never
 * enabled push still receives readable copy. The final default covers a
 * recipient with neither.
 */
export function resolveLocale({
  device,
  preference,
}: {
  device?: string;
  preference?: string;
}): NotificationLocale {
  return normalizeLocale(device ?? preference);
}

function stringValue(value: Prisma.JsonValue, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const item = value[key];
  return typeof item === 'string' ? item : undefined;
}

async function eligibleUsers(tx: Prisma.TransactionClient, event: Event) {
  const actor = event.actor_id;
  const group = stringValue(event.payload, 'groupId');
  const recipient = stringValue(event.payload, 'recipientId');
  const groupId = isJobUuid(group) ? group : null;
  const recipientId = isJobUuid(recipient) ? recipient : null;
  const subject = event.subject_id;
  if (event.event_type === 'FOLLOW') {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN user_follows f ON f.entity_id = u.id AND f.entity_type = 'RESEARCHER'
      WHERE u.id = ${subject}::uuid AND u.is_active
        AND f.follower_id = ${actor}::uuid AND u.id <> ${actor}::uuid
    `;
  }
  if (event.subject_type === 'APPLICATION') {
    const direct =
      event.event_type === 'APPLICATION_ACCEPTED' ||
      event.event_type === 'APPLICATION_DECLINED';
    const expected = {
      APPLICATION_ACCEPTED: 'ACCEPTED',
      APPLICATION_DECLINED: 'DECLINED',
      APPLICATION_WITHDRAWN: 'WITHDRAWN',
    }[
      event.event_type as
        | 'APPLICATION_ACCEPTED'
        | 'APPLICATION_DECLINED'
        | 'APPLICATION_WITHDRAWN'
    ];
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN opportunity_applications a ON a.id = ${subject}::uuid
      JOIN research_opportunities o ON o.id = a.opportunity_id AND o.archived_at IS NULL
      WHERE u.is_active AND u.id IS DISTINCT FROM ${actor}::uuid
        AND (${expected ?? null}::text IS NULL OR a.status::text = ${expected ?? null})
        AND (${direct} AND u.id = a.applicant_id
          OR NOT ${direct} AND can_manage_opportunity(u.id, o.id))
    `;
  }
  if (event.event_type === 'OPPORTUNITY_EXPIRED') {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN research_opportunities o ON o.id = ${subject}::uuid
      WHERE u.is_active AND o.status = 'EXPIRED' AND o.archived_at IS NULL
        AND can_manage_opportunity(u.id, o.id)
    `;
  }
  if (event.subject_type === 'CONVERSATION') {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN chat_conversation_participants p ON p.user_id = u.id
      JOIN chat_conversations c ON c.id = p.conversation_id
      WHERE u.id = ${recipientId}::uuid AND u.is_active
        AND c.id = ${subject}::uuid AND c.archived_at IS NULL AND NOT p.notification_muted
        AND u.id IS DISTINCT FROM ${actor}::uuid
    `;
  }
  if (event.subject_type === 'GROUP') {
    const added = event.event_type === 'GROUP_MEMBER_ADDED';
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN research_groups g ON g.id = ${subject}::uuid
      WHERE u.id = ${recipientId}::uuid AND u.is_active AND g.archived_at IS NULL
        AND u.id IS DISTINCT FROM ${actor}::uuid
        AND is_group_member(u.id, g.id) = ${added}
    `;
  }
  if (
    event.event_type === 'GROUP_OUTPUT_REQUESTED' ||
    event.event_type === 'GROUP_OUTPUT_ACCEPTED' ||
    event.event_type === 'GROUP_OUTPUT_REJECTED'
  ) {
    const requested = event.event_type === 'GROUP_OUTPUT_REQUESTED';
    const status = requested
      ? 'PENDING'
      : event.event_type === 'GROUP_OUTPUT_ACCEPTED'
        ? 'ACCEPTED'
        : 'REJECTED';
    return tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN group_output_links l ON l.output_id = ${subject}::uuid AND l.group_id = ${groupId}::uuid
      WHERE l.status::text = ${status} AND u.is_active AND u.id IS DISTINCT FROM ${actor}::uuid
        AND can_view_output(u.id, l.output_id)
        AND CASE WHEN ${requested} THEN can_manage_group(u.id, l.group_id)
          ELSE u.id = l.requested_by AND is_group_member(u.id, l.group_id) END
    `;
  }
  if (!actor) return [];
  if (event.subject_type === 'MESSAGE') {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT p.user_id AS id
      FROM chat_messages AS m
      JOIN chat_conversations AS c ON c.id = m.conversation_id
      JOIN chat_conversation_participants AS p ON p.conversation_id = c.id
      JOIN users AS u ON u.id = p.user_id AND u.is_active
      WHERE m.id = ${event.subject_id}::uuid AND m.deleted_at IS NULL
        AND c.archived_at IS NULL AND p.user_id <> ${actor}::uuid
        AND NOT p.notification_muted
        AND CASE WHEN ${event.event_type} = 'CHAT_MENTION' THEN EXISTS (
          SELECT 1 FROM chat_message_mentions AS mention
          WHERE mention.message_id = m.id AND mention.mentioned_user_id = p.user_id
        ) ELSE c.type = 'DIRECT' AND NOT EXISTS (
          SELECT 1 FROM chat_message_mentions AS mention
          WHERE mention.message_id = m.id AND mention.mentioned_user_id = p.user_id
        ) END
    `;
  }

  const visibility =
    event.subject_type === 'OUTPUT'
      ? Prisma.sql`can_view_output(u.id, ${subject}::uuid) AND EXISTS (
          SELECT 1 FROM research_outputs AS o
          WHERE o.id = ${subject}::uuid AND o.sharing_status = 'SHARED'
        )`
      : event.subject_type === 'OPPORTUNITY'
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM research_opportunities AS o
            WHERE o.id = ${subject}::uuid AND o.status = 'OPEN' AND o.archived_at IS NULL
          )`
        : Prisma.sql`EXISTS (
            SELECT 1 FROM research_seminars AS s
            WHERE s.id = ${subject}::uuid AND s.published_at IS NOT NULL
              AND (s.group_id IS NULL OR is_group_member(u.id, s.group_id))
          )`;
  return tx.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT u.id
    FROM users AS u
    WHERE u.is_active AND u.id <> ${actor}::uuid AND ${visibility}
      AND (
        EXISTS (SELECT 1 FROM user_follows AS f WHERE f.follower_id = u.id
          AND ((f.entity_type = 'RESEARCHER' AND f.entity_id = ${actor}::uuid)
            OR (f.entity_type = 'GROUP' AND f.entity_id = ${groupId}::uuid)
            OR (${event.subject_type} = 'OUTPUT' AND f.entity_type = 'TOPIC' AND EXISTS (
              SELECT 1 FROM output_topics AS t
              JOIN research_outputs AS o ON o.id = t.output_id AND o.current_release_id = t.revision_id
              WHERE o.id = ${subject}::uuid AND t.topic_id = f.entity_id
            ))))
        OR (${groupId}::uuid IS NOT NULL AND is_group_member(u.id, ${groupId}::uuid))
      )
  `;
}

export async function fanOutNotification(
  tx: Prisma.TransactionClient,
  payload: Prisma.JsonValue,
) {
  const eventId = stringValue(payload, 'eventId');
  if (!isJobUuid(eventId))
    return {
      error: new UnrecoverableError('Invalid notification event reference'),
    };

  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM notification_events
    WHERE id = ${eventId}::uuid AND processed_at IS NULL FOR UPDATE
  `;
  if (!locked) return { result: { recipients: 0 } };
  const event = await tx.notification_events.findUniqueOrThrow({
    where: { id: eventId },
  });
  const labels = copy[event.event_type as keyof typeof copy];
  const link = stringValue(event.payload, 'link');
  if (!labels || !link)
    return { error: new UnrecoverableError('Unsupported notification event') };

  const recipients = await eligibleUsers(tx, event);
  const ids = recipients.map(({ id }) => id);
  const preferences = await tx.notification_preferences.findMany({
    where: { user_id: { in: ids } },
  });
  const devices = await tx.push_devices.findMany({
    where: { user_id: { in: ids }, is_active: true },
    select: { id: true, user_id: true, locale: true },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });
  const devicesByUser = new Map<string, typeof devices>();
  for (const device of devices) {
    const existing = devicesByUser.get(device.user_id);
    if (existing) existing.push(device);
    else devicesByUser.set(device.user_id, [device]);
  }
  const preferenceById = new Map(
    preferences.map((preference) => [preference.user_id, preference]),
  );
  const actor = event.actor_id
    ? await tx.users.findUnique({
        where: { id: event.actor_id },
        select: { full_name: true },
      })
    : null;
  const rendered = recipients.map(({ id }) => {
    const locale = resolveLocale({
      device: devicesByUser.get(id)?.[0]?.locale,
      preference: preferenceById.get(id)?.locale,
    });
    const title = labels[locale === 'en' ? 1 : 0];
    return {
      recipient_id: id,
      event_key: event.event_key,
      event_type: event.event_type,
      actor_id: event.actor_id,
      subject_type: event.subject_type,
      subject_id: event.subject_id,
      title,
      body: actor?.full_name ?? title,
      link,
      locale,
      content_snapshot: { actorName: actor?.full_name ?? null },
    };
  });
  const created = await tx.notifications.createManyAndReturn({
    data: rendered,
    skipDuplicates: true,
  });
  const deliveries: Prisma.notification_deliveriesCreateManyInput[] = [];
  for (const notification of created) {
    const preference = preferenceById.get(notification.recipient_id);
    if (preference?.muted_types.includes(event.event_type)) continue;
    const notification_id = notification.id;
    if (preference?.websocket_enabled !== false)
      deliveries.push({ notification_id, channel: 'WEBSOCKET' });
    if (preference?.push_enabled !== false) {
      for (const device of devicesByUser.get(notification.recipient_id) ?? []) {
        deliveries.push({
          notification_id,
          channel: 'FCM',
          device_id: device.id,
        });
      }
    }
  }
  await tx.notification_deliveries.createMany({
    data: deliveries,
    skipDuplicates: true,
  });
  await tx.notification_events.update({
    where: { id: eventId },
    data: { processed_at: new Date() },
  });
  return { result: { recipients: created.length } };
}
