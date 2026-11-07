import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  createQueueOptions,
  SYSTEM_QUEUE,
  BACKGROUND_QUEUE,
} from '@researchos/queue';
import { ProbeProcessor } from '../../processors/probe.processor.js';
import { BackgroundProbeProcessor } from '../../processors/background-probe.processor.js';
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
  ],
  providers: [ProbeProcessor, BackgroundProbeProcessor, OutboxService],
})
export class JobsModule {}
