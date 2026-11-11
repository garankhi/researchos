import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
  RESEARCH_UPDATES_QUEUE,
} from '@researchos/queue';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import {
  BackgroundJobProcessor,
  BackgroundJobRunner,
  ResearchUpdateProcessor,
} from '../../processors/background-job.processor.js';
import { OutboxService } from './outbox.service.js';

@Module({
  imports: [
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
  ],
  providers: [
    ProbeProcessor,
    BackgroundJobRunner,
    BackgroundJobProcessor,
    ResearchUpdateProcessor,
    OutboxService,
  ],
})
export class JobsModule {}
