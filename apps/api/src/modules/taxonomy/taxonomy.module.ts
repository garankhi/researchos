import { Module } from '@nestjs/common';
import { TaxonomyController } from './taxonomy.controller.js';
import { TaxonomyService } from './taxonomy.service.js';
import { TopicSuggestionsController } from './topic-suggestions.controller.js';
import { TopicSuggestionsService } from './topic-suggestions.service.js';
import { TopicSuggestionCleanupService } from './topic-suggestion-cleanup.service.js';

/**
 * Module encapsulating the read operations for the research taxonomy tree.
 */
@Module({
  controllers: [TaxonomyController, TopicSuggestionsController],
  providers: [
    TaxonomyService,
    TopicSuggestionsService,
    TopicSuggestionCleanupService,
  ],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
