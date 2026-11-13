import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from './search-query.dto.js';

/**
 * Query parameters for the per-tab result counts endpoint (`GET /search/counts`).
 *
 * The counts endpoint takes the same term as the search endpoint — the same
 * trimming and the same length bounds — so the badge for a tab and the tab's
 * results always describe the same query.
 */
export class SearchCountsQueryDto {
  @ApiProperty({
    description:
      'Search query text matched via PostgreSQL full-text search (`websearch_to_tsquery`) and title trigram (`ILIKE`). Must be between 2 and 200 characters after trimming.',
    example: 'machine learning',
    minLength: MIN_SEARCH_QUERY_LENGTH,
    maxLength: MAX_SEARCH_QUERY_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(MIN_SEARCH_QUERY_LENGTH)
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  q: string;
}
