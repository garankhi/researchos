import type {
  ChatMessageDeletedEventPayload,
  ChatMessagePayload,
  ChatReactionSummaryPayload,
  ChatReactionUpdatedEventPayload,
  ChatReadUpdatedEventPayload,
  ChatReceiptUpdatedEventPayload,
} from '@researchos/chat';
import type { ChatUiMessage } from '../types';

/**
 * Merges paginated REST history, live Socket.IO messages, and optimistic
 * client messages into one deduplicated chronological array.
 *
 * - Persisted messages are keyed by stable `id`.
 * - Optimistic messages whose `(senderId, clientNonce)` already match a
 *   persisted message are dropped so retries/acks never create duplicates.
 */
export function mergeChatMessages(
  olderPages: ChatMessagePayload[][],
  initialPage: ChatMessagePayload[],
  liveById: ReadonlyMap<string, ChatMessagePayload>,
  optimistic: ChatUiMessage[],
): ChatUiMessage[] {
  const byId = new Map<string, ChatUiMessage>();

  for (const page of olderPages) {
    for (const msg of page) {
      byId.set(msg.id, msg);
    }
  }
  for (const msg of initialPage) {
    byId.set(msg.id, msg);
  }
  for (const [id, msg] of liveById.entries()) {
    byId.set(id, msg);
  }

  const persistedNonces = new Set<string>();
  for (const msg of byId.values()) {
    if (msg.clientNonce) {
      persistedNonces.add(`${msg.senderId}:${msg.clientNonce}`);
    }
  }

  const pendingToInclude: ChatUiMessage[] = [];
  for (const opt of optimistic) {
    if (byId.has(opt.id)) continue;
    if (
      opt.clientNonce &&
      persistedNonces.has(`${opt.senderId}:${opt.clientNonce}`)
    ) {
      continue;
    }
    pendingToInclude.push(opt);
  }

  const combined = [...byId.values(), ...pendingToInclude];
  combined.sort((a, b) => {
    const timeDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  return combined;
}

/**
 * Optimistically toggles one user's reaction on a message's reaction list.
 */
export function toggleReactionOptimistically(
  current: ChatReactionSummaryPayload[],
  userId: string,
  emoji: string,
): ChatReactionSummaryPayload[] {
  const existingIndex = current.findIndex((r) => r.reaction === emoji);
  if (existingIndex === -1) {
    return [
      ...current,
      {
        reaction: emoji,
        count: 1,
        userIds: [userId],
      },
    ];
  }

  const target = current[existingIndex]!;
  const hasReacted = target.userIds.includes(userId);
  if (hasReacted) {
    const nextUsers = target.userIds.filter((id) => id !== userId);
    if (nextUsers.length === 0) {
      return current.filter((_, idx) => idx !== existingIndex);
    }
    return current.map((item, idx) =>
      idx === existingIndex
        ? { ...item, count: nextUsers.length, userIds: nextUsers }
        : item,
    );
  }

  const nextUsers = [...target.userIds, userId];
  return current.map((item, idx) =>
    idx === existingIndex
      ? { ...item, count: nextUsers.length, userIds: nextUsers }
      : item,
  );
}

export function applyReactionEventToMessage(
  msg: ChatMessagePayload,
  event: ChatReactionUpdatedEventPayload,
): ChatMessagePayload {
  if (msg.id !== event.messageId) return msg;
  return {
    ...msg,
    reactions: event.reactions,
  };
}

export function applyReadEventToMessage(
  msg: ChatMessagePayload,
  event: ChatReadUpdatedEventPayload,
  readCutoffTimeMs: number,
): ChatMessagePayload {
  const msgTime = new Date(msg.createdAt).getTime();
  if (msg.id !== event.messageId && msgTime > readCutoffTimeMs) {
    return msg;
  }
  if (msg.reads.some((r) => r.userId === event.userId)) {
    return msg;
  }
  return {
    ...msg,
    reads: [
      ...msg.reads,
      {
        messageId: msg.id,
        userId: event.userId,
        readAt: event.readAt,
      },
    ],
  };
}

export function applyReceiptEventToMessage(
  msg: ChatMessagePayload,
  event: ChatReceiptUpdatedEventPayload,
): ChatMessagePayload {
  if (!event.messageIds.includes(msg.id)) return msg;
  const hasExisting = msg.receipts.some((r) => r.userId === event.userId);
  const nextReceipts = hasExisting
    ? msg.receipts.map((r) =>
        r.userId === event.userId
          ? { ...r, status: event.status, updatedAt: event.updatedAt }
          : r,
      )
    : [
        ...msg.receipts,
        {
          messageId: msg.id,
          userId: event.userId,
          status: event.status,
          updatedAt: event.updatedAt,
        },
      ];
  return {
    ...msg,
    receipts: nextReceipts,
  };
}

export function applyDeletedEventToMessage(
  msg: ChatMessagePayload,
  event: ChatMessageDeletedEventPayload,
): ChatMessagePayload {
  if (msg.id !== event.messageId) return msg;
  return {
    ...msg,
    body: '',
    attachments: [],
    reactions: [],
    mentions: [],
    deletedAt: event.deletedAt,
    deletedBy: event.deletedBy,
  };
}

export function initialsForChatName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
