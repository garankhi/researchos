import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ListResearchProjectsQueryDto } from './dto/list-research-projects.query.dto.js';
import { PaginatedResearchProjectsResponseDto } from './dto/paginated-research-projects-response.dto.js';
import { ResearchProjectResponseDto } from './dto/research-project-response.dto.js';
import { ProjectsService } from './projects.service.js';

/**
 * Controller for research projects — the containers a work can be posted
 * into.
 */
@ApiTags('projects')
@ApiCookieAuth()
@Controller('research-projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ApiOperation({
    summary: 'List the research projects the caller may post into',
    description:
      'Returns a paginated list of the projects the caller can reach: the ones they lead, the ones they are a member of, and the ones belonging to a group they are in. A project is a container of its own — the project lead and the leads of the parent group decide who may read the works posted into it.',
  })
  @ApiOkResponse({
    description: 'Paginated list of reachable research projects.',
    type: PaginatedResearchProjectsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
  })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @Get()
  async findAll(
    @Query() query: ListResearchProjectsQueryDto,
    @CurrentUserId() callerId: string,
  ): Promise<PaginatedResearchProjectsResponseDto> {
    return this.projectsService.findAll(query, callerId);
  }

  @ApiOperation({
    summary: 'Get details of a research project',
    description:
      'Returns a single research project the caller may post into. Returns 404 when the project does not exist and 403 when the caller cannot reach it.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Unique identifier of the research project (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Research project retrieved successfully.',
    type: ResearchProjectResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The provided projectId is not a valid UUID.',
  })
  @ApiUnauthorizedResponse({ description: 'Caller is not authenticated.' })
  @ApiForbiddenResponse({
    description: 'Caller is not allowed to view this research project.',
  })
  @ApiNotFoundResponse({
    description: 'The research project was not found.',
  })
  @Get(':projectId')
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ResearchProjectResponseDto> {
    return this.projectsService.findOne(projectId, callerId);
  }
}
