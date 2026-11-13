import 'reflect-metadata';
import {
  BadRequestException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { GroupMemberRole, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  AddGroupMemberDto,
  UpdateGroupMemberDto,
} from './dto/group-member.dto.js';
import { GroupMembersService } from './group-members.service.js';

const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const leadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const callerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const joinedAt = new Date('2026-11-09T00:00:00Z');

/**
 * The joined account row of a member, with the optional profile row.
 *
 * The roster carries the display data, so the group hub renders a member
 * list without an N+1 walk over the profile endpoints.
 */
function memberUser(overrides: Record<string, unknown> = {}) {
  return {
    id: userId,
    full_name: 'Nguyễn Văn A',
    email: 'nguyenvana@fpt.edu.vn',
    department_unit: 'Software Engineering',
    academic_title: 'PGS',
    academic_degree: 'TS',
    user_type: 'FACULTY',
    ...overrides,
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    group_id: groupId,
    user_id: userId,
    role: GroupMemberRole.MEMBER,
    joined_at: joinedAt,
    users: memberUser(),
    researcher_profiles: null,
    ...overrides,
  };
}

function setup() {
  const group = {
    id: groupId,
    lead_id: leadId,
    is_active: true,
    archived_at: null,
  };
  const row = memberRow();
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: groupId }]),
    research_groups: { findUnique: vi.fn().mockResolvedValue(group) },
    users: { findUnique: vi.fn().mockResolvedValue({ id: userId }) },
    group_members: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row),
      update: vi
        .fn()
        .mockResolvedValue({ ...row, role: GroupMemberRole.GROUP_LEADER }),
      delete: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const service = new GroupMembersService(prisma as unknown as PrismaService);
  return { service, tx, group };
}

describe('Group membership policies', () => {
  const dto = { userId, role: GroupMemberRole.MEMBER };

  it('allows the lead to add a member and returns the join timestamp', async () => {
    const { service, tx } = setup();
    await expect(service.add(groupId, dto, leadId)).resolves.toEqual({
      groupId,
      userId,
      role: dto.role,
      joinedAt: joinedAt.toISOString(),
      fullName: 'Nguyễn Văn A',
      email: 'nguyenvana@fpt.edu.vn',
      departmentUnit: 'Software Engineering',
      academicTitle: 'PGS',
      academicDegree: 'TS',
      userType: 'FACULTY',
      avatarStorageKey: null,
      bio: null,
    });
    expect(tx.group_members.create).toHaveBeenCalledWith({
      data: { group_id: groupId, user_id: userId, role: dto.role },
      include: { users: { include: { researcher_profiles: true } } },
    });
    expect(tx.$queryRaw).toHaveBeenCalledBefore(tx.group_members.create);
  });

  it('returns the member display data the group hub renders', async () => {
    const { service, tx } = setup();
    tx.group_members.findMany.mockResolvedValue([
      memberRow({
        users: memberUser({
          full_name: 'Trần Thị B',
          email: 'tranthib@fpt.edu.vn',
          department_unit: 'AI Lab',
          academic_title: null,
          academic_degree: null,
          user_type: 'STUDENT',
        }),
      }),
    ]);

    const result = await service.findAll(
      groupId,
      new PaginationQueryDto(),
      callerId,
    );

    expect(result.items[0]).toMatchObject({
      userId,
      fullName: 'Trần Thị B',
      email: 'tranthib@fpt.edu.vn',
      departmentUnit: 'AI Lab',
      academicTitle: null,
      academicDegree: null,
      userType: 'STUDENT',
      avatarStorageKey: null,
      bio: null,
    });
  });

  it('carries the avatar and bio of a member that has a profile', async () => {
    const { service, tx } = setup();
    tx.group_members.findMany.mockResolvedValue([
      memberRow({
        users: {
          ...memberUser(),
          researcher_profiles: {
            avatar_storage_key: 'avatars/abc.png',
            bio: 'Researcher on distributed systems.',
          },
        },
      }),
    ]);

    const result = await service.findAll(
      groupId,
      new PaginationQueryDto(),
      callerId,
    );

    expect(result.items[0]).toMatchObject({
      avatarStorageKey: 'avatars/abc.png',
      bio: 'Researcher on distributed systems.',
    });
  });

  it('lists a member without a profile row instead of failing', async () => {
    const { service, tx } = setup();
    tx.group_members.findMany.mockResolvedValue([
      memberRow({ users: { ...memberUser(), researcher_profiles: null } }),
    ]);

    const result = await service.findAll(
      groupId,
      new PaginationQueryDto(),
      callerId,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      fullName: 'Nguyễn Văn A',
      avatarStorageKey: null,
      bio: null,
    });
  });

  it('allows a group leader to change another member role', async () => {
    const { service, tx } = setup();
    tx.group_members.findUnique.mockResolvedValue({
      role: GroupMemberRole.GROUP_LEADER,
    });
    await expect(
      service.update(
        groupId,
        userId,
        { role: GroupMemberRole.GROUP_LEADER },
        callerId,
      ),
    ).resolves.toMatchObject({ role: GroupMemberRole.GROUP_LEADER });
    expect(tx.group_members.update).toHaveBeenCalledWith({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { role: GroupMemberRole.GROUP_LEADER },
      include: { users: { include: { researcher_profiles: true } } },
    });
  });

  it.each([null, { role: GroupMemberRole.MEMBER }])(
    'rejects membership writes by a non-manager: %j',
    async (membership) => {
      const { service, tx } = setup();
      tx.group_members.findUnique.mockResolvedValue(membership);
      await expect(service.add(groupId, dto, callerId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.groups.accessDenied,
      });
      await expect(
        service.update(groupId, userId, dto, callerId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.groups.accessDenied,
      });
      await expect(
        service.remove(groupId, userId, callerId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.groups.accessDenied,
      });
      expect(tx.group_members.create).not.toHaveBeenCalled();
      expect(tx.group_members.update).not.toHaveBeenCalled();
      expect(tx.group_members.delete).not.toHaveBeenCalled();
    },
  );

  it('rejects self-addition even with uppercase UUIDs', async () => {
    const { service, tx } = setup();
    await expect(
      service.add(
        groupId,
        { ...dto, userId: leadId.toUpperCase() },
        leadId.toUpperCase(),
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.groups.accessDenied,
    });
    expect(tx.group_members.create).not.toHaveBeenCalled();
  });

  it('rejects removal of the active lead even with uppercase UUIDs', async () => {
    const { service, tx } = setup();
    await expect(
      service.remove(groupId, leadId.toUpperCase(), leadId),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.groups.leadRemovalDenied,
    });
    expect(tx.group_members.delete).not.toHaveBeenCalled();
  });

  it('allows removal of the lead membership once the group is inactive', async () => {
    const { service, tx, group } = setup();
    group.is_active = false;
    await service.remove(groupId, leadId, leadId);
    expect(tx.group_members.delete).toHaveBeenCalled();
  });

  it('removes an ordinary membership', async () => {
    const { service, tx } = setup();
    await expect(
      service.remove(groupId, userId, leadId),
    ).resolves.toBeUndefined();
    expect(tx.group_members.delete).toHaveBeenCalledWith({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
  });

  it('returns 404 for a missing group without reading its members', async () => {
    const { service, tx } = setup();
    tx.research_groups.findUnique.mockResolvedValue(null);
    await expect(service.add(groupId, dto, leadId)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: domainErrorCodes.groups.groupNotFound,
    });
    expect(tx.group_members.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    const { service, tx } = setup();
    tx.users.findUnique.mockResolvedValue(null);
    await expect(service.add(groupId, dto, leadId)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: domainErrorCodes.groups.memberNotFound,
    });
    expect(tx.group_members.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate composite key to 409', async () => {
    const { service, tx } = setup();
    tx.group_members.create.mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed',
    });
    await expect(service.add(groupId, dto, leadId)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: domainErrorCodes.groups.memberAlreadyExists,
    });
  });

  it.each(['update', 'remove'] as const)(
    'maps a missing membership to 404 for %s',
    async (operation) => {
      const { service, tx } = setup();
      tx.group_members.update.mockRejectedValue({
        code: 'P2025',
        message: 'Record not found',
      });
      tx.group_members.delete.mockRejectedValue({
        code: 'P2025',
        message: 'Record not found',
      });
      const result =
        operation === 'update'
          ? service.update(groupId, userId, dto, leadId)
          : service.remove(groupId, userId, leadId);
      await expect(result).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: domainErrorCodes.groups.memberNotFound,
      });
    },
  );

  it.each(Object.values(GroupMemberRole))(
    'allows a %s to read the member list',
    async (role) => {
      const { service, tx } = setup();
      tx.group_members.findUnique.mockResolvedValue({ role });
      const result = await service.findAll(
        groupId,
        new PaginationQueryDto(),
        callerId,
      );
      expect(result.items).toHaveLength(1);
      expect(result.meta).toMatchObject({ page: 1, total: 1 });
    },
  );

  it('lets any signed-in researcher read the roster of an active group', async () => {
    const { service, tx } = setup();
    const result = await service.findAll(
      groupId,
      new PaginationQueryDto(),
      callerId,
    );
    expect(result.items).toHaveLength(1);
    expect(tx.group_members.findMany).toHaveBeenCalled();
  });

  it('denies an outsider the roster of an archived group', async () => {
    const { service, tx, group } = setup();
    group.archived_at = new Date('2026-11-09T00:00:00Z');
    await expect(
      service.findAll(groupId, new PaginationQueryDto(), callerId),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.groups.accessDenied,
    });
    expect(tx.group_members.findMany).not.toHaveBeenCalled();
  });

  it('denies an outsider the roster of an inactive group', async () => {
    const { service, tx, group } = setup();
    group.is_active = false;
    await expect(
      service.findAll(groupId, new PaginationQueryDto(), callerId),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.groups.accessDenied,
    });
    expect(tx.group_members.findMany).not.toHaveBeenCalled();
  });

  it('allows the lead without a membership row to read a sorted page', async () => {
    const { service, tx } = setup();
    await service.findAll(
      groupId,
      { page: 2, limit: 5, sort: '-joinedAt' },
      leadId,
    );
    expect(tx.group_members.findMany).toHaveBeenCalledWith({
      where: { group_id: groupId },
      skip: 5,
      take: 5,
      orderBy: [{ joined_at: 'desc' }, { user_id: 'asc' }],
      include: { users: { include: { researcher_profiles: true } } },
    });
  });

  it('rejects unknown sort fields', async () => {
    const { service } = setup();
    await expect(
      service.findAll(groupId, { page: 1, limit: 5, sort: 'secret' }, leadId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([
    { userId: 'invalid', role: 'GROUP_LEADER' },
    { userId, role: 'ADMIN' },
    { userId },
    { userId, role: null },
  ])('rejects invalid add payload %j', async (payload) => {
    await expect(
      pipe.transform(payload, { type: 'body', metatype: AddGroupMemberDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects changing the target user through the update body', async () => {
    await expect(
      pipe.transform(dto, { type: 'body', metatype: UpdateGroupMemberDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
