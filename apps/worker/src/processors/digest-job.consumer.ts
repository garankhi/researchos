import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createQueueOptions,
  DIGEST_QUEUE,
  isBackgroundJobPayload,
} from '@researchos/queue';
import { UnrecoverableError, Worker } from 'bullmq';
import { DigestSender } from '../modules/notifications/digest-sender.service.js';

@Injectable()
export class DigestJobConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestJobConsumer.name);
  private worker?: Worker<unknown>;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DigestSender) private readonly sender: DigestSender,
  ) {}

  onModuleInit(): void {
    if (!this.sender.enabled) return;
    const prefix = this.config.get<string>('QUEUE_PREFIX') ?? 'researchos';
    const options = createQueueOptions(
      this.config.getOrThrow<string>('REDIS_URL'),
      prefix,
      'worker',
    );
    this.worker = new Worker<unknown>(
      DIGEST_QUEUE,
      async (job) => {
        if (!isBackgroundJobPayload(job.data)) {
          throw new UnrecoverableError('Invalid digest job reference');
        }
        await this.sender.process(job.data, prefix);
      },
      { ...options, concurrency: 2 },
    );
    this.worker.on('error', (error) => this.logger.error(error.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
