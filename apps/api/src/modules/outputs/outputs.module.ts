import { Module } from '@nestjs/common';
import { ProvenanceModule } from '../provenance/provenance.module.js';
import { OutputsController } from './outputs.controller.js';
import { OutputsService } from './outputs.service.js';

@Module({
  imports: [ProvenanceModule],
  controllers: [OutputsController],
  providers: [OutputsService],
  exports: [OutputsService],
})
export class OutputsModule {}
