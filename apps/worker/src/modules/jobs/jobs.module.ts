import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  TOPIC_SUGGESTION_QUEUE,
} from '@researchos/queue';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import {
  BackgroundJobProcessor,
  BackgroundJobRunner,
  ResearchUpdateProcessor,
} from '../../processors/background-job.processor.js';
import { OutboxService } from './outbox.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
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
    BullModule.registerQueue({ name: RESEARCH_UPDATES_QUEUE }),
    BullModule.registerQueue({ name: TOPIC_SUGGESTION_QUEUE }),
  ],
  providers: [
    ProbeProcessor,
    BackgroundJobRunner,
    BackgroundJobProcessor,
    ResearchUpdateProcessor,
    OutboxService,
    TopicSuggestionProcessor,
    TopicEmbeddingIndexService,
    TopicEmbeddingModel,
  ],
})
export class JobsModule {}
