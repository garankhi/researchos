/**
 * Socket.IO event enums and TypeScript payload contracts shared by `apps/api` and `apps/web`.
 *
 * Authentication & Connection Lifecycle:
 * 1. Client connects to `CHAT_SOCKET_NAMESPACE` (`/chat`) with `withCredentials: true` so
 *    the HTTP-only session cookie is sent during the Engine.IO / Socket.IO handshake
 *    (an optional `auth.conversationId` may also be supplied for immediate room join).
 * 2. Gateway validates the session cookie via `SessionResolver`. Unauthenticated or
 *    expired credentials emit a connection error and disconnect immediately.
 * 3. Every client->server event supports a typed Socket.IO acknowledgement callback
 *    returning `ChatSocketAck<T>` (`{ ok: true, data }` or `{ ok: false, code, status, fieldErrors? }`).
 * 4. Persisted messages share the exact `ChatMessagePayload` identity across REST history
 *    and Socket.IO live broadcasts so the client merges by `id` (and reconciles optimistic
 *    pending rows by `clientNonce`).
 * 5. Attachment payloads expose `downloadPath` (`/chat/attachments/:id/download`) and
 *    verified metadata only; S3 `storage_key` never leaves the server.
 */

export enum ChatConversationTypeEnum {
  DIRECT = "DIRECT",
  GROUP = "GROUP",
}

export enum ChatParticipantRoleEnum {
  MEMBER = "MEMBER",
  OWNER = "OWNER",
}

export enum ChatReceiptStatusEnum {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export type ChatConversationTypeValue =
  ChatConversationTypeEnum | `${ChatConversationTypeEnum}`;

export type ChatParticipantRoleValue =
  ChatParticipantRoleEnum | `${ChatParticipantRoleEnum}`;

export type ChatReceiptStatusValue =
  ChatReceiptStatusEnum | `${ChatReceiptStatusEnum}`;

/** Client-to-server Socket.IO event names. Never hardcode inline strings. */
export enum ChatClientEvent {
  JOIN_CONVERSATION = "chat:conversation:join",
  LEAVE_CONVERSATION = "chat:conversation:leave",
  SEND_MESSAGE = "chat:message:send",
  EDIT_MESSAGE = "chat:message:edit",
  DELETE_MESSAGE = "chat:message:delete",
  TYPING_START = "chat:typing:start",
  TYPING_STOP = "chat:typing:stop",
  MARK_READ = "chat:message:read",
  MARK_DELIVERED = "chat:message:delivered",
  TOGGLE_REACTION = "chat:reaction:toggle",
}

/** Server-to-client Socket.IO event names. Never hardcode inline strings. */
export enum ChatServerEvent {
  CONNECTED = "chat:session:connected",
  MESSAGE_CREATED = "chat:message:created",
  MESSAGE_UPDATED = "chat:message:updated",
  MESSAGE_DELETED = "chat:message:deleted",
  TYPING_UPDATED = "chat:typing:updated",
  READ_UPDATED = "chat:read:updated",
  RECEIPT_UPDATED = "chat:receipt:updated",
  REACTION_UPDATED = "chat:reaction:updated",
  CONVERSATION_UPDATED = "chat:conversation:updated",
  MENTION_NOTIFICATION = "chat:mention:notification",
  ERROR = "chat:error",
}

export interface ChatUserSummary {
  id: string;
  fullName: string;
  email: string;
  departmentUnit: string;
}

export interface ChatParticipantPayload {
  conversationId: string;
  userId: string;
  role: ChatParticipantRoleValue;
  joinedAt: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  notificationMuted: boolean;
  user: ChatUserSummary;
}

/**
 * Public attachment metadata exposed over REST and Socket.IO.
 * Note: S3 `storage_key` is deliberately omitted; clients access bytes only via
 * the authorized API endpoint `/chat/attachments/:id/download`.
 */
export interface ChatAttachmentPayload {
  id: string;
  conversationId: string;
  messageId: string | null;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  isImage: boolean;
  downloadPath: string;
  createdAt: string;
}

/** Server-only storage record representation (never sent over the wire). */
export interface ChatStoredAttachmentRecord extends ChatAttachmentPayload {
  storageKey: string;
}

export interface ChatMentionPayload {
  messageId: string;
  mentionedUserId: string;
  conversationId: string;
  mentionedAt: string;
  user?: ChatUserSummary;
}

export interface ChatReactionSummaryPayload {
  reaction: string;
  count: number;
  userIds: string[];
}

export interface ChatReadReceiptPayload {
  messageId: string;
  userId: string;
  readAt: string;
}

export interface ChatDeliveryReceiptPayload {
  messageId: string;
  userId: string;
  status: ChatReceiptStatusValue;
  updatedAt: string;
}

export interface ChatMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: ChatUserSummary;
  body: string;
  clientNonce: string | null;
  mentions: ChatMentionPayload[];
  reactions: ChatReactionSummaryPayload[];
  attachments: ChatAttachmentPayload[];
  reads: ChatReadReceiptPayload[];
  receipts: ChatDeliveryReceiptPayload[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface ChatConversationSummaryPayload {
  id: string;
  title: string | null;
  type: ChatConversationTypeValue;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  participants: ChatParticipantPayload[];
  lastMessage: ChatMessagePayload | null;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Inbound Client -> Server Payloads
// ---------------------------------------------------------------------------

export interface ChatJoinConversationPayload {
  conversationId: string;
}

export interface ChatLeaveConversationPayload {
  conversationId: string;
}

export interface ChatSendMessagePayload {
  conversationId: string;
  body: string;
  clientNonce?: string;
  attachmentIds?: string[];
}

export interface ChatEditMessagePayload {
  conversationId: string;
  messageId: string;
  body: string;
}

export interface ChatDeleteMessagePayload {
  conversationId: string;
  messageId: string;
}

export interface ChatTypingPayload {
  conversationId: string;
}

export interface ChatMarkReadPayload {
  conversationId: string;
  messageId: string;
}

export interface ChatMarkDeliveredPayload {
  conversationId: string;
  messageIds: string[];
}

export interface ChatToggleReactionPayload {
  conversationId: string;
  messageId: string;
  reaction: string;
}

// ---------------------------------------------------------------------------
// Outbound Server -> Client Broadcast Payloads
// ---------------------------------------------------------------------------

export interface ChatConnectedEventPayload {
  userId: string;
  connectedAt: string;
}

export interface ChatTypingUpdatedEventPayload {
  conversationId: string;
  typingUserIds: string[];
  updatedAt: string;
}

export interface ChatReadUpdatedEventPayload {
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: string;
}

export interface ChatReceiptUpdatedEventPayload {
  conversationId: string;
  messageIds: string[];
  userId: string;
  status: ChatReceiptStatusValue;
  updatedAt: string;
}

export interface ChatReactionUpdatedEventPayload {
  conversationId: string;
  messageId: string;
  reactions: ChatReactionSummaryPayload[];
  actorId: string;
  reaction: string;
  action: "added" | "removed";
}

export interface ChatMessageDeletedEventPayload {
  conversationId: string;
  messageId: string;
  deletedAt: string;
  deletedBy: string;
}

export interface ChatMentionNotificationEventPayload {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  mentionedUserId: string;
  isAllMention: boolean;
  preview: string;
  createdAt: string;
}

export interface ChatSocketErrorPayload {
  code: string;
  status: number;
  fieldErrors?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Acknowledgement Contract & Typed Socket.IO Event Maps
// ---------------------------------------------------------------------------

export type ChatSocketAck<T = void> =
  | {
      ok: true;
      data: T;
    }
  | ({
      ok: false;
    } & ChatSocketErrorPayload);

export type ChatAckCallback<T = void> = (response: ChatSocketAck<T>) => void;

export interface ChatClientToServerEvents {
  [ChatClientEvent.JOIN_CONVERSATION]: (
    payload: ChatJoinConversationPayload,
    ack?: ChatAckCallback<{ conversationId: string; typingUserIds: string[] }>,
  ) => void;
  [ChatClientEvent.LEAVE_CONVERSATION]: (
    payload: ChatLeaveConversationPayload,
    ack?: ChatAckCallback<{ conversationId: string }>,
  ) => void;
  [ChatClientEvent.SEND_MESSAGE]: (
    payload: ChatSendMessagePayload,
    ack?: ChatAckCallback<ChatMessagePayload>,
  ) => void;
  [ChatClientEvent.EDIT_MESSAGE]: (
    payload: ChatEditMessagePayload,
    ack?: ChatAckCallback<ChatMessagePayload>,
  ) => void;
  [ChatClientEvent.DELETE_MESSAGE]: (
    payload: ChatDeleteMessagePayload,
    ack?: ChatAckCallback<ChatMessageDeletedEventPayload>,
  ) => void;
  [ChatClientEvent.TYPING_START]: (
    payload: ChatTypingPayload,
    ack?: ChatAckCallback<{ ok: boolean }>,
  ) => void;
  [ChatClientEvent.TYPING_STOP]: (
    payload: ChatTypingPayload,
    ack?: ChatAckCallback<{ ok: boolean }>,
  ) => void;
  [ChatClientEvent.MARK_READ]: (
    payload: ChatMarkReadPayload,
    ack?: ChatAckCallback<ChatReadUpdatedEventPayload>,
  ) => void;
  [ChatClientEvent.MARK_DELIVERED]: (
    payload: ChatMarkDeliveredPayload,
    ack?: ChatAckCallback<ChatReceiptUpdatedEventPayload>,
  ) => void;
  [ChatClientEvent.TOGGLE_REACTION]: (
    payload: ChatToggleReactionPayload,
    ack?: ChatAckCallback<ChatReactionUpdatedEventPayload>,
  ) => void;
}

export interface ChatServerToClientEvents {
  [ChatServerEvent.CONNECTED]: (payload: ChatConnectedEventPayload) => void;
  [ChatServerEvent.MESSAGE_CREATED]: (payload: ChatMessagePayload) => void;
  [ChatServerEvent.MESSAGE_UPDATED]: (payload: ChatMessagePayload) => void;
  [ChatServerEvent.MESSAGE_DELETED]: (
    payload: ChatMessageDeletedEventPayload,
  ) => void;
  [ChatServerEvent.TYPING_UPDATED]: (
    payload: ChatTypingUpdatedEventPayload,
  ) => void;
  [ChatServerEvent.READ_UPDATED]: (
    payload: ChatReadUpdatedEventPayload,
  ) => void;
  [ChatServerEvent.RECEIPT_UPDATED]: (
    payload: ChatReceiptUpdatedEventPayload,
  ) => void;
  [ChatServerEvent.REACTION_UPDATED]: (
    payload: ChatReactionUpdatedEventPayload,
  ) => void;
  [ChatServerEvent.CONVERSATION_UPDATED]: (
    payload: ChatConversationSummaryPayload,
  ) => void;
  [ChatServerEvent.MENTION_NOTIFICATION]: (
    payload: ChatMentionNotificationEventPayload,
  ) => void;
  [ChatServerEvent.ERROR]: (payload: ChatSocketErrorPayload) => void;
}
