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
import { GroupApplicationPageDto } from './dto/group-application.dto.js';
import { RespondApplicationDto } from './dto/respond-application.dto.js';
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

  @Get('research-groups/:groupId/applications')
  @ApiParam({
    name: 'groupId',
    description: 'Group whose opportunities the applications belong to.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: "List a group's applications across its opportunities",
    description:
      "Returns every application on the group's opportunities, with the opportunity identity and the server-calculated countdown. Only the opportunities the caller may manage are included.",
  })
  @ApiOkResponse({
    description:
      'Paginated group applications with opportunity identity and countdowns.',
    type: GroupApplicationPageDto,
  })
  @ApiNotFoundResponse({ description: 'Research group does not exist.' })
  @ApiForbiddenResponse({
    description: 'The caller may not manage any opportunity of this group.',
  })
  forGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUserId() actorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<GroupApplicationPageDto> {
    return this.applications.forGroup(groupId, actorId, query);
  }

  @Post('applications/:applicationId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'applicationId',
    description: 'Application to answer.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: "Answer a pending application as the opportunity's owner",
    description:
      'Only the opportunity creator, the group lead and the group leaders may answer. The response timestamp is written by the database.',
  })
  @ApiOkResponse({
    description:
      'The answered application with its decision, response note, responder and response timestamp.',
    type: ApplicationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID, decision or response note.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller may not manage the opportunity this application belongs to.',
  })
  @ApiNotFoundResponse({ description: 'Application does not exist.' })
  @ApiConflictResponse({
    description: 'The application has already been answered or withdrawn.',
  })
  respond(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: RespondApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applications.respond(applicationId, actorId, dto);
  }

  @Post('applications/:applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'applicationId',
    description: 'Application to withdraw.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: "Withdraw one of the caller's own pending applications",
    description:
      'Only the applicant may withdraw, and only while the application is pending. The application keeps its row and its history.',
  })
  @ApiOkResponse({
    description:
      'The withdrawn application with its withdrawal timestamp and no countdown.',
    type: ApplicationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid application UUID.' })
  @ApiForbiddenResponse({
    description: 'The application belongs to another researcher.',
  })
  @ApiNotFoundResponse({ description: 'Application does not exist.' })
  @ApiConflictResponse({
    description: 'The application has already been withdrawn or answered.',
  })
  withdraw(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentUserId() actorId: string,
  ): Promise<ApplicationResponseDto> {
    return this.applications.withdraw(applicationId, actorId);
  }
}
