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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  AddGroupMemberDto,
  GroupMemberPageDto,
  GroupMemberResponseDto,
  UpdateGroupMemberDto,
} from './dto/group-member.dto.js';
import { GroupMembersService } from './group-members.service.js';

@ApiTags('groups')
@ApiBearerAuth()
@ApiParam({
  name: 'groupId',
  description: 'Group the membership belongs to.',
  format: 'uuid',
})
@ApiBadRequestResponse({
  description: 'Invalid UUID, role or pagination parameters.',
})
@ApiForbiddenResponse({
  description:
    'Caller lacks membership access or management permission, or tried to add themselves.',
})
@ApiNotFoundResponse({
  description: 'Group, user or membership does not exist.',
})
@Controller('research-groups/:groupId/members')
export class GroupMembersController {
  constructor(private readonly members: GroupMembersService) {}

  @Get()
  @ApiOperation({
    summary: 'List group members',
    description:
      'The roster of an active group is readable by any signed-in researcher. An archived or inactive group keeps its roster private to the lead and its members.',
  })
  @ApiOkResponse({
    description: 'Paginated group member list.',
    type: GroupMemberPageDto,
  })
  findAll(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupMemberPageDto> {
    return this.members.findAll(groupId, query, callerId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an existing user to a group' })
  @ApiCreatedResponse({
    description: 'Member added.',
    type: GroupMemberResponseDto,
  })
  @ApiConflictResponse({
    description: 'User is already a member of this group.',
  })
  add(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupMemberResponseDto> {
    return this.members.add(groupId, dto, callerId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Change a group member role' })
  @ApiParam({
    name: 'userId',
    description: 'User whose membership is being updated.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Member role changed.',
    type: GroupMemberResponseDto,
  })
  update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateGroupMemberDto,
    @CurrentUserId() callerId: string,
  ): Promise<GroupMemberResponseDto> {
    return this.members.update(groupId, userId, dto, callerId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a group member' })
  @ApiParam({
    name: 'userId',
    description: 'User whose membership is being removed.',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'Member removed.' })
  @ApiConflictResponse({
    description: 'The lead cannot be removed while the group is active.',
  })
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUserId() callerId: string,
  ): Promise<void> {
    return this.members.remove(groupId, userId, callerId);
  }
}
