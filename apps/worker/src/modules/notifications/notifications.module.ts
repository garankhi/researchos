import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DigestSchedulerProcessor } from '../../processors/digest-scheduler.processor.js';
import {
  DIGEST_SCHEDULER_QUEUE,
  DigestScheduler,
} from './digest-scheduler.service.js';
import { DigestSender } from './digest-sender.service.js';
import { DigestTemplate } from './digest-template.js';
import { GmailSmtpProvider } from './gmail-smtp.provider.js';
import { MAIL_PROVIDER } from './mail-provider.js';
import { DigestJobConsumer } from '../../processors/digest-job.consumer.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: DIGEST_SCHEDULER_QUEUE })],
  providers: [
    DigestScheduler,
    DigestSchedulerProcessor,
    DigestTemplate,
    DigestSender,
    DigestJobConsumer,
    NotificationDeliveryService,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('DIGEST_SMTP_ENABLED') === 'true'
          ? new GmailSmtpProvider(
              config.getOrThrow<string>('DIGEST_SMTP_USER'),
              config.getOrThrow<string>('DIGEST_SMTP_APP_PASSWORD'),
            )
          : null,
    },
  ],
})
export class NotificationsModule {}
