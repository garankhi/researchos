import { Module } from '@nestjs/common';
import { ArticleCreationUploadCleanupService } from './article-creation-upload-cleanup.service.js';
import { ArticleCreationUploadController } from './article-creation-upload.controller.js';
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
  // ChatModule imports StorageModule and injects ObjectStorageService, so the
  // services module has to be re-exported. Nest only re-exports providers it
  // owns, so the module itself is exported rather than the provider.
  exports: [StorageServicesModule],
})
export class StorageModule {}
