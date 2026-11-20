import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackgroundJobsService, PrismaService } from '@researchos/database';
import type {
  OutputFile,
  OutputFileVisibility,
  Prisma,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  ARTICLE_PDF_METADATA_JOB,
  articlePdfMetadataScope,
  type ArticlePdfMetadata,
} from '@researchos/queue';
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
type ArticleUploadSnapshot = ArticleUpload & {
  expired: boolean;
  job_status: Prisma.background_jobsGetPayload<undefined>['status'] | null;
  job_result: Prisma.JsonValue;
  job_error_code: string | null;
};
type ArticleFileVisibility = Extract<
  OutputFileVisibility,
  'PRIVATE' | 'FPTU_COMMUNITY'
>;

@Injectable()
export class ArticleCreationUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly jobs: BackgroundJobsService,
    private readonly config: ConfigService,
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
    return this.toStatus(upload);
  }

  async confirmUpload(
    ownerId: string,
    uploadId: string,
  ): Promise<ArticlePdfUploadStatusDto> {
    const upload = await this.findOwnerUpload(ownerId, uploadId);
    if (upload.consumed_at) return this.toStatus(upload);
    this.assertUnexpired(upload.expired);
    if (upload.verified_at && upload.metadata_status !== 'NOT_STARTED') {
      return this.toStatus(upload);
    }

    const matched =
      upload.verified_at ||
      (await this.storage.verifyUpload(this.toStorageRequest(upload), true));
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockOwnerUpload(tx, ownerId, uploadId);
      if (current.consumed_at) return;
      this.assertUnexpired(current.expired);
      if (!current.verified_at && !matched) {
        throw new CodedHttpException(
          domainErrorCodes.storage.fileConflict,
          HttpStatus.CONFLICT,
        );
      }

      if (current.metadata_status !== 'NOT_STARTED') return;
      await tx.article_creation_uploads.update({
        where: { id: current.id },
        data: {
          verified_at: current.verified_at ?? current.now,
          metadata_status: 'QUEUED',
        },
      });
      await this.jobs.submitInTransaction(
        tx,
        current.owner_id,
        ARTICLE_PDF_METADATA_JOB,
        current.id,
        { uploadId: current.id },
        articlePdfMetadataScope(
          this.config.get<string>('QUEUE_PREFIX') ?? 'researchos',
        ),
      );
    });
    return this.getUpload(ownerId, upload.id);
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
  ): Promise<ArticleUploadSnapshot> {
    // The join shares a statement snapshot with consumption and job updates.
    const [upload] = await this.prisma.$queryRaw<ArticleUploadSnapshot[]>`
      SELECT u.*, u.expires_at <= statement_timestamp() OR u.storage_deleted_at IS NOT NULL AS expired,
        j.status AS job_status, j.result AS job_result, j.error_code AS job_error_code
      FROM article_creation_uploads u
      LEFT JOIN background_jobs j ON j.owner_id = u.owner_id AND j.kind = ${ARTICLE_PDF_METADATA_JOB}
        AND j.idempotency_key = u.id::text
        AND u.verified_at IS NOT NULL AND u.consumed_at IS NULL
        AND u.metadata_status <> 'NOT_STARTED'
      WHERE u.id = ${uploadId}::uuid AND u.owner_id = ${ownerId}::uuid
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

  private toStatus(upload: ArticleUploadSnapshot): ArticlePdfUploadStatusDto {
    let status: ArticlePdfUploadStatusDto['status'] = 'PENDING';
    if (upload.consumed_at) status = 'CONSUMED';
    else if (upload.expired) status = 'EXPIRED';
    else if (upload.verified_at) status = 'VERIFIED';

    let metadataStatus: ArticlePdfUploadStatusDto['metadataStatus'] =
      'NOT_STARTED';
    let metadata: ArticlePdfMetadata | null = null;
    let metadataErrorCode: string | null = null;
    if (status === 'VERIFIED') {
      switch (upload.job_status) {
        case 'FAILED':
          metadataStatus = 'FAILED';
          metadataErrorCode =
            !upload.job_error_code || upload.job_error_code === 'job_failed'
              ? domainErrorCodes.storage.articlePdfMetadataUnavailable
              : upload.job_error_code;
          break;
        case 'COMPLETED':
          if (
            upload.job_result &&
            typeof upload.job_result === 'object' &&
            !Array.isArray(upload.job_result)
          ) {
            metadataStatus = 'READY';
            metadata = upload.job_result as ArticlePdfMetadata;
          }
          break;
        case 'PENDING':
          metadataStatus =
            upload.metadata_status === 'PROCESSING' ? 'PROCESSING' : 'QUEUED';
          break;
      }
    }
    return {
      uploadId: upload.id,
      fileName: upload.file_name,
      mimeType: articlePdfMimeType,
      sizeBytes: Number(upload.size_bytes),
      expiresAt: upload.expires_at.toISOString(),
      verifiedAt: upload.verified_at?.toISOString() ?? null,
      status,
      metadataStatus,
      metadata,
      metadataErrorCode,
    };
  }
}
