import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigestSender } from './digest-sender.service.js';
import { DigestTemplate } from './digest-template.js';
import { GmailSmtpProvider } from './gmail-smtp.provider.js';
import { MAIL_PROVIDER } from './mail-provider.js';

@Module({
  providers: [
    DigestTemplate,
    DigestSender,
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
  exports: [DigestSender],
})
export class NotificationsModule {}
