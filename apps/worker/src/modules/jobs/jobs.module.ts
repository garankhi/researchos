import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
  NOTIFICATION_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  TOPIC_SUGGESTION_QUEUE,
  ARTICLE_PDF_METADATA_QUEUE,
} from '@researchos/queue';
import { ArticlePdfMetadataProcessor } from '../../processors/article-pdf-metadata.processor.js';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import {
  BackgroundJobProcessor,
  BackgroundJobRunner,
  NotificationFanoutProcessor,
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
import { TopicSuggestionProcessor } from '../../processors/topic-suggestion.processor.js';
import { TopicEmbeddingIndexService } from './topic-embedding-index.service.js';
import { TopicEmbeddingModel } from './topic-embedding-model.js';

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
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    BullModule.registerQueue({ name: RESEARCH_UPDATES_QUEUE }),
    BullModule.registerQueue({ name: TOPIC_SUGGESTION_QUEUE }),
    BullModule.registerQueue({ name: ARTICLE_PDF_METADATA_QUEUE }),
    BullModule.registerQueue({ name: OPPORTUNITY_EXPIRY_QUEUE }),
  ],
  providers: [
    ProbeProcessor,
    BackgroundJobRunner,
    NotificationFanoutProcessor,
    ArticlePdfMetadataService,
    ArticlePdfMetadataProcessor,
    BackgroundJobProcessor,
    ResearchUpdateProcessor,
    OutboxService,
    OpportunityExpiryService,
    OpportunityExpiryProcessor,
    TopicSuggestionProcessor,
    TopicEmbeddingIndexService,
    TopicEmbeddingModel,
  ],
})
export class JobsModule {}
