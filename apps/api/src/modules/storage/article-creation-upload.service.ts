import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import type {
  OutputFile,
  OutputFileVisibility,
  Prisma,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import type { UploadRequest } from '@researchos/storage';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  articlePdfMimeType,
  type ArticlePdfUploadResponseDto,
  type ArticlePdfUploadStatusDto,
  type CreateArticlePdfUploadDto,
} from './dto/article-creation-upload.dto.js';
import { ObjectStorageService } from './object-storage.service.js';

type ArticleUpload = Prisma.article_creation_uploadsGetPayload<undefined>;
type ArticleFileVisibility = Extract<
  OutputFileVisibility,
  'PRIVATE' | 'FPTU_COMMUNITY'
>;

@Injectable()
export class ArticleCreationUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async createUpload(
    ownerId: string,
    input: CreateArticlePdfUploadDto,
  ): Promise<ArticlePdfUploadResponseDto> {
    const uploadId = randomUUID();
    const key = `article-uploads/${uploadId}`;
    const sha256 = input.sha256.toLowerCase();
    const upload = await this.storage.run((storage) =>
      storage.createUploadUrl({
        key,
        contentType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256,
      }),
    );
    const [session] = await this.prisma.$queryRaw<{ expires_at: Date }[]>`
      INSERT INTO article_creation_uploads (
        id, owner_id, storage_key, file_name, mime_type, size_bytes, sha256, expires_at
      ) VALUES (
        ${uploadId}::uuid, ${ownerId}::uuid, ${key}, ${input.fileName}, ${input.mimeType},
        ${BigInt(input.sizeBytes)}, ${sha256}, CURRENT_TIMESTAMP + interval '24 hours'
      ) RETURNING expires_at
    `;
    return {
      uploadId,
      uploadUrl: upload.url,
      headers: upload.headers,
      expiresAt: session!.expires_at.toISOString(),
    };
  }

  async getUpload(
    ownerId: string,
    uploadId: string,
  ): Promise<ArticlePdfUploadStatusDto> {
    const upload = await this.findOwnerUpload(ownerId, uploadId);
    return this.toStatus(upload, upload.expired);
  }

  async confirmUpload(
    ownerId: string,
    uploadId: string,
  ): Promise<ArticlePdfUploadStatusDto> {
    const upload = await this.findOwnerUpload(ownerId, uploadId);
    if (upload.consumed_at) return this.toStatus(upload, upload.expired);
    this.assertUnexpired(upload.expired);
    if (upload.verified_at) return this.toStatus(upload, false);

    const matched = await this.storage.verifyUpload(
      this.toStorageRequest(upload),
      true,
    );
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockOwnerUpload(tx, ownerId, uploadId);
      if (current.consumed_at) return this.toStatus(current, current.expired);
      this.assertUnexpired(current.expired);
      if (current.verified_at) return this.toStatus(current, false);
      if (!matched) {
        throw new CodedHttpException(
          domainErrorCodes.storage.fileConflict,
          HttpStatus.CONFLICT,
        );
      }

      const verified = await tx.article_creation_uploads.update({
        where: { id: current.id },
        data: { verified_at: current.now },
      });
      return this.toStatus(verified, false);
    });
  }

  /** Private storage coordinates for the metadata extraction job. Never return these from an HTTP controller. */
  async getVerifiedUploadForMetadata(
    ownerId: string,
    uploadId: string,
  ): Promise<UploadRequest> {
    const upload = await this.findOwnerUpload(ownerId, uploadId);
    this.assertUsable(upload, upload.expired);
    return this.toStorageRequest(upload);
  }

  async consumeVerifiedUpload(
    tx: Prisma.TransactionClient,
    ownerId: string,
    uploadId: string,
    outputId: string,
    revisionId: string,
    fileVisibility: ArticleFileVisibility,
  ): Promise<OutputFile> {
    const upload = await this.lockOwnerUpload(tx, ownerId, uploadId);
    this.assertUsable(upload, upload.expired);

    const file = await tx.output_files.create({
      data: {
        output_id: outputId,
        uploaded_by: ownerId,
        storage_key: upload.storage_key,
        file_name: upload.file_name,
        mime_type: upload.mime_type,
        size_bytes: upload.size_bytes,
        sha256: upload.sha256,
        visibility: fileVisibility,
      },
    });
    await tx.output_revision_files.create({
      data: { output_id: outputId, revision_id: revisionId, file_id: file.id },
    });
    await tx.article_creation_uploads.update({
      where: { id: upload.id },
      data: { consumed_at: upload.now, consumed_file_id: file.id },
    });
    return file;
  }

  private async findOwnerUpload(
    ownerId: string,
    uploadId: string,
  ): Promise<ArticleUpload & { expired: boolean }> {
    const [upload] = await this.prisma.$queryRaw<
      (ArticleUpload & { expired: boolean })[]
    >`
      SELECT *, expires_at <= statement_timestamp() OR storage_deleted_at IS NOT NULL AS expired
      FROM article_creation_uploads WHERE id = ${uploadId}::uuid AND owner_id = ${ownerId}::uuid
    `;
    if (!upload) this.throwNotFound();
    return upload;
  }

  private async lockOwnerUpload(
    tx: Prisma.TransactionClient,
    ownerId: string,
    uploadId: string,
  ): Promise<ArticleUpload & { expired: boolean; now: Date }> {
    const [upload] = await tx.$queryRaw<ArticleUpload[]>`
      SELECT * FROM article_creation_uploads
      WHERE id = ${uploadId}::uuid AND owner_id = ${ownerId}::uuid
      FOR UPDATE
    `;
    if (!upload) this.throwNotFound();

    // Read the database clock after acquiring the row lock, including time spent waiting.
    const [clock] = await tx.$queryRaw<{ now: Date; expired: boolean }[]>`
      WITH clock AS (SELECT clock_timestamp() AS now)
      SELECT now, ${upload.expires_at}::timestamptz <= now AS expired FROM clock
    `;
    return {
      ...upload,
      now: clock!.now,
      expired: clock!.expired || upload.storage_deleted_at !== null,
    };
  }

  private throwNotFound(): never {
    throw new CodedHttpException(
      domainErrorCodes.storage.articlePdfUploadNotFound,
      HttpStatus.NOT_FOUND,
    );
  }

  private assertUnexpired(expired: boolean): void {
    if (expired) {
      throw new CodedHttpException(
        domainErrorCodes.storage.articlePdfUploadExpired,
        HttpStatus.GONE,
      );
    }
  }

  private assertUsable(upload: ArticleUpload, expired: boolean): void {
    if (upload.consumed_at) {
      throw new CodedHttpException(
        domainErrorCodes.storage.articlePdfUploadConsumed,
        HttpStatus.CONFLICT,
      );
    }
    this.assertUnexpired(expired);
    if (!upload.verified_at) {
      throw new CodedHttpException(
        domainErrorCodes.storage.articlePdfUploadNotVerified,
        HttpStatus.CONFLICT,
      );
    }
  }

  private toStorageRequest(upload: ArticleUpload): UploadRequest {
    return {
      key: upload.storage_key,
      contentType: upload.mime_type,
      sizeBytes: Number(upload.size_bytes),
      sha256: upload.sha256,
    };
  }

  private toStatus(
    upload: ArticleUpload,
    expired: boolean,
  ): ArticlePdfUploadStatusDto {
    let status: ArticlePdfUploadStatusDto['status'] = 'PENDING';
    if (upload.consumed_at) status = 'CONSUMED';
    else if (expired) status = 'EXPIRED';
    else if (upload.verified_at) status = 'VERIFIED';

    return {
      uploadId: upload.id,
      fileName: upload.file_name,
      mimeType: articlePdfMimeType,
      sizeBytes: Number(upload.size_bytes),
      expiresAt: upload.expires_at.toISOString(),
      verifiedAt: upload.verified_at?.toISOString() ?? null,
      status,
      metadataStatus: upload.metadata_status,
    };
  }
}
