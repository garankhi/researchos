import { createReadStream } from 'node:fs';
import { posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
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
import { OutputDownloadService } from './output-download.service.js';

const downloadTimeoutMs = 15 * 60_000;

@ApiTags('output-files')
@ApiCookieAuth()
@Controller('output-files')
export class OutputDownloadController {
  constructor(private readonly downloads: OutputDownloadService) {}

  @ApiOperation({
    summary: 'Download a verified output file',
    description:
      'Checks the current file access policy and verifies the stored file before sending the attachment.',
  })
  @ApiParam({
    name: 'fileId',
    description: 'Identifier of the output file.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The verified file as an attachment.',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: {
      'Content-Disposition': {
        description: 'Attachment filename.',
        schema: { type: 'string' },
      },
      'Content-Length': {
        description: 'File size in bytes.',
        schema: { type: 'integer', format: 'int64' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'The file identifier is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'A valid session cookie is required.',
  })
  @ApiNotFoundResponse({
    description: 'The file does not exist.',
  })
  @ApiForbiddenResponse({
    description: 'The caller is not allowed to view this file.',
  })
  @ApiConflictResponse({
    description: 'The stored object does not match the recorded file.',
  })
  @ApiTooManyRequestsResponse({
    description: 'The API request rate limit was exceeded.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Download capacity was exceeded, verification timed out, or storage was unavailable.',
  })
  @Get(':fileId/download')
  async downloadFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
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
      const file = await this.downloads.prepareDownload(
        userId,
        fileId,
        abort.signal,
      );
      try {
        abort.signal.throwIfAborted();
        const fileName = posix
          .basename(file.fileName.replaceAll('\\', '/'))
          .replace(/[\p{Cc}\p{Cs}]/gu, '');
        const attachmentName =
          !fileName || fileName === '.' || fileName === '..'
            ? 'download'
            : fileName;
        response.attachment(attachmentName).set({
          'Content-Type': 'application/octet-stream',
          'Content-Length': file.sizeBytes.toString(),
          'X-Content-Type-Options': 'nosniff',
        });
        await pipeline(createReadStream(file.path), response, {
          signal: abort.signal,
        });
      } finally {
        await file.cleanup();
      }
    } catch (error) {
      if (!response.destroyed) {
        throw abort.signal.reason instanceof ServiceUnavailableException
          ? abort.signal.reason
          : error;
      }
    } finally {
      clearTimeout(deadline);
      response.off('close', onClose);
    }
  }
}
