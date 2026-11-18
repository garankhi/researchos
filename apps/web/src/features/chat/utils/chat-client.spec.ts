import { CHAT_RECONNECT_CONFIG, CHAT_SOCKET_NAMESPACE } from '@researchos/chat';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChatSocketUrl } from '../hooks/use-chat-socket';
import type { ChatMessagePayload, ChatUiMessage } from '../types';
import {
  computeSha256Hex,
  prepareFileForChatUpload,
  resolveAuthorizedAttachmentUrl,
  uploadBytesToPresignedUrl,
} from './attachment-upload';
import {
  applyDeletedEventToMessage,
  applyReactionEventToMessage,
  applyReadEventToMessage,
  applyReceiptEventToMessage,
  mergeChatMessages,
  toggleReactionOptimistically,
} from './message-state';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CONV_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeMsg(
  overrides: Partial<ChatMessagePayload> = {},
): ChatMessagePayload {
  return {
    id: 'msg-1',
    conversationId: CONV_ID,
    senderId: ALICE_ID,
    body: 'Hello world',
    clientNonce: null,
    mentions: [],
    reactions: [],
    attachments: [],
    reads: [],
    receipts: [],
    createdAt: '2026-11-18T05:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('chat client state, merging, reactions, and upload helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('merges older pages, initial history, live Socket.IO messages, and deduplicates optimistic clientNonce', () => {
    const older = makeMsg({
      id: 'msg-0',
      body: 'Older',
      createdAt: '2026-11-18T04:59:00.000Z',
    });
    const hist = makeMsg({
      id: 'msg-1',
      body: 'Initial',
      createdAt: '2026-11-18T05:00:00.000Z',
    });
    const live = makeMsg({
      id: 'msg-2',
      body: 'Live persisted',
      clientNonce: 'nonce-abc',
      createdAt: '2026-11-18T05:01:00.000Z',
    });

    const optimisticReconciled: ChatUiMessage = {
      ...makeMsg({
        id: 'temp-nonce-abc',
        body: 'Live persisted',
        clientNonce: 'nonce-abc',
        createdAt: '2026-11-18T05:00:59.000Z',
      }),
      localState: 'sending',
    };

    const optimisticStillSending: ChatUiMessage = {
      ...makeMsg({
        id: 'temp-nonce-xyz',
        body: 'Pending',
        clientNonce: 'nonce-xyz',
        createdAt: '2026-11-18T05:02:00.000Z',
      }),
      localState: 'sending',
    };

    const merged = mergeChatMessages(
      [[older]],
      [hist],
      new Map([[live.id, live]]),
      [optimisticReconciled, optimisticStillSending],
    );

    expect(merged.map((m) => m.id)).toEqual([
      'msg-0',
      'msg-1',
      'msg-2',
      'temp-nonce-xyz',
    ]);
  });

  it('toggles reactions optimistically and supports clean rollback', () => {
    const initial = [{ reaction: '👍', count: 1, userIds: [ALICE_ID] }];

    const bobAdded = toggleReactionOptimistically(initial, BOB_ID, '👍');
    expect(bobAdded).toEqual([
      { reaction: '👍', count: 2, userIds: [ALICE_ID, BOB_ID] },
    ]);

    const aliceRemoved = toggleReactionOptimistically(bobAdded, ALICE_ID, '👍');
    expect(aliceRemoved).toEqual([
      { reaction: '👍', count: 1, userIds: [BOB_ID] },
    ]);

    const lastRemoved = toggleReactionOptimistically(
      aliceRemoved,
      BOB_ID,
      '👍',
    );
    expect(lastRemoved).toEqual([]);
  });

  it('applies read, delivery receipt, reaction, and delete Socket.IO events immutably', () => {
    const base = makeMsg({
      id: 'msg-10',
      receipts: [
        {
          messageId: 'msg-10',
          userId: BOB_ID,
          status: 'SENT',
          updatedAt: '2026-11-18T05:00:00.000Z',
        },
      ],
    });

    const delivered = applyReceiptEventToMessage(base, {
      conversationId: CONV_ID,
      messageIds: ['msg-10'],
      userId: BOB_ID,
      status: 'DELIVERED',
      updatedAt: '2026-11-18T05:01:00.000Z',
    });
    expect(delivered.receipts[0]?.status).toBe('DELIVERED');

    const read = applyReadEventToMessage(
      delivered,
      {
        conversationId: CONV_ID,
        messageId: 'msg-10',
        userId: BOB_ID,
        readAt: '2026-11-18T05:02:00.000Z',
      },
      new Date('2026-11-18T05:02:00.000Z').getTime(),
    );
    expect(read.reads).toHaveLength(1);

    const reacted = applyReactionEventToMessage(read, {
      conversationId: CONV_ID,
      messageId: 'msg-10',
      reactions: [{ reaction: '🎉', count: 1, userIds: [BOB_ID] }],
      actorId: BOB_ID,
      reaction: '🎉',
      action: 'added',
    });
    expect(reacted.reactions[0]?.reaction).toBe('🎉');

    const deleted = applyDeletedEventToMessage(reacted, {
      conversationId: CONV_ID,
      messageId: 'msg-10',
      deletedAt: '2026-11-18T05:03:00.000Z',
      deletedBy: ALICE_ID,
    });
    expect(deleted.body).toBe('');
    expect(deleted.reactions).toEqual([]);
    expect(deleted.deletedBy).toBe(ALICE_ID);
  });

  it('computes SHA-256 hex digest, compresses images when canvas shrinks bytes, and resolves authorized download URLs', async () => {
    const raw = new TextEncoder().encode('researchos-chat-attachment');
    const digest = await computeSha256Hex(raw.buffer);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    // Mock browser image compression APIs
    const compressedBytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 3000,
        height: 1500,
        close: vi.fn(),
      }),
    );
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob) => void) =>
          cb(new Blob([compressedBytes], { type: 'image/webp' })),
      }),
    });

    const originalFile = new File([new Uint8Array(2048)], 'photo.png', {
      type: 'image/png',
    });
    const prepared = await prepareFileForChatUpload(originalFile, {
      maxDimension: 1200,
    });

    expect(prepared.mimeType).toBe('image/webp');
    expect(prepared.fileName).toBe('photo.webp');
    expect(prepared.width).toBe(1200);
    expect(prepared.height).toBe(600);
    expect(prepared.sizeBytes).toBe(compressedBytes.byteLength);
    expect(prepared.sha256).toBe(
      await computeSha256Hex(compressedBytes.buffer),
    );

    expect(
      resolveAuthorizedAttachmentUrl('/chat/attachments/abc/download'),
    ).toBe('http://localhost:4000/chat/attachments/abc/download');
  });

  it('tracks XHR upload progress to S3 and configures Socket.IO namespace + bounded backoff', async () => {
    const progressEvents: number[] = [];

    class MockXHR {
      status = 200;
      headers: Record<string, string> = {};
      upload: {
        onprogress?: (ev: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void;
      } = {};
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn((k: string, v: string) => {
        this.headers[k] = v;
      });
      abort = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 50,
          total: 100,
        });
        this.onload?.();
      });
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR);

    await uploadBytesToPresignedUrl(
      'https://s3.local/put',
      { 'content-type': 'text/plain' },
      new Blob(['hello']),
      (pct) => progressEvents.push(pct),
    );

    expect(progressEvents).toEqual([50, 100]);
    expect(buildChatSocketUrl('http://localhost:4000/')).toBe(
      `http://localhost:4000${CHAT_SOCKET_NAMESPACE}`,
    );
    expect(CHAT_RECONNECT_CONFIG.reconnectionDelay).toBe(1000);
    expect(CHAT_RECONNECT_CONFIG.reconnectionDelayMax).toBe(15000);
  });
});
