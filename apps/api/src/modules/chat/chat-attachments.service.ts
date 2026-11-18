import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  isAllowedChatAttachmentMime,
  isChatImageMimeType,
} from '@researchos/chat';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { StorageObjectNotFoundError } from '@researchos/storage';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import {
  readChatUploadIntent,
  signUploadIntent,
  type ChatUploadIntent,
} from '../storage/upload-token.js';
import {
  verifyUploadedS3Object,
  withStorageAdapter,
} from '../storage/verify-stored-object.js';
import type {
  ChatAttachmentResponseDto,
  ChatUploadPreparedResponseDto,
  CreateChatUploadDto,
} from './dto/chat.dto.js';

const confirmationTtlMs = 15 * 60_000;
const maxStagedBytes = 2n * 1024n ** 3n;
const maxActiveDownloads = 8;

type ChatAttachmentRow = Prisma.chat_message_attachmentsGetPayload<undefined>;

export interface VerifiedChatDownload {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  isImage: boolean;
  cleanup(): Promise<void>;
}

export function mapChatAttachmentToDto(
  row: ChatAttachmentRow,
): ChatAttachmentResponseDto {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    isImage: isChatImageMimeType(row.mime_type),
    downloadPath: `/chat/attachments/${row.id}/download`,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class ChatAttachmentsService {
  private readonly logger = new Logger(ChatAttachmentsService.name);
  private reservedBytes = 0n;
  private activeDownloads = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async prepareUpload(
    userId: string,
    conversationId: string,
    input: CreateChatUploadDto,
  ): Promise<ChatUploadPreparedResponseDto> {
    await this.assertActiveParticipant(userId, conversationId);

    const normalizedMime = input.mimeType.toLowerCase();
    if (!isAllowedChatAttachmentMime(normalizedMime)) {
      throw new CodedHttpException(
        domainErrorCodes.chat.attachmentInvalidType,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new CodedHttpException(
        domainErrorCodes.chat.attachmentSizeExceeded,
        HttpStatus.BAD_REQUEST,
      );
    }

    const isImage = isChatImageMimeType(normalizedMime);
    const width = isImage ? (input.width ?? null) : null;
    const height = isImage ? (input.height ?? null) : null;
    if ((width === null) !== (height === null)) {
      throw new CodedHttpException(
        domainErrorCodes.chat.attachmentInvalidType,
        HttpStatus.BAD_REQUEST,
      );
    }

    const intent: ChatUploadIntent = {
      kind: 'chat',
      userId,
      conversationId,
      key: `chat/${conversationId}/${randomUUID()}`,
      fileName: input.fileName,
      mimeType: normalizedMime,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256.toLowerCase(),
      width,
      height,
      expiresAt: Date.now() + confirmationTtlMs,
    };

    const uploadToken = signUploadIntent(intent);
    const { url, headers } = await withStorageAdapter(
      this.storage.adapter,
      this.logger,
      (adapter) =>
        adapter.createUploadUrl({
          key: intent.key,
          contentType: intent.mimeType,
          sizeBytes: intent.sizeBytes,
          sha256: intent.sha256,
        }),
    );

    return { uploadUrl: url, headers, uploadToken };
  }

  async confirmUpload(
    userId: string,
    conversationId: string,
    uploadToken: string,
  ): Promise<ChatAttachmentResponseDto> {
    const intent = readChatUploadIntent(uploadToken);
    if (intent.userId !== userId || intent.conversationId !== conversationId) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    await this.assertActiveParticipant(userId, conversationId);

    const existing = await this.prisma.chat_message_attachments.findUnique({
      where: { storage_key: intent.key },
    });
    if (existing) {
      return mapChatAttachmentToDto(existing);
    }

    if (intent.expiresAt <= Date.now()) {
      await this.deleteObjectsBestEffort([intent.key]);
      throw new CodedHttpException(
        domainErrorCodes.storage.uploadIntentInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    await verifyUploadedS3Object(this.storage.adapter, this.logger, {
      key: intent.key,
      sizeBytes: intent.sizeBytes,
      mimeType: intent.mimeType,
      sha256: intent.sha256,
    });

    try {
      const created = await this.prisma.chat_message_attachments.create({
        data: {
          conversation_id: conversationId,
          uploaded_by: userId,
          storage_key: intent.key,
          file_name: intent.fileName,
          mime_type: intent.mimeType,
          size_bytes: BigInt(intent.sizeBytes),
          sha256: intent.sha256,
          width: intent.width,
          height: intent.height,
        },
      });
      return mapChatAttachmentToDto(created);
    } catch (error) {
      const concurrent = await this.prisma.chat_message_attachments.findUnique({
        where: { storage_key: intent.key },
      });
      if (concurrent) {
        return mapChatAttachmentToDto(concurrent);
      }
      await this.deleteObjectsBestEffort([intent.key]);
      throw error;
    }
  }

  async prepareDownload(
    userId: string,
    attachmentId: string,
    signal: AbortSignal,
  ): Promise<VerifiedChatDownload> {
    const attachment = await this.prisma.chat_message_attachments.findUnique({
      where: { id: attachmentId },
      include: {
        chat_messages: {
          select: { deleted_at: true },
        },
      },
    });

    if (!attachment || attachment.chat_messages?.deleted_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.attachmentNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.assertParticipantCanView(userId, attachment.conversation_id);
    signal.throwIfAborted();

    if (
      this.activeDownloads >= maxActiveDownloads ||
      this.reservedBytes + attachment.size_bytes > maxStagedBytes
    ) {
      throw new ServiceUnavailableException();
    }

    this.activeDownloads += 1;
    this.reservedBytes += attachment.size_bytes;

    let directory: string | undefined;
    let cleanupPromise: Promise<void> | undefined;
    const cleanup = () =>
      (cleanupPromise ??= (async () => {
        try {
          if (directory) {
            await rm(directory, {
              recursive: true,
              force: true,
              maxRetries: 3,
            });
          }
          this.reservedBytes -= attachment.size_bytes;
        } catch (error) {
          this.logger.warn(
            `Could not clean up staged chat download: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        } finally {
          this.activeDownloads -= 1;
        }
      })());

    try {
      try {
        directory = await mkdtemp(join(tmpdir(), 'researchos-chat-dl-'));
      } catch {
        throw new ServiceUnavailableException();
      }
      const path = join(directory, 'object');
      await this.stageVerifiedObject(attachment, path, signal);

      // Re-verify conversation membership after staging large files.
      await this.assertParticipantCanView(userId, attachment.conversation_id);
      signal.throwIfAborted();

      return {
        path,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        isImage: isChatImageMimeType(attachment.mime_type),
        cleanup,
      };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async cleanupUnlinkedAttachments(
    userId: string,
    conversationId: string,
    attachmentIds: string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    const rows = await this.prisma.chat_message_attachments.findMany({
      where: {
        id: { in: attachmentIds },
        conversation_id: conversationId,
        uploaded_by: userId,
        message_id: null,
      },
      select: { id: true, storage_key: true },
    });
    if (rows.length === 0) return;

    await this.prisma.chat_message_attachments
      .deleteMany({
        where: {
          id: { in: rows.map((r) => r.id) },
          message_id: null,
        },
      })
      .catch(() => undefined);

    await this.deleteObjectsBestEffort(rows.map((r) => r.storage_key));
  }

  async deleteObjectsBestEffort(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await this.storage.adapter.deleteObject(key);
        } catch (error) {
          this.logger.warn(
            `Could not delete orphaned chat object ${key}: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        }
      }),
    );
  }

  private async stageVerifiedObject(
    file: ChatAttachmentRow,
    path: string,
    signal: AbortSignal,
  ): Promise<void> {
    const hash = createHash('sha256');
    let size = 0n;
    const verify = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += BigInt(chunk.length);
        if (size > file.size_bytes) {
          callback(
            new CodedHttpException(
              domainErrorCodes.storage.fileConflict,
              HttpStatus.CONFLICT,
            ),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      signal.throwIfAborted();
      const source = await this.storage.adapter.getObject(
        file.storage_key,
        signal,
      );
      await pipeline(source, verify, createWriteStream(path, { mode: 0o600 }), {
        signal,
      });
    } catch (error) {
      if (signal.aborted || error instanceof CodedHttpException) {
        throw error;
      }
      if (error instanceof StorageObjectNotFoundError) {
        throw new CodedHttpException(
          domainErrorCodes.chat.attachmentNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      this.logger.warn(
        `Could not verify stored chat attachment: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      throw new ServiceUnavailableException();
    }

    if (
      size !== file.size_bytes ||
      hash.digest('hex') !== file.sha256.toLowerCase()
    ) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileConflict,
        HttpStatus.CONFLICT,
      );
    }
  }

  private async assertParticipantCanView(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        chat_conversation_participants: {
          where: { user_id: userId },
          select: { user_id: true },
        },
      },
    });

    if (!conversation) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    if (conversation.chat_conversation_participants.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async assertActiveParticipant(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.prisma.chat_conversations.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        archived_at: true,
        chat_conversation_participants: {
          where: { user_id: userId },
          select: { user_id: true },
        },
      },
    });

    if (!conversation) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    if (conversation.chat_conversation_participants.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    if (conversation.archived_at) {
      throw new CodedHttpException(
        domainErrorCodes.chat.conversationArchived,
        HttpStatus.CONFLICT,
      );
    }
  }
}
