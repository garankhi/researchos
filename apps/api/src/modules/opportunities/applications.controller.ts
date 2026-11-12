import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  ApplicationPageDto,
  ApplicationResponseDto,
  CreateApplicationDto,
} from './dto/application.dto.js';
import { ApplicationsService } from './applications.service.js';

@ApiTags('applications')
@ApiBearerAuth()
@Roles('RESEARCHER')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@ApiForbiddenResponse({
  description:
    "Researcher access required; cannot apply to your own opportunity or read another owner's received applications.",
})
@ApiBadRequestResponse({
  description: 'Invalid UUID, application note, or pagination.',
})
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post('opportunities/:opportunityId/applications')
  @ApiParam({
    name: 'opportunityId',
    description: 'Opportunity to apply to.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: 'Apply to an open opportunity with a note and snapshot its SLA',
  })
  @ApiCreatedResponse({
    description:
      'Application recorded with database-calculated deadline and server countdown.',
    type: ApplicationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Opportunity does not exist.' })
  @ApiConflictResponse({
    description:
      'Opportunity is not open/unexpired, an application already exists, or eligibility changed concurrently.',
  })
  apply(
    @Param('opportunityId', ParseUUIDPipe) opportunityId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applications.apply(opportunityId, actorId, dto);
  }

  @Get('opportunities/:opportunityId/applications')
  @ApiParam({
    name: 'opportunityId',
    description: 'Opportunity whose received applications are requested.',
    format: 'uuid',
  })
  @ApiOperation({ summary: 'List received interests as an opportunity owner' })
  @ApiOkResponse({
    description:
      'Paginated received applications with server-calculated SLA countdowns.',
    type: ApplicationPageDto,
  })
  @ApiNotFoundResponse({ description: 'Opportunity does not exist.' })
  received(
    @Param('opportunityId', ParseUUIDPipe) opportunityId: string,
    @CurrentUserId() actorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<ApplicationPageDto> {
    return this.applications.received(opportunityId, actorId, query);
  }

  @Get('my/applications')
  @ApiOperation({
    summary: "List the caller's own applications and SLA countdowns",
  })
  @ApiOkResponse({
    description: 'Paginated applications submitted by the caller.',
    type: ApplicationPageDto,
  })
  mine(
    @CurrentUserId() actorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<ApplicationPageDto> {
    return this.applications.mine(actorId, query);
  }
}
