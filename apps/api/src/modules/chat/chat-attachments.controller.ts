import { createReadStream } from 'node:fs';
import { posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ChatAttachmentsService } from './chat-attachments.service.js';
import {
  ChatAttachmentResponseDto,
  ChatUploadPreparedResponseDto,
  ConfirmChatUploadDto,
  CreateChatUploadDto,
} from './dto/chat.dto.js';

const downloadTimeoutMs = 15 * 60_000;

@ApiTags('chat')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiTooManyRequestsResponse({
  description: 'The API request rate limit was exceeded.',
})
@ApiServiceUnavailableResponse({
  description:
    'Upload signing, verification, or object storage is unavailable.',
})
@Controller('chat')
export class ChatAttachmentsController {
  constructor(private readonly attachments: ChatAttachmentsService) {}

  @ApiOperation({
    summary: 'Prepare a chat attachment S3 upload',
    description:
      'Issues a presigned PUT URL, required headers, and a signed confirmation token to an active conversation participant.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the target chat conversation.',
    format: 'uuid',
  })
  @ApiCreatedResponse({
    description: 'Presigned PUT URL, required headers, and confirmation token.',
    type: ChatUploadPreparedResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Unsupported MIME type, invalid size, or malformed metadata.',
  })
  @ApiForbiddenResponse({
    description: 'The caller is not a participant in this conversation.',
  })
  @ApiNotFoundResponse({
    description: 'The conversation does not exist.',
  })
  @ApiConflictResponse({
    description: 'The conversation is archived.',
  })
  @Post('conversations/:conversationId/attachments/uploads')
  prepareUpload(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
    @Body() input: CreateChatUploadDto,
  ): Promise<ChatUploadPreparedResponseDto> {
    return this.attachments.prepareUpload(userId, conversationId, input);
  }

  @ApiOperation({
    summary: 'Confirm a chat attachment S3 upload',
    description:
      'Verifies the uploaded S3 object size, MIME type, and SHA-256 digest and records the attachment metadata idempotently.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the target chat conversation.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The verified chat attachment metadata.',
    type: ChatAttachmentResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The upload confirmation token is invalid or expired.',
  })
  @ApiForbiddenResponse({
    description:
      'The caller is not a conversation participant or does not own the upload token.',
  })
  @ApiNotFoundResponse({
    description: 'The conversation does not exist.',
  })
  @ApiConflictResponse({
    description:
      'The S3 object is missing, does not match declared metadata, or the conversation is archived.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('conversations/:conversationId/attachments/uploads/confirm')
  confirmUpload(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
    @Body() input: ConfirmChatUploadDto,
  ): Promise<ChatAttachmentResponseDto> {
    return this.attachments.confirmUpload(
      userId,
      conversationId,
      input.uploadToken,
    );
  }

  @ApiOperation({
    summary: 'Download or preview a verified chat attachment',
    description:
      'Verifies conversation membership and stored SHA-256 integrity before streaming the private S3 attachment.',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Identifier of the chat message attachment.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The verified attachment stream.',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: {
      'Content-Disposition': {
        description: 'Inline (for verified images) or attachment filename.',
        schema: { type: 'string' },
      },
      'Content-Length': {
        description: 'File size in bytes.',
        schema: { type: 'integer', format: 'int64' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The attachment identifier is invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'The caller is not a participant in the attachment conversation.',
  })
  @ApiNotFoundResponse({
    description: 'The attachment does not exist or its message was deleted.',
  })
  @ApiConflictResponse({
    description: 'The stored S3 object failed integrity verification.',
  })
  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUserId() userId: string,
    @Res() response: Response,
  ): Promise<void> {
    response.set('Cache-Control', 'private, no-store');
    const abort = new AbortController();
    const deadline = setTimeout(
      () => abort.abort(new ServiceUnavailableException()),
      downloadTimeoutMs,
    );
    const onClose = () => {
      if (!response.writableFinished) {
        abort.abort();
      }
    };
    response.once('close', onClose);
    if (response.destroyed) {
      abort.abort();
    }

    try {
      const file = await this.attachments.prepareDownload(
        userId,
        attachmentId,
        abort.signal,
      );
      try {
        abort.signal.throwIfAborted();
        const fileName = posix
          .basename(file.fileName.replaceAll('\\', '/'))
          .replace(/[\p{Cc}\p{Cs}]/gu, '');
        const safeName =
          !fileName || fileName === '.' || fileName === '..'
            ? 'attachment'
            : fileName;
        const asciiFallback =
          safeName.replace(/[^\x20-\x7e]|["\\;%]/g, '_').trim() || 'attachment';

        const dispositionType = file.isImage ? 'inline' : 'attachment';
        response.set({
          'Content-Type': file.isImage
            ? file.mimeType
            : 'application/octet-stream',
          'Content-Length': file.sizeBytes.toString(),
          'Content-Disposition': `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
          'X-Content-Type-Options': 'nosniff',
        });

        await pipeline(createReadStream(file.path), response, {
          signal: abort.signal,
        });
      } finally {
        await file.cleanup();
      }
    } catch (error) {
      if (abort.signal.aborted) {
        const reason: unknown = abort.signal.reason;
        if (
          reason instanceof ServiceUnavailableException &&
          !response.headersSent
        ) {
          throw reason;
        }
        return;
      }
      throw error;
    } finally {
      clearTimeout(deadline);
      response.off('close', onClose);
    }
  }
}
