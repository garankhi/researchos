import { Module } from '@nestjs/common';
import { ArticleCreationUploadService } from './article-creation-upload.service.js';
import { ObjectStorageService } from './object-storage.service.js';

@Module({
  providers: [ObjectStorageService, ArticleCreationUploadService],
  exports: [ObjectStorageService, ArticleCreationUploadService],
})
export class StorageServicesModule {}
