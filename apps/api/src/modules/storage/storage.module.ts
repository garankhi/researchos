import { Module } from '@nestjs/common';
import { ArticleCreationUploadCleanupService } from './article-creation-upload-cleanup.service.js';
import { ArticleCreationUploadController } from './article-creation-upload.controller.js';
import { ObjectStorageService } from './object-storage.service.js';
import { OutputDownloadController } from './output-download.controller.js';
import { OutputDownloadService } from './output-download.service.js';
import { OutputUploadController } from './output-upload.controller.js';
import { OutputUploadService } from './output-upload.service.js';
import { StorageServicesModule } from './storage-services.module.js';

@Module({
  imports: [StorageServicesModule],
  controllers: [
    OutputUploadController,
    OutputDownloadController,
    ArticleCreationUploadController,
  ],
  providers: [
    OutputUploadService,
    OutputDownloadService,
    ArticleCreationUploadCleanupService,
  ],
  // ChatModule imports StorageModule and injects ObjectStorageService.
  exports: [ObjectStorageService],
})
export class StorageModule {}
