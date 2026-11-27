import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  ArticlePdfRevisionResponseDto,
  AttachArticlePdfDto,
  AttachArticlePdfResponseDto,
  UpdateArticlePdfVisibilityDto,
} from './dto/article-pdf.dto.js';
import {
  CreateArticleDto,
  CreateArticleResponseDto,
} from './dto/create-article.dto.js';
import { HomeFeedQueryDto, HomeFeedResponseDto } from './dto/home-feed.dto.js';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import { PublishOutputDto } from './dto/publish-output.dto.js';
import { UpdateArticleAbstractDto } from './dto/update-article-abstract.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { UpdateOutputRevisionDto } from './dto/update-output-revision.dto.js';
import { UpdateOutputVisibilityDto } from './dto/update-output-visibility.dto.js';
import { OutputsService } from './outputs.service.js';

/**
 * Controller for research outputs, their revisions and associated files.
 */
@ApiTags('outputs')
@ApiCookieAuth()
@Controller('outputs')
export class OutputsController {
  constructor(private readonly outputsService: OutputsService) {}

  @ApiOperation({
    summary: 'Create and release an Article',
    description:
      'Creates an Article with an optional verified PDF and releases its first revision to FPTU_COMMUNITY. A replay returns the original identifiers.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'An actor-scoped key for retrying the same submission.',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiCreatedResponse({
    description:
      'The Article and first release identifiers for a new submission or replay.',
    type: CreateArticleResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid Article metadata or idempotency key.',
  })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher account is required.',
  })
  @ApiNotFoundResponse({ description: 'The caller has no such PDF upload.' })
  @ApiGoneResponse({ description: 'The PDF upload has expired.' })
  @ApiConflictResponse({
    description:
      'The idempotency key was reused with a changed submission, the DOI already exists, or the PDF upload is unverified or already used.',
  })
  @Post()
  @Roles('RESEARCHER')
  async createArticle(
    @CurrentUserId() callerId: string,
    @Body() dto: CreateArticleDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<CreateArticleResponseDto> {
    return this.outputsService.createArticle(callerId, dto, key);
  }

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
    summary: 'List shared research for Home',
    description:
      'Returns the shared releases visible to the caller, newest shared first, with a cursor for loading more.',
  })
  @ApiOkResponse({
    description: 'A batch of shared releases with Home feed metadata.',
    type: HomeFeedResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid cursor or limit.' })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @Get('home-feed')
  async findHomeFeed(
    @CurrentUserId() callerId: string,
    @Query() query: HomeFeedQueryDto,
  ): Promise<HomeFeedResponseDto> {
    return this.outputsService.findHomeFeed(callerId, query);
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

  @Patch(':outputId/article')
  @Roles('RESEARCHER')
  @ApiOperation({ summary: 'Update the metadata of a released Article' })
  @ApiParam({ name: 'outputId', format: 'uuid', description: 'Article ID.' })
  @ApiOkResponse({
    type: OutputResponseDto,
    description: 'Article with the current released revision.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid Article metadata or references.',
  })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher owner is required.',
  })
  @ApiNotFoundResponse({ description: 'The output was not found.' })
  @ApiConflictResponse({
    description:
      'The release changed, an author has a claim, or the DOI is already in use.',
  })
  async updateArticle(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<OutputResponseDto> {
    return this.outputsService.updateArticle(outputId, callerId, dto);
  }

  @Patch(':outputId/article-abstract')
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Save the abstract of a released Article as a new revision',
  })
  @ApiParam({ name: 'outputId', format: 'uuid', description: 'Article ID.' })
  @ApiOkResponse({
    type: OutputRevisionResponseDto,
    description: 'Current released revision.',
  })
  @ApiBadRequestResponse({ description: 'Invalid abstract or revision ID.' })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher owner is required.',
  })
  @ApiNotFoundResponse({ description: 'The output was not found.' })
  @ApiConflictResponse({
    description: 'The release changed or the Article cannot be edited.',
  })
  async updateArticleAbstract(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateArticleAbstractDto,
  ): Promise<OutputRevisionResponseDto> {
    return this.outputsService.updateArticleAbstract(outputId, callerId, dto);
  }

  @Put(':outputId/article-pdf')
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Add or replace the PDF of a released Article',
    description:
      'The owner attaches a verified upload and releases a successor revision. Replacing a PDF revokes access to the replaced file in every revision.',
  })
  @ApiParam({ name: 'outputId', format: 'uuid', description: 'Article ID.' })
  @ApiOkResponse({
    type: AttachArticlePdfResponseDto,
    description: 'Newly released revision and attached PDF identifiers.',
  })
  @ApiBadRequestResponse({ description: 'Invalid PDF attachment request.' })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher owner is required.',
  })
  @ApiNotFoundResponse({
    description:
      'The output, the targeted current PDF, or the upload was not found.',
  })
  @ApiGoneResponse({ description: 'The PDF upload has expired.' })
  @ApiConflictResponse({
    description:
      'The release changed, the existing PDF was not specified, or the upload cannot be attached.',
  })
  async attachArticlePdf(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: AttachArticlePdfDto,
  ): Promise<AttachArticlePdfResponseDto> {
    return this.outputsService.attachArticlePdf(outputId, callerId, dto);
  }

  @Patch(':outputId/article-pdf/:fileId')
  @Roles('RESEARCHER')
  @ApiOperation({ summary: 'Change the visibility of a released Article PDF' })
  @ApiParam({ name: 'outputId', format: 'uuid', description: 'Article ID.' })
  @ApiParam({
    name: 'fileId',
    format: 'uuid',
    description: 'Current PDF file ID.',
  })
  @ApiOkResponse({
    type: OutputFileResponseDto,
    description: 'Current PDF with the updated visibility.',
  })
  @ApiBadRequestResponse({ description: 'Invalid PDF visibility request.' })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher owner is required.',
  })
  @ApiNotFoundResponse({
    description: 'The output or its current PDF was not found.',
  })
  @ApiConflictResponse({ description: 'The output is not a shared Article.' })
  async updateArticlePdfVisibility(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateArticlePdfVisibilityDto,
  ): Promise<OutputFileResponseDto> {
    return this.outputsService.updateArticlePdfVisibility(
      outputId,
      callerId,
      fileId,
      dto,
    );
  }

  @Delete(':outputId/article-pdf/:fileId')
  @Roles('RESEARCHER')
  @ApiOperation({
    summary: 'Remove a released Article PDF',
    description:
      'Releases a successor revision without the PDF and revokes access to that file in every revision.',
  })
  @ApiParam({ name: 'outputId', format: 'uuid', description: 'Article ID.' })
  @ApiParam({
    name: 'fileId',
    format: 'uuid',
    description: 'Current PDF file ID.',
  })
  @ApiOkResponse({
    type: ArticlePdfRevisionResponseDto,
    description: 'Newly released revision after withdrawing the PDF.',
  })
  @ApiBadRequestResponse({ description: 'Invalid output or file identifier.' })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'An active researcher owner is required.',
  })
  @ApiNotFoundResponse({
    description: 'The output or its current PDF was not found.',
  })
  @ApiConflictResponse({ description: 'The output is not a shared Article.' })
  async removeArticlePdf(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ArticlePdfRevisionResponseDto> {
    return this.outputsService.removeArticlePdf(outputId, callerId, fileId);
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
      'Releases the draft revision of a work the caller owns, pins it as the current release, and shares the work under the audience the caller chose. The audience follows the scope of the work: a personal work reaches the community, a container work reaches its group or project. The work becomes searchable, discoverable, and linkable into a group. This is the single publish action, whether the draft came from an OpenAlex pull or from a work created inside the platform.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The published work, now shared under the requested audience.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID format for outputId, an unsupported audience, or an access group the caller is not a member of.',
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
      'Changes the audience of an already shared work. The authority follows the scope of the work: the owner of a personal work, the leads of the group of a group work, or the project lead and the parent group leads of a project work. The poster of a container work may not, because the container owns the post.',
  })
  @ApiParam({
    name: 'outputId',
    description: 'Unique identifier of the research output (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The work with its updated audience.',
    type: OutputResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid UUID format for outputId, or an audience the scope of the work does not allow.',
  })
  @ApiUnauthorizedResponse({
    description: 'Caller is not authenticated.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active researcher, or does not manage the container of the work.',
  })
  @ApiNotFoundResponse({
    description: 'The research output was not found.',
  })
  @ApiConflictResponse({
    description: 'The work is not published, so its audience cannot change.',
  })
  async updateVisibility(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() callerId: string,
    @Body() dto: UpdateOutputVisibilityDto,
  ): Promise<OutputResponseDto> {
    return this.outputsService.updateVisibility(outputId, callerId, dto);
  }
}
