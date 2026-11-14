import {
  Body,
  Controller,
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
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import { PublishOutputDto } from './dto/publish-output.dto.js';
import { UpdateOutputRevisionDto } from './dto/update-output-revision.dto.js';
import { UpdateOutputVisibilityDto } from './dto/update-output-visibility.dto.js';
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

  @Patch(':outputId/revision')
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Corrects the metadata of a work draft revision',
    description:
      'Updates the editable draft revision of a work the caller owns. Only the fields present in the body are changed. Every corrected field is locked against later automated syncs, so a subsequent OpenAlex pull cannot overwrite a value a person stood behind. A released revision is immutable and cannot be edited.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The updated draft revision.',
    type: OutputRevisionResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID format for outputId, or a field value that fails validation.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher, or does not own this research output.',
  })
  @ApiNotFoundResponse({
    description:
      'The research output or its editable draft revision was not found.',
  })
  @ApiConflictResponse({
    description: 'The revision has already been released and cannot be edited.',
  })
  async updateRevision(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateOutputRevisionDto,
  ): Promise<OutputRevisionResponseDto> {
    return this.outputsService.updateRevision(outputId, callerId, dto);
  }

  @Post(':outputId/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Publishes a work and shares it with the chosen audience',
    description:
      'Releases the draft revision of a work the caller owns, pins it as the current release, and shares the work under the visibility the caller chose. The work becomes searchable, discoverable, and linkable into a group. This is the single visibility action, whether the draft came from an OpenAlex pull or from a work created inside the platform.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'The published work, now shared under the requested visibility.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID format for outputId, an unsupported visibility, or a visibility that does not match the access group.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher, or does not own this research output.',
  })
  @ApiNotFoundResponse({
    description: 'The research output was not found.',
  })
  @ApiConflictResponse({
    description:
      'The work is already published, or it has no editable draft revision to publish.',
  })
  async publish(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: PublishOutputDto,
  ): Promise<OutputResponseDto> {
    return this.outputsService.publish(outputId, callerId, dto);
  }

  @Post(':outputId/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Archives a published work',
    description:
      'Takes a published work out of every shared surface. The work keeps its revisions, its authorship claims and its group links; only its sharing ends. Archiving is the only way to un-share a work — a published work cannot be reset to draft, because the sharing history is not erasable.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The archived work.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID format for outputId.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher, or does not own this research output.',
  })
  @ApiNotFoundResponse({
    description: 'The research output was not found.',
  })
  @ApiConflictResponse({
    description: 'The work is not published, so it cannot be archived.',
  })
  async archive(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
  ): Promise<OutputResponseDto> {
    return this.outputsService.archive(outputId, callerId);
  }

  @Patch(':outputId/visibility')
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Changes who may see a shared work',
    description:
      'Changes the visibility of an already shared work and optionally its affiliated group. The owner may always change it; the lead of the affiliated group may too, so a group keeps control of works carrying its banner. A FPTU_COMMUNITY work may keep its affiliation and stays public.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The work with its updated visibility.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID format for outputId, an unsupported visibility, or a group the caller is not a member of.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher, or is neither the owner nor the lead of the affiliated group.',
  })
  @ApiNotFoundResponse({
    description: 'The research output was not found.',
  })
  @ApiConflictResponse({
    description: 'The work is not published, so its visibility cannot change.',
  })
  async updateVisibility(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateOutputVisibilityDto,
  ): Promise<OutputResponseDto> {
    return this.outputsService.updateVisibility(outputId, callerId, dto);
  }
}
