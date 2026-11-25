import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationGateway } from './notification.gateway.js';
import { NotificationDevicesController } from './notification-devices.controller.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController, NotificationDevicesController],
  providers: [NotificationGateway],
})
export class NotificationsModule {}
