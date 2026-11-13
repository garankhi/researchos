import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Search tabs supported by `GET /search`.
 *
 * Each tab maps to a dedicated query over a distinct `entity_type` slice of
 * `search_index` (`OUTPUT`, `RESEARCHER`, `GROUP`, `OPPORTUNITY`).
 */
export enum SearchTab {
  RESEARCH = 'research',
  PEOPLE = 'people',
  GROUP = 'group',
  OPPORTUNITY = 'opportunity',
}

/**
 * Minimum trimmed search term length to bound expensive full-text and trigram scans.
 */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/**
 * Maximum search term length accepted by the search endpoint.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Query parameters for the tabbed search endpoint (`GET /search`).
 */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description:
      'Search tab selecting which slice of the index to query (`research`, `people`, `group`, or `opportunity`).',
    enum: SearchTab,
    example: SearchTab.RESEARCH,
  })
  @IsEnum(SearchTab)
  tab: SearchTab;

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
