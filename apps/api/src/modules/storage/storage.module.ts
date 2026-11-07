import { Module } from '@nestjs/common';
import { OutputUploadController } from './output-upload.controller.js';
import { OutputUploadService } from './output-upload.service.js';

@Module({
  controllers: [OutputUploadController],
  providers: [OutputUploadService],
})
export class StorageModule {}
