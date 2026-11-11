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
import { CreateInterestDto } from './dto/create-interest.dto.js';
import { UpdateInterestDto } from './dto/update-interest.dto.js';
import { InterestResponseDto } from './dto/interest-response.dto.js';
import { InterestsService } from './interests.service.js';

@ApiTags('interests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@ApiForbiddenResponse({ description: 'Researcher access required.' })
@Roles('RESEARCHER')
@Controller('interests')
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  @Get()
  @ApiOperation({
    summary:
      "List all of the caller's interests, including suggestions and rejections",
  })
  @ApiOkResponse({
    type: [InterestResponseDto],
    description: 'All interests belonging to the caller.',
  })
  list(@CurrentUserId() userId: string): Promise<InterestResponseDto[]> {
    return this.interests.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Declare an active research interest' })
  @ApiCreatedResponse({
    type: InterestResponseDto,
    description: 'Declared interest created successfully.',
  })
  @ApiBadRequestResponse({ description: 'Invalid input or inactive topic.' })
  @ApiNotFoundResponse({ description: 'Topic does not exist.' })
  @ApiConflictResponse({
    description: 'An interest for this topic already exists, in any status.',
  })
  create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateInterestDto,
  ): Promise<InterestResponseDto> {
    return this.interests.create(userId, dto);
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identifier of an interest owned by the caller.',
  })
  @ApiOperation({
    summary:
      'Accept, restore, or reject an owned interest while preserving its source and evidence',
  })
  @ApiOkResponse({
    type: InterestResponseDto,
    description: 'Interest review decision saved.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or activating an inactive topic.',
  })
  @ApiNotFoundResponse({
    description:
      'Interest is missing or belongs to another user, or topic is missing.',
  })
  update(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterestDto,
  ): Promise<InterestResponseDto> {
    return this.interests.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identifier of an interest owned by the caller.',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reject an owned interest, retaining the row as feedback',
  })
  @ApiNoContentResponse({
    description: 'Interest retained with REJECTED status.',
  })
  @ApiBadRequestResponse({ description: 'Invalid interest UUID.' })
  @ApiNotFoundResponse({
    description: 'Interest is missing or belongs to another user.',
  })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.interests.update(userId, id, { status: 'REJECTED' });
  }
}
