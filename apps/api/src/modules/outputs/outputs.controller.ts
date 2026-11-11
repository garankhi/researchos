import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import { OutputsService } from './outputs.service.js';

/**
 * Controller exposing endpoints for reading research outputs metadata,
 * revisions history, and associated files.
 */
@ApiTags('outputs')
@ApiBearerAuth()
@Controller('outputs')
export class OutputsController {
  constructor(private readonly outputsService: OutputsService) {}

  @ApiOperation({
    summary: 'List visible research outputs',
    description:
      'Returns a paginated list of research outputs visible to the caller (shared community works, member group works, or the caller own working copy draft works).',
  })
  @ApiOkResponse({
    description: 'Paginated list of visible research outputs.',
    type: PaginatedOutputsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or sort expression.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @Get()
  async findAll(
    @CurrentUserId() callerId: string,
    @Query() query: ListOutputsQueryDto,
  ): Promise<PaginatedOutputsResponseDto> {
    return this.outputsService.findAll(callerId, query);
  }

  @ApiOperation({
    summary: 'Get details of a research output',
    description:
      'Returns metadata of the specified research output including its pinned release revision, author list, and linked research topics. Returns 404 if missing, or 403 if unauthorized.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Research output details retrieved successfully.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID format for outputId.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description: 'Caller is not authorized to view this research output.',
  })
  @ApiNotFoundResponse({
    description: 'The requested research output was not found.',
  })
  @Get(':outputId')
  async findOne(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
  ): Promise<OutputResponseDto> {
    return this.outputsService.findOne(outputId, callerId);
  }

  @ApiOperation({
    summary: 'List revisions of a research output',
    description:
      'Returns the list of revisions belonging to the specified research output, ordered by revision number descending.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'List of revisions retrieved successfully.',
    type: [OutputRevisionResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID format for outputId.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description: 'Caller is not authorized to view this research output.',
  })
  @ApiNotFoundResponse({
    description: 'The requested research output was not found.',
  })
  @Get(':outputId/revisions')
  async findRevisions(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
  ): Promise<OutputRevisionResponseDto[]> {
    return this.outputsService.findRevisions(outputId, callerId);
  }

  @ApiOperation({
    summary: 'List authorized files of a research output',
    description:
      'Returns the list of files attached to the specified research output that the caller is authorized to view.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'List of authorized files retrieved successfully.',
    type: [OutputFileResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID format for outputId.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description: 'Caller is not authorized to view this research output.',
  })
  @ApiNotFoundResponse({
    description: 'The requested research output was not found.',
  })
  @Get(':outputId/files')
  async findFiles(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
  ): Promise<OutputFileResponseDto[]> {
    return this.outputsService.findFiles(outputId, callerId);
  }
}
