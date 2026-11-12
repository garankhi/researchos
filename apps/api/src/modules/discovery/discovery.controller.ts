import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { DiscoveryService } from './discovery.service.js';
import { SearchCountsQueryDto } from './dto/search-counts-query.dto.js';
import { SearchCountsResponseDto } from './dto/search-counts-response.dto.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { PaginatedSearchResultsResponseDto } from './dto/search-result-response.dto.js';

/**
 * Controller exposing the permission-filtered tabbed search endpoints
 * (`GET /search` and `GET /search/counts`).
 */
@ApiTags('discovery')
@ApiBearerAuth()
@Controller('search')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @ApiOperation({
    summary: 'Count the matching results of one search term per tab',
    description:
      'Returns one permission-filtered total per search tab (`research`, `people`, `group`, `opportunity`) for the given term, using the same matching expression as `GET /search`. The totals are the source for the tab badges, so a tab nobody has opened yet still has a count.',
  })
  @ApiOkResponse({
    description: 'The number of matching records per search tab.',
    type: SearchCountsResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Query term length outside [2, 200] characters after trimming.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @Get('counts')
  async counts(
    @CurrentUserId() actorId: string,
    @Query() query: SearchCountsQueryDto,
  ): Promise<SearchCountsResponseDto> {
    return this.discoveryService.counts(actorId, query);
  }

  @ApiOperation({
    summary:
      'Search across research outputs, people, groups, and opportunities by tab',
    description:
      'Queries the requested tab slice (`research`, `people`, `group`, or `opportunity`) of `search_index` through `visible_search_index(actor)` using PostgreSQL full-text search (`websearch_to_tsquery`) and title trigram matching (`ILIKE`), ranked strictly by text relevance (`ts_rank`).',
  })
  @ApiOkResponse({
    description: 'Paginated search results for the selected tab.',
    type: PaginatedSearchResultsResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid search tab, query term length outside [2, 200], or invalid pagination/sort parameters.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @Get()
  async search(
    @CurrentUserId() actorId: string,
    @Query() query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    return this.discoveryService.search(actorId, query);
  }
}
