import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpportunityStatus, Prisma, PrismaService } from '@researchos/database';
import type { ResearchOpportunity } from '@researchos/database';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto.js';
import {
  OpportunityPageDto,
  OpportunityResponseDto,
} from './dto/opportunity-response.dto.js';

// DTOs use camelCase; dev's introspected Prisma domain models use snake_case.
// Policy queries use bound parameters and the canonical PostgreSQL functions.

/**
 * Normalizes a UUID for comparison.
 *
 * PostgreSQL returns a UUID in lower case, while the caller may send the
 * same UUID in upper case — the DTO accepts both. A missing id stays
 * missing, so that "no group" and "some group" never compare equal.
 */
function normalizeUuid(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private management(actorId: string) {
    return Prisma.sql`can_manage_opportunity(${actorId}::uuid, o.id)`;
  }

  private visibility(actorId: string) {
    return Prisma.sql`((o.status <> 'DRAFT' AND o.archived_at IS NULL) OR ${this.management(actorId)})`;
  }

  private async requireResearcher(
    tx: Prisma.TransactionClient,
    actorId: string,
  ) {
    const [result] = await tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT is_researcher(${actorId}::uuid) AS allowed
    `;
    if (!result?.allowed)
      throw new ForbiddenException('An active researcher account is required');
  }

  private async checkScope(
    tx: Prisma.TransactionClient,
    actorId: string,
    dto: CreateOpportunityDto,
  ) {
    if (dto.groupId) {
      const [group] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT (g.lead_id = ${actorId}::uuid OR EXISTS (
          SELECT 1 FROM group_members m WHERE m.group_id = g.id
          AND m.user_id = ${actorId}::uuid AND m.role = 'CORE_MEMBER'
        )) AS allowed FROM research_groups g
        WHERE g.id = ${dto.groupId}::uuid AND g.is_active AND g.archived_at IS NULL
      `;
      if (!group?.allowed)
        throw new ForbiddenException('Group management permission is required');
    }
    if (dto.projectId) {
      const [project] = await tx.$queryRaw<
        { groupId: string | null; leadId: string }[]
      >`
        SELECT group_id AS "groupId", lead_id AS "leadId" FROM research_projects
        WHERE id = ${dto.projectId}::uuid AND archived_at IS NULL
      `;
      if (!project || project.leadId !== actorId)
        throw new ForbiddenException(
          'Project management permission is required',
        );
      // PostgreSQL returns a UUID in lower case, while the caller may send
      // the same UUID in upper case. The ids are equal, so they are
      // compared in a single case rather than rejected as a mismatch.
      if (normalizeUuid(project.groupId) !== normalizeUuid(dto.groupId))
        throw new BadRequestException('Project and group scopes must match');
    }
  }

  private validateRecord(record: {
    status?: string;
    title?: string;
    description?: string | null;
    applicationDeadline?: unknown;
    publishedAt?: unknown;
  }) {
    if (
      (record.status ?? OpportunityStatus.DRAFT) !== OpportunityStatus.DRAFT &&
      (!record.title?.trim() ||
        !record.description?.trim() ||
        !record.applicationDeadline ||
        !record.publishedAt)
    ) {
      throw new BadRequestException(
        'A non-draft opportunity requires a non-empty title and description, applicationDeadline and publishedAt',
      );
    }
  }

  private dates(dto: CreateOpportunityDto | UpdateOpportunityDto) {
    const { applicationDeadline, archivedAt } = dto;
    return {
      title: dto.title,
      opportunity_kind: dto.opportunityKind,
      target_audience: dto.targetAudience,
      expected_role: dto.expectedRole,
      required_expertise_tags: dto.requiredExpertiseTags,
      description: dto.description,
      response_sla_days: dto.responseSlaDays,
      application_deadline:
        applicationDeadline === undefined
          ? undefined
          : applicationDeadline === null
            ? null
            : new Date(applicationDeadline),
      archived_at:
        archivedAt === undefined
          ? undefined
          : archivedAt === null
            ? null
            : new Date(archivedAt),
    };
  }

  private response(row: ResearchOpportunity): OpportunityResponseDto {
    return {
      id: row.id,
      groupId: row.group_id,
      projectId: row.project_id,
      creatorId: row.creator_id,
      title: row.title,
      opportunityKind: row.opportunity_kind,
      targetAudience: row.target_audience,
      expectedRole: row.expected_role,
      requiredExpertiseTags: row.required_expertise_tags ?? [],
      description: row.description,
      responseSlaDays: row.response_sla_days,
      status: row.status,
      applicationDeadline: row.application_deadline?.toISOString() ?? null,
      publishedAt: row.published_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
    };
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003')
          throw new BadRequestException(
            'A referenced resource no longer exists',
          );
        if (error.code === 'P2004')
          throw new BadRequestException(
            'Opportunity constraints were not satisfied',
          );
        if (error.code === 'P2002' || error.code === 'P2034')
          throw new ConflictException('Concurrent change; retry the request');
      }
      throw error;
    }
  }

  async create(
    actorId: string,
    dto: CreateOpportunityDto,
    key?: string,
  ): Promise<OpportunityResponseDto> {
    if (key !== undefined && (!key.trim() || key.length > 200))
      throw new BadRequestException(
        'Idempotency-Key must contain 1 to 200 characters',
      );
    if (dto.status !== undefined && dto.status !== OpportunityStatus.DRAFT)
      throw new BadRequestException(
        'Create the opportunity as DRAFT, then publish it using a status action',
      );
    // Sort properties so equivalent JSON objects with different key order replay.
    const hash = createHash('sha256')
      .update(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(dto)
              .filter(([, value]) => value !== undefined)
              .sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      )
      .digest('hex');
    return this.write(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireResearcher(tx, actorId);
        if (key !== undefined) {
          // Transaction-scoped lock serializes retries across API processes.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ':' + key}, 0))::text`;
          const previous = await tx.research_opportunities.findUnique({
            where: {
              creator_id_create_idempotency_key: {
                creator_id: actorId,
                create_idempotency_key: key,
              },
            },
            select: { create_request_hash: true, create_response: true },
          });
          if (previous) {
            if (previous.create_request_hash !== hash)
              throw new ConflictException(
                'Idempotency-Key was already used with a different payload',
              );
            if (!previous.create_response)
              throw new ConflictException(
                'The original create response is unavailable',
              );
            return previous.create_response as unknown as OpportunityResponseDto;
          }
        }
        await this.checkScope(tx, actorId, dto);
        const row = await tx.research_opportunities.create({
          data: {
            ...this.dates(dto),
            title: dto.title,
            opportunity_kind: dto.opportunityKind,
            group_id: dto.groupId,
            project_id: dto.projectId,
            creator_id: actorId,
            status: OpportunityStatus.DRAFT,
            published_at: null,
            required_expertise_tags: dto.requiredExpertiseTags ?? [],
          },
        });
        const response = this.response(row);
        if (key !== undefined)
          await tx.research_opportunities.update({
            where: { id: row.id },
            data: {
              create_idempotency_key: key,
              create_request_hash: hash,
              create_response: response as unknown as Prisma.InputJsonValue,
            },
          });
        return response;
      }),
    );
  }

  async findAll(
    actorId: string,
    query: ListOpportunitiesQueryDto,
  ): Promise<OpportunityPageDto> {
    const conditions = Prisma.sql`${this.visibility(actorId)}
      ${query.groupId ? Prisma.sql`AND o.group_id = ${query.groupId}::uuid` : Prisma.empty}
      ${query.projectId ? Prisma.sql`AND o.project_id = ${query.projectId}::uuid` : Prisma.empty}
      ${query.status ? Prisma.sql`AND o.status = ${query.status}::opportunity_status` : Prisma.empty}`;
    return this.prisma.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT o.id FROM research_opportunities o WHERE ${conditions}
        ORDER BY o.created_at DESC, o.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      `;
        const [count] = await tx.$queryRaw<
          { total: bigint }[]
        >`SELECT count(*) AS total FROM research_opportunities o WHERE ${conditions}`;
        const rows = await tx.research_opportunities.findMany({
          where: { id: { in: ids.map(({ id }) => id) } },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        });
        return {
          items: rows.map((row) => this.response(row)),
          page: query.page,
          pageSize: query.pageSize,
          total: Number(count.total),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findOne(actorId: string, id: string): Promise<OpportunityResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const [visible] = await tx.$queryRaw<{ id: string }[]>`
        SELECT o.id FROM research_opportunities o WHERE o.id = ${id}::uuid AND ${this.visibility(actorId)}
      `;
        if (!visible) throw new NotFoundException('Opportunity not found');
        const row = await tx.research_opportunities.findUnique({
          where: { id },
        });
        if (!row) throw new NotFoundException('Opportunity not found');
        return this.response(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateOpportunityDto,
  ): Promise<OpportunityResponseDto> {
    return this.write(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireResearcher(tx, actorId);
        const [record] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT ${this.management(actorId)} AS allowed FROM research_opportunities o
        WHERE o.id = ${id}::uuid FOR UPDATE OF o
      `;
        if (!record) throw new NotFoundException('Opportunity not found');
        if (!record.allowed)
          throw new ForbiddenException(
            'Only the creator, group lead or core members can edit an opportunity',
          );
        const current = await tx.research_opportunities.findUniqueOrThrow({
          where: { id },
        });
        const data = this.dates(dto);
        // Undefined means retain the persisted value; explicit null clears it.
        const changed = Object.fromEntries(
          Object.entries(dto).filter(([, value]) => value !== undefined),
        );
        this.validateRecord(Object.assign({}, this.response(current), changed));
        return this.response(
          await tx.research_opportunities.update({ where: { id }, data }),
        );
      }),
    );
  }
}
