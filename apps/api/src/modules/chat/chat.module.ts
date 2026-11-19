import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ChatAttachmentSweeper } from './chat-attachment-sweeper.service.js';
import { ChatAttachmentsController } from './chat-attachments.controller.js';
import { ChatAttachmentsService } from './chat-attachments.service.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [IdentityModule, StorageModule],
  controllers: [ChatController, ChatAttachmentsController],
  providers: [
    ChatService,
    ChatAttachmentsService,
    ChatAttachmentSweeper,
    ChatGateway,
  ],
  exports: [ChatService],
})
export class ChatModule {}
