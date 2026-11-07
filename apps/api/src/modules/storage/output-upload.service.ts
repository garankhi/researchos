import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OutputFileVisibility,
  Prisma,
  PrismaService,
} from '@researchos/database';
import { createS3Storage, type StorageAdapter } from '@researchos/storage';
import type {
  CreateOutputUploadDto,
  OutputFileResponseDto,
  OutputUploadResponseDto,
} from './dto/output-upload.dto.js';
import {
  readUploadIntent,
  signUploadIntent,
  type UploadIntent,
} from './upload-token.js';

const confirmationTtlMs = 15 * 60_000;
type OutputFile = Prisma.output_filesGetPayload<undefined>;

@Injectable()
export class OutputUploadService {
  private readonly logger = new Logger(OutputUploadService.name);
  private storage?: StorageAdapter;

  constructor(private readonly prisma: PrismaService) {}

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
      throw new BadRequestException();
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
    const intent = readUploadIntent(uploadToken);
    if (intent.userId !== userId || intent.outputId !== outputId) {
      throw new ForbiddenException();
    }
    await this.assertCanManage(userId, outputId);

    const existing = await this.prisma.output_files.findUnique({
      where: { storage_key: intent.key },
    });
    if (existing) {
      return this.toResponse(existing);
    }
    if (intent.expiresAt <= Date.now()) {
      throw new BadRequestException();
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
      throw new ConflictException();
    }
    return this.toResponse(file);
  }

  private async verifyObject(intent: UploadIntent): Promise<void> {
    const metadata = await this.withStorage((storage) =>
      storage.headObject(intent.key),
    );
    if (
      !metadata ||
      metadata.sizeBytes !== intent.sizeBytes ||
      metadata.contentType !== intent.mimeType
    ) {
      throw new ConflictException();
    }
    const sha256 =
      metadata.sha256 ??
      (await this.withStorage(async (storage) => {
        const body = await storage.getObject(intent.key);
        const hash = createHash('sha256');
        let size = 0;
        try {
          for await (const chunk of body as AsyncIterable<Buffer>) {
            size += chunk.byteLength;
            if (size > intent.sizeBytes) {
              return undefined;
            }
            hash.update(chunk);
          }
          return size === intent.sizeBytes ? hash.digest('hex') : undefined;
        } finally {
          body.destroy();
        }
      }));
    if (sha256 !== intent.sha256) {
      throw new ConflictException();
    }
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
      throw new ForbiddenException();
    }
    if (!access.group_exists) {
      throw new BadRequestException();
    }
  }

  private async withStorage<T>(
    run: (storage: StorageAdapter) => Promise<T>,
  ): Promise<T> {
    try {
      return await run((this.storage ??= createS3Storage()));
    } catch (error) {
      this.logger.warn(
        `S3 operation failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      throw new ServiceUnavailableException();
    }
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
