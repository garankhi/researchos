import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
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
    name: 'Idempotency-Key',
    required: false,
    description:
      'Actor-scoped retry key, 1–200 characters; a changed payload returns 409',
  })
  @ApiCreatedResponse({ type: OpportunityResponseDto })
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
  })
  @ApiOkResponse({ type: OpportunityPageDto })
  findAll(
    @CurrentUserId() actorId: string,
    @Query() query: ListOpportunitiesQueryDto,
  ) {
    return this.opportunities.findAll(actorId, query);
  }

  @Get(':opportunityId')
  @ApiOperation({ summary: 'Returns a visible research opportunity' })
  @ApiOkResponse({ type: OpportunityResponseDto })
  findOne(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
  ) {
    return this.opportunities.findOne(actorId, id);
  }

  @Patch(':opportunityId')
  @ApiOperation({
    summary: 'Updates a research opportunity managed by the caller',
  })
  @ApiOkResponse({ type: OpportunityResponseDto })
  update(
    @CurrentUserId() actorId: string,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(actorId, id, dto);
  }
}
