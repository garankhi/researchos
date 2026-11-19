# `@researchos/chat` — Shared Real-Time Chat Contracts

Shared Socket.IO event enums, payload contracts, limits, and mention parsing utilities consumed by both `apps/api` and `apps/web`.

## 1. Namespace & Transport

- **Socket.IO Namespace**: `/chat` (`CHAT_SOCKET_NAMESPACE`)
- **Transport**: Socket.IO v4 (`@nestjs/platform-socket.io` + `socket.io-client`)
- **Multi-Instance Delivery & Redis Adapter**:
  - `ChatRedisIoAdapter` in `apps/api` reads `REDIS_URL` (`createQueueOptions` from `@researchos/queue`) and creates dedicated `ioredis` `pubClient` and `subClient` connections via `@socket.io/redis-adapter`.
  - Socket.IO `connectionStateRecovery` (`maxDisconnectionDuration: 120_000`) is enabled alongside bounded client exponential backoff (`CHAT_RECONNECT_CONFIG`: 1s initial, 15s max, 0.3 jitter).
  - Transient typing state (`CHAT_TYPING_TTL_MS = 5000`) is scoped to conversation rooms (`conversation:<id>`) and never persisted to PostgreSQL.

## 2. Authentication & Authorization Lifecycle

1. **Handshake Authentication**: The browser connects with `withCredentials: true`, sending the opaque `SESSION_COOKIE_NAME` cookie on the Socket.IO handshake. `ChatGateway.handleConnection` resolves the session principal via `SESSION_RESOLVER`. Invalid, expired, or `mustChangePassword` sessions emit `chat:error` (`unauthorized` / `must_change_password`) and disconnect immediately.
2. **Personal Channel**: Authenticated sockets automatically join `user:<userId>` to receive conversation-list updates (`chat:conversation:updated`) and `@mention` notifications (`chat:mention:notification`).
3. **Room Authorization**: Before joining `conversation:<conversationId>` (`chat:conversation:join`), sending messages, reacting, marking read/delivered, or preparing/confirming/downloading attachments, `ChatService` verifies active membership in `chat_conversation_participants`. Non-participants are rejected with `403` (`chat_conversation_access_denied`).

## 3. Acknowledgement Contract

Every client-to-server Socket.IO event accepts an acknowledgement callback typed as `ChatSocketAck<T>`:

- **Success**: `{ ok: true, data: T }`
- **Failure**: `{ ok: false, code: string, status: number, fieldErrors?: Record<string, string[]> }`

All `code` values are machine-readable identifiers from `@researchos/error-codes` resolved via the web locale catalogs (`en.json` / `vi.json`).

## 4. Event Catalog

### Client -> Server (`ChatClientEvent`)
- `chat:conversation:join` — Join an authorized conversation room and receive active typing user IDs.
- `chat:conversation:leave` — Leave a conversation room and clear caller typing state.
- `chat:message:send` — Validate, persist (idempotent on `(conversationId, senderId, clientNonce)`), and broadcast a `ChatMessagePayload`.
- `chat:message:edit` — Edit sender's own active message body and re-evaluate `@mentions`.
- `chat:message:delete` — Soft-delete a message (sender or conversation `OWNER`).
- `chat:typing:start` / `chat:typing:stop` — Broadcast transient typing indicators with 5s auto-expiry.
- `chat:message:read` — Persist `chat_message_reads` + `last_read_message_id` and broadcast `chat:read:updated`.
- `chat:message:delivered` — Transition recipient receipts in `chat_message_receipts` to `DELIVERED` and broadcast `chat:receipt:updated`.
- `chat:reaction:toggle` — Idempotently add/remove `(message_id, user_id, reaction)` and broadcast aggregated `chat:reaction:updated`.

### Server -> Client (`ChatServerEvent`)
- `chat:session:connected` — Confirms authenticated socket principal.
- `chat:message:created` / `chat:message:updated` / `chat:message:deleted` — Live message mutations sharing exact REST `ChatMessagePayload` identity.
- `chat:typing:updated` — Current `typingUserIds` in the conversation.
- `chat:read:updated` / `chat:receipt:updated` — Read and delivery receipt updates.
- `chat:reaction:updated` — Updated reaction counts and actor delta.
- `chat:conversation:updated` — Conversation summary update pushed to `user:<userId>`.
- `chat:mention:notification` — Real-time mention alert pushed to mentioned participants (`@[Name](uuid)` or `@all` by `OWNER`).
- `chat:error` — Connection-level or transport error notification.

## 5. S3 Attachment Contract

1. **Prepare (`POST /chat/conversations/:conversationId/attachments/uploads`)**: Validates participant membership, allowed MIME type (`ALLOWED_CHAT_ATTACHMENT_MIME_TYPES`), and byte limit (`MAX_CHAT_ATTACHMENT_BYTES`), returning `{ uploadUrl, headers, uploadToken }` signed with `S3_UPLOAD_TOKEN_SECRET`.
2. **Direct PUT**: Browser compresses images first, computes final `SHA-256` and `sizeBytes`, and PUTs directly to S3.
3. **Confirm (`POST /chat/conversations/:conversationId/attachments/uploads/confirm`)**: Verifies object existence, byte size, MIME type, and SHA-256 via `ObjectStorageService`, recording `chat_message_attachments` idempotently.
4. **Authorized Download (`GET /chat/attachments/:attachmentId/download`)**: Re-checks conversation membership, streams & verifies SHA-256/size in staging, and never exposes `storage_key` or public S3 URLs.
