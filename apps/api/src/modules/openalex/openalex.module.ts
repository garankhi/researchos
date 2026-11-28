import { Module } from '@nestjs/common';
import { ProvenanceModule } from '../provenance/provenance.module.js';
import { OpenAlexAuthorRecordService } from './openalex-author-record.service.js';
import { OpenAlexCandidatesService } from './openalex-candidates.service.js';
import { OpenAlexController } from './openalex.controller.js';
import { OpenAlexIngestService } from './openalex-ingest.service.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { OpenAlexPullService } from './openalex-pull.service.js';
import { OpenAlexWorksCache } from './openalex-works-cache.js';
import { OpenAlexClient } from './openalex.client.js';

/**
 * Module owning the OpenAlex API client.
 *
 * The client fetches and shapes data only — it never writes works or
 * provenance rows. Lookup (RES-134) and ingest (RES-137) consume it. The
 * controller (RES-138, RES-141) exposes the discovery, the preview, the
 * pull and the decisions over the candidates those two produced.
 */
@Module({
  imports: [ProvenanceModule],
  controllers: [OpenAlexController],
  providers: [
    OpenAlexClient,
    OpenAlexLookupService,
    OpenAlexIngestService,
    OpenAlexCandidatesService,
    OpenAlexPullService,
    OpenAlexWorksCache,
    OpenAlexAuthorRecordService,
  ],
  exports: [
    OpenAlexClient,
    OpenAlexLookupService,
    OpenAlexIngestService,
    OpenAlexCandidatesService,
    OpenAlexPullService,
    OpenAlexWorksCache,
    OpenAlexAuthorRecordService,
  ],
})
export class OpenAlexModule {}
