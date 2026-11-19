/**
 * Shared constants and validation limits for ResearchOS real-time chat.
 */

/** Socket.IO namespace used by the chat gateway and web client. */
export const CHAT_SOCKET_NAMESPACE = "/chat";

/** Maximum character length of a chat message body. */
export const MAX_CHAT_MESSAGE_BODY_LENGTH = 4000;

/** Maximum character length of a group conversation title. */
export const MAX_CHAT_CONVERSATION_TITLE_LENGTH = 120;

/** Maximum number of attachments allowed on a single chat message. */
export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 5;

/** Maximum byte size of a single chat attachment (25 MiB). */
export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Stale typing timeout in milliseconds (auto-expired when no update arrives). */
export const CHAT_TYPING_TTL_MS = 5000;

/** Bounded reconnection backoff configuration for the Socket.IO web client. */
export const CHAT_RECONNECT_CONFIG = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 15000,
  randomizationFactor: 0.3,
} as const;

/** Normalized emoji reactions supported on chat messages. */
export const ALLOWED_CHAT_REACTIONS = [
  "👍",
  "❤️",
  "🎉",
  "💡",
  "👀",
  "🙏",
] as const;

export type ChatReactionEmoji = (typeof ALLOWED_CHAT_REACTIONS)[number];

/** Allowed MIME types for chat image attachments. */
export const ALLOWED_CHAT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Allowed MIME types for chat document/file attachments. */
export const ALLOWED_CHAT_FILE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

/** Union of all safe MIME types accepted by chat attachment uploads. */
export const ALLOWED_CHAT_ATTACHMENT_MIME_TYPES = [
  ...ALLOWED_CHAT_IMAGE_MIME_TYPES,
  ...ALLOWED_CHAT_FILE_MIME_TYPES,
] as const;

export type AllowedChatAttachmentMimeType =
  (typeof ALLOWED_CHAT_ATTACHMENT_MIME_TYPES)[number];

export function isAllowedChatReaction(
  value: string,
): value is ChatReactionEmoji {
  return (ALLOWED_CHAT_REACTIONS as readonly string[]).includes(value);
}

export function isAllowedChatAttachmentMime(
  mimeType: string,
): mimeType is AllowedChatAttachmentMimeType {
  return (ALLOWED_CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    mimeType.toLowerCase(),
  );
}

export function isChatImageMimeType(mimeType: string): boolean {
  return (ALLOWED_CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(
    mimeType.toLowerCase(),
  );
}
