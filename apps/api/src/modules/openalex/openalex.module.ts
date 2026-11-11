import { Module } from '@nestjs/common';
import { ProvenanceModule } from '../provenance/provenance.module.js';
import { OpenAlexCandidatesController } from './openalex-candidates.controller.js';
import { OpenAlexCandidatesService } from './openalex-candidates.service.js';
import { OpenAlexIngestService } from './openalex-ingest.service.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { OpenAlexClient } from './openalex.client.js';

/**
 * Module owning the OpenAlex API client.
 *
 * The client fetches and shapes data only — it never writes works or
 * provenance rows. Lookup (RES-134) and ingest (RES-137) consume it. The
 * candidates controller (RES-138) exposes the stored candidates those two
 * produced; it never calls OpenAlex itself.
 */
@Module({
  imports: [ProvenanceModule],
  controllers: [OpenAlexCandidatesController],
  providers: [
    OpenAlexClient,
    OpenAlexLookupService,
    OpenAlexIngestService,
    OpenAlexCandidatesService,
  ],
  exports: [
    OpenAlexClient,
    OpenAlexLookupService,
    OpenAlexIngestService,
    OpenAlexCandidatesService,
  ],
})
export class OpenAlexModule {}
