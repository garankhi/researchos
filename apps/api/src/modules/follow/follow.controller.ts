import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
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
  FollowDto,
  FollowEntityType,
  FollowTargetDto,
  PaginatedFollowsDto,
} from './follow.dto.js';
import { FollowService } from './follow.service.js';

@ApiTags('follows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid session is required.' })
@ApiForbiddenResponse({ description: 'Active RESEARCHER access is required.' })
@Roles('RESEARCHER')
@Controller('follows')
export class FollowController {
  constructor(private readonly follows: FollowService) {}

  @Post()
  @ApiOperation({ summary: 'Follow a research entity' })
  @ApiCreatedResponse({
    description: 'The follow was created.',
    type: FollowDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid, unsupported or self-follow target.',
  })
  @ApiNotFoundResponse({
    description: 'The target is unavailable to the caller.',
  })
  @ApiConflictResponse({
    description: 'The caller already follows the target.',
  })
  create(
    @CurrentUserId() callerId: string,
    @Body() dto: FollowTargetDto,
  ): Promise<FollowDto> {
    return this.follows.create(callerId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the caller’s followed entities' })
  @ApiOkResponse({
    description:
      'Paginated list of followed entities currently visible to the caller.',
    type: PaginatedFollowsDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters.' })
  findAll(
    @CurrentUserId() callerId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedFollowsDto> {
    return this.follows.findAll(callerId, query);
  }

  @Delete(':entityType/:entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unfollow a research entity' })
  @ApiNoContentResponse({
    description: 'The caller no longer follows the target.',
  })
  @ApiBadRequestResponse({ description: 'Invalid target type or UUID.' })
  @ApiParam({
    name: 'entityType',
    enum: FollowEntityType,
    enumName: 'FollowEntityType',
    description: 'Type of the followed target.',
  })
  @ApiParam({
    name: 'entityId',
    format: 'uuid',
    description: 'ID of the followed target.',
  })
  remove(
    @CurrentUserId() callerId: string,
    @Param('entityType', new ParseEnumPipe(FollowEntityType))
    entityType: FollowEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ): Promise<void> {
    return this.follows.remove(callerId, { entityType, entityId });
  }
}
