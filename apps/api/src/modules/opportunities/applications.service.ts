import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OpportunityApplicationStatus,
  Prisma,
  PrismaService,
  stageNotificationEvent,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  buildPaginationMeta,
  PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  ApplicationResponseDto,
  CreateApplicationDto,
} from './dto/application.dto.js';
import type { GroupApplicationPageDto } from './dto/group-application.dto.js';
import type { RespondApplicationDto } from './dto/respond-application.dto.js';

type ApplicationRow = Prisma.opportunity_applicationsGetPayload<
  Record<string, never>
>;

/**
 * The applicant, read from the joined account row.
 *
 * `researcher_profiles` is optional, so the profile-backed field is
 * nullable: an applicant without a profile row still appears in the list.
 */
interface ApplicantDisplay {
  fullName: string;
  email: string;
  departmentUnit: string;
  avatarStorageKey: string | null;
}

/**
 * An application row with the applicant joined in.
 *
 * The join is one query for the whole page, so a list of applications does
 * not walk the profile endpoints once per row.
 *
 * The opportunity title is joined separately, because only the two list
 * queries read it — a single application is answered without it.
 */
type ApplicationRowWithApplicant = Prisma.opportunity_applicationsGetPayload<{
  include: {
    users_opportunity_applications_applicant_idTousers: {
      include: { researcher_profiles: true };
    };
  };
}>;

/**
 * An application row with the applicant and the opportunity joined in.
 *
 * The two list queries read the opportunity's title alongside the
 * application, so they join both in one query.
 */
type ApplicationRowWithOpportunity = ApplicationRowWithApplicant & {
  research_opportunities: { title: string };
};

/**
 * The applicant join every application read carries.
 *
 * Declared once so the create, the update and the two list queries all
 * join the same shape — and so the display fields are never missing on
 * one path and present on another.
 */
const applicantInclude = {
  users_opportunity_applications_applicant_idTousers: {
    include: { researcher_profiles: true },
  },
} as const;

/**
 * The sort keys the group application list accepts.
 *
 * They mirror the per-opportunity list, so the two tabs sort the same way.
 */
const GROUP_APPLICATION_SORT_FIELDS = {
  appliedAt: 'applied_at',
  responseDueAt: 'response_due_at',
} as const;

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

  /**
   * Runs an action on an application.
   *
   * The database refuses a transition that leaves a pending application, and
   * refuses a response whose responder does not hold the opportunity's
   * management authority. The API checks both before writing, so the
   * trigger's refusal is the backstop for a race rather than the ordinary
   * path — it is reported as a conflict on the application.
   */
  private async runAction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      const failure = readDatabaseFailure(error);
      if (failure?.sqlState === 'P0168')
        throw new CodedHttpException(
          domainErrorCodes.applications.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      if (failure?.sqlState === 'P0167')
        throw new CodedHttpException(
          domainErrorCodes.applications.capacityReached,
          HttpStatus.CONFLICT,
        );
      if (failure?.sqlState === '23514' || failure?.prismaCode === 'P2034')
        throw new CodedHttpException(
          domainErrorCodes.applications.invalidState,
          HttpStatus.CONFLICT,
        );
      if (failure?.prismaCode === 'P2003' || failure?.sqlState === '23503')
        throw new CodedHttpException(
          domainErrorCodes.applications.invalidState,
          HttpStatus.CONFLICT,
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
        include: applicantInclude,
      });
      await this.notifyApplication(
        tx,
        application,
        actorId,
        'APPLICATION_RECEIVED',
      );
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

  /**
   * Answers a pending application on behalf of its opportunity owner.
   *
   * The owner is whoever the canonical PostgreSQL policy says may manage the
   * opportunity: the creator, the group's lead, or a group leader of the
   * scope the opportunity belongs to. The same policy is what the
   * `guard_application` trigger checks, so the API refuses the same callers
   * the database would.
   *
   * `responded_at` is written by the trigger from the database clock, not by
   * the caller, and `responded_by` is the caller — a client cannot answer on
   * somebody else's behalf.
   */
  async respond(
    applicationId: string,
    actorId: string,
    dto: RespondApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.runAction(async (tx) => {
      const application = await this.lock(tx, applicationId);
      if (!application)
        throw new CodedHttpException(
          domainErrorCodes.applications.notFound,
          HttpStatus.NOT_FOUND,
        );
      const accepting = dto.decision === OpportunityApplicationStatus.ACCEPTED;
      const lock = accepting
        ? Prisma.sql`FOR UPDATE OF o`
        : Prisma.sql`FOR SHARE OF o`;
      const [opportunity] = await tx.$queryRaw<
        { allowed: boolean; group_id: string | null }[]
      >`
        SELECT can_manage_opportunity(${actorId}::uuid, o.id) AS allowed, o.group_id
        FROM research_opportunities o WHERE o.id = ${application.opportunity_id}::uuid ${lock}
      `;
      if (!opportunity?.allowed)
        throw new CodedHttpException(
          domainErrorCodes.applications.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      if (
        accepting &&
        application.status === OpportunityApplicationStatus.ACCEPTED
      ) {
        const accepted = await tx.opportunity_applications.findUniqueOrThrow({
          where: { id: applicationId },
          include: applicantInclude,
        });
        return this.acceptanceResponse(tx, accepted, opportunity.group_id);
      }
      // Only a pending application can be answered. Answering one that is
      // already answered is a conflict, not a silent second answer.
      if (application.status !== OpportunityApplicationStatus.PENDING)
        throw new CodedHttpException(
          application.status === OpportunityApplicationStatus.WITHDRAWN
            ? domainErrorCodes.applications.alreadyWithdrawn
            : domainErrorCodes.applications.alreadyAnswered,
          HttpStatus.CONFLICT,
        );
      const answered = await tx.opportunity_applications.updateManyAndReturn({
        where: {
          id: applicationId,
          status: OpportunityApplicationStatus.PENDING,
        },
        data: {
          status: dto.decision,
          // A blank note is no note: it is stored as null so the API does not
          // carry an empty string as if the owner had written something.
          response_note: dto.responseNote?.trim() ? dto.responseNote : null,
          responded_by: actorId,
        },
        include: applicantInclude,
      });
      // The conditional update matched no row when another transaction
      // answered the application between the lock and the write.
      if (!answered.length)
        throw new CodedHttpException(
          domainErrorCodes.applications.alreadyAnswered,
          HttpStatus.CONFLICT,
        );
      await this.notifyApplication(
        tx,
        answered[0],
        actorId,
        accepting ? 'APPLICATION_ACCEPTED' : 'APPLICATION_DECLINED',
      );
      return accepting
        ? this.acceptanceResponse(tx, answered[0], opportunity.group_id)
        : this.response(answered[0], await this.now(tx));
    });
  }

  private async acceptanceResponse(
    tx: Prisma.TransactionClient,
    application: ApplicationRowWithApplicant,
    groupId: string | null,
  ): Promise<ApplicationResponseDto> {
    const member = groupId
      ? await tx.group_members.findUnique({
          where: {
            group_id_user_id: {
              group_id: groupId,
              user_id: application.applicant_id,
            },
            archived_at: null,
          },
        })
      : null;
    const response = this.response(application, await this.now(tx));
    response.membership = member && {
      groupId: member.group_id,
      userId: member.user_id,
      role: member.role,
    };
    return response;
  }

  /**
   * Withdraws a pending application on behalf of its applicant.
   *
   * Only the applicant may withdraw, and only while the application is still
   * pending. The row is kept: the withdrawal is a status change, so the
   * application and its history stay visible instead of disappearing.
   */
  async withdraw(
    applicationId: string,
    actorId: string,
  ): Promise<ApplicationResponseDto> {
    return this.runAction(async (tx) => {
      const application = await this.lock(tx, applicationId);
      if (!application)
        throw new CodedHttpException(
          domainErrorCodes.applications.notFound,
          HttpStatus.NOT_FOUND,
        );
      // The applicant owns the withdrawal. The owner cannot withdraw on
      // the applicant's behalf — that is what responding is for.
      if (application.applicant_id !== actorId.toLowerCase())
        throw new CodedHttpException(
          domainErrorCodes.applications.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      // Withdrawing twice is a conflict, not a silent success.
      if (application.status !== OpportunityApplicationStatus.PENDING)
        throw new CodedHttpException(
          application.status === OpportunityApplicationStatus.WITHDRAWN
            ? domainErrorCodes.applications.alreadyWithdrawn
            : domainErrorCodes.applications.alreadyAnswered,
          HttpStatus.CONFLICT,
        );
      const withdrawn = await tx.opportunity_applications.updateManyAndReturn({
        where: {
          id: applicationId,
          status: OpportunityApplicationStatus.PENDING,
        },
        data: { status: OpportunityApplicationStatus.WITHDRAWN },
        include: applicantInclude,
      });
      if (!withdrawn.length)
        throw new CodedHttpException(
          domainErrorCodes.applications.alreadyWithdrawn,
          HttpStatus.CONFLICT,
        );
      await this.notifyApplication(
        tx,
        withdrawn[0],
        actorId,
        'APPLICATION_WITHDRAWN',
      );
      return this.response(withdrawn[0], await this.now(tx));
    });
  }

  /**
   * Reads an application and holds its row for the rest of the transaction.
   *
   * The lock serializes a response or a withdrawal against another one, so
   * two concurrent actions cannot both see the application as pending. The
   * lock is taken before the row is read, so the read returns the state the
   * lock holder sees.
   */
  private notifyApplication(
    tx: Prisma.TransactionClient,
    row: ApplicationRow,
    actorId: string,
    type:
      | 'APPLICATION_RECEIVED'
      | 'APPLICATION_ACCEPTED'
      | 'APPLICATION_DECLINED'
      | 'APPLICATION_WITHDRAWN',
  ) {
    return stageNotificationEvent(tx, {
      key: `${type}:${row.id}`,
      type,
      actorId,
      subjectType: 'APPLICATION',
      subjectId: row.id,
      payload: { link: `/opportunities/${row.opportunity_id}` },
    });
  }

  private async lock(
    tx: Prisma.TransactionClient,
    applicationId: string,
  ): Promise<ApplicationRow | undefined> {
    const [application] = await tx.$queryRaw<
      ApplicationRow[]
    >`SELECT id, opportunity_id, applicant_id, applicant_note, status,
                response_note, response_due_at, responded_by, applied_at,
                responded_at, withdrawn_at
         FROM opportunity_applications
         WHERE id = ${applicationId}::uuid
         FOR UPDATE`;
    return application;
  }

  async mine(actorId: string, query: PaginationQueryDto) {
    return this.run((tx) => this.page(tx, { applicant_id: actorId }, query));
  }

  /**
   * Lists the applications on every opportunity scoped to a group.
   *
   * The scope matches `GET /opportunities?groupId=`: the opportunities whose
   * `group_id` is the group. Which of them the caller may read is decided per
   * opportunity by the canonical `can_manage_opportunity` policy — the same
   * rule the per-opportunity received list uses — so the group tab never
   * widens what the caller could already read.
   */
  async forGroup(
    groupId: string,
    actorId: string,
    query: PaginationQueryDto,
  ): Promise<GroupApplicationPageDto> {
    return this.run(async (tx) => {
      const group = await tx.research_groups.findUnique({
        where: { id: groupId },
        select: { id: true },
      });
      if (!group)
        throw new CodedHttpException(
          domainErrorCodes.groups.groupNotFound,
          HttpStatus.NOT_FOUND,
        );

      const [scope] = await tx.$queryRaw<
        { group_total: bigint; manageable: bigint }[]
      >`
        SELECT
          (SELECT count(*) FROM research_opportunities o
            WHERE o.group_id = ${groupId}::uuid) AS group_total,
          (SELECT count(*) FROM research_opportunities o
            WHERE o.group_id = ${groupId}::uuid
              AND can_manage_opportunity(${actorId}::uuid, o.id)) AS manageable
      `;

      // A group with no opportunity has nothing to refuse. A group that has
      // opportunities the caller may not manage is a private list, and an
      // empty page would read as "no applications" rather than "not allowed".
      if (
        Number(scope?.group_total ?? 0n) > 0 &&
        Number(scope?.manageable ?? 0n) === 0
      )
        throw new CodedHttpException(
          domainErrorCodes.opportunities.accessDenied,
          HttpStatus.FORBIDDEN,
        );

      const opportunities = await tx.$queryRaw<{ id: string }[]>`
        SELECT o.id FROM research_opportunities o
        WHERE o.group_id = ${groupId}::uuid
          AND can_manage_opportunity(${actorId}::uuid, o.id)
      `;
      const opportunityIds = opportunities.map((row) => row.id);

      if (opportunityIds.length === 0)
        return {
          items: [],
          meta: buildPaginationMeta(query, 0, 0),
        };

      const orderBy = parseSortParam(
        query.sort,
        GROUP_APPLICATION_SORT_FIELDS,
        { applied_at: 'desc' },
      );
      if (!orderBy) throw new BadRequestException('validation_failed');

      const where: Prisma.opportunity_applicationsWhereInput = {
        opportunity_id: { in: opportunityIds },
      };
      const rows = await tx.opportunity_applications.findMany({
        where,
        include: {
          research_opportunities: { select: { title: true } },
          users_opportunity_applications_applicant_idTousers: {
            include: { researcher_profiles: true },
          },
        },
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.opportunity_applications.count({ where });
      const now = await this.now(tx);
      return {
        items: rows.map((row) => ({
          ...this.response(row, now),
          opportunityTitle: row.research_opportunities.title,
        })),
        meta: buildPaginationMeta(query, rows.length, total),
      };
    });
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
      include: {
        research_opportunities: { select: { title: true } },
        users_opportunity_applications_applicant_idTousers: {
          include: { researcher_profiles: true },
        },
      },
      orderBy: [orderBy, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const total = await tx.opportunity_applications.count({ where });
    const now = await this.now(tx);
    return {
      items: rows.map((row) => ({
        ...this.response(row, now),
        opportunityTitle: row.research_opportunities?.title ?? null,
      })),
      meta: buildPaginationMeta(query, rows.length, total),
    };
  }

  /**
   * Reads the applicant's display fields from the joined account row.
   *
   * The join is optional on purpose: a missing join must not break the
   * list, so the display fields fall back to empty strings rather than
   * throwing.
   */
  private applicantDisplay(row: ApplicationRowWithApplicant): ApplicantDisplay {
    const user = row.users_opportunity_applications_applicant_idTousers;
    const profile = user?.researcher_profiles ?? null;

    return {
      fullName: user?.full_name ?? '',
      email: user?.email ?? '',
      departmentUnit: user?.department_unit ?? '',
      avatarStorageKey: profile?.avatar_storage_key ?? null,
    };
  }

  private response(
    row: ApplicationRowWithApplicant,
    now: Date,
  ): ApplicationResponseDto {
    const pending = row.status === 'PENDING';
    const remaining = row.response_due_at.getTime() - now.getTime();
    const applicant = this.applicantDisplay(row);
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      applicantId: row.applicant_id,
      applicantFullName: applicant.fullName,
      applicantEmail: applicant.email,
      applicantDepartmentUnit: applicant.departmentUnit,
      applicantAvatarStorageKey: applicant.avatarStorageKey,
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
