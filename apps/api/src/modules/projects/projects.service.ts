import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type { ListResearchProjectsQueryDto } from './dto/list-research-projects.query.dto.js';
import type { PaginatedResearchProjectsResponseDto } from './dto/paginated-research-projects-response.dto.js';
import type { ResearchProjectResponseDto } from './dto/research-project-response.dto.js';

type ProjectRow = Prisma.research_projectsGetPayload<Record<string, never>>;

/**
 * Service listing the research projects the caller may post into.
 *
 * A project is a container of its own: the project lead and the leads of
 * the parent group decide who may read the works posted into it. The
 * poster keeps the right to edit the content.
 *
 * The list is scoped to the caller on purpose. It exists so a composer
 * can offer the containers the caller can actually post into, and a
 * project the caller cannot post into is not one of them — the caller is
 * a project lead, a project member, or a member of the group that owns
 * the project.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists the projects the caller may post a work into.
   *
   * A standalone project counts when the caller leads it or is one of its
   * members. A project inside a group also counts for the members of that
   * group, because a project post belongs to the whole group and the
   * group leads manage it too.
   */
  async findAll(
    query: ListResearchProjectsQueryDto,
    callerId: string,
  ): Promise<PaginatedResearchProjectsResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const andConditions: Prisma.research_projectsWhereInput[] = [];

    if (query.search?.trim()) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (query.groupId) {
      andConditions.push({ group_id: query.groupId });
    }

    if (query.relation === 'LEAD') {
      andConditions.push({ lead_id: callerId });
    } else if (query.relation === 'MEMBER') {
      andConditions.push({
        project_members: { some: { user_id: callerId } },
      });
    }

    if (query.isActive !== undefined) {
      andConditions.push(
        query.isActive ? { archived_at: null } : { archived_at: { not: null } },
      );
    }

    // The caller's reach: they lead the project, they are a member of it,
    // or they belong to the group that owns it. A group member reaches
    // every project of that group, because the group leads manage the
    // audience of a project post on behalf of the whole group.
    const reachable: Prisma.research_projectsWhereInput[] = [
      { lead_id: callerId },
      { project_members: { some: { user_id: callerId } } },
      {
        research_groups: {
          is: {
            group_members: { some: { user_id: callerId, archived_at: null } },
          },
        },
      },
    ];

    const where: Prisma.research_projectsWhereInput = {
      AND: [
        { OR: reachable },
        // An archived project is not somewhere to post. The exception is
        // the lead, who may still see the project they run.
        {
          OR: [{ archived_at: null }, { lead_id: callerId }],
        },
        ...andConditions,
      ],
    };

    const [total, rows] = await Promise.all([
      this.prisma.research_projects.count({ where }),
      this.prisma.research_projects.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ archived_at: 'asc' }, { created_at: 'desc' }],
      }),
    ]);

    const items = rows.map((row) => this.mapToResponse(row, callerId));

    return {
      items,
      meta: buildPaginationMeta({ page, limit }, items.length, total),
    };
  }

  /**
   * Retrieves a single project the caller may post into.
   *
   * Throws `404 project_not_found` when the project does not exist and
   * `403 project_access_denied` when the caller cannot reach it.
   */
  async findOne(
    projectId: string,
    callerId: string,
  ): Promise<ResearchProjectResponseDto> {
    const project = await this.prisma.research_projects.findUnique({
      where: { id: projectId },
      include: {
        project_members: { where: { user_id: callerId } },
        research_groups: {
          include: {
            group_members: {
              where: { user_id: callerId, archived_at: null },
            },
          },
        },
      },
    });

    if (!project) {
      throw new CodedHttpException(
        domainErrorCodes.projects.projectNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const isMember = project.project_members.length > 0;
    const isGroupMember =
      (project.research_groups?.group_members.length ?? 0) > 0;
    const isLead = project.lead_id === callerId;

    if (!isMember && !isGroupMember && !isLead) {
      throw new CodedHttpException(
        domainErrorCodes.projects.projectAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    return this.mapToResponse(project, callerId);
  }

  private mapToResponse(
    project: ProjectRow,
    callerId: string,
  ): ResearchProjectResponseDto {
    return {
      id: project.id,
      code: project.code,
      title: project.title,
      projectType: project.project_type,
      groupId: project.group_id,
      leadId: project.lead_id,
      status: project.status,
      isCallerLead: project.lead_id === callerId,
    };
  }
}
