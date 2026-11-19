'use client';

import {
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  isAllowedChatAttachmentMime,
  type ChatMessageDeletedEventPayload,
  type ChatMessagePayload,
  type ChatReactionUpdatedEventPayload,
  type ChatReadUpdatedEventPayload,
  type ChatReceiptUpdatedEventPayload,
  type ChatTypingUpdatedEventPayload,
} from '@researchos/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chatAttachmentsControllerConfirmUpload,
  chatAttachmentsControllerDeleteStagedAttachment,
  chatAttachmentsControllerPrepareUpload,
  chatControllerListMessages,
  getChatControllerGetConversationQueryKey,
  getChatControllerListConversationsQueryKey,
  getChatControllerListMessagesQueryKey,
  useChatControllerGetConversation,
  useChatControllerListMessages,
} from '@/lib/api';
import { apiErrorCode } from '@/lib/api-error';
import type {
  ChatAttachmentPayload,
  ChatUiMessage,
  ChatUserSummary,
  PendingAttachmentItem,
} from '../types';
import {
  prepareFileForChatUpload,
  uploadBytesToPresignedUrl,
} from '../utils/attachment-upload';
import {
  applyDeletedEventToMessage,
  applyReactionEventToMessage,
  applyReadEventToMessage,
  applyReceiptEventToMessage,
  mergeChatMessages,
  toggleReactionOptimistically,
} from '../utils/message-state';
import type { useChatSocket } from './use-chat-socket';

const PAGE_LIMIT = 40;

type SocketActions = ReturnType<typeof useChatSocket>;

export function useChatRoom({
  conversationId,
  currentUser,
  socket,
}: {
  conversationId: string | null;
  currentUser: ChatUserSummary | null;
  socket: SocketActions;
}) {
  const queryClient = useQueryClient();
  const {
    connectionStatus,
    joinConversation,
    leaveConversation,
    markDelivered,
    markRead,
  } = socket;

  const [olderPages, setOlderPages] = useState<ChatMessagePayload[][]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const [liveById, setLiveById] = useState<Map<string, ChatMessagePayload>>(
    () => new Map(),
  );
  const [optimisticMessages, setOptimisticMessages] = useState<ChatUiMessage[]>(
    [],
  );
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachmentItem[]
  >([]);
  const [composerErrorCode, setComposerErrorCode] = useState<string | null>(
    null,
  );

  const lastMarkedReadIdRef = useRef<string | null>(null);

  const conversationQuery = useChatControllerGetConversation(
    conversationId ?? '',
    {
      query: {
        enabled: Boolean(conversationId),
        staleTime: 15_000,
      },
    },
  );

  const messagesQuery = useChatControllerListMessages(
    conversationId ?? '',
    { limit: PAGE_LIMIT },
    {
      query: {
        enabled: Boolean(conversationId),
        staleTime: 10_000,
      },
    },
  );

  // Join & leave Socket.IO conversation room when connected
  useEffect(() => {
    if (!conversationId || connectionStatus !== 'connected') {
      return;
    }

    let cancelled = false;
    void joinConversation(conversationId).then((ack) => {
      if (!cancelled && ack.ok) {
        setTypingUserIds(
          ack.data.typingUserIds.filter((id) => id !== currentUser?.id),
        );
      }
    });

    return () => {
      cancelled = true;
      void leaveConversation(conversationId);
    };
  }, [
    connectionStatus,
    conversationId,
    currentUser?.id,
    joinConversation,
    leaveConversation,
  ]);

  const initialItems = useMemo(
    () => (messagesQuery.data?.items ?? []) as unknown as ChatMessagePayload[],
    [messagesQuery.data?.items],
  );

  const effectiveCursor =
    olderCursor !== undefined
      ? olderCursor
      : (messagesQuery.data?.nextBeforeMessageId ?? null);

  const messages = useMemo(
    () =>
      mergeChatMessages(olderPages, initialItems, liveById, optimisticMessages),
    [olderPages, initialItems, liveById, optimisticMessages],
  );

  // Mark latest visible incoming message as read & delivered
  useEffect(() => {
    if (
      !conversationId ||
      !currentUser ||
      connectionStatus !== 'connected' ||
      messages.length === 0
    ) {
      return;
    }

    const persistedMessages = messages.filter((m) => !m.localState);
    if (persistedMessages.length === 0) return;

    const undeliveredIds = persistedMessages
      .filter(
        (m) =>
          m.senderId !== currentUser.id &&
          m.receipts.some(
            (r) => r.userId === currentUser.id && r.status === 'SENT',
          ),
      )
      .map((m) => m.id);

    if (undeliveredIds.length > 0) {
      void markDelivered({
        conversationId,
        messageIds: undeliveredIds,
      });
    }

    const lastPersisted = persistedMessages[persistedMessages.length - 1]!;
    const alreadyRead = lastPersisted.reads.some(
      (r) => r.userId === currentUser.id,
    );
    if (!alreadyRead && lastMarkedReadIdRef.current !== lastPersisted.id) {
      lastMarkedReadIdRef.current = lastPersisted.id;
      void markRead({
        conversationId,
        messageId: lastPersisted.id,
      });
      void queryClient.invalidateQueries({
        queryKey: getChatControllerListConversationsQueryKey({
          includeArchived: false,
        }),
      });
    }
  }, [
    connectionStatus,
    conversationId,
    currentUser,
    markDelivered,
    markRead,
    messages,
    queryClient,
  ]);

  // Socket event handlers scoped to this active conversation
  const handleLiveMessageCreated = useCallback(
    (msg: ChatMessagePayload) => {
      if (msg.conversationId !== conversationId) return;
      setLiveById((prev) => {
        const next = new Map(prev);
        next.set(msg.id, msg);
        return next;
      });
      if (msg.clientNonce) {
        setOptimisticMessages((prev) =>
          prev.filter(
            (opt) =>
              !(
                opt.senderId === msg.senderId &&
                opt.clientNonce === msg.clientNonce
              ),
          ),
        );
      }
    },
    [conversationId],
  );

  const handleLiveMessageUpdated = useCallback(
    (msg: ChatMessagePayload) => {
      if (msg.conversationId !== conversationId) return;
      setLiveById((prev) => {
        const next = new Map(prev);
        next.set(msg.id, msg);
        return next;
      });
    },
    [conversationId],
  );

  const updateEveryKnownMessage = useCallback(
    (updater: (msg: ChatMessagePayload) => ChatMessagePayload) => {
      setLiveById((prev) => {
        const next = new Map(prev);
        const visited = new Set<string>();

        for (const base of initialItems) {
          visited.add(base.id);
          const current = next.get(base.id) ?? base;
          const updated = updater(current);
          if (updated !== current) {
            next.set(base.id, updated);
          }
        }
        for (const page of olderPages) {
          for (const base of page) {
            if (visited.has(base.id)) continue;
            visited.add(base.id);
            const current = next.get(base.id) ?? base;
            const updated = updater(current);
            if (updated !== current) {
              next.set(base.id, updated);
            }
          }
        }
        for (const [id, current] of prev.entries()) {
          if (visited.has(id)) continue;
          visited.add(id);
          const updated = updater(current);
          if (updated !== current) {
            next.set(id, updated);
          }
        }
        return next;
      });
    },
    [initialItems, olderPages],
  );

  const handleLiveMessageDeleted = useCallback(
    (event: ChatMessageDeletedEventPayload) => {
      if (event.conversationId !== conversationId) return;
      updateEveryKnownMessage((msg) => applyDeletedEventToMessage(msg, event));
    },
    [conversationId, updateEveryKnownMessage],
  );

  const handleLiveTypingUpdated = useCallback(
    (event: ChatTypingUpdatedEventPayload) => {
      if (event.conversationId !== conversationId) return;
      setTypingUserIds(
        event.typingUserIds.filter((id) => id !== currentUser?.id),
      );
    },
    [conversationId, currentUser?.id],
  );

  const handleLiveReadUpdated = useCallback(
    (event: ChatReadUpdatedEventPayload) => {
      if (event.conversationId !== conversationId) return;
      const target = messages.find((m) => m.id === event.messageId);
      const cutoff = target
        ? new Date(target.createdAt).getTime()
        : new Date(event.readAt).getTime();
      updateEveryKnownMessage((msg) =>
        applyReadEventToMessage(msg, event, cutoff),
      );
    },
    [conversationId, messages, updateEveryKnownMessage],
  );

  const handleLiveReceiptUpdated = useCallback(
    (event: ChatReceiptUpdatedEventPayload) => {
      if (event.conversationId !== conversationId) return;
      updateEveryKnownMessage((msg) => applyReceiptEventToMessage(msg, event));
    },
    [conversationId, updateEveryKnownMessage],
  );

  const handleLiveReactionUpdated = useCallback(
    (event: ChatReactionUpdatedEventPayload) => {
      if (event.conversationId !== conversationId) return;
      updateEveryKnownMessage((msg) => applyReactionEventToMessage(msg, event));
    },
    [conversationId, updateEveryKnownMessage],
  );

  const refreshAfterReconnect = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getChatControllerListConversationsQueryKey({
          includeArchived: false,
        }),
      }),
      conversationId
        ? queryClient.invalidateQueries({
            queryKey: getChatControllerGetConversationQueryKey(conversationId),
          })
        : Promise.resolve(),
      conversationId
        ? queryClient.invalidateQueries({
            queryKey: getChatControllerListMessagesQueryKey(conversationId, {
              limit: PAGE_LIMIT,
            }),
          })
        : Promise.resolve(),
    ]);
  }, [conversationId, queryClient]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !effectiveCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const page = await chatControllerListMessages(conversationId, {
        beforeMessageId: effectiveCursor,
        limit: PAGE_LIMIT,
      });
      setOlderPages((prev) => [
        page.items as unknown as ChatMessagePayload[],
        ...prev,
      ]);
      setOlderCursor(page.nextBeforeMessageId);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, effectiveCursor, isLoadingOlder]);

  // Direct-to-S3 attachment upload pipeline
  const stageFiles = useCallback(
    async (files: File[]) => {
      if (!conversationId) return;
      setComposerErrorCode(null);

      const remainingSlots =
        MAX_CHAT_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
      if (files.length > remainingSlots) {
        setComposerErrorCode('chat_attachment_limit_exceeded');
        return;
      }

      for (const file of files) {
        if (!isAllowedChatAttachmentMime(file.type)) {
          setComposerErrorCode('chat_attachment_invalid_type');
          continue;
        }
        if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
          setComposerErrorCode('chat_attachment_size_exceeded');
          continue;
        }

        const localId = crypto.randomUUID();
        setPendingAttachments((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            progress: 0,
            status: 'compressing',
          },
        ]);

        void (async () => {
          try {
            const preparedBytes = await prepareFileForChatUpload(file);
            if (preparedBytes.sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
              throw { code: 'chat_attachment_size_exceeded' };
            }

            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      fileName: preparedBytes.fileName,
                      mimeType: preparedBytes.mimeType,
                      sizeBytes: preparedBytes.sizeBytes,
                      status: 'uploading',
                      progress: 5,
                    }
                  : item,
              ),
            );

            const ticket = await chatAttachmentsControllerPrepareUpload(
              conversationId,
              {
                fileName: preparedBytes.fileName,
                mimeType: preparedBytes.mimeType,
                sizeBytes: preparedBytes.sizeBytes,
                sha256: preparedBytes.sha256,
                width: preparedBytes.width,
                height: preparedBytes.height,
              },
            );

            await uploadBytesToPresignedUrl(
              ticket.uploadUrl,
              ticket.headers,
              preparedBytes.blob,
              (pct) => {
                setPendingAttachments((prev) =>
                  prev.map((item) =>
                    item.localId === localId
                      ? { ...item, progress: pct }
                      : item,
                  ),
                );
              },
            );

            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? { ...item, status: 'confirming', progress: 100 }
                  : item,
              ),
            );

            const confirmed = await chatAttachmentsControllerConfirmUpload(
              conversationId,
              { uploadToken: ticket.uploadToken },
            );

            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      status: 'ready',
                      progress: 100,
                      confirmed: confirmed as unknown as ChatAttachmentPayload,
                    }
                  : item,
              ),
            );
          } catch (err) {
            const code =
              err &&
              typeof err === 'object' &&
              'code' in err &&
              typeof err.code === 'string'
                ? err.code
                : (apiErrorCode(err) ?? 'server_error');
            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? { ...item, status: 'error', errorCode: code }
                  : item,
              ),
            );
          }
        })();
      }
    },
    [conversationId, pendingAttachments.length],
  );

  /**
   * Discards an attachment the user picked but never sent.
   *
   * The upload already reached storage when the file was chosen, so the
   * row and the stored object are removed here as well — otherwise every
   * discarded file would sit in storage until the sweeper collects it.
   */
  const removePendingAttachment = useCallback(
    async (localId: string) => {
      const item = pendingAttachments.find((a) => a.localId === localId);
      setPendingAttachments((prev) =>
        prev.filter((entry) => entry.localId !== localId),
      );

      // Only a confirmed upload has a server-side row to delete. An upload
      // still in flight has no row yet; the sweep collects it later.
      const confirmedId = item?.confirmed?.id;
      if (!conversationId || !confirmedId) return;

      try {
        await chatAttachmentsControllerDeleteStagedAttachment(
          conversationId,
          confirmedId,
        );
      } catch {
        // The row stays until the sweeper removes it; discarding the file
        // locally must never fail because the server was unreachable.
      }
    },
    [conversationId, pendingAttachments],
  );

  const hasUploadingAttachments = pendingAttachments.some(
    (a) =>
      a.status === 'compressing' ||
      a.status === 'uploading' ||
      a.status === 'confirming',
  );

  const submitMessage = useCallback(
    async (rawBody: string): Promise<boolean> => {
      if (!conversationId || !currentUser || hasUploadingAttachments) {
        return false;
      }

      const readyAttachments = pendingAttachments
        .filter((a) => a.status === 'ready' && a.confirmed)
        .map((a) => a.confirmed!);

      if (rawBody.trim().length === 0 && readyAttachments.length === 0) {
        setComposerErrorCode('chat_message_empty');
        return false;
      }

      setComposerErrorCode(null);
      const clientNonce = crypto.randomUUID();
      const tempId = `temp-${clientNonce}`;
      const nowIso = new Date().toISOString();

      const optimistic: ChatUiMessage = {
        id: tempId,
        conversationId,
        senderId: currentUser.id,
        sender: currentUser,
        body: rawBody,
        clientNonce,
        mentions: [],
        reactions: [],
        attachments: readyAttachments,
        reads: [
          {
            messageId: tempId,
            userId: currentUser.id,
            readAt: nowIso,
          },
        ],
        receipts: [],
        createdAt: nowIso,
        editedAt: null,
        deletedAt: null,
        deletedBy: null,
        localState: 'sending',
      };

      setOptimisticMessages((prev) => [...prev, optimistic]);
      setPendingAttachments([]);

      const ack = await socket.sendMessage({
        conversationId,
        body: rawBody,
        clientNonce,
        attachmentIds: readyAttachments.map((a) => a.id),
      });

      if (ack.ok) {
        setLiveById((prev) => {
          const next = new Map(prev);
          next.set(ack.data.id, ack.data);
          return next;
        });
        setOptimisticMessages((prev) =>
          prev.filter((item) => item.clientNonce !== clientNonce),
        );
        return true;
      }

      setOptimisticMessages((prev) =>
        prev.map((item) =>
          item.clientNonce === clientNonce
            ? { ...item, localState: 'failed', localErrorCode: ack.code }
            : item,
        ),
      );
      return false;
    },
    [
      conversationId,
      currentUser,
      hasUploadingAttachments,
      pendingAttachments,
      socket,
    ],
  );

  const retryFailedMessage = useCallback(
    async (failedMsg: ChatUiMessage) => {
      if (!conversationId || !failedMsg.clientNonce) return;

      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === failedMsg.id
            ? { ...m, localState: 'sending', localErrorCode: undefined }
            : m,
        ),
      );

      const ack = await socket.sendMessage({
        conversationId,
        body: failedMsg.body,
        clientNonce: failedMsg.clientNonce,
        attachmentIds: failedMsg.attachments.map((a) => a.id),
      });

      if (ack.ok) {
        setLiveById((prev) => {
          const next = new Map(prev);
          next.set(ack.data.id, ack.data);
          return next;
        });
        setOptimisticMessages((prev) =>
          prev.filter((m) => m.id !== failedMsg.id),
        );
      } else {
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.id === failedMsg.id
              ? { ...m, localState: 'failed', localErrorCode: ack.code }
              : m,
          ),
        );
      }
    },
    [conversationId, socket],
  );

  const toggleReactionOptimistic = useCallback(
    async (messageId: string, emoji: string): Promise<string | null> => {
      if (!conversationId || !currentUser) return null;

      const target = messages.find((m) => m.id === messageId);
      if (!target || target.localState) return null;

      const snapshot = target.reactions;
      const optimisticReactions = toggleReactionOptimistically(
        snapshot,
        currentUser.id,
        emoji,
      );

      updateEveryKnownMessage((msg) =>
        msg.id === messageId ? { ...msg, reactions: optimisticReactions } : msg,
      );

      const ack = await socket.toggleReaction({
        conversationId,
        messageId,
        reaction: emoji,
      });

      if (!ack.ok) {
        // Rollback on failure
        updateEveryKnownMessage((msg) =>
          msg.id === messageId ? { ...msg, reactions: snapshot } : msg,
        );
        return ack.code;
      }

      updateEveryKnownMessage((msg) =>
        applyReactionEventToMessage(msg, ack.data),
      );
      return null;
    },
    [conversationId, currentUser, messages, socket, updateEveryKnownMessage],
  );

  const editExistingMessage = useCallback(
    async (messageId: string, nextBody: string): Promise<string | null> => {
      if (!conversationId) return null;
      const ack = await socket.editMessage({
        conversationId,
        messageId,
        body: nextBody,
      });
      if (!ack.ok) {
        return ack.code;
      }
      handleLiveMessageUpdated(ack.data);
      return null;
    },
    [conversationId, handleLiveMessageUpdated, socket],
  );

  const deleteExistingMessage = useCallback(
    async (messageId: string): Promise<string | null> => {
      if (!conversationId) return null;
      const ack = await socket.deleteMessage({
        conversationId,
        messageId,
      });
      if (!ack.ok) {
        return ack.code;
      }
      handleLiveMessageDeleted(ack.data);
      return null;
    },
    [conversationId, handleLiveMessageDeleted, socket],
  );

  return {
    conversation: conversationQuery.data ?? null,
    isConversationLoading:
      conversationQuery.isPending && conversationQuery.fetchStatus !== 'idle',
    isConversationFailed: conversationQuery.isError,
    conversationError: conversationQuery.error,
    refetchConversation: conversationQuery.refetch,

    messages,
    isMessagesLoading:
      messagesQuery.isPending && messagesQuery.fetchStatus !== 'idle',
    isMessagesFailed: messagesQuery.isError,
    messagesError: messagesQuery.error,
    refetchMessages: messagesQuery.refetch,
    hasOlderMessages: Boolean(effectiveCursor),
    isLoadingOlder,
    loadOlderMessages,

    typingUserIds,
    pendingAttachments,
    hasUploadingAttachments,
    composerErrorCode,
    clearComposerError: () => setComposerErrorCode(null),
    stageFiles,
    removePendingAttachment,

    submitMessage,
    retryFailedMessage,
    toggleReactionOptimistic,
    editExistingMessage,
    deleteExistingMessage,

    // Live socket event bridges
    handleLiveMessageCreated,
    handleLiveMessageUpdated,
    handleLiveMessageDeleted,
    handleLiveTypingUpdated,
    handleLiveReadUpdated,
    handleLiveReceiptUpdated,
    handleLiveReactionUpdated,
    refreshAfterReconnect,
  };
}
