import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  OutputFileVisibility,
  Prisma,
  PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import type { StorageAdapter } from '@researchos/storage';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  CreateOutputUploadDto,
  OutputFileResponseDto,
  OutputUploadResponseDto,
} from './dto/output-upload.dto.js';
import { ObjectStorageService } from './object-storage.service.js';
import {
  readUploadIntent,
  signUploadIntent,
  type UploadIntent,
} from './upload-token.js';
import {
  verifyUploadedS3Object,
  withStorageAdapter,
} from './verify-stored-object.js';

const confirmationTtlMs = 15 * 60_000;
type OutputFile = Prisma.output_filesGetPayload<undefined>;

@Injectable()
export class OutputUploadService {
  private readonly logger = new Logger(OutputUploadService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async createUpload(
    userId: string,
    outputId: string,
    input: CreateOutputUploadDto,
  ): Promise<OutputUploadResponseDto> {
    const visibility = input.visibility ?? OutputFileVisibility.PRIVATE;
    const accessGroupId = input.accessGroupId ?? null;
    if (
      (visibility === OutputFileVisibility.RESEARCH_GROUP) !==
      Boolean(accessGroupId)
    ) {
      throw new BadRequestException('validation_failed');
    }
    await this.assertCanManage(userId, outputId, accessGroupId);

    const intent: UploadIntent = {
      userId,
      outputId,
      key: `outputs/${outputId}/${randomUUID()}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256.toLowerCase(),
      visibility,
      accessGroupId,
      expiresAt: Date.now() + confirmationTtlMs,
    };
    const uploadToken = signUploadIntent(intent);
    const { url, headers } = await this.withStorage((storage) =>
      storage.createUploadUrl({
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
    outputId: string,
    uploadToken: string,
  ): Promise<OutputFileResponseDto> {
    let intent: UploadIntent;
    try {
      intent = readUploadIntent(uploadToken);
    } catch {
      throw new CodedHttpException(
        domainErrorCodes.storage.uploadIntentInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (intent.userId !== userId || intent.outputId !== outputId) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    await this.assertCanManage(userId, outputId);

    const existing = await this.prisma.output_files.findUnique({
      where: { storage_key: intent.key },
    });
    if (existing) {
      return this.toResponse(existing);
    }
    if (intent.expiresAt <= Date.now()) {
      throw new CodedHttpException(
        domainErrorCodes.storage.uploadIntentInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.verifyObject(intent);
    // Evaluate authorization in the write statement, including when the
    // insert has to wait for a concurrent transaction before it can start.
    const [inserted] = await this.prisma.$queryRaw<OutputFile[]>`
      INSERT INTO output_files (
        output_id, uploaded_by, storage_key, file_name, mime_type,
        size_bytes, sha256, visibility, access_group_id
      )
      SELECT ${outputId}::uuid, ${userId}::uuid, ${intent.key},
             ${intent.fileName}, ${intent.mimeType}, ${BigInt(intent.sizeBytes)},
             ${intent.sha256}, ${intent.visibility}::visibility_level,
             ${intent.accessGroupId}::uuid
      WHERE can_manage_output(${userId}::uuid, ${outputId}::uuid)
        AND (${intent.accessGroupId}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM research_groups WHERE id = ${intent.accessGroupId}::uuid
        ))
      ON CONFLICT (storage_key) DO NOTHING
      RETURNING *
    `;
    if (inserted) {
      return this.toResponse(inserted);
    }

    // Another confirmation may have committed while this insert waited.
    await this.assertCanManage(userId, outputId, intent.accessGroupId);
    const file = await this.prisma.output_files.findUnique({
      where: { storage_key: intent.key },
    });
    if (!file) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileConflict,
        HttpStatus.CONFLICT,
      );
    }
    return this.toResponse(file);
  }

  private async verifyObject(intent: UploadIntent): Promise<void> {
    await verifyUploadedS3Object(this.storage.adapter, this.logger, {
      key: intent.key,
      sizeBytes: intent.sizeBytes,
      mimeType: intent.mimeType,
      sha256: intent.sha256,
    });
  }

  private async assertCanManage(
    userId: string,
    outputId: string,
    accessGroupId: string | null = null,
  ): Promise<void> {
    const [access] = await this.prisma.$queryRaw<
      { can_manage: boolean; group_exists: boolean }[]
    >`
      SELECT can_manage_output(${userId}::uuid, ${outputId}::uuid) AS can_manage,
             ${accessGroupId}::uuid IS NULL OR EXISTS (
               SELECT 1 FROM research_groups WHERE id = ${accessGroupId}::uuid
             ) AS group_exists
    `;
    if (!access?.can_manage) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
    if (!access.group_exists) {
      throw new BadRequestException('validation_failed');
    }
  }

  private async withStorage<T>(
    run: (storage: StorageAdapter) => Promise<T>,
  ): Promise<T> {
    return withStorageAdapter(this.storage.adapter, this.logger, run);
  }

  private toResponse(file: OutputFile): OutputFileResponseDto {
    return {
      id: file.id,
      outputId: file.output_id,
      fileName: file.file_name,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      sha256: file.sha256,
      visibility: file.visibility,
      accessGroupId: file.access_group_id,
    };
  }
}
