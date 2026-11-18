'use client';

import {
  CHAT_RECONNECT_CONFIG,
  CHAT_SOCKET_NAMESPACE,
  ChatClientEvent,
  ChatServerEvent,
  type ChatClientToServerEvents,
  type ChatConversationSummaryPayload,
  type ChatDeleteMessagePayload,
  type ChatEditMessagePayload,
  type ChatMarkDeliveredPayload,
  type ChatMarkReadPayload,
  type ChatMentionNotificationEventPayload,
  type ChatMessageDeletedEventPayload,
  type ChatMessagePayload,
  type ChatReactionUpdatedEventPayload,
  type ChatReadUpdatedEventPayload,
  type ChatReceiptUpdatedEventPayload,
  type ChatSendMessagePayload,
  type ChatServerToClientEvents,
  type ChatSocketAck,
  type ChatToggleReactionPayload,
  type ChatTypingUpdatedEventPayload,
} from '@researchos/chat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChatConnectionStatus } from '../types';

export type TypedChatClientSocket = Socket<
  ChatServerToClientEvents,
  ChatClientToServerEvents
>;

export interface ChatSocketEventHandlers {
  onMessageCreated?: (msg: ChatMessagePayload) => void;
  onMessageUpdated?: (msg: ChatMessagePayload) => void;
  onMessageDeleted?: (payload: ChatMessageDeletedEventPayload) => void;
  onTypingUpdated?: (payload: ChatTypingUpdatedEventPayload) => void;
  onReadUpdated?: (payload: ChatReadUpdatedEventPayload) => void;
  onReceiptUpdated?: (payload: ChatReceiptUpdatedEventPayload) => void;
  onReactionUpdated?: (payload: ChatReactionUpdatedEventPayload) => void;
  onConversationUpdated?: (payload: ChatConversationSummaryPayload) => void;
  onMentionNotification?: (
    payload: ChatMentionNotificationEventPayload,
  ) => void;
  onReconnected?: () => void;
}

export function buildChatSocketUrl(
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}${CHAT_SOCKET_NAMESPACE}`;
}

export function useChatSocket({
  enabled = true,
  handlers,
}: {
  enabled?: boolean;
  handlers?: ChatSocketEventHandlers;
}) {
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting');
  const socketRef = useRef<TypedChatClientSocket | null>(null);
  const handlersRef = useRef(handlers);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket: TypedChatClientSocket = io(buildChatSocketUrl(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      ...CHAT_RECONNECT_CONFIG,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setStatus('connected');
      if (hasConnectedOnceRef.current) {
        handlersRef.current?.onReconnected?.();
      }
      hasConnectedOnceRef.current = true;
    };

    const handleDisconnect = () => {
      setStatus('disconnected');
    };

    const handleConnectError = () => {
      setStatus((prev) =>
        prev === 'reconnecting' ? 'reconnecting' : 'disconnected',
      );
    };

    const handleReconnectAttempt = () => {
      setStatus('reconnecting');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);

    socket.on(ChatServerEvent.MESSAGE_CREATED, (msg) =>
      handlersRef.current?.onMessageCreated?.(msg),
    );
    socket.on(ChatServerEvent.MESSAGE_UPDATED, (msg) =>
      handlersRef.current?.onMessageUpdated?.(msg),
    );
    socket.on(ChatServerEvent.MESSAGE_DELETED, (evt) =>
      handlersRef.current?.onMessageDeleted?.(evt),
    );
    socket.on(ChatServerEvent.TYPING_UPDATED, (evt) =>
      handlersRef.current?.onTypingUpdated?.(evt),
    );
    socket.on(ChatServerEvent.READ_UPDATED, (evt) =>
      handlersRef.current?.onReadUpdated?.(evt),
    );
    socket.on(ChatServerEvent.RECEIPT_UPDATED, (evt) =>
      handlersRef.current?.onReceiptUpdated?.(evt),
    );
    socket.on(ChatServerEvent.REACTION_UPDATED, (evt) =>
      handlersRef.current?.onReactionUpdated?.(evt),
    );
    socket.on(ChatServerEvent.CONVERSATION_UPDATED, (evt) =>
      handlersRef.current?.onConversationUpdated?.(evt),
    );
    socket.on(ChatServerEvent.MENTION_NOTIFICATION, (evt) =>
      handlersRef.current?.onMentionNotification?.(evt),
    );

    return () => {
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  const emitAck = useCallback(
    <T>(
      invoke: (
        socket: TypedChatClientSocket,
        cb: (ack: ChatSocketAck<T>) => void,
      ) => void,
    ): Promise<ChatSocketAck<T>> => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        return Promise.resolve({
          ok: false,
          code: 'service_unavailable',
          status: 503,
        });
      }

      return new Promise<ChatSocketAck<T>>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            ok: false,
            code: 'service_unavailable',
            status: 503,
          });
        }, 10_000);

        invoke(socket, (ack) => {
          clearTimeout(timeout);
          resolve(ack);
        });
      });
    },
    [],
  );

  const joinConversation = useCallback(
    (conversationId: string) =>
      emitAck<{ conversationId: string; typingUserIds: string[] }>(
        (socket, cb) =>
          socket.emit(
            ChatClientEvent.JOIN_CONVERSATION,
            { conversationId },
            cb,
          ),
      ),
    [emitAck],
  );

  const leaveConversation = useCallback(
    (conversationId: string) =>
      emitAck<{ conversationId: string }>((socket, cb) =>
        socket.emit(ChatClientEvent.LEAVE_CONVERSATION, { conversationId }, cb),
      ),
    [emitAck],
  );

  const sendMessage = useCallback(
    (payload: ChatSendMessagePayload) =>
      emitAck<ChatMessagePayload>((socket, cb) =>
        socket.emit(ChatClientEvent.SEND_MESSAGE, payload, cb),
      ),
    [emitAck],
  );

  const editMessage = useCallback(
    (payload: ChatEditMessagePayload) =>
      emitAck<ChatMessagePayload>((socket, cb) =>
        socket.emit(ChatClientEvent.EDIT_MESSAGE, payload, cb),
      ),
    [emitAck],
  );

  const deleteMessage = useCallback(
    (payload: ChatDeleteMessagePayload) =>
      emitAck<ChatMessageDeletedEventPayload>((socket, cb) =>
        socket.emit(ChatClientEvent.DELETE_MESSAGE, payload, cb),
      ),
    [emitAck],
  );

  const startTyping = useCallback((conversationId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(ChatClientEvent.TYPING_START, { conversationId });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(ChatClientEvent.TYPING_STOP, { conversationId });
  }, []);

  const markRead = useCallback(
    (payload: ChatMarkReadPayload) =>
      emitAck<ChatReadUpdatedEventPayload>((socket, cb) =>
        socket.emit(ChatClientEvent.MARK_READ, payload, cb),
      ),
    [emitAck],
  );

  const markDelivered = useCallback(
    (payload: ChatMarkDeliveredPayload) =>
      emitAck<ChatReceiptUpdatedEventPayload>((socket, cb) =>
        socket.emit(ChatClientEvent.MARK_DELIVERED, payload, cb),
      ),
    [emitAck],
  );

  const toggleReaction = useCallback(
    (payload: ChatToggleReactionPayload) =>
      emitAck<ChatReactionUpdatedEventPayload>((socket, cb) =>
        socket.emit(ChatClientEvent.TOGGLE_REACTION, payload, cb),
      ),
    [emitAck],
  );

  return {
    connectionStatus: status,
    joinConversation,
    leaveConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    startTyping,
    stopTyping,
    markRead,
    markDelivered,
    toggleReaction,
  };
}
