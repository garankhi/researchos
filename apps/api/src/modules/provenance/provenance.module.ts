import { Module } from '@nestjs/common';
import { ProvenanceService } from './provenance.service.js';

/**
 * Module owning the field-level provenance writer.
 *
 * Provenance is a cross-cutting record written alongside automated field
 * writes (OpenAlex ingest, AI inference, legacy imports). The service is
 * exported so ingest paths can call it inside their own transaction; this
 * module exposes no controller because provenance rows are never written
 * directly by clients.
 */
@Module({
  providers: [ProvenanceService],
  exports: [ProvenanceService],
})
export class ProvenanceModule {}
