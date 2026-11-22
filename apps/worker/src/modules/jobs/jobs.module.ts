import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  ARTICLE_PDF_METADATA_QUEUE,
} from '@researchos/queue';
import { ArticlePdfMetadataProcessor } from '../../processors/article-pdf-metadata.processor.js';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import {
  BackgroundJobProcessor,
  BackgroundJobRunner,
  ResearchUpdateProcessor,
} from '../../processors/background-job.processor.js';
import { OutboxService } from './outbox.service.js';
import { ArticlePdfMetadataService } from './article-pdf-metadata.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OpportunityExpiryProcessor } from '../../processors/opportunity-expiry.processor.js';
import {
  OPPORTUNITY_EXPIRY_QUEUE,
  OpportunityExpiryService,
} from './opportunity-expiry.service.js';

@Module({
  imports: [
    NotificationsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createQueueOptions(
          config.getOrThrow<string>('REDIS_URL'),
          config.get<string>('QUEUE_PREFIX') ?? 'researchos',
          'worker',
        ),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
    BullModule.registerQueue({ name: BACKGROUND_QUEUE }),
    BullModule.registerQueue({ name: RESEARCH_UPDATES_QUEUE }),
    BullModule.registerQueue({ name: ARTICLE_PDF_METADATA_QUEUE }),
    BullModule.registerQueue({ name: OPPORTUNITY_EXPIRY_QUEUE }),
  ],
  providers: [
    ProbeProcessor,
    BackgroundJobRunner,
    ArticlePdfMetadataService,
    ArticlePdfMetadataProcessor,
    BackgroundJobProcessor,
    ResearchUpdateProcessor,
    OutboxService,
    OpportunityExpiryService,
    OpportunityExpiryProcessor,
  ],
})
export class JobsModule {}
