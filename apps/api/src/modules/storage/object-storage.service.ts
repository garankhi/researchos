import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createS3Storage,
  StorageObjectNotFoundError,
  type StorageAdapter,
  type UploadRequest,
} from '@researchos/storage';

const pdfHeader = Buffer.from('%PDF-');
const pdfVerificationTimeoutMs = 45_000;

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private storage?: StorageAdapter;

  get adapter(): StorageAdapter {
    return (this.storage ??= createS3Storage());
  }

  async run<T>(operation: (storage: StorageAdapter) => Promise<T>): Promise<T> {
    try {
      return await operation(this.adapter);
    } catch (error) {
      this.logger.warn(
        `S3 operation failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      throw new ServiceUnavailableException();
    }
  }

  verifyUpload(
    expected: UploadRequest,
    requirePdfHeader = false,
  ): Promise<boolean> {
    return this.run(async (storage) => {
      const signal = requirePdfHeader
        ? AbortSignal.timeout(pdfVerificationTimeoutMs)
        : undefined;
      const metadata = await storage.headObject(expected.key, signal);
      if (
        !metadata ||
        metadata.sizeBytes !== expected.sizeBytes ||
        metadata.contentType !== expected.contentType ||
        (metadata.sha256 !== undefined && metadata.sha256 !== expected.sha256)
      ) {
        return false;
      }
      if (metadata.sha256 && !requirePdfHeader) {
        return true;
      }

      try {
        const body = await storage.getObject(expected.key, signal);
        const hash = createHash('sha256');
        let size = 0;
        try {
          for await (const chunk of body as AsyncIterable<Buffer>) {
            if (requirePdfHeader && size < pdfHeader.length) {
              const prefix = chunk.subarray(0, pdfHeader.length - size);
              if (
                !prefix.equals(pdfHeader.subarray(size, size + prefix.length))
              ) {
                return false;
              }
            }
            size += chunk.byteLength;
            if (size > expected.sizeBytes) return false;
            hash.update(chunk);
          }
          return (
            size === expected.sizeBytes &&
            (!requirePdfHeader || size >= pdfHeader.length) &&
            hash.digest('hex') === expected.sha256
          );
        } finally {
          body.destroy();
        }
      } catch (error) {
        if (error instanceof StorageObjectNotFoundError) return false;
        throw error;
      }
    });
  }
}
