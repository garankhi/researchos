import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  CandidateWorksCountDto,
  PaginatedCandidateWorksResponseDto,
} from './dto/candidate-work-response.dto.js';
import { CandidateDecisionDto } from './dto/candidate-decision-response.dto.js';
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

  @Post('works/:outputId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Accepts a stored OpenAlex candidate as the caller's work",
  })
  @ApiParam({
    name: 'outputId',
    description: 'UUID of the stored candidate to accept.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'The accepted work: import state ACCEPTED with the caller as owner, unless a co-author already accepted it.',
    type: CandidateDecisionDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid candidate UUID.' })
  @ApiForbiddenResponse({
    description: 'Caller is not an active researcher.',
  })
  @ApiNotFoundResponse({
    description:
      'Candidate does not exist, is not visible to the caller, or has no linkable authorship.',
  })
  @ApiConflictResponse({
    description: 'The authorship position is held by another researcher.',
  })
  accept(
    @CurrentUserId() userId: string,
    @Param('outputId', new ParseUUIDPipe()) outputId: string,
  ): Promise<CandidateDecisionDto> {
    return this.candidates.accept(userId, outputId);
  }

  @Post('works/:outputId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rejects a stored OpenAlex candidate for the caller only',
  })
  @ApiParam({
    name: 'outputId',
    description: 'UUID of the stored candidate to reject.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'The rejected claim: the work stays CANDIDATE so a co-author still gets it and the caller can accept it later.',
    type: CandidateDecisionDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid candidate UUID.' })
  @ApiForbiddenResponse({
    description: 'Caller is not an active researcher.',
  })
  @ApiNotFoundResponse({
    description: 'Candidate does not exist or is not visible to the caller.',
  })
  @ApiConflictResponse({
    description: 'The caller owns the accepted work and cannot reject it.',
  })
  reject(
    @CurrentUserId() userId: string,
    @Param('outputId', new ParseUUIDPipe()) outputId: string,
  ): Promise<CandidateDecisionDto> {
    return this.candidates.reject(userId, outputId);
  }
}
