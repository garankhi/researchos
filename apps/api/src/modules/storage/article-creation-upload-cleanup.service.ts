import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { ObjectStorageService } from './object-storage.service.js';

const sweepEveryMs = 5 * 60_000;
const batchSize = 50;
const deleteTimeoutMs = 10_000;

@Injectable()
export class ArticleCreationUploadCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    ArticleCreationUploadCleanupService.name,
  );
  private timer?: NodeJS.Timeout;
  private runningSweep?: Promise<void>;
  private scanAfter?: string;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      !process.env.S3_BUCKET ||
      !process.env.S3_REGION
    )
      return;

    this.timer = setInterval(() => {
      this.runningSweep ??= this.sweepExpiredUploads()
        .catch(() =>
          this.logger.warn('Could not scan expired Article PDF uploads'),
        )
        .finally(() => {
          this.runningSweep = undefined;
        });
    }, sweepEveryMs).unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.runningSweep;
  }

  async sweepExpiredUploads(): Promise<void> {
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT upload.id
      FROM article_creation_uploads AS upload
      WHERE upload.consumed_at IS NULL AND upload.storage_deleted_at IS NULL
        AND upload.expires_at <= statement_timestamp()
        AND (${this.scanAfter ?? null}::uuid IS NULL OR (upload.expires_at, upload.id) > (
          SELECT expires_at, id FROM article_creation_uploads WHERE id = ${this.scanAfter ?? null}::uuid
        ))
      ORDER BY upload.expires_at, upload.id LIMIT ${batchSize}
    `;
    // Rotate the scan so a failed deletion cannot prevent later sessions from being cleaned.
    this.scanAfter =
      candidates.length === batchSize ? candidates.at(-1)?.id : undefined;
    for (const { id } of candidates) {
      if (this.stopping) return;
      try {
        await this.deleteExpiredObject(id);
      } catch (error) {
        this.logger.warn(
          `Could not delete expired Article PDF upload ${id}: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      }
    }
  }

  private async deleteExpiredObject(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        // A consume transaction can still be committing an upload selected before expiry.
        // Lock the unused row and recheck expiry before touching its object.
        const [upload] = await tx.$queryRaw<{ storage_key: string }[]>`
        SELECT storage_key FROM article_creation_uploads
        WHERE id = ${id}::uuid AND consumed_at IS NULL AND storage_deleted_at IS NULL
          AND expires_at <= statement_timestamp()
        FOR UPDATE SKIP LOCKED
      `;
        if (!upload) return;

        await this.storage.adapter.deleteObject(
          upload.storage_key,
          AbortSignal.timeout(deleteTimeoutMs),
        );
        await tx.$executeRaw`
        UPDATE article_creation_uploads SET storage_deleted_at = clock_timestamp()
        WHERE id = ${id}::uuid
      `;
      },
      { timeout: deleteTimeoutMs + 5_000 },
    );
  }
}
