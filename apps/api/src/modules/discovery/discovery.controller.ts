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
import { SearchQueryDto } from './dto/search-query.dto.js';
import { PaginatedSearchResultsResponseDto } from './dto/search-result-response.dto.js';

/**
 * Controller exposing the permission-filtered tabbed search endpoint (`GET /search`).
 */
@ApiTags('discovery')
@ApiBearerAuth()
@Controller('search')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

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
