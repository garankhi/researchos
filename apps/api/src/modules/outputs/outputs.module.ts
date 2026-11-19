import { Module } from '@nestjs/common';
import { ProvenanceModule } from '../provenance/provenance.module.js';
import { StorageServicesModule } from '../storage/storage-services.module.js';
import { OutputsController } from './outputs.controller.js';
import { OutputsService } from './outputs.service.js';

@Module({
  imports: [ProvenanceModule, StorageServicesModule],
  controllers: [OutputsController],
  providers: [OutputsService],
  exports: [OutputsService],
})
export class OutputsModule {}
