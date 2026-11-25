import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { HttpStatus } from '@nestjs/common';
import {
  CHAT_TYPING_TTL_MS,
  ChatConversationTypeEnum,
  ChatParticipantRoleEnum,
  ChatServerEvent,
  formatUserMentionToken,
} from '@researchos/chat';
import {
  ChatConversationType,
  ChatParticipantRole,
  ChatReceiptStatus,
  OutputFileVisibility,
  type PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResolver } from '../../common/auth/session-resolver.js';
import { SESSION_COOKIE_NAME } from '../../common/auth/session-cookie.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type { ObjectStorageService } from '../storage/object-storage.service.js';
import { signUploadIntent } from '../storage/upload-token.js';
import { ChatAttachmentsService } from './chat-attachments.service.js';
import {
  ChatGateway,
  conversationRoom,
  userRoom,
  type ChatAuthenticatedSocket,
} from './chat.gateway.js';
import { ChatService } from './chat.service.js';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const CONV_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MSG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const aliceSummary = {
  id: ALICE_ID,
  full_name: 'Alice Researcher',
  email: 'alice@fpt.edu.vn',
  department_unit: 'AI Lab',
};

const bobSummary = {
  id: BOB_ID,
  full_name: 'Bob Researcher',
  email: 'bob@fpt.edu.vn',
  department_unit: 'SE Dept',
};

describe('ChatAttachmentsService', () => {
  const prevSecret = process.env.S3_UPLOAD_TOKEN_SECRET;

  beforeEach(() => {
    process.env.S3_UPLOAD_TOKEN_SECRET =
      '0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    process.env.S3_UPLOAD_TOKEN_SECRET = prevSecret;
    vi.restoreAllMocks();
  });

  function makeHarness() {
    const adapter = {
      createUploadUrl: vi.fn().mockResolvedValue({
        url: 'https://s3.local/upload',
        headers: { 'content-type': 'image/webp' },
      }),
      headObject: vi.fn(),
      getObject: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const storage = { adapter } as unknown as ObjectStorageService;
    const prisma = {
      chat_conversations: {
        findUnique: vi.fn().mockResolvedValue({
          id: CONV_ID,
          archived_at: null,
          chat_conversation_participants: [{ user_id: ALICE_ID }],
        }),
      },
      chat_message_attachments: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;

    const service = new ChatAttachmentsService(prisma, storage);
    return { service, prisma, adapter };
  }

  it('prepares and confirms an upload with SHA-256 verification and never exposes storage_key', async () => {
    const { service, prisma, adapter } = makeHarness();
    const content = Buffer.from('compressed-webp-bytes');
    const sha256 = createHash('sha256').update(content).digest('hex');

    const prepared = await service.prepareUpload(ALICE_ID, CONV_ID, {
      fileName: 'diagram.webp',
      mimeType: 'image/webp',
      sizeBytes: content.byteLength,
      sha256,
      width: 800,
      height: 600,
    });

    expect(prepared.uploadUrl).toBe('https://s3.local/upload');
    expect(prepared.uploadToken).toContain('.');

    adapter.headObject.mockResolvedValue({
      sizeBytes: content.byteLength,
      contentType: 'image/webp',
      sha256: undefined,
    });
    adapter.getObject.mockResolvedValue(Readable.from([content]));

    const createdAt = new Date('2026-11-18T04:00:00.000Z');
    (
      prisma.chat_message_attachments.create as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: ATT_ID,
        message_id: null,
        conversation_id: data.conversation_id,
        uploaded_by: data.uploaded_by,
        storage_key: data.storage_key,
        file_name: data.file_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        sha256: data.sha256,
        width: data.width,
        height: data.height,
        created_at: createdAt,
      }),
    );

    const confirmed = await service.confirmUpload(
      ALICE_ID,
      CONV_ID,
      prepared.uploadToken,
    );

    expect(confirmed).toEqual({
      id: ATT_ID,
      conversationId: CONV_ID,
      messageId: null,
      uploadedBy: ALICE_ID,
      fileName: 'diagram.webp',
      mimeType: 'image/webp',
      sizeBytes: content.byteLength,
      sha256,
      width: 800,
      height: 600,
      isImage: true,
      downloadPath: `/chat/attachments/${ATT_ID}/download`,
      createdAt: createdAt.toISOString(),
    });
    expect('storageKey' in confirmed).toBe(false);
    expect('storage_key' in confirmed).toBe(false);
  });

  it('rejects unsupported executable MIME types and cross-domain upload tokens', async () => {
    const { service } = makeHarness();

    await expect(
      service.prepareUpload(ALICE_ID, CONV_ID, {
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 128,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.attachmentInvalidType,
      status: HttpStatus.BAD_REQUEST,
    });

    const outputToken = signUploadIntent({
      userId: ALICE_ID,
      outputId: CONV_ID,
      key: `outputs/${CONV_ID}/file`,
      fileName: 'paper.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      visibility: OutputFileVisibility.PRIVATE,
      accessGroupId: null,
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      service.confirmUpload(ALICE_ID, CONV_ID, outputToken),
    ).rejects.toMatchObject({
      code: domainErrorCodes.storage.uploadIntentInvalid,
    });
  });

  it('rejects SHA-256 mismatch on confirm and cleans up orphaned S3 object on DB failure', async () => {
    const { service, prisma, adapter } = makeHarness();
    const expectedBytes = Buffer.from('expected');
    const wrongBytes = Buffer.from('tampered');
    const sha256 = createHash('sha256').update(expectedBytes).digest('hex');

    const prepared = await service.prepareUpload(ALICE_ID, CONV_ID, {
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: expectedBytes.byteLength,
      sha256,
    });

    adapter.headObject.mockResolvedValue({
      sizeBytes: expectedBytes.byteLength,
      contentType: 'text/plain',
      sha256: undefined,
    });
    adapter.getObject.mockResolvedValue(Readable.from([wrongBytes]));

    await expect(
      service.confirmUpload(ALICE_ID, CONV_ID, prepared.uploadToken),
    ).rejects.toMatchObject({
      code: domainErrorCodes.storage.fileConflict,
      status: HttpStatus.CONFLICT,
    });

    // Now return valid bytes, but simulate DB insert failure -> S3 object cleaned up.
    adapter.getObject.mockResolvedValue(Readable.from([expectedBytes]));
    (
      prisma.chat_message_attachments.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db write error'));

    await expect(
      service.confirmUpload(ALICE_ID, CONV_ID, prepared.uploadToken),
    ).rejects.toThrow('db write error');
    expect(adapter.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('stages verified downloads for participants, blocks outsiders, and cleans up temp file', async () => {
    const { service, prisma, adapter } = makeHarness();
    const bytes = Buffer.from('verified-pdf-payload');
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    (
      prisma.chat_message_attachments.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: ATT_ID,
      message_id: MSG_ID,
      conversation_id: CONV_ID,
      uploaded_by: ALICE_ID,
      storage_key: `chat/${CONV_ID}/obj-1`,
      file_name: 'report.pdf',
      mime_type: 'application/pdf',
      size_bytes: BigInt(bytes.byteLength),
      sha256,
      width: null,
      height: null,
      created_at: new Date(),
      chat_messages: { deleted_at: null },
    });
    adapter.getObject.mockResolvedValue(Readable.from([bytes]));

    const controller = new AbortController();
    const verified = await service.prepareDownload(
      ALICE_ID,
      ATT_ID,
      controller.signal,
    );
    const diskBytes = await readFile(verified.path);
    expect(diskBytes.equals(bytes)).toBe(true);
    expect(verified.isImage).toBe(false);
    await verified.cleanup();

    // Non-participant rejected with 403
    (
      prisma.chat_conversations.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: CONV_ID,
      chat_conversation_participants: [],
    });

    await expect(
      service.prepareDownload(OUTSIDER_ID, ATT_ID, controller.signal),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.conversationAccessDenied,
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('discards a staged attachment and its stored object', async () => {
    const { service, prisma, adapter } = makeHarness();
    (
      prisma.chat_message_attachments.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: ATT_ID,
      message_id: null,
      conversation_id: CONV_ID,
      uploaded_by: ALICE_ID,
      storage_key: `chat/${CONV_ID}/staged-1`,
      file_name: 'notes.txt',
      mime_type: 'text/plain',
      size_bytes: 42n,
      sha256: 'a'.repeat(64),
      width: null,
      height: null,
      created_at: new Date(),
    });

    const discarded = await service.deleteStagedAttachment(
      ALICE_ID,
      CONV_ID,
      ATT_ID,
    );

    expect(discarded.id).toBe(ATT_ID);
    expect(discarded.messageId).toBeNull();
    expect(
      prisma.chat_message_attachments.deleteMany as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith({
      where: { id: ATT_ID, message_id: null },
    });
    expect(adapter.deleteObject).toHaveBeenCalledWith(
      `chat/${CONV_ID}/staged-1`,
    );
  });

  it('refuses to discard an attachment owned by someone else or already sent', async () => {
    const { service, prisma, adapter } = makeHarness();
    (
      prisma.chat_message_attachments.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: ATT_ID,
      message_id: null,
      conversation_id: CONV_ID,
      uploaded_by: BOB_ID,
      storage_key: `chat/${CONV_ID}/staged-2`,
      file_name: 'notes.txt',
      mime_type: 'text/plain',
      size_bytes: 42n,
      sha256: 'a'.repeat(64),
      width: null,
      height: null,
      created_at: new Date(),
    });

    await expect(
      service.deleteStagedAttachment(ALICE_ID, CONV_ID, ATT_ID),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.attachmentNotFound,
      status: HttpStatus.NOT_FOUND,
    });

    (
      prisma.chat_message_attachments.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: ATT_ID,
      message_id: MSG_ID,
      conversation_id: CONV_ID,
      uploaded_by: ALICE_ID,
      storage_key: `chat/${CONV_ID}/staged-2`,
      file_name: 'notes.txt',
      mime_type: 'text/plain',
      size_bytes: 42n,
      sha256: 'a'.repeat(64),
      width: null,
      height: null,
      created_at: new Date(),
    });

    await expect(
      service.deleteStagedAttachment(ALICE_ID, CONV_ID, ATT_ID),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.attachmentAlreadyLinked,
      status: HttpStatus.CONFLICT,
    });
    expect(adapter.deleteObject).not.toHaveBeenCalled();
  });

  it('sweeps only unlinked attachments older than the window and removes their objects', async () => {
    const { service, prisma, adapter } = makeHarness();
    const orphanId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    (prisma.chat_message_attachments.findMany as ReturnType<typeof vi.fn>)
      // The first read selects the orphans.
      .mockResolvedValueOnce([
        {
          id: orphanId,
          storage_key: `chat/${CONV_ID}/orphan-1`,
        },
      ])
      // The second read confirms the rows are gone.
      .mockResolvedValueOnce([]);

    (
      prisma.chat_message_attachments.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });

    const result = await service.sweepOrphanAttachments(
      new Date('2026-11-18T00:00:00.000Z'),
    );

    expect(result.rows).toBe(1);
    expect(result.objects).toBe(1);
    expect(adapter.deleteObject).toHaveBeenCalledWith(
      `chat/${CONV_ID}/orphan-1`,
    );
    // Only unlinked rows are eligible for the sweep.
    expect(
      prisma.chat_message_attachments.findMany as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ message_id: null }),
      }),
    );
  });

  it('keeps the stored object when the row was linked to a message during the sweep', async () => {
    const { service, prisma, adapter } = makeHarness();
    const orphanId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    (prisma.chat_message_attachments.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { id: orphanId, storage_key: `chat/${CONV_ID}/orphan-2` },
      ])
      // The row survived because a message claimed it in between.
      .mockResolvedValueOnce([
        { id: orphanId, storage_key: `chat/${CONV_ID}/orphan-2` },
      ]);

    (
      prisma.chat_message_attachments.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 0 });

    const result = await service.sweepOrphanAttachments(
      new Date('2026-11-18T00:00:00.000Z'),
    );

    expect(result.objects).toBe(0);
    expect(adapter.deleteObject).not.toHaveBeenCalled();
  });
});

describe('ChatService & ChatGateway', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeChatHarness() {
    const now = new Date('2026-11-18T05:00:00.000Z');
    const hydratedMsg = {
      id: MSG_ID,
      conversation_id: CONV_ID,
      sender_id: ALICE_ID,
      body: `Hello ${formatUserMentionToken('Bob Researcher', BOB_ID)}`,
      client_nonce: 'nonce-1',
      created_at: now,
      edited_at: null,
      deleted_at: null,
      deleted_by: null,
      sender: aliceSummary,
      chat_message_mentions: [
        {
          message_id: MSG_ID,
          mentioned_user_id: BOB_ID,
          conversation_id: CONV_ID,
          mentioned_at: now,
          users: bobSummary,
        },
      ],
      chat_message_reactions: [],
      chat_message_attachments: [],
      chat_message_reads: [
        { message_id: MSG_ID, user_id: ALICE_ID, read_at: now },
      ],
      chat_message_receipts: [
        {
          message_id: MSG_ID,
          user_id: BOB_ID,
          status: ChatReceiptStatus.SENT,
          updated_at: now,
        },
      ],
    };

    const tx = {
      $executeRaw: vi.fn(),
      chat_messages: {
        create: vi.fn().mockResolvedValue({ id: MSG_ID }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(hydratedMsg),
        findMany: vi.fn().mockResolvedValue([{ id: MSG_ID }]),
        update: vi.fn().mockResolvedValue(hydratedMsg),
      },
      chat_message_attachments: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      chat_message_mentions: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      chat_message_reads: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      chat_message_receipts: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      chat_message_reactions: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      chat_conversation_participants: {
        update: vi.fn().mockResolvedValue({}),
      },
      chat_conversations: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      users: {
        findMany: vi.fn().mockResolvedValue([bobSummary]),
      },
      chat_conversations: {
        findUnique: vi.fn().mockResolvedValue({
          id: CONV_ID,
          title: 'Project Sync',
          type: ChatConversationType.GROUP,
          created_by: ALICE_ID,
          created_at: now,
          updated_at: now,
          archived_at: null,
          chat_conversation_participants: [
            {
              conversation_id: CONV_ID,
              user_id: ALICE_ID,
              role: ChatParticipantRole.OWNER,
              joined_at: now,
              last_read_message_id: null,
              last_read_at: null,
              notification_muted: false,
              users: aliceSummary,
            },
            {
              conversation_id: CONV_ID,
              user_id: BOB_ID,
              role: ChatParticipantRole.MEMBER,
              joined_at: now,
              last_read_message_id: null,
              last_read_at: null,
              notification_muted: false,
              users: bobSummary,
            },
          ],
          chat_messages: [],
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: CONV_ID }),
        update: vi.fn().mockResolvedValue({}),
      },
      chat_messages: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      chat_message_attachments: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chat_message_reactions: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { message_id: MSG_ID, user_id: BOB_ID, reaction: '👍' },
          ]),
      },
    } as unknown as PrismaService;

    const attachments = {
      cleanupUnlinkedAttachments: vi.fn().mockResolvedValue(undefined),
      deleteObjectsBestEffort: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatAttachmentsService;

    const chatService = new ChatService(prisma, attachments);

    const sessionResolver: SessionResolver = {
      resolve: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      effectiveRoles: vi.fn().mockResolvedValue({
        isAdmin: false,
        isResearcher: true,
      }),
    };

    const gateway = new ChatGateway(sessionResolver, chatService);
    const roomEmitter = { emit: vi.fn() };
    gateway.server = {
      to: vi.fn().mockReturnValue(roomEmitter),
    } as unknown as ChatGateway['server'];

    return {
      chatService,
      gateway,
      prisma,
      tx,
      attachments,
      sessionResolver,
      roomEmitter,
      hydratedMsg,
    };
  }

  function makeMockSocket(
    cookie?: string,
    auth?: Record<string, unknown>,
  ): ChatAuthenticatedSocket {
    return {
      data: {},
      handshake: {
        headers: cookie ? { cookie } : {},
        auth: auth ?? {},
        query: {},
      },
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as ChatAuthenticatedSocket;
  }

  it('authenticates valid session cookies on Socket.IO handshake and rejects invalid sessions', async () => {
    const { gateway, sessionResolver } = makeChatHarness();

    // Unauthenticated socket rejected immediately
    const anonSocket = makeMockSocket();
    await gateway.handleConnection(anonSocket);
    expect(anonSocket.emit).toHaveBeenCalledWith(ChatServerEvent.ERROR, {
      code: 'unauthorized',
      status: 401,
    });
    expect(anonSocket.disconnect).toHaveBeenCalledWith(true);

    // Valid session joins personal user room and emits CONNECTED
    (sessionResolver.resolve as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessionId: 'sess-1',
      userId: ALICE_ID,
      mustChangePassword: false,
    });
    const authSocket = makeMockSocket(
      `${SESSION_COOKIE_NAME}=valid-opaque-token`,
    );
    await gateway.handleConnection(authSocket);
    expect(authSocket.join).toHaveBeenCalledWith(userRoom(ALICE_ID));
    expect(authSocket.emit).toHaveBeenCalledWith(
      ChatServerEvent.CONNECTED,
      expect.objectContaining({ userId: ALICE_ID }),
    );
  });

  it('enforces room membership before joining, sending, or reacting', async () => {
    const { gateway, prisma } = makeChatHarness();
    const outsiderSocket = makeMockSocket();
    outsiderSocket.data.principal = {
      sessionId: 'sess-out',
      userId: OUTSIDER_ID,
      mustChangePassword: false,
    };

    const joinAck = await gateway.onJoinConversation(outsiderSocket, {
      conversationId: CONV_ID,
    });
    expect(joinAck).toEqual({
      ok: false,
      code: domainErrorCodes.chat.conversationAccessDenied,
      status: 403,
    });
    expect(outsiderSocket.join).not.toHaveBeenCalledWith(
      conversationRoom(CONV_ID),
    );

    // Valid participant joins room
    const aliceSocket = makeMockSocket();
    aliceSocket.data.principal = {
      sessionId: 'sess-alice',
      userId: ALICE_ID,
      mustChangePassword: false,
    };
    const okJoin = await gateway.onJoinConversation(aliceSocket, {
      conversationId: CONV_ID,
    });
    expect(okJoin).toEqual({
      ok: true,
      data: { conversationId: CONV_ID, typingUserIds: [] },
    });
    expect(aliceSocket.join).toHaveBeenCalledWith(conversationRoom(CONV_ID));
    expect(prisma.chat_conversations.findUnique).toHaveBeenCalled();
  });

  it('validates inbound Socket.IO payloads, persists messages idempotently, and broadcasts mentions', async () => {
    const { gateway, prisma, roomEmitter, hydratedMsg } = makeChatHarness();
    const aliceSocket = makeMockSocket();
    aliceSocket.data.principal = {
      sessionId: 'sess-alice',
      userId: ALICE_ID,
      mustChangePassword: false,
    };

    // Malformed payload rejected by DTO validation before service call
    const badAck = await gateway.onSendMessage(aliceSocket, {
      conversationId: 'not-a-uuid',
      body: 'hi',
      unexpectedExtraField: true,
    });
    expect(badAck.ok).toBe(false);
    if (!badAck.ok) {
      expect(badAck.status).toBe(400);
      expect(badAck.fieldErrors).toBeDefined();
    }

    // Valid send broadcasts persisted message and mention notification
    const sendAck = await gateway.onSendMessage(aliceSocket, {
      conversationId: CONV_ID,
      body: `Hello ${formatUserMentionToken('Bob Researcher', BOB_ID)}`,
      clientNonce: 'nonce-1',
    });
    expect(sendAck.ok).toBe(true);
    if (sendAck.ok) {
      expect(sendAck.data.id).toBe(MSG_ID);
      expect(sendAck.data.mentions).toHaveLength(1);
      expect(sendAck.data.receipts[0]?.status).toBe('SENT');
    }
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      ChatServerEvent.MESSAGE_CREATED,
      expect.objectContaining({ id: MSG_ID }),
    );
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      ChatServerEvent.MENTION_NOTIFICATION,
      expect.objectContaining({ mentionedUserId: BOB_ID }),
    );

    // Retry with identical clientNonce returns existing message without re-broadcasting
    roomEmitter.emit.mockClear();
    (
      prisma.chat_messages.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(hydratedMsg);
    const retryAck = await gateway.onSendMessage(aliceSocket, {
      conversationId: CONV_ID,
      body: `Hello ${formatUserMentionToken('Bob Researcher', BOB_ID)}`,
      clientNonce: 'nonce-1',
    });
    expect(retryAck.ok).toBe(true);
    expect(roomEmitter.emit).not.toHaveBeenCalledWith(
      ChatServerEvent.MESSAGE_CREATED,
      expect.anything(),
    );
  });

  it('enforces @all mention authorization for group owners vs regular members', async () => {
    const { chatService } = makeChatHarness();

    // Regular member cannot @all in GROUP conversation
    await expect(
      chatService.sendMessage(BOB_ID, {
        conversationId: CONV_ID,
        body: 'Hey @all check this',
      }),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.mentionAllDenied,
      status: HttpStatus.FORBIDDEN,
    });

    // Owner CAN @all in GROUP conversation
    const ownerSend = await chatService.sendMessage(ALICE_ID, {
      conversationId: CONV_ID,
      body: 'Announcement @all!',
    });
    expect(ownerSend.mentionNotifications).toEqual([
      expect.objectContaining({
        mentionedUserId: BOB_ID,
        isAllMention: true,
      }),
    ]);
  });

  it('broadcasts transient typing indicators and auto-expires stale typing state', async () => {
    vi.useFakeTimers();
    const { gateway, roomEmitter } = makeChatHarness();

    const bobSocket = makeMockSocket();
    bobSocket.data.principal = {
      sessionId: 'sess-bob',
      userId: BOB_ID,
      mustChangePassword: false,
    };

    const ack = await gateway.onTypingStart(bobSocket, {
      conversationId: CONV_ID,
    });
    expect(ack).toEqual({ ok: true, data: { ok: true } });
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      ChatServerEvent.TYPING_UPDATED,
      expect.objectContaining({
        conversationId: CONV_ID,
        typingUserIds: [BOB_ID],
      }),
    );

    roomEmitter.emit.mockClear();
    vi.advanceTimersByTime(CHAT_TYPING_TTL_MS + 50);

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      ChatServerEvent.TYPING_UPDATED,
      expect.objectContaining({
        conversationId: CONV_ID,
        typingUserIds: [],
      }),
    );
  });

  it('toggles reactions idempotently and updates read receipts', async () => {
    const { gateway, prisma, roomEmitter } = makeChatHarness();
    (
      prisma.chat_messages.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: MSG_ID,
      created_at: new Date(),
      deleted_at: null,
    });

    const bobSocket = makeMockSocket();
    bobSocket.data.principal = {
      sessionId: 'sess-bob',
      userId: BOB_ID,
      mustChangePassword: false,
    };

    const reactAck = await gateway.onToggleReaction(bobSocket, {
      conversationId: CONV_ID,
      messageId: MSG_ID,
      reaction: '👍',
    });
    expect(reactAck).toEqual({
      ok: true,
      data: {
        conversationId: CONV_ID,
        messageId: MSG_ID,
        reactions: [{ reaction: '👍', count: 1, userIds: [BOB_ID] }],
        actorId: BOB_ID,
        reaction: '👍',
        action: 'added',
      },
    });

    const readAck = await gateway.onMarkRead(bobSocket, {
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });
    expect(readAck.ok).toBe(true);
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      ChatServerEvent.READ_UPDATED,
      expect.objectContaining({
        conversationId: CONV_ID,
        messageId: MSG_ID,
        userId: BOB_ID,
      }),
    );
  });

  it('cleans up unlinked attachments when message transaction fails unexpectedly', async () => {
    const { chatService, prisma, attachments } = makeChatHarness();
    (
      prisma.chat_message_attachments.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: ATT_ID,
        conversation_id: CONV_ID,
        uploaded_by: ALICE_ID,
        message_id: null,
      },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CodedHttpException(
        domainErrorCodes.chat.attachmentAlreadyLinked,
        HttpStatus.CONFLICT,
      ),
    );

    await expect(
      chatService.sendMessage(ALICE_ID, {
        conversationId: CONV_ID,
        body: '',
        attachmentIds: [ATT_ID],
      }),
    ).rejects.toMatchObject({
      code: domainErrorCodes.chat.attachmentAlreadyLinked,
    });

    // Non-domain DB crash triggers cleanupUnlinkedAttachments
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected db disconnect'),
    );
    await expect(
      chatService.sendMessage(ALICE_ID, {
        conversationId: CONV_ID,
        body: '',
        attachmentIds: [ATT_ID],
      }),
    ).rejects.toThrow('unexpected db disconnect');
    expect(attachments.cleanupUnlinkedAttachments).toHaveBeenCalledWith(
      ALICE_ID,
      CONV_ID,
      [ATT_ID],
    );
  });

  it('reuses existing active DIRECT conversation between the same two participants', async () => {
    const { chatService, prisma } = makeChatHarness();
    (
      prisma.chat_conversations.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: CONV_ID,
      _count: { chat_conversation_participants: 2 },
    });

    const conv = await chatService.createConversation(ALICE_ID, {
      type: ChatConversationTypeEnum.DIRECT as unknown as ChatConversationType,
      participantIds: [BOB_ID],
    });
    expect(conv.id).toBe(CONV_ID);
    expect(prisma.chat_conversations.create).not.toHaveBeenCalled();
    expect(conv.participants[0]?.role).toBe(ChatParticipantRoleEnum.OWNER);
  });

  it('deletes the attachment rows and stored objects when a message is deleted', async () => {
    const { chatService, prisma, tx, attachments } = makeChatHarness();
    const storageKey = `chat/${CONV_ID}/attached-1`;

    (
      prisma.chat_messages.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: MSG_ID,
      conversation_id: CONV_ID,
      sender_id: ALICE_ID,
      deleted_at: null,
      deleted_by: null,
      chat_message_attachments: [{ id: ATT_ID, storage_key: storageKey }],
    });

    const result = await chatService.deleteMessage(ALICE_ID, {
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });

    expect(result.deleted.messageId).toBe(MSG_ID);
    // The row goes with the message.
    expect(
      tx.chat_message_attachments.deleteMany as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith({ where: { message_id: MSG_ID } });
    // And so does the stored object.
    expect(attachments.deleteObjectsBestEffort).toHaveBeenCalledWith([
      storageKey,
    ]);
  });
});
