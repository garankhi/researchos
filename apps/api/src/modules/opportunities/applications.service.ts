import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import {
  buildPaginationMeta,
  PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import type {
  ApplicationResponseDto,
  CreateApplicationDto,
} from './dto/application.dto.js';

type ApplicationRow = Prisma.opportunity_applicationsGetPayload<
  Record<string, never>
>;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async run<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      const failure = readDatabaseFailure(error);
      if (failure?.prismaCode === 'P2002' || failure?.sqlState === '23505')
        throw new ConflictException('Already applied to this opportunity');
      if (failure?.sqlState === '23514' || failure?.prismaCode === 'P2034')
        throw new ConflictException(
          'Opportunity eligibility changed; refresh before retrying',
        );
      if (failure?.prismaCode === 'P2003' || failure?.sqlState === '23503')
        throw new ConflictException(
          'A referenced resource changed; refresh before retrying',
        );
      throw error;
    }
  }

  private async now(tx: Prisma.TransactionClient): Promise<Date> {
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }

  async apply(
    opportunityId: string,
    actorId: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.run(async (tx) => {
      // Serialize submissions with status/deadline changes and other submissions.
      await tx.$queryRaw`SELECT id FROM research_opportunities WHERE id = ${opportunityId}::uuid FOR UPDATE`;
      const opportunity = await tx.research_opportunities.findUnique({
        where: { id: opportunityId },
      });
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      if (opportunity.creator_id === actorId.toLowerCase())
        throw new ForbiddenException('Cannot apply to your own opportunity');
      const now = await this.now(tx);
      if (
        opportunity.status !== 'OPEN' ||
        opportunity.archived_at !== null ||
        !opportunity.application_deadline ||
        opportunity.application_deadline <= now
      )
        throw new ConflictException('Opportunity is not open for applications');
      const existing = await tx.opportunity_applications.findFirst({
        where: { opportunity_id: opportunityId, applicant_id: actorId },
      });
      if (existing)
        throw new ConflictException('Already applied to this opportunity');
      // Required Prisma field; guard_application replaces both timestamps using
      // the database clock and the opportunity's current SLA under the same lock.
      const application = await tx.opportunity_applications.create({
        data: {
          opportunity_id: opportunityId,
          applicant_id: actorId,
          applicant_note: dto.applicantNote,
          response_due_at: new Date(
            now.getTime() + opportunity.response_sla_days * 86400000,
          ),
        },
      });
      return this.response(application, await this.now(tx));
    });
  }

  async received(
    opportunityId: string,
    actorId: string,
    query: PaginationQueryDto,
  ) {
    return this.run(async (tx) => {
      const [opportunity] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT can_manage_opportunity(${actorId}::uuid, o.id) AS allowed
        FROM research_opportunities o WHERE o.id = ${opportunityId}::uuid FOR SHARE OF o
      `;
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      // The ticket explicitly requires 403 for another owner's received list.
      if (!opportunity.allowed)
        throw new ForbiddenException('Opportunity ownership required');
      return this.page(tx, { opportunity_id: opportunityId }, query);
    });
  }

  async mine(actorId: string, query: PaginationQueryDto) {
    return this.run((tx) => this.page(tx, { applicant_id: actorId }, query));
  }

  private async page(
    tx: Prisma.TransactionClient,
    where: Prisma.opportunity_applicationsWhereInput,
    query: PaginationQueryDto,
  ) {
    const orderBy = parseSortParam(
      query.sort,
      { appliedAt: 'applied_at', responseDueAt: 'response_due_at' },
      { applied_at: 'desc' },
    );
    if (!orderBy)
      throw new BadRequestException('Unsupported application sort field');
    const rows = await tx.opportunity_applications.findMany({
      where,
      orderBy: [orderBy, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const total = await tx.opportunity_applications.count({ where });
    const now = await this.now(tx);
    return {
      items: rows.map((row) => this.response(row, now)),
      meta: buildPaginationMeta(query, rows.length, total),
    };
  }

  private response(row: ApplicationRow, now: Date): ApplicationResponseDto {
    const pending = row.status === 'PENDING';
    const remaining = row.response_due_at.getTime() - now.getTime();
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      applicantId: row.applicant_id,
      applicantNote: row.applicant_note,
      status: row.status,
      responseNote: row.response_note,
      respondedBy: row.responded_by,
      appliedAt: row.applied_at.toISOString(),
      responseDueAt: row.response_due_at.toISOString(),
      respondedAt: row.responded_at?.toISOString() ?? null,
      withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
      countdownAsOf: now.toISOString(),
      remainingSeconds: pending
        ? Math.max(0, Math.ceil(remaining / 1000))
        : null,
      isOverdue: pending && remaining <= 0,
    };
  }
}
