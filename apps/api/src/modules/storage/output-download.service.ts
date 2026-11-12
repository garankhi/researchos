import { createHash } from 'node:crypto';
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
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { StorageObjectNotFoundError } from '@researchos/storage';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { ObjectStorageService } from './object-storage.service.js';

const maxStagedBytes = 5n * 1024n ** 3n;
const maxActiveDownloads = 8;

interface DownloadMetadata {
  storage_key: string;
  file_name: string;
  size_bytes: bigint;
  sha256: string;
}

interface VerifiedDownload {
  path: string;
  fileName: string;
  sizeBytes: bigint;
  cleanup(): Promise<void>;
}

@Injectable()
export class OutputDownloadService {
  private readonly logger = new Logger(OutputDownloadService.name);
  private reservedBytes = 0n;
  private activeDownloads = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async prepareDownload(
    userId: string,
    fileId: string,
    signal: AbortSignal,
  ): Promise<VerifiedDownload> {
    const [file] = await this.prisma.$queryRaw<
      Array<DownloadMetadata & { allowed: boolean }>
    >`
      SELECT storage_key, file_name, size_bytes, sha256,
             can_view_output_file(${userId}::uuid, id) AS allowed
      FROM output_files
      WHERE id = ${fileId}::uuid
    `;
    if (!file) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    if (!file.allowed) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    signal.throwIfAborted();

    if (
      this.activeDownloads >= maxActiveDownloads ||
      this.reservedBytes + file.size_bytes > maxStagedBytes
    ) {
      throw new ServiceUnavailableException();
    }
    this.activeDownloads += 1;
    this.reservedBytes += file.size_bytes;

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
          this.reservedBytes -= file.size_bytes;
        } catch (error) {
          // Keep accounting for bytes that may still be on disk.
          this.logger.warn(
            `Could not clean up a download: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        } finally {
          this.activeDownloads -= 1;
        }
      })());

    try {
      try {
        directory = await mkdtemp(join(tmpdir(), 'researchos-download-'));
      } catch (error) {
        this.logger.warn(
          `Could not create a download directory: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
        throw new ServiceUnavailableException();
      }
      const path = join(directory, 'object');
      await this.stageVerifiedObject(file, path, signal);

      // A large object can take time to verify. Use the current policy again
      // before handing any bytes to the controller.
      const [access] = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
        SELECT can_view_output_file(${userId}::uuid, ${fileId}::uuid) AS allowed
      `;
      if (!access?.allowed) {
        throw new CodedHttpException(
          domainErrorCodes.storage.fileAccessDenied,
          HttpStatus.FORBIDDEN,
        );
      }
      signal.throwIfAborted();

      return {
        path,
        fileName: file.file_name,
        sizeBytes: file.size_bytes,
        cleanup,
      };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  private async stageVerifiedObject(
    file: DownloadMetadata,
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
          domainErrorCodes.storage.fileNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      this.logger.warn(
        `Could not verify stored file: ${error instanceof Error ? error.name : 'unknown error'}`,
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
}
