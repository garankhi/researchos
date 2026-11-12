import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { GroupMemberRole, Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  buildPaginationMeta,
  PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import type {
  AddGroupMemberDto,
  GroupMemberPageDto,
  GroupMemberResponseDto,
  UpdateGroupMemberDto,
} from './dto/group-member.dto.js';

type MemberRow = Prisma.group_membersGetPayload<Record<string, never>>;

@Injectable()
export class GroupMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    groupId: string,
    query: PaginationQueryDto,
    callerId: string,
  ): Promise<GroupMemberPageDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, groupId, callerId, false);
      const orderBy = parseSortParam(
        query.sort,
        { joinedAt: 'joined_at', role: 'role', userId: 'user_id' } as const,
        { joined_at: 'asc' },
      );
      if (!orderBy) throw new BadRequestException('validation_failed');
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const where = { group_id: groupId };
      const total = await tx.group_members.count({ where });
      const rows = await tx.group_members.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [orderBy, { user_id: 'asc' }],
      });
      const items = rows.map((row) => this.toResponse(row));
      return {
        items,
        meta: buildPaginationMeta({ page, limit }, items.length, total),
      };
    });
  }

  async add(
    groupId: string,
    dto: AddGroupMemberDto,
    callerId: string,
  ): Promise<GroupMemberResponseDto> {
    return this.write(async (tx) => {
      await this.authorize(tx, groupId, callerId, true);
      if (dto.userId.toLowerCase() === callerId.toLowerCase())
        throw new CodedHttpException(
          domainErrorCodes.groups.accessDenied,
          HttpStatus.FORBIDDEN,
        );
      const user = await tx.users.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      });
      if (!user)
        throw new CodedHttpException(
          domainErrorCodes.groups.memberNotFound,
          HttpStatus.NOT_FOUND,
        );
      const row = await tx.group_members.create({
        data: { group_id: groupId, user_id: dto.userId, role: dto.role },
      });
      return this.toResponse(row);
    });
  }

  async update(
    groupId: string,
    userId: string,
    dto: UpdateGroupMemberDto,
    callerId: string,
  ): Promise<GroupMemberResponseDto> {
    return this.write(async (tx) => {
      await this.authorize(tx, groupId, callerId, true);
      const row = await tx.group_members.update({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        data: { role: dto.role },
      });
      return this.toResponse(row);
    });
  }

  async remove(
    groupId: string,
    userId: string,
    callerId: string,
  ): Promise<void> {
    await this.write(async (tx) => {
      const group = await this.authorize(tx, groupId, callerId, true);
      if (group.is_active && group.lead_id === userId.toLowerCase())
        throw new CodedHttpException(
          domainErrorCodes.groups.leadRemovalDenied,
          HttpStatus.FORBIDDEN,
        );
      await tx.group_members.delete({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      });
    });
  }

  private async authorize(
    tx: Prisma.TransactionClient,
    groupId: string,
    callerId: string,
    write: boolean,
  ) {
    // Serialize membership changes with each other and with lead/archive changes.
    // Readers hold a shared lock until the private member list has been read.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM research_groups WHERE id = ${groupId}::uuid ${write ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`,
    );
    const group = await tx.research_groups.findUnique({
      where: { id: groupId },
    });
    if (!group)
      throw new CodedHttpException(
        domainErrorCodes.groups.groupNotFound,
        HttpStatus.NOT_FOUND,
      );
    if (group.lead_id === callerId.toLowerCase()) return group;
    // The roster of an active group is public to any signed-in researcher, so
    // the group hub is not empty for an outsider. An archived or inactive
    // group keeps its private roster: only the lead and its members read it.
    const active = group.is_active && group.archived_at === null;
    if (!write && active) return group;
    const member = await tx.group_members.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: callerId } },
    });
    if (!member || (write && member.role !== GroupMemberRole.GROUP_LEADER))
      throw new CodedHttpException(
        domainErrorCodes.groups.accessDenied,
        HttpStatus.FORBIDDEN,
      );
    return group;
  }

  private async write<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      const failure = readDatabaseFailure(error);
      if (failure?.prismaCode === 'P2002' || failure?.sqlState === '23505')
        throw new CodedHttpException(
          domainErrorCodes.groups.memberAlreadyExists,
          HttpStatus.CONFLICT,
        );
      if (
        failure?.prismaCode === 'P2025' ||
        failure?.prismaCode === 'P2003' ||
        failure?.sqlState === '23503'
      )
        throw new CodedHttpException(
          domainErrorCodes.groups.memberNotFound,
          HttpStatus.NOT_FOUND,
        );
      throw error;
    }
  }

  private toResponse(row: MemberRow): GroupMemberResponseDto {
    return {
      groupId: row.group_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at.toISOString(),
    };
  }
}
