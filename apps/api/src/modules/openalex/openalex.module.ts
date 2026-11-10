import { Module } from '@nestjs/common';
import { OpenAlexClient } from './openalex.client.js';

/**
 * Module owning the OpenAlex API client.
 *
 * The client fetches and shapes data only — it never writes works or
 * provenance rows. Lookup (RES-134) and ingest (RES-137) consume it.
 * No controller: nothing here is an HTTP endpoint of our own.
 */
@Module({
  providers: [OpenAlexClient],
  exports: [OpenAlexClient],
})
export class OpenAlexModule {}
