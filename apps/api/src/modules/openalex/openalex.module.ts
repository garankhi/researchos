import { Module } from '@nestjs/common';
import { ProvenanceModule } from '../provenance/provenance.module.js';
import { OpenAlexIngestService } from './openalex-ingest.service.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { OpenAlexClient } from './openalex.client.js';

/**
 * Module owning the OpenAlex API client.
 *
 * The client fetches and shapes data only — it never writes works or
 * provenance rows. Lookup (RES-134) and ingest (RES-137) consume it.
 * No controller: nothing here is an HTTP endpoint of our own.
 */
@Module({
  imports: [ProvenanceModule],
  providers: [OpenAlexClient, OpenAlexLookupService, OpenAlexIngestService],
  exports: [OpenAlexClient, OpenAlexLookupService, OpenAlexIngestService],
})
export class OpenAlexModule {}
