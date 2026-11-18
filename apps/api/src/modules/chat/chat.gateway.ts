import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  CHAT_SOCKET_NAMESPACE,
  CHAT_TYPING_TTL_MS,
  ChatClientEvent,
  ChatServerEvent,
  type ChatClientToServerEvents,
  type ChatConversationSummaryPayload,
  type ChatMessageDeletedEventPayload,
  type ChatMessagePayload,
  type ChatReactionUpdatedEventPayload,
  type ChatReadUpdatedEventPayload,
  type ChatReceiptUpdatedEventPayload,
  type ChatServerToClientEvents,
  type ChatSocketAck,
  type ChatSocketErrorPayload,
} from '@researchos/chat';
import { codeForStatus, domainErrorCodes } from '@researchos/error-codes';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import type { Namespace, Socket } from 'socket.io';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { SESSION_COOKIE_NAME } from '../../common/auth/session-cookie.js';
import {
  SESSION_RESOLVER,
  type SessionResolver,
} from '../../common/auth/session-resolver.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { ChatService } from './chat.service.js';
import {
  ChatRoomSocketDto,
  DeleteChatMessageSocketDto,
  EditChatMessageSocketDto,
  MarkChatDeliveredSocketDto,
  MarkChatReadSocketDto,
  SendChatMessageSocketDto,
  ToggleChatReactionSocketDto,
} from './dto/chat.dto.js';

interface SocketSessionData {
  principal?: AuthPrincipal;
}

export type ChatAuthenticatedSocket = Socket<
  ChatClientToServerEvents,
  ChatServerToClientEvents,
  Record<string, never>,
  SocketSessionData
>;

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function readCookieFromHeader(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key !== cookieName) continue;
    const rawVal = part.slice(eqIndex + 1).trim();
    if (!rawVal) return undefined;
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return undefined;
}

@Injectable()
@WebSocketGateway({
  namespace: CHAT_SOCKET_NAMESPACE,
  cors: {
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server?: Namespace<
    ChatClientToServerEvents,
    ChatServerToClientEvents,
    Record<string, never>,
    SocketSessionData
  >;

  /** Transient typing expiry timers: conversationId -> userId -> timeout */
  private readonly typingTimers = new Map<
    string,
    Map<string, ReturnType<typeof setTimeout>>
  >();

  constructor(
    @Inject(SESSION_RESOLVER) private readonly sessionResolver: SessionResolver,
    private readonly chatService: ChatService,
  ) {}

  onModuleDestroy(): void {
    for (const userMap of this.typingTimers.values()) {
      for (const timer of userMap.values()) {
        clearTimeout(timer);
      }
    }
    this.typingTimers.clear();
  }

  async handleConnection(client: ChatAuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractSessionToken(client);
      if (!token) {
        this.rejectConnection(client, {
          code: codeForStatus(HttpStatus.UNAUTHORIZED),
          status: HttpStatus.UNAUTHORIZED,
        });
        return;
      }

      const principal = await this.sessionResolver.resolve(token);
      if (!principal) {
        this.rejectConnection(client, {
          code: codeForStatus(HttpStatus.UNAUTHORIZED),
          status: HttpStatus.UNAUTHORIZED,
        });
        return;
      }

      if (principal.mustChangePassword) {
        this.rejectConnection(client, {
          code: domainErrorCodes.identity.mustChangePassword,
          status: HttpStatus.FORBIDDEN,
        });
        return;
      }

      await this.sessionResolver
        .refresh(principal.sessionId)
        .catch(() => undefined);

      client.data.principal = principal;
      await client.join(userRoom(principal.userId));

      // Optional initial conversation handshake target (`auth.conversationId`).
      const initialConversationId =
        typeof client.handshake.auth?.conversationId === 'string'
          ? client.handshake.auth.conversationId
          : typeof client.handshake.query?.conversationId === 'string'
            ? client.handshake.query.conversationId
            : undefined;

      if (initialConversationId) {
        const dto = await this.validatePayload(ChatRoomSocketDto, {
          conversationId: initialConversationId,
        });
        await this.chatService.assertParticipant(
          principal.userId,
          dto.conversationId,
        );
        await client.join(conversationRoom(dto.conversationId));
      }

      client.emit(ChatServerEvent.CONNECTED, {
        userId: principal.userId,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      const mapped = this.toSocketError(error);
      this.rejectConnection(client, mapped);
    }
  }

  handleDisconnect(client: ChatAuthenticatedSocket): void {
    const userId = client.data.principal?.userId;
    if (!userId) return;

    for (const [conversationId, userMap] of this.typingTimers.entries()) {
      if (userMap.has(userId)) {
        this.clearUserTyping(conversationId, userId, true);
      }
    }
  }

  @SubscribeMessage(ChatClientEvent.JOIN_CONVERSATION)
  async onJoinConversation(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<
    ChatSocketAck<{ conversationId: string; typingUserIds: string[] }>
  > {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(ChatRoomSocketDto, payload);
      await this.chatService.assertParticipant(userId, dto.conversationId);
      await client.join(conversationRoom(dto.conversationId));
      return {
        conversationId: dto.conversationId,
        typingUserIds: this.getTypingUserIds(dto.conversationId),
      };
    });
  }

  @SubscribeMessage(ChatClientEvent.LEAVE_CONVERSATION)
  async onLeaveConversation(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ conversationId: string }>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(ChatRoomSocketDto, payload);
      await client.leave(conversationRoom(dto.conversationId));
      this.clearUserTyping(dto.conversationId, userId, true);
      return { conversationId: dto.conversationId };
    });
  }

  @SubscribeMessage(ChatClientEvent.SEND_MESSAGE)
  async onSendMessage(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatMessagePayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(SendChatMessageSocketDto, payload);
      const outcome = await this.chatService.sendMessage(userId, dto);

      this.clearUserTyping(dto.conversationId, userId, true);

      if (outcome.created) {
        this.emitToConversation(
          dto.conversationId,
          ChatServerEvent.MESSAGE_CREATED,
          outcome.message,
        );

        for (const notif of outcome.mentionNotifications) {
          this.emitToUser(
            notif.mentionedUserId,
            ChatServerEvent.MENTION_NOTIFICATION,
            notif,
          );
        }

        await this.broadcastConversationToParticipants(
          dto.conversationId,
          outcome.participantIds,
        );
      }

      return outcome.message;
    });
  }

  @SubscribeMessage(ChatClientEvent.EDIT_MESSAGE)
  async onEditMessage(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatMessagePayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(EditChatMessageSocketDto, payload);
      const outcome = await this.chatService.editMessage(userId, dto);

      this.emitToConversation(
        dto.conversationId,
        ChatServerEvent.MESSAGE_UPDATED,
        outcome.message,
      );

      for (const notif of outcome.mentionNotifications) {
        this.emitToUser(
          notif.mentionedUserId,
          ChatServerEvent.MENTION_NOTIFICATION,
          notif,
        );
      }

      return outcome.message;
    });
  }

  @SubscribeMessage(ChatClientEvent.DELETE_MESSAGE)
  async onDeleteMessage(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatMessageDeletedEventPayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(
        DeleteChatMessageSocketDto,
        payload,
      );
      const { deleted, participantIds } = await this.chatService.deleteMessage(
        userId,
        dto,
      );

      this.emitToConversation(
        dto.conversationId,
        ChatServerEvent.MESSAGE_DELETED,
        deleted,
      );

      await this.broadcastConversationToParticipants(
        dto.conversationId,
        participantIds,
      );

      return deleted;
    });
  }

  @SubscribeMessage(ChatClientEvent.TYPING_START)
  async onTypingStart(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ ok: boolean }>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(ChatRoomSocketDto, payload);
      await this.chatService.assertParticipant(userId, dto.conversationId);
      this.setUserTyping(dto.conversationId, userId);
      return { ok: true };
    });
  }

  @SubscribeMessage(ChatClientEvent.TYPING_STOP)
  async onTypingStop(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ ok: boolean }>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(ChatRoomSocketDto, payload);
      await this.chatService.assertParticipant(userId, dto.conversationId);
      this.clearUserTyping(dto.conversationId, userId, true);
      return { ok: true };
    });
  }

  @SubscribeMessage(ChatClientEvent.MARK_READ)
  async onMarkRead(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatReadUpdatedEventPayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(MarkChatReadSocketDto, payload);
      const readPayload = await this.chatService.markRead(userId, dto);
      this.emitToConversation(
        dto.conversationId,
        ChatServerEvent.READ_UPDATED,
        readPayload,
      );
      return readPayload;
    });
  }

  @SubscribeMessage(ChatClientEvent.MARK_DELIVERED)
  async onMarkDelivered(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatReceiptUpdatedEventPayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(
        MarkChatDeliveredSocketDto,
        payload,
      );
      const receiptPayload = await this.chatService.markDelivered(userId, dto);
      if (receiptPayload.messageIds.length > 0) {
        this.emitToConversation(
          dto.conversationId,
          ChatServerEvent.RECEIPT_UPDATED,
          receiptPayload,
        );
      }
      return receiptPayload;
    });
  }

  @SubscribeMessage(ChatClientEvent.TOGGLE_REACTION)
  async onToggleReaction(
    @ConnectedSocket() client: ChatAuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<ChatReactionUpdatedEventPayload>> {
    return this.executeWithAck(client, async (userId) => {
      const dto = await this.validatePayload(
        ToggleChatReactionSocketDto,
        payload,
      );
      const reactionPayload = await this.chatService.toggleReaction(
        userId,
        dto,
      );
      this.emitToConversation(
        dto.conversationId,
        ChatServerEvent.REACTION_UPDATED,
        reactionPayload,
      );
      return reactionPayload;
    });
  }

  async broadcastConversationToParticipants(
    conversationId: string,
    participantIds: string[],
  ): Promise<void> {
    if (!this.server) return;
    await Promise.all(
      participantIds.map(async (uid) => {
        try {
          const summary = await this.chatService.getConversation(
            uid,
            conversationId,
          );
          this.emitToUser(
            uid,
            ChatServerEvent.CONVERSATION_UPDATED,
            summary as ChatConversationSummaryPayload,
          );
        } catch {
          // Participant may have left concurrently; ignore safely.
        }
      }),
    );
  }

  private setUserTyping(conversationId: string, userId: string): void {
    let userMap = this.typingTimers.get(conversationId);
    if (!userMap) {
      userMap = new Map();
      this.typingTimers.set(conversationId, userMap);
    }

    const hadExisting = userMap.has(userId);
    const existingTimer = userMap.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.clearUserTyping(conversationId, userId, true);
    }, CHAT_TYPING_TTL_MS);
    timer.unref?.();
    userMap.set(userId, timer);

    if (!hadExisting) {
      this.broadcastTyping(conversationId);
    }
  }

  private clearUserTyping(
    conversationId: string,
    userId: string,
    broadcast: boolean,
  ): void {
    const userMap = this.typingTimers.get(conversationId);
    if (!userMap) return;
    const timer = userMap.get(userId);
    if (!timer) return;

    clearTimeout(timer);
    userMap.delete(userId);
    if (userMap.size === 0) {
      this.typingTimers.delete(conversationId);
    }

    if (broadcast) {
      this.broadcastTyping(conversationId);
    }
  }

  private getTypingUserIds(conversationId: string): string[] {
    const userMap = this.typingTimers.get(conversationId);
    return userMap ? Array.from(userMap.keys()) : [];
  }

  private broadcastTyping(conversationId: string): void {
    this.emitToConversation(conversationId, ChatServerEvent.TYPING_UPDATED, {
      conversationId,
      typingUserIds: this.getTypingUserIds(conversationId),
      updatedAt: new Date().toISOString(),
    });
  }

  private emitToConversation<E extends keyof ChatServerToClientEvents>(
    conversationId: string,
    event: E,
    ...args: Parameters<ChatServerToClientEvents[E]>
  ): void {
    if (!this.server) return;
    this.server.to(conversationRoom(conversationId)).emit(event, ...args);
  }

  private emitToUser<E extends keyof ChatServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ChatServerToClientEvents[E]>
  ): void {
    if (!this.server) return;
    this.server.to(userRoom(userId)).emit(event, ...args);
  }

  private extractSessionToken(
    client: ChatAuthenticatedSocket,
  ): string | undefined {
    const fromCookie = readCookieFromHeader(
      client.handshake.headers?.cookie,
      SESSION_COOKIE_NAME,
    );
    if (fromCookie) return fromCookie;

    const fromAuth = client.handshake.auth?.sessionToken;
    return typeof fromAuth === 'string' && fromAuth.length > 0
      ? fromAuth
      : undefined;
  }

  private rejectConnection(
    client: ChatAuthenticatedSocket,
    errorPayload: ChatSocketErrorPayload,
  ): void {
    client.emit(ChatServerEvent.ERROR, errorPayload);
    client.disconnect(true);
  }

  private async executeWithAck<T>(
    client: ChatAuthenticatedSocket,
    handler: (userId: string) => Promise<T>,
  ): Promise<ChatSocketAck<T>> {
    const principal = client.data.principal;
    if (!principal) {
      return {
        ok: false,
        code: codeForStatus(HttpStatus.UNAUTHORIZED),
        status: HttpStatus.UNAUTHORIZED,
      };
    }

    try {
      const data = await handler(principal.userId);
      return { ok: true, data };
    } catch (error) {
      const mapped = this.toSocketError(error);
      return { ok: false, ...mapped };
    }
  }

  private async validatePayload<T extends object>(
    cls: new () => T,
    raw: unknown,
  ): Promise<T> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ValidationFailureError({
        payload: ['validation_failed'],
      });
    }

    const instance = plainToInstance(cls, raw, {
      enableImplicitConversion: true,
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new ValidationFailureError(this.flattenValidationErrors(errors));
    }

    return instance;
  }

  private flattenValidationErrors(
    errors: ValidationError[],
  ): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const err of errors) {
      const constraints = err.constraints
        ? Object.values(err.constraints)
        : ['validation_failed'];
      grouped[err.property] = constraints.map(() => 'validation_failed');
    }
    return grouped;
  }

  private toSocketError(error: unknown): ChatSocketErrorPayload {
    if (error instanceof ValidationFailureError) {
      return {
        code: codeForStatus(HttpStatus.BAD_REQUEST),
        status: HttpStatus.BAD_REQUEST,
        fieldErrors: error.fieldErrors,
      };
    }

    if (error instanceof CodedHttpException) {
      return {
        code: error.code,
        status: error.getStatus(),
      };
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      return {
        code: codeForStatus(status),
        status,
      };
    }

    this.logger.error(
      `Unhandled Socket.IO chat error: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return {
      code: codeForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}

class ValidationFailureError extends Error {
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super('validation_failed');
  }
}
