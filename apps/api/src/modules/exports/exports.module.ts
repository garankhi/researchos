import { Module } from '@nestjs/common';
import { StorageServicesModule } from '../storage/storage-services.module.js';
import { LlkhExportsController } from './llkh-exports.controller.js';

@Module({
  imports: [StorageServicesModule],
  controllers: [LlkhExportsController],
})
export class ExportsModule {}
