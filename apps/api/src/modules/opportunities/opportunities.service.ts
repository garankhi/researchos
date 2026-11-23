import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { OpportunityStatus, Prisma, PrismaService } from '@researchos/database';
import type {
  OpportunityApplicationStatus,
  ResearchOpportunity,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  buildPaginationMeta,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
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
 * The sort keys the opportunity list accepts.
 *
 * They mirror the columns the list already orders by, so a client can ask
 * for the same ordering the default uses or reverse it.
 */
const OPPORTUNITY_SORT_FIELDS = {
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
  applicationDeadline: 'application_deadline',
  application_deadline: 'application_deadline',
  publishedAt: 'published_at',
  published_at: 'published_at',
} as const;

type OpportunitySortColumn =
  (typeof OPPORTUNITY_SORT_FIELDS)[keyof typeof OPPORTUNITY_SORT_FIELDS];

/**
 * Builds the `ORDER BY` clause of the opportunity list.
 *
 * The list selects a page of ids in SQL, because the visibility predicate
 * is a raw SQL fragment, so the sort has to be expressed in SQL too.
 *
 * Two details are deliberate:
 *
 * - The nullable date columns sort `NULLS LAST`. PostgreSQL puts nulls
 *   first for `ASC` and last for `DESC`, and an opportunity without a
 *   deadline does not belong at the top of a list ordered by deadline.
 * - Every ordering ends with `id`. `created_at` is not unique, so without a
 *   tiebreaker two records sharing a timestamp could land on two pages in
 *   a different order, and the client would show one twice and miss the
 *   other.
 */
function opportunityOrderBy(
  column: OpportunitySortColumn,
  direction: 'asc' | 'desc',
): Prisma.Sql {
  const asc = direction === 'asc';

  switch (column) {
    case 'application_deadline':
      return Prisma.sql`o.application_deadline ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST, o.created_at DESC, o.id DESC`;
    case 'published_at':
      return Prisma.sql`o.published_at ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST, o.created_at DESC, o.id DESC`;
    case 'updated_at':
      return Prisma.sql`o.updated_at ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`}, o.id ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;
    default:
      return Prisma.sql`o.created_at ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`}, o.id ${asc ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;
  }
}

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

const STATUS_ACTIONS = {
  open: { from: OpportunityStatus.DRAFT, to: OpportunityStatus.OPEN },
  fill: { from: OpportunityStatus.OPEN, to: OpportunityStatus.FILLED },
  close: { from: OpportunityStatus.FILLED, to: OpportunityStatus.CLOSED },
} as const;

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
      throw new CodedHttpException(
        domainErrorCodes.identity.researcherRequired,
        HttpStatus.FORBIDDEN,
      );
  }

  private async checkScope(
    tx: Prisma.TransactionClient,
    actorId: string,
    dto: CreateOpportunityDto,
  ) {
    if (dto.groupId) {
      const [group] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT can_manage_group(${actorId}::uuid, ${dto.groupId}::uuid) AS allowed
      `;
      if (!group?.allowed)
        throw new CodedHttpException(
          domainErrorCodes.opportunities.accessDenied,
          HttpStatus.FORBIDDEN,
        );
    }
    if (dto.projectId) {
      const [project] = await tx.$queryRaw<
        { groupId: string | null; leadId: string }[]
      >`
        SELECT group_id AS "groupId", lead_id AS "leadId" FROM research_projects
        WHERE id = ${dto.projectId}::uuid AND archived_at IS NULL
      `;
      if (!project || (!dto.groupId && project.leadId !== actorId))
        throw new CodedHttpException(
          domainErrorCodes.opportunities.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      // PostgreSQL returns a UUID in lower case, while the caller may send
      // the same UUID in upper case. The ids are equal, so they are
      // compared in a single case rather than rejected as a mismatch.
      if (normalizeUuid(project.groupId) !== normalizeUuid(dto.groupId))
        throw new BadRequestException('validation_failed');
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
      throw new CodedHttpException(
        domainErrorCodes.opportunities.invalidState,
        HttpStatus.BAD_REQUEST,
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
      auto_fill_on_acceptance: dto.autoFillOnAcceptance,
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
      autoFillOnAcceptance: row.auto_fill_on_acceptance ?? false,
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
      // PostgreSQL trigger/check failures can surface through the driver adapter
      // rather than Prisma's legacy P2004 code (including a deadline race).
      const sqlState = readDatabaseFailure(error)?.sqlState;
      if (sqlState === 'P0156') throw new ConflictException();
      if (sqlState === '23514')
        throw new BadRequestException('validation_failed');
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003' || error.code === 'P2004')
          throw new BadRequestException('validation_failed');
        if (error.code === 'P2002' || error.code === 'P2034')
          throw new ConflictException();
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
      throw new CodedHttpException(
        domainErrorCodes.opportunities.idempotencyKeyInvalid,
        HttpStatus.BAD_REQUEST,
      );
    if (dto.status !== undefined && dto.status !== OpportunityStatus.DRAFT)
      throw new CodedHttpException(
        domainErrorCodes.opportunities.invalidState,
        HttpStatus.BAD_REQUEST,
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
              throw new CodedHttpException(
                domainErrorCodes.opportunities.idempotencyKeyConflict,
                HttpStatus.CONFLICT,
              );
            if (dto.groupId) await this.checkScope(tx, actorId, dto);
            if (!previous.create_response)
              throw new CodedHttpException(
                domainErrorCodes.opportunities.idempotencyKeyConflict,
                HttpStatus.CONFLICT,
              );
            const response =
              previous.create_response as unknown as OpportunityResponseDto;
            response.autoFillOnAcceptance ??= false;
            return response;
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
    const orderBy = parseSortParam<OpportunitySortColumn>(
      query.sort,
      OPPORTUNITY_SORT_FIELDS,
      { created_at: 'desc' },
    );
    if (!orderBy) {
      throw new BadRequestException('validation_failed');
    }

    const sortColumn = Object.keys(orderBy)[0] as OpportunitySortColumn;
    const sortDir = orderBy[sortColumn] ?? 'desc';
    const orderBySql = opportunityOrderBy(sortColumn, sortDir);

    const includeArchived =
      query.archived === 'true' || query.archived === 'all';
    const archiveCondition =
      query.archived === 'true'
        ? Prisma.sql`AND o.archived_at IS NOT NULL`
        : query.archived === 'false'
          ? Prisma.sql`AND o.archived_at IS NULL`
          : Prisma.empty;
    const conditions = Prisma.sql`${this.visibility(actorId)}
      ${archiveCondition}
      ${query.groupId ? Prisma.sql`AND o.group_id = ${query.groupId}::uuid` : Prisma.empty}
      ${query.projectId ? Prisma.sql`AND o.project_id = ${query.projectId}::uuid` : Prisma.empty}
      ${query.status ? Prisma.sql`AND o.status = ${query.status}::opportunity_status` : Prisma.empty}
      ${query.creatorId ? Prisma.sql`AND o.creator_id = ${query.creatorId}::uuid` : Prisma.empty}`;

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    return this.prisma.$transaction(
      async (tx) => {
        if (includeArchived) {
          const [group] = query.groupId
            ? await tx.$queryRaw<{ allowed: boolean }[]>`
                SELECT can_manage_group(${actorId}::uuid, ${query.groupId}::uuid) AS allowed
              `
            : [];
          if (!group?.allowed)
            throw new CodedHttpException(
              domainErrorCodes.opportunities.accessDenied,
              HttpStatus.FORBIDDEN,
            );
        }
        const ids = await tx.$queryRaw<{ id: string; can_manage: boolean }[]>`
        SELECT o.id, ${this.management(actorId)} AS can_manage FROM research_opportunities o WHERE ${conditions}
        ORDER BY ${orderBySql} LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;
        const [count] = await tx.$queryRaw<
          { total: bigint }[]
        >`SELECT count(*) AS total FROM research_opportunities o WHERE ${conditions}`;
        const rows = await tx.research_opportunities.findMany({
          where: { id: { in: ids.map(({ id }) => id) } },
        });
        const total = Number(count.total);
        // The rows come back unordered, so the SQL order is restored from
        // the id list the paged query produced.
        const byId = new Map(rows.map((row) => [row.id, row]));
        const items = ids
          .map(({ id }) => byId.get(id))
          .filter((row): row is ResearchOpportunity => Boolean(row))
          .map((row) => {
            const item = this.response(row);
            item.canManage =
              ids.find((entry) => entry.id === row.id)?.can_manage === true;
            return item;
          });
        return {
          items,
          meta: buildPaginationMeta({ page, limit }, items.length, total),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findOne(actorId: string, id: string): Promise<OpportunityResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.research_opportunities.findUnique({
          where: { id },
        });
        if (!row)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.notFound,
            HttpStatus.NOT_FOUND,
          );
        const [visible] = await tx.$queryRaw<
          {
            id: string;
            can_manage: boolean;
            my_application_status: OpportunityApplicationStatus | null;
          }[]
        >`
        SELECT o.id, ${this.management(actorId)} AS can_manage, (
          SELECT a.status FROM opportunity_applications a
          WHERE a.opportunity_id = o.id AND a.applicant_id = ${actorId}::uuid
          ORDER BY a.applied_at DESC, a.id DESC LIMIT 1
        ) AS my_application_status
        FROM research_opportunities o WHERE o.id = ${id}::uuid AND ${this.visibility(actorId)}
      `;
        if (!visible)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.accessDenied,
            HttpStatus.FORBIDDEN,
          );
        const item = this.response(row);
        item.canManage = visible.can_manage === true;
        item.myApplicationStatus = visible.my_application_status ?? null;
        return item;
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
        if (!record)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.notFound,
            HttpStatus.NOT_FOUND,
          );
        if (!record.allowed)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.accessDenied,
            HttpStatus.FORBIDDEN,
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
        const updated = await tx.research_opportunities.update({
          where: { id },
          data,
        });
        return this.response(updated);
      }),
    );
  }

  async transitionStatus(
    actorId: string,
    id: string,
    action: keyof typeof STATUS_ACTIONS,
  ): Promise<OpportunityResponseDto> {
    const transition = STATUS_ACTIONS[action];
    return this.write(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireResearcher(tx, actorId);
        // Serialize status actions with PATCH and other status actions. A retry
        // sees the committed status and fails before writing another audit row.
        const [record] = await tx.$queryRaw<{ allowed: boolean }[]>`
          SELECT ${this.management(actorId)} AS allowed FROM research_opportunities o
          WHERE o.id = ${id}::uuid FOR UPDATE OF o
        `;
        if (!record)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.notFound,
            HttpStatus.NOT_FOUND,
          );
        if (!record.allowed)
          throw new CodedHttpException(
            domainErrorCodes.opportunities.accessDenied,
            HttpStatus.FORBIDDEN,
          );

        const current = await tx.research_opportunities.findUniqueOrThrow({
          where: { id },
        });
        if (current.status !== transition.from || current.archived_at !== null)
          throw new ConflictException();

        if (action === 'open' || action === 'fill') {
          const [eligibility] = await tx.$queryRaw<[{ current: boolean }]>`
            SELECT application_deadline > clock_timestamp() AS current
            FROM research_opportunities WHERE id = ${id}::uuid
          `;
          if (!eligibility?.current) {
            if (action === 'fill') throw new ConflictException();
            throw new BadRequestException('validation_failed');
          }
        }
        if (action === 'open') {
          if (
            !current.title.trim() ||
            !current.description?.trim() ||
            !current.application_deadline
          )
            throw new BadRequestException('validation_failed');
        }

        // normalize_opportunity stamps published_at on opening and rechecks the
        // deadline against PostgreSQL's clock. Existing timestamps are preserved.
        const updated = await tx.research_opportunities.update({
          where: { id },
          data: { status: transition.to },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'OPPORTUNITY_STATUS_CHANGED',
            entity: 'research_opportunities',
            entityId: current.id,
            payload: {
              fromStatus: current.status,
              toStatus: updated.status,
            },
          },
        });
        return this.response(updated);
      }),
    );
  }
}
