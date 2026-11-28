import {
  Body,
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
import { AcceptCandidateDto } from './dto/accept-candidate.dto.js';
import { AvailableWorksQueryDto } from './dto/available-works.query.dto.js';
import { CandidateDecisionDto } from './dto/candidate-decision-response.dto.js';
import {
  CandidateWorksCountDto,
  PaginatedCandidateWorksResponseDto,
} from './dto/candidate-work-response.dto.js';
import { ListCandidateWorksQueryDto } from './dto/list-candidate-works.query.dto.js';
import { OpenAlexAuthorCandidatesDto } from './dto/openalex-author-response.dto.js';
import { OpenAlexWorkPreviewDto } from './dto/openalex-work-preview.dto.js';
import { PullOpenAlexWorksDto } from './dto/pull-openalex-works.dto.js';
import { PullOpenAlexWorksResultDto } from './dto/pull-openalex-works-result.dto.js';
import { OpenAlexCandidatesService } from './openalex-candidates.service.js';
import { OpenAlexPullService } from './openalex-pull.service.js';

/**
 * The OpenAlex routes of the pull (RES-138, RES-141).
 *
 * Three groups:
 *
 * - **discovery** — the author candidates and the live works preview,
 *   both resolved from the caller's own identity;
 * - **pull** — the trigger that pulls the works into the platform as
 *   candidates;
 * - **decisions** — the accept and the reject on a stored candidate.
 */
@ApiTags('openalex')
@ApiCookieAuth()
@ApiUnauthorizedResponse({
  description: 'There is no valid session behind the request.',
})
@Controller('external/openalex')
export class OpenAlexController {
  constructor(
    private readonly candidates: OpenAlexCandidatesService,
    private readonly pull: OpenAlexPullService,
  ) {}

  @ApiOperation({
    summary: "Lists the caller's OpenAlex author candidates",
  })
  @ApiOkResponse({
    description:
      'The author candidates for the caller: the confirmed author when the profile carries an id, otherwise the candidates found by the byline name.',
    type: OpenAlexAuthorCandidatesDto,
  })
  @ApiNotFoundResponse({
    description: 'The caller has no researcher profile.',
  })
  @Get('authors')
  findAuthors(
    @CurrentUserId() userId: string,
  ): Promise<OpenAlexAuthorCandidatesDto> {
    return this.pull.findAuthorCandidates(userId);
  }

  @ApiOperation({
    summary: "Previews the caller's OpenAlex works before they are pulled",
  })
  @ApiOkResponse({
    description:
      'The live works OpenAlex holds for the caller, newest pull not applicable — the order is OpenAlex’s own.',
    type: [OpenAlexWorkPreviewDto],
  })
  @ApiNotFoundResponse({
    description:
      'The caller has no researcher profile, or no author could be resolved for them.',
  })
  @ApiBadRequestResponse({
    description: 'The author id is malformed.',
  })
  @Get('works/available')
  findAvailableWorks(
    @CurrentUserId() userId: string,
    @Query() query: AvailableWorksQueryDto,
  ): Promise<OpenAlexWorkPreviewDto[]> {
    return this.pull.findAvailableWorks(userId, query.authorId);
  }

  @ApiOperation({
    summary:
      "Pulls the caller's OpenAlex works into the platform as candidates",
  })
  @ApiOkResponse({
    description:
      'The pull result: the candidates that were created, the ones that already existed, and how the works were resolved.',
    type: PullOpenAlexWorksResultDto,
  })
  @ApiNotFoundResponse({
    description:
      'The caller has no researcher profile, or no author could be resolved for them.',
  })
  @Post('pull')
  @HttpCode(HttpStatus.OK)
  pullWorks(
    @CurrentUserId() userId: string,
    @Body() body: PullOpenAlexWorksDto,
  ): Promise<PullOpenAlexWorksResultDto> {
    return this.pull.pull(userId, body);
  }

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
    summary: 'Lists the OpenAlex candidates the caller rejected',
  })
  @ApiOkResponse({
    description:
      'The rejected candidates of the caller. A rejected work is never deleted, so it can be accepted later.',
    type: PaginatedCandidateWorksResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The pagination parameters are invalid.',
  })
  @Get('works/rejected')
  findRejected(
    @CurrentUserId() userId: string,
    @Query() query: ListCandidateWorksQueryDto,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    return this.candidates.findRejected(userId, query);
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
    @Body() body: AcceptCandidateDto,
  ): Promise<CandidateDecisionDto> {
    return this.candidates.accept(userId, outputId, body);
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
