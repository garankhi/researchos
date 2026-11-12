import { HttpStatus, Injectable } from '@nestjs/common';
import { GroupOutputStatus, Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  buildPaginationMeta,
  PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import {
  CHECK_VIOLATION_SQL_STATE,
  readDatabaseFailure,
} from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  CreateGroupOutputLinkDto,
  DecideGroupOutputLinkDto,
  GroupOutputLinkPageDto,
  GroupOutputLinkResponseDto,
} from './dto/group-output-link.dto.js';

type LinkRow = Prisma.group_output_linksGetPayload<Record<string, never>>;

/**
 * The sort keys the group link list accepts.
 */
const LINK_SORT_FIELDS = {
  requestedAt: 'requested_at',
  status: 'status',
} as const;

/**
 * The policy facts the link lifecycle needs, read from PostgreSQL.
 *
 * The rules live in SQL functions — `is_group_member`, `can_view_output`,
 * `can_manage_group`, `can_manage_output` — and the `guard_group_output`
 * trigger enforces the same state machine on every write. The service asks
 * the database the same questions the trigger would, so a write is never
 * attempted in a shape the trigger refuses.
 */
interface LinkPolicy {
  groupExists: boolean;
  isResearcher: boolean;
  canManageGroup: boolean;
  isMember: boolean;
  canView: boolean;
  canManageOutput: boolean;
  sharingStatus: string | null;
  revisionReleased: boolean;
}

@Injectable()
export class GroupOutputLinksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists the group's content links.
   *
   * A group member reads the list; an outsider does not, because the list
   * names the works the group curated and the requests it is deciding.
   */
  async list(
    groupId: string,
    query: PaginationQueryDto,
    callerId: string,
  ): Promise<GroupOutputLinkPageDto> {
    const orderBy = parseSortParam(query.sort, LINK_SORT_FIELDS, {
      requested_at: 'desc',
    });
    if (!orderBy)
      throw new CodedHttpException(
        domainErrorCodes.groups.outputLinkInvalid,
        HttpStatus.BAD_REQUEST,
      );

    return this.prisma.$transaction(async (tx) => {
      const [access] = await tx.$queryRaw<
        { group_exists: boolean; is_member: boolean }[]
      >`
        SELECT
          EXISTS (SELECT 1 FROM research_groups g WHERE g.id = ${groupId}::uuid)
            AS group_exists,
          is_group_member(${callerId}::uuid, ${groupId}::uuid) AS is_member
      `;

      if (!access?.group_exists)
        throw new CodedHttpException(
          domainErrorCodes.groups.groupNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (!access.is_member)
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );

      const where = { group_id: groupId };
      const rows = await tx.group_output_links.findMany({
        where,
        orderBy: [orderBy, { output_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.group_output_links.count({ where });
      return {
        items: rows.map((row) => this.response(row)),
        meta: buildPaginationMeta(query, rows.length, total),
      };
    });
  }

  /**
   * Requests a link between a research output and a group.
   *
   * The link lands as `PENDING` — the group lead decides — unless the caller
   * may both manage the group and own the work, in which case the link is
   * created already `ACCEPTED`. A link that already exists is re-requested:
   * the requested revision moves on, and the accepted pin is preserved until
   * a fresh acceptance replaces it.
   */
  async request(
    groupId: string,
    dto: CreateGroupOutputLinkDto,
    callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.write(async (tx) => {
      const policy = await this.policy(
        tx,
        groupId,
        dto.outputId,
        dto.revisionId,
        callerId,
      );

      if (!policy.groupExists)
        throw new CodedHttpException(
          domainErrorCodes.groups.groupNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (!policy.sharingStatus)
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (policy.sharingStatus !== 'SHARED')
        throw new CodedHttpException(
          domainErrorCodes.groups.outputNotShared,
          HttpStatus.CONFLICT,
        );
      if (!policy.revisionReleased)
        throw new CodedHttpException(
          domainErrorCodes.groups.outputLinkInvalid,
          HttpStatus.BAD_REQUEST,
        );
      if (!policy.isResearcher || !policy.isMember || !policy.canView)
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );

      const now = await this.now(tx);
      const direct = policy.canManageGroup && policy.canManageOutput;

      const existing = await tx.group_output_links.findUnique({
        where: {
          output_id_group_id: { output_id: dto.outputId, group_id: groupId },
        },
      });

      if (existing) {
        // Nothing to request when the group already shows this revision, and
        // a second request for a revision that is already pending is a no-op
        // the caller should see as a conflict rather than as a silent reset.
        if (
          existing.status === GroupOutputStatus.ACCEPTED &&
          existing.accepted_revision_id === dto.revisionId
        )
          throw new CodedHttpException(
            domainErrorCodes.groups.outputLinkConflict,
            HttpStatus.CONFLICT,
          );
        if (
          existing.status === GroupOutputStatus.PENDING &&
          existing.requested_revision_id === dto.revisionId
        )
          throw new CodedHttpException(
            domainErrorCodes.groups.outputLinkConflict,
            HttpStatus.CONFLICT,
          );

        const row = await tx.group_output_links.update({
          where: {
            output_id_group_id: { output_id: dto.outputId, group_id: groupId },
          },
          data: direct
            ? {
                requested_revision_id: dto.revisionId,
                requested_by: callerId,
                requested_at: now,
                status: GroupOutputStatus.ACCEPTED,
                decided_by: callerId,
                decided_at: now,
                decision_note: dto.decisionNote ?? null,
                accepted_revision_id: dto.revisionId,
                accepted_by: callerId,
                accepted_at: now,
                removed_by: null,
                removed_at: null,
              }
            : {
                // A pending request never touches the accepted pin: the group
                // keeps showing the revision it accepted until a fresh
                // acceptance replaces it.
                requested_revision_id: dto.revisionId,
                requested_by: callerId,
                requested_at: now,
                status: GroupOutputStatus.PENDING,
                decided_by: null,
                decided_at: null,
                decision_note: dto.decisionNote ?? null,
                removed_by: null,
                removed_at: null,
              },
        });
        return this.response(row);
      }

      const row = await tx.group_output_links.create({
        data: {
          output_id: dto.outputId,
          group_id: groupId,
          requested_revision_id: dto.revisionId,
          requested_by: callerId,
          requested_at: now,
          status: direct
            ? GroupOutputStatus.ACCEPTED
            : GroupOutputStatus.PENDING,
          decided_by: direct ? callerId : null,
          decided_at: direct ? now : null,
          decision_note: dto.decisionNote ?? null,
          accepted_revision_id: direct ? dto.revisionId : null,
          accepted_by: direct ? callerId : null,
          accepted_at: direct ? now : null,
        },
      });
      return this.response(row);
    });
  }

  /**
   * Accepts or rejects a pending link request.
   *
   * Only the group lead may decide, and only a pending request can be
   * decided. Accepting pins the requested revision; rejecting preserves the
   * revision the group already shows.
   */
  async decide(
    groupId: string,
    outputId: string,
    dto: DecideGroupOutputLinkDto,
    callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.write(async (tx) => {
      const policy = await this.policy(tx, groupId, outputId, null, callerId);

      if (!policy.groupExists)
        throw new CodedHttpException(
          domainErrorCodes.groups.groupNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (!policy.canManageGroup)
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );

      const existing = await this.link(tx, groupId, outputId);

      if (existing.status !== GroupOutputStatus.PENDING)
        throw new CodedHttpException(
          domainErrorCodes.groups.outputLinkConflict,
          HttpStatus.CONFLICT,
        );

      const now = await this.now(tx);
      const accepted = dto.status === GroupOutputStatus.ACCEPTED;

      const row = await tx.group_output_links.update({
        where: {
          output_id_group_id: { output_id: outputId, group_id: groupId },
        },
        data: {
          status: dto.status,
          decided_by: callerId,
          decided_at: now,
          decision_note: dto.decisionNote ?? existing.decision_note,
          // Accepting pins the requested revision and clears the removal
          // markers; rejecting leaves the accepted pin untouched.
          ...(accepted
            ? {
                accepted_revision_id: existing.requested_revision_id,
                accepted_by: callerId,
                accepted_at: now,
                removed_by: null,
                removed_at: null,
              }
            : {}),
        },
      });
      return this.response(row);
    });
  }

  /**
   * Removes an accepted link from the group.
   *
   * The removal is a status transition to `REMOVED`, not a row delete: the
   * database refuses a real `DELETE`, and the group keeps its own record of
   * what it once showed. Only this group's pin is cleared — the work stays
   * visible and findable everywhere else.
   */
  async remove(
    groupId: string,
    outputId: string,
    callerId: string,
  ): Promise<GroupOutputLinkResponseDto> {
    return this.write(async (tx) => {
      const policy = await this.policy(tx, groupId, outputId, null, callerId);

      if (!policy.groupExists)
        throw new CodedHttpException(
          domainErrorCodes.groups.groupNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (!policy.canManageGroup)
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );

      const existing = await this.link(tx, groupId, outputId);

      if (existing.status !== GroupOutputStatus.ACCEPTED)
        throw new CodedHttpException(
          domainErrorCodes.groups.outputLinkConflict,
          HttpStatus.CONFLICT,
        );

      const now = await this.now(tx);

      const row = await tx.group_output_links.update({
        where: {
          output_id_group_id: { output_id: outputId, group_id: groupId },
        },
        data: {
          status: GroupOutputStatus.REMOVED,
          decided_by: callerId,
          decided_at: now,
          accepted_revision_id: null,
          accepted_by: null,
          accepted_at: null,
          removed_by: callerId,
          removed_at: now,
        },
      });
      return this.response(row);
    });
  }

  private async link(
    tx: Prisma.TransactionClient,
    groupId: string,
    outputId: string,
  ): Promise<LinkRow> {
    const existing = await tx.group_output_links.findUnique({
      where: {
        output_id_group_id: { output_id: outputId, group_id: groupId },
      },
    });
    if (!existing)
      throw new CodedHttpException(
        domainErrorCodes.groups.outputLinkNotFound,
        HttpStatus.NOT_FOUND,
      );
    return existing;
  }

  private async policy(
    tx: Prisma.TransactionClient,
    groupId: string,
    outputId: string,
    revisionId: string | null,
    callerId: string,
  ): Promise<LinkPolicy> {
    const [row] = await tx.$queryRaw<
      {
        group_exists: boolean;
        is_researcher: boolean;
        can_manage_group: boolean;
        is_member: boolean;
        can_view: boolean;
        can_manage_output: boolean;
        sharing_status: string | null;
        revision_released: boolean;
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM research_groups g WHERE g.id = ${groupId}::uuid)
          AS group_exists,
        is_researcher(${callerId}::uuid) AS is_researcher,
        can_manage_group(${callerId}::uuid, ${groupId}::uuid) AS can_manage_group,
        is_group_member(${callerId}::uuid, ${groupId}::uuid) AS is_member,
        can_view_output(${callerId}::uuid, ${outputId}::uuid) AS can_view,
        can_manage_output(${callerId}::uuid, ${outputId}::uuid) AS can_manage_output,
        (SELECT o.sharing_status FROM research_outputs o WHERE o.id = ${outputId}::uuid)
          AS sharing_status,
        (${revisionId}::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM output_revisions r
          WHERE r.id = ${revisionId}::uuid AND r.output_id = ${outputId}::uuid
            AND r.released_at IS NOT NULL
        )) AS revision_released
    `;

    return {
      groupExists: row?.group_exists ?? false,
      isResearcher: row?.is_researcher ?? false,
      canManageGroup: row?.can_manage_group ?? false,
      isMember: row?.is_member ?? false,
      canView: row?.can_view ?? false,
      canManageOutput: row?.can_manage_output ?? false,
      sharingStatus: row?.sharing_status ?? null,
      revisionReleased: row?.revision_released ?? false,
    };
  }

  private async now(tx: Prisma.TransactionClient): Promise<Date> {
    const [row] = await tx.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;
    return row.now;
  }

  /**
   * Runs a write and maps the database's refusals onto HTTP failures.
   *
   * The `guard_group_output` trigger refuses a malformed request with
   * `23514` just as it refuses a state conflict, so the message decides
   * which of the two it was.
   */
  private async write<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      const failure = readDatabaseFailure(error);
      if (failure?.sqlState === '23503')
        throw new CodedHttpException(
          domainErrorCodes.groups.outputLinkNotFound,
          HttpStatus.NOT_FOUND,
        );
      if (failure?.prismaCode === 'P2002' || failure?.sqlState === '23505')
        throw new CodedHttpException(
          domainErrorCodes.groups.outputLinkExists,
          HttpStatus.CONFLICT,
        );
      if (failure?.sqlState === CHECK_VIOLATION_SQL_STATE) {
        const malformed =
          failure.message.includes('released revision') ||
          failure.message.includes('New request must be pending');
        throw new CodedHttpException(
          malformed
            ? domainErrorCodes.groups.outputLinkInvalid
            : domainErrorCodes.groups.outputLinkConflict,
          malformed ? HttpStatus.BAD_REQUEST : HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private response(row: LinkRow): GroupOutputLinkResponseDto {
    return {
      outputId: row.output_id,
      groupId: row.group_id,
      status: row.status,
      requestedRevisionId: row.requested_revision_id,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at.toISOString(),
      decidedBy: row.decided_by,
      decidedAt: row.decided_at?.toISOString() ?? null,
      decisionNote: row.decision_note,
      acceptedRevisionId: row.accepted_revision_id,
      acceptedBy: row.accepted_by,
      acceptedAt: row.accepted_at?.toISOString() ?? null,
      removedBy: row.removed_by,
      removedAt: row.removed_at?.toISOString() ?? null,
    };
  }
}
