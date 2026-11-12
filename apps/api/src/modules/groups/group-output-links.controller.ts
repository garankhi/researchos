import {
  Body,
  Controller,
  Delete,
  Get,
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
  CreateGroupOutputLinkDto,
  DecideGroupOutputLinkDto,
  GroupOutputLinkPageDto,
  GroupOutputLinkResponseDto,
} from './dto/group-output-link.dto.js';
import { GroupOutputLinksService } from './group-output-links.service.js';

/**
 * The group's curated content: the links between a group and the research
 * outputs it shows.
 *
 * A link is requested as `PENDING` and decided by the group lead, or
 * accepted outright when the caller may both manage the group and own the
 * work. A removal is a status transition, not a row delete, so it returns
 * the updated link.
 */
@ApiTags('group-outputs')
@ApiBearerAuth()
@ApiParam({
  name: 'groupId',
  description: 'Group whose curated content is managed.',
  format: 'uuid',
})
@ApiBadRequestResponse({
  description:
    'Invalid UUID, revision, or payload. The revision must be a released revision of the output.',
})
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@ApiForbiddenResponse({
  description:
    'Only the group lead may decide or remove a link; a request needs group membership and visibility of the work.',
})
@ApiNotFoundResponse({
  description: 'Group, research output, or group output link does not exist.',
})
@ApiConflictResponse({
  description:
    'The link is not in a state that allows this action, or it already exists.',
})
@Controller('research-groups/:groupId/outputs')
export class GroupOutputLinksController {
  constructor(private readonly links: GroupOutputLinksService) {}

  @Get()
  @ApiOperation({
    summary: 'List the research outputs linked to the group',
    description:
      'Returns the group links with their status, the revision each group shows, and the revision the pending request asks for.',
  })
  @ApiOkResponse({
    description: 'Paginated group output links.',
    type: GroupOutputLinkPageDto,
  })
  list(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupOutputLinkPageDto> {
    return this.links.list(groupId, query, callerId);
  }

  @Post()
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Request a research output for the group',
    description:
      'Creates the link as PENDING for the group lead to decide, or as ACCEPTED when the caller may both manage the group and own the work.',
  })
  @ApiCreatedResponse({
    description: 'Link requested, or accepted outright.',
    type: GroupOutputLinkResponseDto,
  })
  request(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupOutputLinkDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.links.request(groupId, dto, callerId);
  }

  @Patch(':outputId')
  @Roles('RESEARCHER')
  @ApiParam({
    name: 'outputId',
    description: 'Research output whose group link is decided.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: 'Accept or reject a pending group content request',
    description:
      'Only the group lead may decide. Accepting pins the requested revision; rejecting keeps the revision the group already shows.',
  })
  @ApiOkResponse({
    description: 'Decision recorded.',
    type: GroupOutputLinkResponseDto,
  })
  decide(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @Body() dto: DecideGroupOutputLinkDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.links.decide(groupId, outputId, dto, callerId);
  }

  @Delete(':outputId')
  @HttpCode(HttpStatus.OK)
  @Roles('RESEARCHER')
  @ApiParam({
    name: 'outputId',
    description: 'Research output removed from the group content.',
    format: 'uuid',
  })
  @ApiOperation({
    summary: 'Remove a research output from the group content',
    description:
      'The link moves to the REMOVED status; the work stays visible and findable everywhere else.',
  })
  @ApiOkResponse({
    description: 'Link removed from the group.',
    type: GroupOutputLinkResponseDto,
  })
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.links.remove(groupId, outputId, callerId);
  }
}
