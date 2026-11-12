import {
  BadRequestException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../identity/access.service.js';
import { ListResearchGroupsQueryDto } from './dto/list-research-groups.query.dto.js';
import { UpdateResearchGroupDto } from './dto/update-research-group.dto.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

describe('GroupsController', () => {
  const leadId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const outsiderId = '33333333-3333-4333-8333-333333333333';
  const groupId = '77777777-7777-4777-8777-777777777777';

  const mockLeadUser = {
    id: leadId,
    email: 'lead@fpt.edu.vn',
    full_name: 'Dr. Lead',
    user_type: 'FACULTY',
    department_unit: 'Software Engineering',
    is_active: true,
  };

  const mockGroup = {
    id: groupId,
    code: 'AI-LAB',
    name: 'Artificial Intelligence Lab',
    lead_id: leadId,
    description: 'Deep learning and NLP research.',
    is_active: true,
    archived_at: null,
    created_at: new Date('2026-11-07T08:00:00.000Z'),
    updated_at: new Date('2026-11-07T08:00:00.000Z'),
  };

  const createPrismaMock = () => ({
    users: {
      findUnique: vi.fn(),
    },
    research_groups: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    group_members: {
      findUnique: vi.fn(),
    },
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
      controllers: [GroupsController],
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AccessService, useValue: accessServiceMock },
      ],
    }).compile();

    return moduleRef.get<GroupsController>(GroupsController);
  };

  describe('create', () => {
    it('creates a group and defaults leadId to the authenticated caller when omitted', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockLeadUser);
      prismaMock.research_groups.findFirst.mockResolvedValue(null);
      prismaMock.research_groups.create.mockResolvedValue(mockGroup);

      const controller = await setupController(prismaMock);
      const result = await controller.create(
        {
          code: '  AI-LAB  ',
          name: '  Artificial Intelligence Lab  ',
          description: '  Deep learning and NLP research.  ',
        },
        leadId,
      );

      expect(result.id).toBe(groupId);
      expect(result.code).toBe('AI-LAB');
      expect(result.leadId).toBe(leadId);
      expect(prismaMock.research_groups.create).toHaveBeenCalledWith({
        data: {
          code: 'AI-LAB',
          name: 'Artificial Intelligence Lab',
          lead_id: leadId,
          description: 'Deep learning and NLP research.',
        },
      });
    });

    it('throws 404 user_not_found when explicit leadId does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.create(
          {
            code: 'AI-LAB',
            name: 'AI Lab',
            leadId: '99999999-9999-4999-8999-999999999999',
          },
          leadId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.identity.userNotFound,
        }),
      );
    });

    it('throws 400 group_leader_ineligible when designated leader is not an active researcher', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockLeadUser);
      const accessMock = createAccessServiceMock();
      accessMock.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });

      const controller = await setupController(prismaMock, accessMock);

      await expect(
        controller.create(
          {
            code: 'AI-LAB',
            name: 'AI Lab',
            leadId,
          },
          leadId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: domainErrorCodes.groups.groupLeaderIneligible,
        }),
      );
    });

    it('throws 409 group_code_already_exists on duplicate group code', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockLeadUser);
      prismaMock.research_groups.findFirst.mockResolvedValue(mockGroup);

      const controller = await setupController(prismaMock);

      await expect(
        controller.create(
          {
            code: 'AI-LAB',
            name: 'Duplicate Code Group',
          },
          leadId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.groups.groupCodeAlreadyExists,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('scopes results to public active groups, led groups, and member groups', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_groups.count.mockResolvedValue(1);
      prismaMock.research_groups.findMany.mockResolvedValue([mockGroup]);

      const controller = await setupController(prismaMock);
      const result = await controller.findAll(
        { page: 1, limit: 20, sort: 'name' },
        memberId,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(groupId);
      expect(prismaMock.research_groups.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
          where: {
            AND: [
              {
                OR: [
                  { is_active: true, archived_at: null },
                  { lead_id: memberId },
                  { group_members: { some: { user_id: memberId } } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('rejects invalid sort keys with 400 and preserves isActive=false under ValidationPipe', async () => {
      const prismaMock = createPrismaMock();
      const controller = await setupController(prismaMock);

      await expect(
        controller.findAll({ sort: 'unknownColumn' }, leadId),
      ).rejects.toThrow(BadRequestException);

      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      });

      const transformed = await pipe.transform(
        { isActive: 'false' },
        { type: 'query', metatype: ListResearchGroupsQueryDto },
      );
      expect(transformed.isActive).toBe(false);
    });
  });

  describe('findOne', () => {
    it('returns a public active group to any authenticated caller', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_groups.findUnique.mockResolvedValue(mockGroup);

      const controller = await setupController(prismaMock);
      const result = await controller.findOne(groupId, outsiderId);

      expect(result.id).toBe(groupId);
      expect(result.isActive).toBe(true);
    });

    it('returns an archived group to its leader or member, but throws 403 for outsiders', async () => {
      const prismaMock = createPrismaMock();
      const archivedGroup = {
        ...mockGroup,
        is_active: false,
        archived_at: new Date('2026-11-07T12:00:00.000Z'),
      };
      prismaMock.research_groups.findUnique.mockResolvedValue(archivedGroup);

      const controller = await setupController(prismaMock);

      const leadView = await controller.findOne(groupId, leadId);
      expect(leadView.isActive).toBe(false);

      prismaMock.group_members.findUnique.mockResolvedValueOnce({
        group_id: groupId,
        user_id: memberId,
        role: 'COLLABORATOR',
      });
      const memberView = await controller.findOne(groupId, memberId);
      expect(memberView.id).toBe(groupId);

      prismaMock.group_members.findUnique.mockResolvedValueOnce(null);
      await expect(
        controller.findOne(groupId, outsiderId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.groups.accessDenied,
      });
    });

    it('throws 404 group_not_found when group does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_groups.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(controller.findOne(groupId, leadId)).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.groups.groupNotFound,
        }),
      );
    });
  });

  describe('update', () => {
    it('archives a group by setting is_active=false and archived_at', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_groups.findUnique.mockResolvedValue(mockGroup);
      const archivedAt = new Date('2026-11-07T15:00:00.000Z');
      prismaMock.research_groups.update.mockResolvedValue({
        ...mockGroup,
        is_active: false,
        archived_at: archivedAt,
      });

      const controller = await setupController(prismaMock);
      const result = await controller.update(
        groupId,
        { isActive: false },
        leadId,
      );

      expect(result.isActive).toBe(false);
      expect(result.archivedAt).toBe(archivedAt.toISOString());
      expect(prismaMock.research_groups.update).toHaveBeenCalledWith({
        where: { id: groupId },
        data: {
          is_active: false,
          archived_at: expect.any(Date),
        },
      });
    });

    it('throws 403 when a non-leader non-admin attempts to update the group', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_groups.findUnique.mockResolvedValue(mockGroup);

      const controller = await setupController(prismaMock);

      await expect(
        controller.update(groupId, { name: 'Unauthorized Edit' }, outsiderId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.groups.accessDenied,
      });
    });

    it('rejects explicit null for non-nullable fields (code, name, leadId, isActive) with 400', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      });

      for (const payload of [
        { code: null },
        { name: null },
        { leadId: null },
        { isActive: null },
      ]) {
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: UpdateResearchGroupDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }

      const validPartial = await pipe.transform(
        { name: 'Updated Lab Name', description: null },
        { type: 'body', metatype: UpdateResearchGroupDto },
      );
      expect(validPartial.name).toBe('Updated Lab Name');
      expect(validPartial.description).toBeNull();
    });
  });
});
