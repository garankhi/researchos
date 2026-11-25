import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationGateway } from './notification.gateway.js';

@Module({
  imports: [IdentityModule],
  providers: [NotificationGateway],
})
export class NotificationsModule {}
