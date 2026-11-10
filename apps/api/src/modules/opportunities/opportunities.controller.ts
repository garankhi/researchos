import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { OpportunitiesService } from './opportunities.service.js';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto.js';
import {
  OpportunityPageDto,
  OpportunityResponseDto,
} from './dto/opportunity-response.dto.js';

@ApiTags('opportunities')
@ApiCookieAuth()
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Creates a research opportunity' })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Actor-scoped retry key, 1–200 characters; a changed payload returns 409',
  })
  @ApiCreatedResponse({
    description: 'Created draft or replay of its original create response.',
    type: OpportunityResponseDto,
  })
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateOpportunityDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.opportunities.create(actorId, dto, key);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lists published opportunities and opportunities managed by the caller',
    description:
      'Overdue OPEN opportunities are persisted as EXPIRED before status filtering and pagination.',
  })
  @ApiOkResponse({
    description: 'Visible opportunities and pagination information.',
    type: OpportunityPageDto,
  })
  findAll(
    @CurrentUserId() actorId: string,
    @Query() query: ListOpportunitiesQueryDto,
  ) {
    return this.opportunities.findAll(actorId, query);
  }

  @Get(':opportunityId')
  @ApiOperation({
    summary: 'Returns a visible research opportunity',
    description:
      'An OPEN opportunity is persisted as EXPIRED when its application deadline has been reached.',
  })
  @ApiParam({
    name: 'opportunityId',
    description: 'Opportunity UUID.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The visible opportunity.',
    type: OpportunityResponseDto,
  })
  findOne(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
  ) {
    return this.opportunities.findOne(actorId, id);
  }

  @Patch(':opportunityId')
  @ApiOperation({
    summary: 'Updates a research opportunity managed by the caller',
    description:
      'Deadline-based OPEN to EXPIRED changes are automatic. Extending an expired record deadline does not reopen it.',
  })
  @ApiParam({
    name: 'opportunityId',
    description: 'UUID of the opportunity to edit.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Updated opportunity details, including automatic deadline expiry.',
    type: OpportunityResponseDto,
  })
  update(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(actorId, id, dto);
  }

  @Post(':opportunityId/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Opens a draft opportunity for applications' })
  @ApiParam({
    name: 'opportunityId',
    description: 'UUID of the opportunity to open.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'Opened opportunity with a server-owned publication timestamp.',
    type: OpportunityResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID, missing publication details or deadline not in the future.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher with opportunity management permission.',
  })
  @ApiNotFoundResponse({ description: 'Opportunity does not exist.' })
  @ApiConflictResponse({
    description: 'Opportunity is archived or is not DRAFT.',
  })
  open(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
  ): Promise<OpportunityResponseDto> {
    return this.opportunities.transitionStatus(actorId, id, 'open');
  }

  @Post(':opportunityId/fill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marks an open opportunity as filled' })
  @ApiParam({
    name: 'opportunityId',
    description: 'UUID of the opportunity to fill.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Filled opportunity; its publication timestamp is preserved.',
    type: OpportunityResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid opportunity UUID.' })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher with opportunity management permission.',
  })
  @ApiNotFoundResponse({ description: 'Opportunity does not exist.' })
  @ApiConflictResponse({
    description: 'Opportunity is archived or is not OPEN.',
  })
  fill(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
  ): Promise<OpportunityResponseDto> {
    return this.opportunities.transitionStatus(actorId, id, 'fill');
  }

  @Post(':opportunityId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Closes a filled opportunity' })
  @ApiParam({
    name: 'opportunityId',
    description: 'UUID of the opportunity to close.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Closed opportunity; its publication timestamp is preserved.',
    type: OpportunityResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid opportunity UUID.' })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher with opportunity management permission.',
  })
  @ApiNotFoundResponse({ description: 'Opportunity does not exist.' })
  @ApiConflictResponse({
    description: 'Opportunity is archived or is not FILLED.',
  })
  close(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
  ): Promise<OpportunityResponseDto> {
    return this.opportunities.transitionStatus(actorId, id, 'close');
  }
}
