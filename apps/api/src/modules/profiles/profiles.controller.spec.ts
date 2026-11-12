import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilityStatusEnum } from './dto/availability-status.enum.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController', () => {
  const callerId = 'u0000000-0000-0000-0000-000000000001';
  const otherUserId = 'u0000000-0000-0000-0000-000000000002';

  const mockUser = {
    id: callerId,
    full_name: 'Nguyễn Văn A',
    email: 'nguyenvana@fpt.edu.vn',
    department_unit: 'Software Engineering',
    academic_title: 'PGS',
    academic_degree: 'TS',
    user_type: 'FACULTY',
    is_active: true,
  };

  const mockOtherUser = {
    id: otherUserId,
    full_name: 'Trần Thị B',
    email: 'tranthib@fpt.edu.vn',
    department_unit: 'Computer Science',
    academic_title: null,
    academic_degree: 'ThS',
    user_type: 'STAFF',
    is_active: true,
  };

  const mockConfirmedProfile = {
    user_id: callerId,
    orcid_id: '0000-0002-1825-0097',
    scopus_author_id: '57193294821',
    google_scholar_url: 'https://scholar.google.com/citations?user=example',
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Distributed systems researcher.',
    avatar_storage_key: 'avatars/u1.png',
    profile_confirmed_at: new Date('2026-11-06T10:00:00.000Z'),
    papers_reviewed_at: new Date('2026-11-06T10:30:00.000Z'),
    onboarding_completed_at: new Date('2026-11-06T11:00:00.000Z'),
    last_synced_at: null,
    llkh_last_exported_at: null,
    updated_at: new Date('2026-11-06T11:00:00.000Z'),
    users: mockUser,
  };

  const mockUnconfirmedProfile = {
    user_id: otherUserId,
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'NOT_AVAILABLE',
    bio: null,
    avatar_storage_key: null,
    profile_confirmed_at: null,
    papers_reviewed_at: null,
    onboarding_completed_at: null,
    last_synced_at: null,
    llkh_last_exported_at: null,
    updated_at: new Date('2026-11-06T11:00:00.000Z'),
    users: mockOtherUser,
  };

  const createPrismaMock = () => ({
    researcher_profiles: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    return moduleRef.get<ProfilesController>(ProfilesController);
  };

  describe('getMyProfile', () => {
    it('returns caller profile even if unconfirmed', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue({
        ...mockUnconfirmedProfile,
        user_id: callerId,
        users: mockUser,
      });

      const controller = await setupController(prismaMock);
      const result = await controller.getMyProfile(callerId);

      expect(result.userId).toBe(callerId);
      expect(result.fullName).toBe('Nguyễn Văn A');
      expect(result.profileConfirmedAt).toBeNull();
      expect(result.availabilityStatus).toBe(
        AvailabilityStatusEnum.NOT_AVAILABLE,
      );
    });

    it('throws 404 when profile does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(controller.getMyProfile('missing-id')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.profiles.profileNotFound,
        }),
      );
    });
  });

  describe('getProfileById', () => {
    it('returns confirmed profile to any authenticated user', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(
        mockConfirmedProfile,
      );

      const controller = await setupController(prismaMock);
      const result = await controller.getProfileById(callerId, otherUserId);

      expect(result.userId).toBe(callerId);
      expect(result.fullName).toBe('Nguyễn Văn A');
      expect(result.profileConfirmedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(result.availabilityStatus).toBe(
        AvailabilityStatusEnum.OPEN_FOR_COLLABORATION,
      );
    });

    it('allows owner to view their own unconfirmed profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(
        mockUnconfirmedProfile,
      );

      const controller = await setupController(prismaMock);
      const result = await controller.getProfileById(otherUserId, otherUserId);

      expect(result.userId).toBe(otherUserId);
      expect(result.profileConfirmedAt).toBeNull();
    });

    it('throws 403 when non-owner requests unconfirmed profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(
        mockUnconfirmedProfile,
      );

      const controller = await setupController(prismaMock);

      await expect(
        controller.getProfileById(otherUserId, callerId),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
      );
    });

    it('throws 404 when target profile does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.getProfileById('non-existent-user', callerId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.profiles.profileNotFound,
        }),
      );
    });
  });

  describe('updateMyProfile', () => {
    it('updates editable fields and returns updated profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(
        mockConfirmedProfile,
      );
      prismaMock.researcher_profiles.update.mockResolvedValue({
        ...mockConfirmedProfile,
        bio: 'Updated research focus.',
        availability_status: 'MENTORING_ONLY',
      });

      const controller = await setupController(prismaMock);
      const result = await controller.updateMyProfile(callerId, {
        bio: 'Updated research focus.',
        availabilityStatus: AvailabilityStatusEnum.MENTORING_ONLY,
      });

      expect(result.bio).toBe('Updated research focus.');
      expect(result.availabilityStatus).toBe(
        AvailabilityStatusEnum.MENTORING_ONLY,
      );
      expect(prismaMock.researcher_profiles.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: callerId },
          data: expect.objectContaining({
            bio: 'Updated research focus.',
            availability_status: 'MENTORING_ONLY',
          }),
        }),
      );
    });

    it('throws 404 when updating non-existent profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.researcher_profiles.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.updateMyProfile('missing-id', {
          bio: 'Test',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.profiles.profileNotFound,
        }),
      );
    });
  });
});
