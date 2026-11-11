import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  CandidateWorksCountDto,
  PaginatedCandidateWorksResponseDto,
} from './dto/candidate-work-response.dto.js';
import { ListCandidateWorksQueryDto } from './dto/list-candidate-works.query.dto.js';
import { OpenAlexCandidatesService } from './openalex-candidates.service.js';

/**
 * The stored-candidate reads of the OpenAlex pull (RES-138).
 *
 * Both routes read the candidates the ingest persisted — never OpenAlex
 * itself — for the researcher behind the session.
 */
@ApiTags('openalex')
@ApiCookieAuth()
@ApiUnauthorizedResponse({
  description: 'There is no valid session behind the request.',
})
@Controller('external/openalex')
export class OpenAlexCandidatesController {
  constructor(private readonly candidates: OpenAlexCandidatesService) {}

  @ApiOperation({
    summary: "Lists the caller's stored OpenAlex candidates",
  })
  @ApiOkResponse({
    description:
      'The stored candidates awaiting a decision, newest pull first, with pagination information.',
    type: PaginatedCandidateWorksResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The pagination parameters are invalid.',
  })
  @Get('works')
  findAll(
    @CurrentUserId() userId: string,
    @Query() query: ListCandidateWorksQueryDto,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    return this.candidates.findAll(userId, query);
  }

  @ApiOperation({
    summary: "Counts the caller's remaining OpenAlex candidates",
  })
  @ApiOkResponse({
    description:
      'The number of stored candidates left, excluding works the caller already accepted or rejected.',
    type: CandidateWorksCountDto,
  })
  @Get('works/count')
  count(@CurrentUserId() userId: string): Promise<CandidateWorksCountDto> {
    return this.candidates.count(userId);
  }
}
