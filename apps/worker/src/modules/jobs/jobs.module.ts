import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
} from '@researchos/queue';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import { BackgroundJobProcessor } from '../../processors/background-job.processor.js';
import { OutboxService } from './outbox.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

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
  ],
  providers: [ProbeProcessor, BackgroundJobProcessor, OutboxService],
})
export class JobsModule {}
