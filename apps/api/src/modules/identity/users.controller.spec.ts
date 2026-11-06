import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from './access.service.js';
import { UserTypeEnum } from './dto/create-user.dto.js';
import { AccessRoleEnum } from './dto/grant-role.dto.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  const adminId = 'a0000000-0000-0000-0000-000000000001';
  const targetUserId = 'u0000000-0000-0000-0000-000000000002';

  const mockUser = {
    id: targetUserId,
    email: 'faculty@researchos.local',
    full_name: 'Nguyễn Văn A',
    user_type: 'FACULTY',
    department_unit: 'Software Engineering',
    fptu_guid: 'FPTU001',
    academic_title: 'PGS',
    academic_degree: 'TS',
    is_active: true,
    last_login_at: new Date('2026-11-06T10:00:00.000Z'),
    created_at: new Date('2026-11-01T08:00:00.000Z'),
    updated_at: new Date('2026-11-01T08:00:00.000Z'),
  };

  const mockRoleAssignment = {
    id: 'r0000000-0000-0000-0000-000000000001',
    user_id: targetUserId,
    role: 'ADMIN',
    grant_source: 'MANUAL',
    granted_by: adminId,
    granted_at: new Date('2026-11-06T12:00:00.000Z'),
    revoked_by: null,
    revoked_at: null,
    reason: 'Promoted to admin',
  };

  const createPrismaMock = () => ({
    users: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user_role_assignments: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  });

  const createAccessServiceMock = () => ({
    effectiveRoles: vi.fn().mockResolvedValue({
      isResearcher: true,
      isAdmin: false,
    }),
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
    accessServiceMock = createAccessServiceMock(),
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AccessService, useValue: accessServiceMock },
      ],
    }).compile();

    return moduleRef.get<UsersController>(UsersController);
  };

  describe('findAll', () => {
    it('returns a paginated list of users with effective roles', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.count.mockResolvedValue(1);
      prismaMock.users.findMany.mockResolvedValue([mockUser]);
      prismaMock.$queryRaw.mockResolvedValue([
        {
          user_id: targetUserId,
          is_researcher: true,
          is_admin: false,
        },
      ]);

      const controller = await setupController(prismaMock);
      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(targetUserId);
      expect(result.items[0].email).toBe('faculty@researchos.local');
      expect(result.items[0].roles).toEqual(['RESEARCHER']);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('filters users by search query and active status', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.count.mockResolvedValue(0);
      prismaMock.users.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock);
      const result = await controller.findAll({
        search: 'Nguyễn',
        isActive: true,
        userType: UserTypeEnum.FACULTY,
        departmentUnit: 'Software',
      });

      expect(result.items).toHaveLength(0);
      expect(prismaMock.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
            user_type: 'FACULTY',
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns user details with effective roles when found', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      const accessServiceMock = createAccessServiceMock();
      accessServiceMock.effectiveRoles.mockResolvedValue({
        isResearcher: true,
        isAdmin: true,
      });

      const controller = await setupController(prismaMock, accessServiceMock);
      const result = await controller.findOne(targetUserId);

      expect(result.id).toBe(targetUserId);
      expect(result.fullName).toBe('Nguyễn Văn A');
      expect(result.roles).toEqual(['RESEARCHER', 'ADMIN']);
    });

    it('throws 404 when user does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(controller.findOne('non-existent-id')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.userNotFound,
        }),
      );
    });
  });

  describe('create', () => {
    it('creates a new user with trimmed and normalized email', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findFirst.mockResolvedValue(null);
      prismaMock.users.findUnique.mockResolvedValue(null);
      prismaMock.users.create.mockResolvedValue({
        ...mockUser,
        email: 'newuser@fpt.edu.vn',
      });

      const controller = await setupController(prismaMock);
      const result = await controller.create({
        email: '  NewUser@fpt.edu.vn  ',
        fullName: 'New User',
        userType: UserTypeEnum.FACULTY,
        departmentUnit: 'Computer Science',
      });

      expect(result.email).toBe('newuser@fpt.edu.vn');
      expect(prismaMock.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newuser@fpt.edu.vn',
            full_name: 'New User',
          }),
        }),
      );
    });

    it('throws 409 when email is already registered', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findFirst.mockResolvedValue(mockUser);

      const controller = await setupController(prismaMock);

      await expect(
        controller.create({
          email: 'faculty@researchos.local',
          fullName: 'Duplicate',
          userType: UserTypeEnum.FACULTY,
          departmentUnit: 'Software',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.identity.emailAlreadyRegistered,
        }),
      );
    });

    it('throws 409 when institutional identifier exists', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findFirst.mockResolvedValue(null);
      prismaMock.users.findUnique.mockResolvedValue(mockUser);

      const controller = await setupController(prismaMock);

      await expect(
        controller.create({
          email: 'unique@fpt.edu.vn',
          fullName: 'Test',
          userType: UserTypeEnum.STUDENT,
          departmentUnit: 'Software',
          fptuGuid: 'FPTU001',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.identity.userAlreadyExists,
        }),
      );
    });
  });

  describe('update', () => {
    it('updates user attributes and returns updated profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      prismaMock.users.update.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });

      const controller = await setupController(prismaMock);
      const result = await controller.update(targetUserId, {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: targetUserId },
          data: { is_active: false },
        }),
      );
    });

    it('throws 404 when updating non-existent user', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.update('missing-id', { fullName: 'No one' }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.userNotFound,
        }),
      );
    });
  });

  describe('grantRole', () => {
    it('throws 400 when admin attempts self-grant', async () => {
      const prismaMock = createPrismaMock();
      const controller = await setupController(prismaMock);

      await expect(
        controller.grantRole(adminId, { role: AccessRoleEnum.ADMIN }, adminId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: domainErrorCodes.identity.cannotGrantSelfRole,
        }),
      );
    });

    it('throws 404 when target user does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.grantRole(
          targetUserId,
          { role: AccessRoleEnum.ADMIN },
          adminId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.userNotFound,
        }),
      );
    });

    it('throws 409 when user already has active role grant', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      prismaMock.user_role_assignments.findFirst.mockResolvedValue(
        mockRoleAssignment,
      );

      const controller = await setupController(prismaMock);

      await expect(
        controller.grantRole(
          targetUserId,
          { role: AccessRoleEnum.ADMIN },
          adminId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.identity.roleAlreadyGranted,
        }),
      );
    });

    it('grants role and returns assignment record', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      prismaMock.user_role_assignments.findFirst.mockResolvedValue(null);
      prismaMock.user_role_assignments.create.mockResolvedValue(
        mockRoleAssignment,
      );

      const controller = await setupController(prismaMock);
      const result = await controller.grantRole(
        targetUserId,
        { role: AccessRoleEnum.ADMIN, reason: 'Promoted to admin' },
        adminId,
      );

      expect(result.userId).toBe(targetUserId);
      expect(result.role).toBe('ADMIN');
      expect(result.grantedBy).toBe(adminId);
      expect(result.revokedAt).toBeNull();
    });
  });

  describe('revokeRole', () => {
    it('throws 404 when target user does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.revokeRole(targetUserId, AccessRoleEnum.ADMIN, {}, adminId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.userNotFound,
        }),
      );
    });

    it('throws 404 when no active role assignment exists', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      prismaMock.user_role_assignments.findFirst.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.revokeRole(targetUserId, AccessRoleEnum.ADMIN, {}, adminId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.roleNotGranted,
        }),
      );
    });

    it('revokes active role assignment and returns record', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUser);
      prismaMock.user_role_assignments.findFirst.mockResolvedValue(
        mockRoleAssignment,
      );
      const now = new Date('2026-11-06T14:00:00.000Z');
      prismaMock.user_role_assignments.update.mockResolvedValue({
        ...mockRoleAssignment,
        revoked_at: now,
        revoked_by: adminId,
        reason: 'Revoked by admin',
      });

      const controller = await setupController(prismaMock);
      const result = await controller.revokeRole(
        targetUserId,
        AccessRoleEnum.ADMIN,
        { reason: 'Revoked by admin' },
        adminId,
      );

      expect(result.revokedBy).toBe(adminId);
      expect(result.revokedAt).toBe(now.toISOString());
      expect(result.reason).toBe('Revoked by admin');
    });
  });
});
