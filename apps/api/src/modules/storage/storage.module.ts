import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service.js';
import { OutputDownloadController } from './output-download.controller.js';
import { OutputDownloadService } from './output-download.service.js';
import { OutputUploadController } from './output-upload.controller.js';
import { OutputUploadService } from './output-upload.service.js';

@Module({
  controllers: [OutputUploadController, OutputDownloadController],
  providers: [ObjectStorageService, OutputUploadService, OutputDownloadService],
})
export class StorageModule {}
