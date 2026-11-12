import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  CreateGroupDirectionDto,
  UpdateGroupDirectionDto,
  GroupDirectionPageDto,
  GroupDirectionResponseDto,
} from './dto/group-direction.dto.js';
import { GroupDirectionsService } from './group-directions.service.js';

@ApiTags('group-directions')
@ApiBearerAuth()
@ApiParam({
  name: 'groupId',
  format: 'uuid',
  description: 'Group publishing the directions.',
})
@ApiBadRequestResponse({
  description: 'Invalid UUID, topic, payload or pagination.',
})
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@ApiForbiddenResponse({
  description:
    'Caller lacks group access or the required publishing/editing authority.',
})
@ApiNotFoundResponse({
  description: 'Group, direction within the group, or topic does not exist.',
})
@ApiConflictResponse({
  description:
    'Group is inactive/archived, a direction is in use, or a concurrent change occurred.',
})
@Controller('research-groups/:groupId/directions')
export class GroupDirectionsController {
  constructor(private readonly directions: GroupDirectionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List published group directions with taxonomy paths',
  })
  @ApiOkResponse({
    description: 'Paginated directions visible to the caller.',
    type: GroupDirectionPageDto,
  })
  list(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUserId() actorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<GroupDirectionPageDto> {
    return this.directions.list(groupId, actorId, query);
  }

  @Post()
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Publish a direction as the group lead or a core member',
  })
  @ApiCreatedResponse({
    description: 'Direction published immediately.',
    type: GroupDirectionResponseDto,
  })
  create(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: CreateGroupDirectionDto,
  ): Promise<GroupDirectionResponseDto> {
    return this.directions.create(groupId, actorId, dto);
  }

  @Patch(':directionId')
  @Roles('RESEARCHER')
  @ApiParam({
    name: 'directionId',
    format: 'uuid',
    description: 'Direction belonging to this group.',
  })
  @ApiOperation({ summary: 'Edit a direction as the group lead' })
  @ApiOkResponse({
    description: 'Direction updated.',
    type: GroupDirectionResponseDto,
  })
  update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('directionId', ParseUUIDPipe) directionId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: UpdateGroupDirectionDto,
  ): Promise<GroupDirectionResponseDto> {
    return this.directions.update(groupId, directionId, actorId, dto);
  }

  @Delete(':directionId')
  @Roles('RESEARCHER')
  @HttpCode(204)
  @ApiParam({
    name: 'directionId',
    format: 'uuid',
    description: 'Direction belonging to this group.',
  })
  @ApiOperation({ summary: 'Delete an unused direction as the group lead' })
  @ApiNoContentResponse({ description: 'Direction deleted.' })
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('directionId', ParseUUIDPipe) directionId: string,
    @CurrentUserId() actorId: string,
  ): Promise<void> {
    return this.directions.remove(groupId, directionId, actorId);
  }
}
