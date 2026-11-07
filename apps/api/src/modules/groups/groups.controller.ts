import {
  Body,
  Controller,
  Get,
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
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CreateResearchGroupDto } from './dto/create-research-group.dto.js';
import { ListResearchGroupsQueryDto } from './dto/list-research-groups.query.dto.js';
import { PaginatedResearchGroupsResponseDto } from './dto/paginated-research-groups-response.dto.js';
import { ResearchGroupResponseDto } from './dto/research-group-response.dto.js';
import { UpdateResearchGroupDto } from './dto/update-research-group.dto.js';
import { GroupsService } from './groups.service.js';

/**
 * Controller exposing endpoints for research groups (CRUD and soft-archiving).
 *
 * All routes require authentication. Visibility of groups is scoped to public
 * active groups plus groups the caller leads or is a member of.
 */
@ApiTags('groups')
@ApiBearerAuth()
@Controller('research-groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @ApiOperation({
    summary: 'Create a new research group',
    description:
      'Creates a new research group. When leadId is omitted, the authenticated researcher becomes the group leader.',
  })
  @ApiCreatedResponse({
    description: 'Research group created successfully.',
    type: ResearchGroupResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid payload or designated leader is not an active researcher.',
  })
  @ApiForbiddenResponse({
    description: 'Caller does not hold the RESEARCHER role.',
  })
  @ApiNotFoundResponse({
    description: 'The specified leader user account was not found.',
  })
  @ApiConflictResponse({
    description: 'A research group with this code already exists.',
  })
  @Roles('RESEARCHER')
  @Post()
  async create(
    @Body() dto: CreateResearchGroupDto,
    @CurrentUserId() callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    return this.groupsService.create(dto, callerId);
  }

  @ApiOperation({
    summary: 'List research groups with pagination and filtering',
    description:
      'Returns a paginated list of research groups visible to the caller (public active groups, groups the caller leads, and groups the caller is a member of).',
  })
  @ApiOkResponse({
    description: 'Paginated research group list retrieved successfully.',
    type: PaginatedResearchGroupsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or sort expression.',
  })
  @Get()
  async findAll(
    @Query() query: ListResearchGroupsQueryDto,
    @CurrentUserId() callerId: string,
  ): Promise<PaginatedResearchGroupsResponseDto> {
    return this.groupsService.findAll(query, callerId);
  }

  @ApiOperation({
    summary: 'Get research group details by ID',
    description:
      'Returns a single research group if visible to the caller. Returns 403 when the group is archived/inactive and the caller is neither the leader nor a member.',
  })
  @ApiParam({
    name: 'groupId',
    description: 'Unique identifier of the research group (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Research group retrieved successfully.',
    type: ResearchGroupResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The provided groupId is not a valid UUID.',
  })
  @ApiForbiddenResponse({
    description: 'Caller is not allowed to view this research group.',
  })
  @ApiNotFoundResponse({
    description: 'The requested research group was not found.',
  })
  @Get(':groupId')
  async findOne(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    return this.groupsService.findOne(groupId, callerId);
  }

  @ApiOperation({
    summary: 'Update or archive a research group',
    description:
      'Updates research group details or archives the group (`isActive: false` sets `is_active = false` and `archived_at`). Only the group leader or an administrator may update the group.',
  })
  @ApiParam({
    name: 'groupId',
    description: 'Unique identifier of the research group (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Research group updated successfully.',
    type: ResearchGroupResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid update payload, invalid UUID, or designated leader is not an active researcher.',
  })
  @ApiForbiddenResponse({
    description: 'Caller is not allowed to modify this research group.',
  })
  @ApiNotFoundResponse({
    description: 'The requested research group or leader user was not found.',
  })
  @ApiConflictResponse({
    description: 'A research group with this code already exists.',
  })
  @Patch(':groupId')
  async update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateResearchGroupDto,
    @CurrentUserId() callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    return this.groupsService.update(groupId, dto, callerId);
  }
}
