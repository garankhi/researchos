import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, type Prisma } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  ARTICLE_PDF_METADATA_JOB,
  JOB_ATTEMPTS,
  MAX_ARTICLE_PDF_BYTES,
  isJobUuid,
  type ArticlePdfMetadata,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { createS3Storage, type StorageAdapter } from '@researchos/storage';
import { UnrecoverableError } from 'bullmq';
import {
  enrichArticlePdfMetadata,
  type GrobidHeaderInput,
  type GrobidSettings,
} from './article-pdf-grobid.js';
import type { PdfEvidence, PdfParserInput } from './article-pdf-parser.js';

const errors = domainErrorCodes.storage;
const extractionTimeoutMs = 15_000;
const defaultGrobidTimeoutMs = 4_000;
type Extraction = { metadata: ArticlePdfMetadata } | { error: string };
type ParserResult = Extraction & { evidence?: PdfEvidence };
type VerifiedPdf = { storage_key: string; size_bytes: bigint; sha256: string };

function runPdfThread<Result>(
  module: URL,
  input: PdfParserInput | GrobidHeaderInput,
  signal: AbortSignal,
  transferList: ArrayBuffer[] = [],
): Promise<Result> {
  signal.throwIfAborted();
  const worker = new Worker(module, {
    workerData: input,
    transferList,
    resourceLimits: { maxOldGenerationSizeMb: 192 },
  });
  let abort: () => void;
  return new Promise<Result>((resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', () => reject(new Error('PDF parser exited early')));
  }).finally(async () => {
    signal.removeEventListener('abort', abort);
    await worker.terminate();
  });
}

@Injectable()
export class ArticlePdfMetadataService {
  private storage?: StorageAdapter;
  private readonly grobid?: GrobidSettings;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const baseUrl = config.get<string>('ARTICLE_PDF_GROBID_URL')?.trim();
    if (!baseUrl) return;
    try {
      const endpoint = new URL('/api/processHeaderDocument', baseUrl);
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password
      )
        throw new Error('Invalid GROBID URL');
      const timeout = Number(
        config.get<string>('ARTICLE_PDF_GROBID_TIMEOUT_MS'),
      );
      this.grobid = {
        endpoint,
        timeoutMs:
          Number.isInteger(timeout) && timeout > 0
            ? Math.min(timeout, extractionTimeoutMs)
            : defaultGrobidTimeoutMs,
      };
    } catch {
      new Logger(ArticlePdfMetadataService.name).warn(
        'Invalid ARTICLE_PDF_GROBID_URL; Article PDF enrichment is disabled',
      );
    }
  }

  async process(ref: BackgroundJobPayload, scope: string): Promise<void> {
    const identity = {
      id: ref.jobId,
      generation: ref.generation,
      queue_prefix: scope,
      kind: ARTICLE_PDF_METADATA_JOB,
      status: 'PENDING',
    };
    const claim = await this.prisma.$transaction(async (tx) => {
      const [job] = await tx.$queryRaw<
        {
          owner_id: string;
          idempotency_key: string;
          attempts: number;
        }[]
      >`
        UPDATE background_jobs SET attempts = attempts + 1, updated_at = now()
        WHERE id = ${ref.jobId}::uuid AND generation = ${ref.generation}
          AND queue_prefix = ${scope} AND kind = ${ARTICLE_PDF_METADATA_JOB}
          AND status = 'PENDING'
        RETURNING owner_id, idempotency_key, attempts
      `;
      if (!job) return null;
      const uploadId = job.idempotency_key;
      const [pdf] = isJobUuid(uploadId)
        ? await tx.$queryRaw<VerifiedPdf[]>`
        UPDATE article_creation_uploads SET metadata_status = 'PROCESSING'
        WHERE id = ${uploadId}::uuid AND owner_id = ${job.owner_id}::uuid
          AND verified_at IS NOT NULL AND consumed_at IS NULL
          AND storage_deleted_at IS NULL AND expires_at > clock_timestamp()
        RETURNING storage_key, size_bytes, sha256
      `
        : [];
      if (!pdf) {
        await tx.background_jobs.update({
          where: { id: ref.jobId },
          data: { status: 'COMPLETED' },
        });
        return null;
      }
      return { pdf, uploadId, ownerId: job.owner_id, attempt: job.attempts };
    });
    if (!claim) return;

    let outcome: Extraction;
    let transient = false;
    if (claim.attempt > JOB_ATTEMPTS) {
      outcome = { error: errors.articlePdfMetadataUnavailable };
    } else {
      const signal = AbortSignal.timeout(extractionTimeoutMs);
      try {
        outcome = await this.extract(claim.pdf, signal);
      } catch {
        transient = !signal.aborted;
        outcome = {
          error: signal.aborted
            ? errors.articlePdfMetadataTimeout
            : errors.articlePdfMetadataUnavailable,
        };
      }
    }

    const error = 'error' in outcome ? outcome.error : null;
    const retry = transient && claim.attempt < JOB_ATTEMPTS;
    const recorded = await this.prisma.$transaction(async (tx) => {
      // Lock the job first, as in the claim. A stalled attempt must not publish
      // after a new attempt or the outbox has already changed its state.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM background_jobs WHERE id = ${ref.jobId}::uuid
          AND generation = ${ref.generation} AND attempts = ${claim.attempt}
          AND status = 'PENDING' FOR UPDATE
      `;
      if (!rows.length) return false;
      const status = retry ? 'QUEUED' : error ? 'FAILED' : 'READY';
      const active = await tx.$executeRaw`
        UPDATE article_creation_uploads SET metadata_status = ${status}::article_pdf_metadata_status
        WHERE id = ${claim.uploadId}::uuid AND owner_id = ${claim.ownerId}::uuid
          AND consumed_at IS NULL AND storage_deleted_at IS NULL
          AND expires_at > clock_timestamp()
      `;
      const failed = Boolean(active && error && !retry);
      await tx.background_jobs.update({
        where: identity,
        data: {
          status: active && retry ? 'PENDING' : failed ? 'FAILED' : 'COMPLETED',
          updated_at: new Date(),
          error_code: failed ? error : null,
          ...(active &&
            'metadata' in outcome && {
              result: outcome.metadata as Prisma.InputJsonObject,
            }),
          ...(failed && {
            outbox: {
              create: { generation: ref.generation, destination: 'DLQ' },
            },
          }),
        },
      });
      return Boolean(active);
    });
    if (recorded && error) {
      throw retry ? new Error(error) : new UnrecoverableError(error);
    }
  }

  private async extract(
    pdf: VerifiedPdf,
    signal: AbortSignal,
  ): Promise<Extraction> {
    const size = Number(pdf.size_bytes);
    if (size < 1 || size > MAX_ARTICLE_PDF_BYTES) {
      return { error: errors.articlePdfMetadataUnsupported };
    }
    const storage = (this.storage ??= createS3Storage());
    const stream = await storage.getObject(pdf.storage_key, signal);
    const abortStream = () => stream.destroy(new Error('PDF read timed out'));
    signal.addEventListener('abort', abortStream, { once: true });
    const bytes = new Uint8Array(size);
    const sha256 = createHash('sha256');
    let offset = 0;
    try {
      signal.throwIfAborted();
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        signal.throwIfAborted();
        if (offset + chunk.length > size)
          return { error: errors.articlePdfMetadataCorrupt };
        bytes.set(chunk, offset);
        sha256.update(chunk);
        offset += chunk.length;
      }
    } finally {
      signal.removeEventListener('abort', abortStream);
      stream.destroy();
    }
    if (offset !== size || sha256.digest('hex') !== pdf.sha256) {
      return { error: errors.articlePdfMetadataCorrupt };
    }
    // The parser worker takes ownership of the ArrayBuffer. Keep an immutable
    // copy of the verified bytes only when the fallback is enabled.
    const file = this.grobid
      ? new Blob([bytes], { type: 'application/pdf' })
      : undefined;
    const parsed = await runPdfThread<ParserResult>(
      new URL('./article-pdf-parser.js', import.meta.url),
      { bytes, collectEvidence: Boolean(file) },
      signal,
      [bytes.buffer],
    );
    if ('error' in parsed) return { error: parsed.error };
    const { metadata, evidence } = parsed;
    return {
      metadata:
        this.grobid && file && evidence
          ? await enrichArticlePdfMetadata(
              metadata,
              evidence,
              file,
              this.grobid,
              signal,
              (input, deadline) =>
                runPdfThread<ArticlePdfMetadata>(
                  new URL(
                    './article-pdf-grobid-header.worker.js',
                    import.meta.url,
                  ),
                  input,
                  deadline,
                ),
            )
          : metadata,
    };
  }
}
