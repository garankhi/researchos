import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ARTICLE_PDF_METADATA_QUEUE,
  articlePdfMetadataScope,
  isBackgroundJobPayload,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';
import { ArticlePdfMetadataService } from '../modules/jobs/article-pdf-metadata.service.js';

@Processor(ARTICLE_PDF_METADATA_QUEUE, { concurrency: 2 })
export class ArticlePdfMetadataProcessor extends WorkerHost {
  private readonly logger = new Logger(ArticlePdfMetadataProcessor.name);
  private readonly scope: string;

  constructor(
    @Inject(ArticlePdfMetadataService)
    private readonly metadata: ArticlePdfMetadataService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    super();
    this.scope = articlePdfMetadataScope(
      config.get<string>('QUEUE_PREFIX') ?? 'researchos',
    );
  }

  process(job: Job<BackgroundJobPayload>): Promise<void> {
    if (!isBackgroundJobPayload(job.data)) {
      throw new UnrecoverableError('Invalid background job reference');
    }
    return this.metadata.process(job.data, this.scope);
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }
}
