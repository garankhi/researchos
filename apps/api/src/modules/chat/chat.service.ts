import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ChatReceiptStatusEnum,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  isAllowedChatReaction,
  parseMentionTokens,
  type ChatMentionNotificationEventPayload,
  type ChatMessageDeletedEventPayload,
  type ChatReactionSummaryPayload,
  type ChatReactionUpdatedEventPayload,
  type ChatReadUpdatedEventPayload,
  type ChatReceiptUpdatedEventPayload,
} from '@researchos/chat';
import {
  ChatConversationType,
  ChatParticipantRole,
  ChatReceiptStatus,
  Prisma,
  PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  ChatAttachmentsService,
  mapChatAttachmentToDto,
} from './chat-attachments.service.js';
import type {
  AddChatParticipantDto,
  ChatConversationResponseDto,
  ChatMessageHistoryResponseDto,
  ChatMessageResponseDto,
  ChatParticipantResponseDto,
  ChatUserSummaryDto,
  CreateChatConversationDto,
  DeleteChatMessageSocketDto,
  EditChatMessageSocketDto,
  ListChatMessagesQueryDto,
  MarkChatDeliveredSocketDto,
  MarkChatReadSocketDto,
  SearchChatUsersQueryDto,
  SendChatMessageSocketDto,
  ToggleChatReactionSocketDto,
  UpdateChatConversationDto,
} from './dto/chat.dto.js';

const USER_SUMMARY_SELECT = {
  id: true,
  full_name: true,
  email: true,
  department_unit: true,
} as const;

const MESSAGE_HYDRATED_INCLUDE = {
  sender: { select: USER_SUMMARY_SELECT },
  chat_message_mentions: {
    include: { users: { select: USER_SUMMARY_SELECT } },
    orderBy: { mentioned_at: 'asc' },
  },
  chat_message_reactions: {
    orderBy: { created_at: 'asc' },
  },
  chat_message_attachments: {
    orderBy: { created_at: 'asc' },
  },
  chat_message_reads: {
    orderBy: { read_at: 'asc' },
  },
  chat_message_receipts: {
    orderBy: { updated_at: 'asc' },
  },
} as const satisfies Prisma.chat_messagesInclude;

type HydratedMessageRow = Prisma.chat_messagesGetPayload<{
  include: typeof MESSAGE_HYDRATED_INCLUDE;
}>;

export interface SendMessageOutcome {
  message: ChatMessageResponseDto;
  created: boolean;
  participantIds: string[];
  mentionNotifications: ChatMentionNotificationEventPayload[];
}

export interface EditMessageOutcome {
  message: ChatMessageResponseDto;
  participantIds: string[];
  mentionNotifications: ChatMentionNotificationEventPayload[];
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: ChatAttachmentsService,
  ) {}

  async searchUsers(
    callerId: string,
    query: SearchChatUsersQueryDto,
  ): Promise<ChatUserSummaryDto[]> {
    const term = query.search?.trim();
    const limit = query.limit ?? 20;

    const users = await this.prisma.users.findMany({
      where: {
        is_active: true,
        id: { not: callerId },
        ...(term
          ? {
              OR: [
                { full_name: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { department_unit: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: USER_SUMMARY_SELECT,
      orderBy: { full_name: 'asc' },
      take: limit,
    });

    return users.map((u) => this.mapUserSummary(u));
  }

  async listConversations(
    userId: string,
    includeArchived = false,
  ): Promise<ChatConversationResponseDto[]> {
    const conversations = await this.prisma.chat_conversations.findMany({
      where: {
        ...(includeArchived ? {} : { archived_at: null }),
        chat_conversation_participants: {
          some: { user_id: userId },
        },
      },
      include: {
        chat_conversation_participants: {
          include: { users: { select: USER_SUMMARY_SELECT } },
          orderBy: { joined_at: 'asc' },
        },
        chat_messages: {
          where: { deleted_at: null },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          include: MESSAGE_HYDRATED_INCLUDE,
        },
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });

    return Promise.all(
      conversations.map(async (conv) => {
        const callerParticipant = conv.chat_conversation_participants.find(
          (p) => p.user_id === userId,
        );
        const unreadCount = await this.countUnreadMessages(
          conv.id,
          userId,
          callerParticipant?.last_read_at ?? null,
        );
        return {
          id: conv.id,
          title: conv.title,
          type: conv.type,
          createdBy: conv.created_by,
          createdAt: conv.created_at.toISOString(),
          updatedAt: conv.updated_at.toISOString(),
          archivedAt: conv.archived_at?.toISOString() ?? null,
          participants: conv.chat_conversation_participants.map((p) =>
            this.mapParticipant(p),
          ),
          lastMessage: conv.chat_messages[0]
            ? this.mapMessage(conv.chat_messages[0])
            : null,
          unreadCount,
        };
      }),
    );
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationResponseDto> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      include: {
        chat_conversation_participants: {
          include: { users: { select: USER_SUMMARY_SELECT } },
          orderBy: { joined_at: 'asc' },
        },
        chat_messages: {
          where: { deleted_at: null },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          include: MESSAGE_HYDRATED_INCLUDE,
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const callerParticipant = conv.chat_conversation_participants.find(
      (p) => p.user_id === userId,
    );
    if (!callerParticipant) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    const unreadCount = await this.countUnreadMessages(
      conv.id,
      userId,
      callerParticipant.last_read_at,
    );

    return {
      id: conv.id,
      title: conv.title,
      type: conv.type,
      createdBy: conv.created_by,
      createdAt: conv.created_at.toISOString(),
      updatedAt: conv.updated_at.toISOString(),
      archivedAt: conv.archived_at?.toISOString() ?? null,
      participants: conv.chat_conversation_participants.map((p) =>
        this.mapParticipant(p),
      ),
      lastMessage: conv.chat_messages[0]
        ? this.mapMessage(conv.chat_messages[0])
        : null,
      unreadCount,
    };
  }

  async assertParticipant(
    userId: string,
    conversationId: string,
  ): Promise<{ role: ChatParticipantRole; participantIds: string[] }> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        chat_conversation_participants: {
          select: { user_id: true, role: true },
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const me = conv.chat_conversation_participants.find(
      (p) => p.user_id === userId,
    );
    if (!me) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      role: me.role,
      participantIds: conv.chat_conversation_participants.map((p) => p.user_id),
    };
  }

  async createConversation(
    userId: string,
    dto: CreateChatConversationDto,
  ): Promise<ChatConversationResponseDto> {
    const otherIds = [
      ...new Set(dto.participantIds.map((id) => id.toLowerCase())),
    ].filter((id) => id !== userId.toLowerCase());

    if (dto.type === ChatConversationType.DIRECT) {
      if (otherIds.length !== 1) {
        throw new CodedHttpException(
          domainErrorCodes.chat.directParticipantInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
      const peerId = otherIds[0]!;
      await this.assertActiveUsersExist([peerId]);

      // Reuse an existing active 2-participant DIRECT conversation if present.
      const existingDirect = await this.prisma.chat_conversations.findFirst({
        where: {
          type: ChatConversationType.DIRECT,
          archived_at: null,
          AND: [
            { chat_conversation_participants: { some: { user_id: userId } } },
            { chat_conversation_participants: { some: { user_id: peerId } } },
          ],
        },
        select: {
          id: true,
          _count: { select: { chat_conversation_participants: true } },
        },
      });

      if (
        existingDirect &&
        existingDirect._count.chat_conversation_participants === 2
      ) {
        return this.getConversation(userId, existingDirect.id);
      }

      const created = await this.prisma.chat_conversations.create({
        data: {
          type: ChatConversationType.DIRECT,
          title: null,
          created_by: userId,
          chat_conversation_participants: {
            create: [
              { user_id: userId, role: ChatParticipantRole.OWNER },
              { user_id: peerId, role: ChatParticipantRole.MEMBER },
            ],
          },
        },
        select: { id: true },
      });

      return this.getConversation(userId, created.id);
    }

    if (otherIds.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.chat.directParticipantInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.assertActiveUsersExist(otherIds);
    const trimmedTitle = dto.title?.trim() || null;

    const created = await this.prisma.chat_conversations.create({
      data: {
        type: ChatConversationType.GROUP,
        title: trimmedTitle,
        created_by: userId,
        chat_conversation_participants: {
          create: [
            { user_id: userId, role: ChatParticipantRole.OWNER },
            ...otherIds.map((peerId) => ({
              user_id: peerId,
              role: ChatParticipantRole.MEMBER,
            })),
          ],
        },
      },
      select: { id: true },
    });

    return this.getConversation(userId, created.id);
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: UpdateChatConversationDto,
  ): Promise<ChatConversationResponseDto> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      include: {
        chat_conversation_participants: {
          select: { user_id: true, role: true },
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const me = conv.chat_conversation_participants.find(
      (p) => p.user_id === userId,
    );
    if (!me) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    const wantsConversationMutation =
      dto.title !== undefined || dto.archived !== undefined;
    if (
      wantsConversationMutation &&
      conv.type === ChatConversationType.GROUP &&
      me.role !== ChatParticipantRole.OWNER
    ) {
      throw new CodedHttpException(
        domainErrorCodes.chat.ownerRequired,
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.notificationMuted !== undefined) {
        await tx.chat_conversation_participants.update({
          where: {
            conversation_id_user_id: {
              conversation_id: conversationId,
              user_id: userId,
            },
          },
          data: { notification_muted: dto.notificationMuted },
        });
      }

      if (wantsConversationMutation) {
        const nextTitle =
          dto.title !== undefined
            ? conv.type === ChatConversationType.DIRECT
              ? null
              : dto.title?.trim() || null
            : undefined;
        await tx.chat_conversations.update({
          where: { id: conversationId },
          data: {
            ...(nextTitle !== undefined ? { title: nextTitle } : {}),
            ...(dto.archived !== undefined
              ? { archived_at: dto.archived ? new Date() : null }
              : {}),
            updated_at: new Date(),
          },
        });
      }
    });

    return this.getConversation(userId, conversationId);
  }

  async addParticipant(
    callerId: string,
    conversationId: string,
    dto: AddChatParticipantDto,
  ): Promise<ChatParticipantResponseDto> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      include: {
        chat_conversation_participants: true,
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const caller = conv.chat_conversation_participants.find(
      (p) => p.user_id === callerId,
    );
    if (!caller) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      conv.type === ChatConversationType.DIRECT ||
      caller.role !== ChatParticipantRole.OWNER
    ) {
      throw new CodedHttpException(
        domainErrorCodes.chat.ownerRequired,
        HttpStatus.FORBIDDEN,
      );
    }
    if (conv.archived_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationArchived,
        HttpStatus.CONFLICT,
      );
    }

    if (
      conv.chat_conversation_participants.some((p) => p.user_id === dto.userId)
    ) {
      throw new CodedHttpException(
        domainErrorCodes.chat.participantAlreadyExists,
        HttpStatus.CONFLICT,
      );
    }

    await this.assertActiveUsersExist([dto.userId]);

    const created = await this.prisma.chat_conversation_participants.create({
      data: {
        conversation_id: conversationId,
        user_id: dto.userId,
        role: dto.role ?? ChatParticipantRole.MEMBER,
      },
      include: { users: { select: USER_SUMMARY_SELECT } },
    });

    await this.prisma.chat_conversations.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });

    return this.mapParticipant(created);
  }

  async removeParticipant(
    callerId: string,
    conversationId: string,
    targetUserId: string,
  ): Promise<ChatParticipantResponseDto> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      include: {
        chat_conversation_participants: {
          include: { users: { select: USER_SUMMARY_SELECT } },
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const caller = conv.chat_conversation_participants.find(
      (p) => p.user_id === callerId,
    );
    if (!caller) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    const target = conv.chat_conversation_participants.find(
      (p) => p.user_id === targetUserId,
    );
    if (!target) {
      throw new CodedHttpException(
        domainErrorCodes.chat.participantNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      conv.type === ChatConversationType.DIRECT ||
      (callerId !== targetUserId && caller.role !== ChatParticipantRole.OWNER)
    ) {
      throw new CodedHttpException(
        domainErrorCodes.chat.ownerRequired,
        HttpStatus.FORBIDDEN,
      );
    }

    const ownerCount = conv.chat_conversation_participants.filter(
      (p) => p.role === ChatParticipantRole.OWNER,
    ).length;
    if (target.role === ChatParticipantRole.OWNER && ownerCount <= 1) {
      throw new CodedHttpException(
        domainErrorCodes.chat.cannotRemoveLastOwner,
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.chat_conversation_participants.delete({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: targetUserId,
        },
      },
    });

    await this.prisma.chat_conversations.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });

    return this.mapParticipant(target);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListChatMessagesQueryDto,
  ): Promise<ChatMessageHistoryResponseDto> {
    await this.assertParticipant(userId, conversationId);

    const limit = query.limit ?? 50;
    let cursorFilter: Prisma.chat_messagesWhereInput = {};

    if (query.beforeMessageId) {
      const anchor = await this.prisma.chat_messages.findFirst({
        where: { id: query.beforeMessageId, conversation_id: conversationId },
        select: { id: true, created_at: true },
      });
      if (!anchor) {
        throw new CodedHttpException(
          domainErrorCodes.chat.messageNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      cursorFilter = {
        OR: [
          { created_at: { lt: anchor.created_at } },
          {
            created_at: anchor.created_at,
            id: { lt: anchor.id },
          },
        ],
      };
    }

    const rows = await this.prisma.chat_messages.findMany({
      where: {
        conversation_id: conversationId,
        ...cursorFilter,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: MESSAGE_HYDRATED_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const pageDesc = hasMore ? rows.slice(0, limit) : rows;
    const chronological = [...pageDesc].reverse();

    return {
      items: chronological.map((row) => this.mapMessage(row)),
      nextBeforeMessageId: hasMore ? (chronological[0]?.id ?? null) : null,
      hasMore,
    };
  }

  async sendMessage(
    senderId: string,
    dto: SendChatMessageSocketDto,
  ): Promise<SendMessageOutcome> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: dto.conversationId },
      include: {
        chat_conversation_participants: {
          include: { users: { select: USER_SUMMARY_SELECT } },
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const senderParticipant = conv.chat_conversation_participants.find(
      (p) => p.user_id === senderId,
    );
    if (!senderParticipant) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    if (conv.archived_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationArchived,
        HttpStatus.CONFLICT,
      );
    }

    const participantIds = conv.chat_conversation_participants.map(
      (p) => p.user_id,
    );
    const clientNonce = dto.clientNonce?.trim() || null;

    // Idempotent retry check for client_nonce.
    if (clientNonce) {
      const existing = await this.prisma.chat_messages.findFirst({
        where: {
          conversation_id: dto.conversationId,
          sender_id: senderId,
          client_nonce: clientNonce,
        },
        include: MESSAGE_HYDRATED_INCLUDE,
      });
      if (existing) {
        return {
          message: this.mapMessage(existing),
          created: false,
          participantIds,
          mentionNotifications: [],
        };
      }
    }

    const attachmentIds = [
      ...new Set((dto.attachmentIds ?? []).map((id) => id.toLowerCase())),
    ];
    if (attachmentIds.length > MAX_CHAT_ATTACHMENTS_PER_MESSAGE) {
      throw new CodedHttpException(
        domainErrorCodes.chat.attachmentLimitExceeded,
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmedBody = dto.body.trim();
    if (trimmedBody.length === 0 && attachmentIds.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageEmpty,
        HttpStatus.BAD_REQUEST,
      );
    }

    const { targetMentionIds, mentionsAll } = this.resolveValidatedMentions(
      dto.body,
      senderId,
      senderParticipant.role,
      conv.type,
      participantIds,
    );

    if (attachmentIds.length > 0) {
      const stagedAttachments =
        await this.prisma.chat_message_attachments.findMany({
          where: { id: { in: attachmentIds } },
        });
      if (stagedAttachments.length !== attachmentIds.length) {
        throw new CodedHttpException(
          domainErrorCodes.chat.attachmentNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      for (const att of stagedAttachments) {
        if (
          att.conversation_id !== dto.conversationId ||
          att.uploaded_by !== senderId
        ) {
          throw new CodedHttpException(
            domainErrorCodes.chat.conversationAccessDenied,
            HttpStatus.FORBIDDEN,
          );
        }
        if (att.message_id !== null) {
          throw new CodedHttpException(
            domainErrorCodes.chat.attachmentAlreadyLinked,
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    const recipientIds = participantIds.filter((uid) => uid !== senderId);
    const now = new Date();

    let hydrated: HydratedMessageRow;
    try {
      hydrated = await this.prisma.$transaction(async (tx) => {
        const createdMsg = await tx.chat_messages.create({
          data: {
            conversation_id: dto.conversationId,
            sender_id: senderId,
            body: dto.body,
            client_nonce: clientNonce,
            created_at: now,
          },
        });

        if (attachmentIds.length > 0) {
          const updated = await tx.chat_message_attachments.updateMany({
            where: {
              id: { in: attachmentIds },
              conversation_id: dto.conversationId,
              uploaded_by: senderId,
              message_id: null,
            },
            data: { message_id: createdMsg.id },
          });
          if (updated.count !== attachmentIds.length) {
            throw new CodedHttpException(
              domainErrorCodes.chat.attachmentAlreadyLinked,
              HttpStatus.CONFLICT,
            );
          }
        }

        if (targetMentionIds.length > 0) {
          await tx.chat_message_mentions.createMany({
            data: targetMentionIds.map((mentionedUserId) => ({
              message_id: createdMsg.id,
              mentioned_user_id: mentionedUserId,
              conversation_id: dto.conversationId,
              mentioned_at: now,
            })),
          });
        }

        await tx.chat_message_reads.create({
          data: {
            message_id: createdMsg.id,
            user_id: senderId,
            read_at: now,
          },
        });

        await tx.chat_conversation_participants.update({
          where: {
            conversation_id_user_id: {
              conversation_id: dto.conversationId,
              user_id: senderId,
            },
          },
          data: {
            last_read_message_id: createdMsg.id,
            last_read_at: now,
          },
        });

        if (recipientIds.length > 0) {
          await tx.chat_message_receipts.createMany({
            data: recipientIds.map((uid) => ({
              message_id: createdMsg.id,
              user_id: uid,
              status: ChatReceiptStatus.SENT,
              updated_at: now,
            })),
          });
        }

        await tx.chat_conversations.update({
          where: { id: dto.conversationId },
          data: { updated_at: now },
        });

        return tx.chat_messages.findUniqueOrThrow({
          where: { id: createdMsg.id },
          include: MESSAGE_HYDRATED_INCLUDE,
        });
      });
    } catch (error) {
      // Handle race on identical client_nonce gracefully.
      if (clientNonce) {
        const raced = await this.prisma.chat_messages.findFirst({
          where: {
            conversation_id: dto.conversationId,
            sender_id: senderId,
            client_nonce: clientNonce,
          },
          include: MESSAGE_HYDRATED_INCLUDE,
        });
        if (raced) {
          return {
            message: this.mapMessage(raced),
            created: false,
            participantIds,
            mentionNotifications: [],
          };
        }
      }
      if (attachmentIds.length > 0 && !(error instanceof CodedHttpException)) {
        await this.attachments.cleanupUnlinkedAttachments(
          senderId,
          dto.conversationId,
          attachmentIds,
        );
      }
      throw error;
    }

    const mapped = this.mapMessage(hydrated);
    const mutedSet = new Set(
      conv.chat_conversation_participants
        .filter((p) => p.notification_muted)
        .map((p) => p.user_id),
    );
    const mentionNotifications: ChatMentionNotificationEventPayload[] =
      targetMentionIds
        .filter((uid) => uid !== senderId && !mutedSet.has(uid))
        .map((uid) => ({
          conversationId: dto.conversationId,
          messageId: mapped.id,
          senderId,
          senderName: senderParticipant.users.full_name,
          mentionedUserId: uid,
          isAllMention: mentionsAll,
          preview: dto.body.slice(0, 160),
          createdAt: mapped.createdAt,
        }));

    return {
      message: mapped,
      created: true,
      participantIds,
      mentionNotifications,
    };
  }

  async editMessage(
    userId: string,
    dto: EditChatMessageSocketDto,
  ): Promise<EditMessageOutcome> {
    const conv = await this.prisma.chat_conversations.findUnique({
      where: { id: dto.conversationId },
      include: {
        chat_conversation_participants: {
          include: { users: { select: USER_SUMMARY_SELECT } },
        },
      },
    });

    if (!conv) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const caller = conv.chat_conversation_participants.find(
      (p) => p.user_id === userId,
    );
    if (!caller) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    if (conv.archived_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationArchived,
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.chat_messages.findFirst({
      where: { id: dto.messageId, conversation_id: dto.conversationId },
      include: {
        chat_message_attachments: { select: { id: true } },
        chat_message_mentions: { select: { mentioned_user_id: true } },
      },
    });

    if (!existing) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    if (existing.deleted_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageDeleted,
        HttpStatus.CONFLICT,
      );
    }
    if (existing.sender_id !== userId) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageEditDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      dto.body.trim().length === 0 &&
      existing.chat_message_attachments.length === 0
    ) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageEmpty,
        HttpStatus.BAD_REQUEST,
      );
    }

    const participantIds = conv.chat_conversation_participants.map(
      (p) => p.user_id,
    );
    const { targetMentionIds, mentionsAll } = this.resolveValidatedMentions(
      dto.body,
      userId,
      caller.role,
      conv.type,
      participantIds,
    );

    const previouslyMentioned = new Set(
      existing.chat_message_mentions.map((m) => m.mentioned_user_id),
    );
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.chat_message_mentions.deleteMany({
        where: { message_id: dto.messageId },
      });

      if (targetMentionIds.length > 0) {
        await tx.chat_message_mentions.createMany({
          data: targetMentionIds.map((mentionedUserId) => ({
            message_id: dto.messageId,
            mentioned_user_id: mentionedUserId,
            conversation_id: dto.conversationId,
            mentioned_at: now,
          })),
        });
      }

      return tx.chat_messages.update({
        where: { id: dto.messageId },
        data: {
          body: dto.body,
          edited_at: now,
        },
        include: MESSAGE_HYDRATED_INCLUDE,
      });
    });

    const mapped = this.mapMessage(updated);
    const mutedSet = new Set(
      conv.chat_conversation_participants
        .filter((p) => p.notification_muted)
        .map((p) => p.user_id),
    );
    const mentionNotifications: ChatMentionNotificationEventPayload[] =
      targetMentionIds
        .filter(
          (uid) =>
            uid !== userId &&
            !previouslyMentioned.has(uid) &&
            !mutedSet.has(uid),
        )
        .map((uid) => ({
          conversationId: dto.conversationId,
          messageId: mapped.id,
          senderId: userId,
          senderName: caller.users.full_name,
          mentionedUserId: uid,
          isAllMention: mentionsAll,
          preview: dto.body.slice(0, 160),
          createdAt: now.toISOString(),
        }));

    return {
      message: mapped,
      participantIds,
      mentionNotifications,
    };
  }

  async deleteMessage(
    userId: string,
    dto: DeleteChatMessageSocketDto,
  ): Promise<{
    deleted: ChatMessageDeletedEventPayload;
    participantIds: string[];
  }> {
    const { role, participantIds } = await this.assertParticipant(
      userId,
      dto.conversationId,
    );

    const existing = await this.prisma.chat_messages.findFirst({
      where: { id: dto.messageId, conversation_id: dto.conversationId },
      include: {
        chat_message_attachments: { select: { id: true, storage_key: true } },
      },
    });

    if (!existing) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.sender_id !== userId && role !== ChatParticipantRole.OWNER) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageDeleteDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    if (existing.deleted_at && existing.deleted_by) {
      return {
        deleted: {
          conversationId: dto.conversationId,
          messageId: existing.id,
          deletedAt: existing.deleted_at.toISOString(),
          deletedBy: existing.deleted_by,
        },
        participantIds,
      };
    }

    const now = new Date();
    const storageKeys = existing.chat_message_attachments.map(
      (a) => a.storage_key,
    );

    await this.prisma.$transaction(async (tx) => {
      if (existing.chat_message_attachments.length > 0) {
        await tx.chat_message_attachments.deleteMany({
          where: { message_id: existing.id },
        });
      }
      await tx.chat_message_mentions.deleteMany({
        where: { message_id: existing.id },
      });
      await tx.chat_message_reactions.deleteMany({
        where: { message_id: existing.id },
      });
      await tx.chat_messages.update({
        where: { id: existing.id },
        data: {
          body: '',
          deleted_at: now,
          deleted_by: userId,
        },
      });
    });

    if (storageKeys.length > 0) {
      await this.attachments.deleteObjectsBestEffort(storageKeys);
    }

    return {
      deleted: {
        conversationId: dto.conversationId,
        messageId: existing.id,
        deletedAt: now.toISOString(),
        deletedBy: userId,
      },
      participantIds,
    };
  }

  async markRead(
    userId: string,
    dto: MarkChatReadSocketDto,
  ): Promise<ChatReadUpdatedEventPayload> {
    await this.assertParticipant(userId, dto.conversationId);

    const targetMessage = await this.prisma.chat_messages.findFirst({
      where: { id: dto.messageId, conversation_id: dto.conversationId },
      select: { id: true, created_at: true },
    });

    if (!targetMessage) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Mark all unread messages up to and including targetMessage as read.
      const unreadUpToTarget = await tx.chat_messages.findMany({
        where: {
          conversation_id: dto.conversationId,
          created_at: { lte: targetMessage.created_at },
          chat_message_reads: {
            none: { user_id: userId },
          },
        },
        select: { id: true },
      });

      if (unreadUpToTarget.length > 0) {
        await tx.chat_message_reads.createMany({
          data: unreadUpToTarget.map((m) => ({
            message_id: m.id,
            user_id: userId,
            read_at: now,
          })),
          skipDuplicates: true,
        });

        await tx.chat_message_receipts.updateMany({
          where: {
            message_id: { in: unreadUpToTarget.map((m) => m.id) },
            user_id: userId,
          },
          data: {
            status: ChatReceiptStatus.DELIVERED,
            updated_at: now,
          },
        });
      }

      await tx.chat_conversation_participants.update({
        where: {
          conversation_id_user_id: {
            conversation_id: dto.conversationId,
            user_id: userId,
          },
        },
        data: {
          last_read_message_id: targetMessage.id,
          last_read_at: now,
        },
      });
    });

    return {
      conversationId: dto.conversationId,
      messageId: targetMessage.id,
      userId,
      readAt: now.toISOString(),
    };
  }

  async markDelivered(
    userId: string,
    dto: MarkChatDeliveredSocketDto,
  ): Promise<ChatReceiptUpdatedEventPayload> {
    await this.assertParticipant(userId, dto.conversationId);

    const uniqueIds = [...new Set(dto.messageIds)];
    const validMessages = await this.prisma.chat_messages.findMany({
      where: {
        id: { in: uniqueIds },
        conversation_id: dto.conversationId,
      },
      select: { id: true },
    });

    const validIds = validMessages.map((m) => m.id);
    const now = new Date();

    if (validIds.length > 0) {
      await this.prisma.chat_message_receipts.updateMany({
        where: {
          message_id: { in: validIds },
          user_id: userId,
          status: { in: [ChatReceiptStatus.PENDING, ChatReceiptStatus.SENT] },
        },
        data: {
          status: ChatReceiptStatus.DELIVERED,
          updated_at: now,
        },
      });
    }

    return {
      conversationId: dto.conversationId,
      messageIds: validIds,
      userId,
      status: ChatReceiptStatusEnum.DELIVERED,
      updatedAt: now.toISOString(),
    };
  }

  async toggleReaction(
    userId: string,
    dto: ToggleChatReactionSocketDto,
  ): Promise<ChatReactionUpdatedEventPayload> {
    await this.assertParticipant(userId, dto.conversationId);

    const normalized = dto.reaction.trim();
    if (!isAllowedChatReaction(normalized)) {
      throw new CodedHttpException(
        domainErrorCodes.chat.reactionInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    const message = await this.prisma.chat_messages.findFirst({
      where: { id: dto.messageId, conversation_id: dto.conversationId },
      select: { id: true, deleted_at: true },
    });

    if (!message) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    if (message.deleted_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.messageDeleted,
        HttpStatus.CONFLICT,
      );
    }

    let action: 'added' | 'removed' = 'added';

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.chat_message_reactions.findUnique({
        where: {
          message_id_user_id_reaction: {
            message_id: dto.messageId,
            user_id: userId,
            reaction: normalized,
          },
        },
      });

      if (existing) {
        await tx.chat_message_reactions.delete({
          where: {
            message_id_user_id_reaction: {
              message_id: dto.messageId,
              user_id: userId,
              reaction: normalized,
            },
          },
        });
        action = 'removed';
      } else {
        await tx.chat_message_reactions.create({
          data: {
            message_id: dto.messageId,
            user_id: userId,
            reaction: normalized,
          },
        });
        action = 'added';
      }
    });

    const allReactions = await this.prisma.chat_message_reactions.findMany({
      where: { message_id: dto.messageId },
      orderBy: { created_at: 'asc' },
    });

    return {
      conversationId: dto.conversationId,
      messageId: dto.messageId,
      reactions: this.aggregateReactions(allReactions),
      actorId: userId,
      reaction: normalized,
      action,
    };
  }

  private resolveValidatedMentions(
    body: string,
    senderId: string,
    senderRole: ChatParticipantRole,
    conversationType: ChatConversationType,
    participantIds: string[],
  ): { targetMentionIds: string[]; mentionsAll: boolean } {
    const parsed = parseMentionTokens(body);
    const participantSet = new Set(
      participantIds.map((id) => id.toLowerCase()),
    );

    for (const mentionedId of parsed.userIds) {
      if (!participantSet.has(mentionedId)) {
        throw new CodedHttpException(
          domainErrorCodes.chat.mentionInvalidTarget,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (parsed.mentionsAll) {
      if (
        conversationType === ChatConversationType.GROUP &&
        senderRole !== ChatParticipantRole.OWNER
      ) {
        throw new CodedHttpException(
          domainErrorCodes.chat.mentionAllDenied,
          HttpStatus.FORBIDDEN,
        );
      }
      const allTargets = participantIds.filter(
        (id) => id.toLowerCase() !== senderId.toLowerCase(),
      );
      return { targetMentionIds: allTargets, mentionsAll: true };
    }

    const distinctTargets = participantIds.filter((id) =>
      parsed.userIds.includes(id.toLowerCase()),
    );
    return { targetMentionIds: distinctTargets, mentionsAll: false };
  }

  private async assertActiveUsersExist(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const found = await this.prisma.users.findMany({
      where: { id: { in: userIds }, is_active: true },
      select: { id: true },
    });
    if (found.length !== userIds.length) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async countUnreadMessages(
    conversationId: string,
    userId: string,
    lastReadAt: Date | null,
  ): Promise<number> {
    return this.prisma.chat_messages.count({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        sender_id: { not: userId },
        ...(lastReadAt ? { created_at: { gt: lastReadAt } } : {}),
        chat_message_reads: {
          none: { user_id: userId },
        },
      },
    });
  }

  private mapUserSummary(u: {
    id: string;
    full_name: string;
    email: string;
    department_unit: string;
  }): ChatUserSummaryDto {
    return {
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      departmentUnit: u.department_unit,
    };
  }

  private mapParticipant(p: {
    conversation_id: string;
    user_id: string;
    role: ChatParticipantRole;
    joined_at: Date;
    last_read_message_id: string | null;
    last_read_at: Date | null;
    notification_muted: boolean;
    users: {
      id: string;
      full_name: string;
      email: string;
      department_unit: string;
    };
  }): ChatParticipantResponseDto {
    return {
      conversationId: p.conversation_id,
      userId: p.user_id,
      role: p.role,
      joinedAt: p.joined_at.toISOString(),
      lastReadMessageId: p.last_read_message_id,
      lastReadAt: p.last_read_at?.toISOString() ?? null,
      notificationMuted: p.notification_muted,
      user: this.mapUserSummary(p.users),
    };
  }

  private aggregateReactions(
    rows: Array<{ reaction: string; user_id: string }>,
  ): ChatReactionSummaryPayload[] {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const list = grouped.get(row.reaction) ?? [];
      if (!list.includes(row.user_id)) {
        list.push(row.user_id);
      }
      grouped.set(row.reaction, list);
    }
    return Array.from(grouped.entries()).map(([reaction, userIds]) => ({
      reaction,
      count: userIds.length,
      userIds,
    }));
  }

  private mapMessage(row: HydratedMessageRow): ChatMessageResponseDto {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      sender: row.sender ? this.mapUserSummary(row.sender) : undefined,
      body: row.deleted_at ? '' : row.body,
      clientNonce: row.client_nonce,
      mentions: row.chat_message_mentions.map((m) => ({
        messageId: m.message_id,
        mentionedUserId: m.mentioned_user_id,
        conversationId: m.conversation_id,
        mentionedAt: m.mentioned_at.toISOString(),
        user: m.users ? this.mapUserSummary(m.users) : undefined,
      })),
      reactions: this.aggregateReactions(row.chat_message_reactions),
      attachments: row.deleted_at
        ? []
        : row.chat_message_attachments.map((att) =>
            mapChatAttachmentToDto(att),
          ),
      reads: row.chat_message_reads.map((r) => ({
        messageId: r.message_id,
        userId: r.user_id,
        readAt: r.read_at.toISOString(),
      })),
      receipts: row.chat_message_receipts.map((rc) => ({
        messageId: rc.message_id,
        userId: rc.user_id,
        status: rc.status,
        updatedAt: rc.updated_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      editedAt: row.edited_at?.toISOString() ?? null,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      deletedBy: row.deleted_by,
    };
  }
}
