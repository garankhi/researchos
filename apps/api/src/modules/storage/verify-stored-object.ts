import { createHash } from 'node:crypto';
import {
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import type { StorageAdapter } from '@researchos/storage';
import { CodedHttpException } from '../../common/errors/error-codes.js';

export interface ExpectedStoredObject {
  key: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
}

export async function withStorageAdapter<T>(
  adapter: StorageAdapter,
  logger: Logger,
  run: (storage: StorageAdapter) => Promise<T>,
): Promise<T> {
  try {
    return await run(adapter);
  } catch (error) {
    if (error instanceof CodedHttpException) {
      throw error;
    }
    logger.warn(
      `S3 operation failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
    throw new ServiceUnavailableException();
  }
}

/**
 * Verifies that an uploaded S3 object exists and matches its declared byte
 * size, content type, and SHA-256 checksum. Reused across output files and
 * chat attachments.
 */
export async function verifyUploadedS3Object(
  adapter: StorageAdapter,
  logger: Logger,
  expected: ExpectedStoredObject,
): Promise<void> {
  const metadata = await withStorageAdapter(adapter, logger, (storage) =>
    storage.headObject(expected.key),
  );
  if (
    !metadata ||
    metadata.sizeBytes !== expected.sizeBytes ||
    metadata.contentType !== expected.mimeType
  ) {
    throw new CodedHttpException(
      domainErrorCodes.storage.fileConflict,
      HttpStatus.CONFLICT,
    );
  }

  const sha256 =
    metadata.sha256 ??
    (await withStorageAdapter(adapter, logger, async (storage) => {
      const body = await storage.getObject(expected.key);
      const hash = createHash('sha256');
      let size = 0;
      try {
        for await (const chunk of body as AsyncIterable<Buffer>) {
          size += chunk.byteLength;
          if (size > expected.sizeBytes) {
            return undefined;
          }
          hash.update(chunk);
        }
        return size === expected.sizeBytes ? hash.digest('hex') : undefined;
      } finally {
        body.destroy();
      }
    }));

  if (sha256 !== expected.sha256) {
    throw new CodedHttpException(
      domainErrorCodes.storage.fileConflict,
      HttpStatus.CONFLICT,
    );
  }
}
