import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  buildPaginationMeta,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import {
  CHECK_VIOLATION_SQL_STATE,
  readDatabaseFailure,
} from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { AccessService } from '../identity/access.service.js';
import type { CreateResearchGroupDto } from './dto/create-research-group.dto.js';
import type { ListResearchGroupsQueryDto } from './dto/list-research-groups.query.dto.js';
import type { PaginatedResearchGroupsResponseDto } from './dto/paginated-research-groups-response.dto.js';
import type { ResearchGroupResponseDto } from './dto/research-group-response.dto.js';
import type { UpdateResearchGroupDto } from './dto/update-research-group.dto.js';

type ResearchGroupRow = Prisma.research_groupsGetPayload<Record<string, never>>;

const GROUP_SORT_FIELDS = {
  name: 'name',
  code: 'code',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
} as const;

/**
 * Service managing research groups: creation, listing, detail retrieval,
 * editing, and soft-archiving.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
  ) {}

  /**
   * Creates a new research group.
   *
   * - Defaults `lead_id` to `callerId` when `dto.leadId` is omitted.
   * - Verifies that the designated lead exists (`404 user_not_found`) and is
   *   an active researcher (`400 group_leader_ineligible`).
   * - Enforces unique `code` (`409 group_code_already_exists`).
   */
  async create(
    dto: CreateResearchGroupDto,
    callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    const trimmedCode = dto.code.trim();
    const trimmedName = dto.name.trim();
    const targetLeadId = dto.leadId ?? callerId;

    await this.assertValidGroupLeader(targetLeadId);

    const existingCode = await this.prisma.research_groups.findFirst({
      where: {
        code: { equals: trimmedCode, mode: 'insensitive' },
      },
    });

    if (existingCode) {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupCodeAlreadyExists,
        HttpStatus.CONFLICT,
      );
    }

    try {
      const created = await this.prisma.research_groups.create({
        data: {
          code: trimmedCode,
          name: trimmedName,
          lead_id: targetLeadId,
          description:
            typeof dto.description === 'string'
              ? dto.description.trim() || null
              : null,
        },
      });

      return this.mapToResponse(created);
    } catch (error) {
      this.rethrowDatabaseConstraintError(error);
      throw error;
    }
  }

  /**
   * Lists research groups visible to the caller:
   * - Active, non-archived groups (`is_active = true AND archived_at IS NULL`) are public.
   * - Groups led by the caller (`lead_id = callerId`) or where the caller is a member
   *   (`group_members.user_id = callerId`) are also included regardless of archive state.
   */
  async findAll(
    query: ListResearchGroupsQueryDto,
    callerId: string,
  ): Promise<PaginatedResearchGroupsResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const orderBy = parseSortParam(query.sort, GROUP_SORT_FIELDS, {
      created_at: 'desc',
    });
    if (!orderBy) {
      throw new BadRequestException('validation_failed');
    }

    const andConditions: Prisma.research_groupsWhereInput[] = [
      {
        OR: [
          { is_active: true, archived_at: null },
          { lead_id: callerId },
          { group_members: { some: { user_id: callerId } } },
        ],
      },
    ];

    if (query.search?.trim()) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (query.leadId) {
      andConditions.push({ lead_id: query.leadId });
    }

    if (query.memberId) {
      // Prisma renders this as the same `EXISTS (SELECT 1 FROM group_members
      // WHERE group_id = ... AND user_id = ...)` the plan describes. It is a
      // filter, not a visibility grant: the public/lead/member clause above
      // still decides which groups the caller may see at all.
      andConditions.push({
        group_members: { some: { user_id: query.memberId } },
      });
    }

    if (query.isActive !== undefined) {
      andConditions.push({ is_active: query.isActive });
    }

    const where: Prisma.research_groupsWhereInput = { AND: andConditions };

    const [total, rows] = await Promise.all([
      this.prisma.research_groups.count({ where }),
      this.prisma.research_groups.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
    ]);

    const items = rows.map((row) => this.mapToResponse(row));

    return {
      items,
      meta: buildPaginationMeta({ page, limit }, items.length, total),
    };
  }

  /**
   * Retrieves a single research group by ID.
   *
   * - Throws `404 group_not_found` when the group does not exist.
   * - Throws `403 Forbidden` when the group is inactive/archived and the caller
   *   is neither the group lead nor a group member.
   */
  async findOne(
    groupId: string,
    callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    const group = await this.prisma.research_groups.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const isPublic = group.is_active && group.archived_at === null;
    if (!isPublic && group.lead_id !== callerId) {
      const membership = await this.prisma.group_members.findUnique({
        where: {
          group_id_user_id: {
            group_id: groupId,
            user_id: callerId,
          },
        },
      });

      if (!membership) {
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return this.mapToResponse(group);
  }

  /**
   * Updates research group attributes or archives/restores the group.
   *
   * - Throws `404 group_not_found` when the group does not exist.
   * - Throws `403 Forbidden` when the caller is neither the group lead (with active
   *   `RESEARCHER` access) nor an `ADMIN`.
   * - Setting `isActive: false` archives the group (`is_active = false`, `archived_at = now`).
   * - Setting `isActive: true` restores the group (`is_active = true`, `archived_at = null`).
   */
  async update(
    groupId: string,
    dto: UpdateResearchGroupDto,
    callerId: string,
  ): Promise<ResearchGroupResponseDto> {
    const existing = await this.prisma.research_groups.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const callerAccess = await this.accessService.effectiveRoles(callerId);
    const canManage =
      callerAccess.isAdmin ||
      (callerAccess.isResearcher && existing.lead_id === callerId);

    if (!canManage) {
      throw new CodedHttpException(
        domainErrorCodes.groups.accessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    const data: Prisma.research_groupsUpdateInput = {};

    if (dto.code !== undefined) {
      const trimmedCode = dto.code.trim();
      const codeConflict = await this.prisma.research_groups.findFirst({
        where: {
          id: { not: groupId },
          code: { equals: trimmedCode, mode: 'insensitive' },
        },
      });

      if (codeConflict) {
        throw new CodedHttpException(
          domainErrorCodes.groups.groupCodeAlreadyExists,
          HttpStatus.CONFLICT,
        );
      }

      data.code = trimmedCode;
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.leadId !== undefined) {
      await this.assertValidGroupLeader(dto.leadId);
      data.users = { connect: { id: dto.leadId } };
    }

    if (dto.description !== undefined) {
      data.description =
        typeof dto.description === 'string'
          ? dto.description.trim() || null
          : null;
    }

    if (dto.isActive !== undefined) {
      data.is_active = dto.isActive;
      data.archived_at = dto.isActive
        ? null
        : (existing.archived_at ?? new Date());
    }

    try {
      const updated = await this.prisma.research_groups.update({
        where: { id: groupId },
        data,
      });

      return this.mapToResponse(updated);
    } catch (error) {
      this.rethrowDatabaseConstraintError(error);
      throw error;
    }
  }

  /**
   * Ensures `userId` belongs to an existing account (`404 user_not_found`)
   * with active `RESEARCHER` access (`400 group_leader_ineligible`).
   */
  private async assertValidGroupLeader(userId: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const access = await this.accessService.effectiveRoles(userId);
    if (!access.isResearcher) {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupLeaderIneligible,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Maps Prisma/PostgreSQL unique and check constraint violations on
   * `research_groups` to domain `CodedHttpException`s.
   */
  private rethrowDatabaseConstraintError(error: unknown): void {
    if (error instanceof CodedHttpException) {
      throw error;
    }

    const failure = readDatabaseFailure(error);
    if (!failure) {
      return;
    }

    if (failure.prismaCode === 'P2002') {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupCodeAlreadyExists,
        HttpStatus.CONFLICT,
      );
    }

    if (failure.sqlState === CHECK_VIOLATION_SQL_STATE) {
      throw new CodedHttpException(
        domainErrorCodes.groups.groupLeaderIneligible,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private mapToResponse(group: ResearchGroupRow): ResearchGroupResponseDto {
    return {
      id: group.id,
      code: group.code,
      name: group.name,
      leadId: group.lead_id,
      description: group.description ?? null,
      isActive: group.is_active,
      archivedAt: group.archived_at?.toISOString() ?? null,
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    };
  }
}
