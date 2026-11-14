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

  /**
   * The profile row of a confirmed researcher.
   *
   * It is attached to the account as `researcher_profiles`, because that
   * is the optional one-to-one relation the service reads.
   */
  const confirmedProfile = {
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
  };

  const unconfirmedProfile = {
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
  };

  const mockConfirmedUser = {
    ...mockUser,
    researcher_profiles: confirmedProfile,
  };

  const mockUnconfirmedUser = {
    ...mockOtherUser,
    researcher_profiles: unconfirmedProfile,
  };

  /**
   * An account that has never had a profile row.
   *
   * The relation is optional, so this is a valid account — and the one
   * the seed leaves every dev account in.
   */
  const mockUserWithoutProfile = {
    ...mockUser,
    researcher_profiles: null,
  };

  const createPrismaMock = () => {
    const prismaMock = {
      users: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      researcher_profiles: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      research_interests: {
        findMany: vi.fn(),
      },
    };

    // The service writes the profile and the account in one transaction, so
    // the mock hands the same client to the callback the way Prisma does.
    return Object.assign(prismaMock, {
      $transaction: vi.fn(async (run: (client: unknown) => unknown) =>
        run(prismaMock),
      ),
    });
  };

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
      prismaMock.users.findUnique.mockResolvedValue({
        ...mockUser,
        researcher_profiles: { ...unconfirmedProfile, user_id: callerId },
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

    it('returns the account fields when the user has no profile row', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUserWithoutProfile);

      const controller = await setupController(prismaMock);
      const result = await controller.getMyProfile(callerId);

      // The account is enough to answer: the name, the email and the
      // department come from `users`.
      expect(result.userId).toBe(callerId);
      expect(result.fullName).toBe('Nguyễn Văn A');
      expect(result.email).toBe('nguyenvana@fpt.edu.vn');
      expect(result.departmentUnit).toBe('Software Engineering');
      expect(result.academicTitle).toBe('PGS');
      expect(result.academicDegree).toBe('TS');
      expect(result.userType).toBe('FACULTY');

      // The profile-only fields are empty rather than missing.
      expect(result.bio).toBeNull();
      expect(result.orcidId).toBeNull();
      expect(result.googleScholarUrl).toBeNull();
      expect(result.scopusAuthorId).toBeNull();
      expect(result.profileConfirmedAt).toBeNull();
      expect(result.availabilityStatus).toBe(
        AvailabilityStatusEnum.NOT_AVAILABLE,
      );
    });

    it('throws 404 when the account does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

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
      prismaMock.users.findUnique.mockResolvedValue(mockConfirmedUser);

      const controller = await setupController(prismaMock);
      const result = await controller.getProfileById(callerId, otherUserId);

      expect(result.userId).toBe(callerId);
      expect(result.fullName).toBe('Nguyễn Văn A');
      expect(result.bio).toBe('Distributed systems researcher.');
      expect(result.orcidId).toBe('0000-0002-1825-0097');
      expect(result.profileConfirmedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(result.availabilityStatus).toBe(
        AvailabilityStatusEnum.OPEN_FOR_COLLABORATION,
      );
    });

    it('allows owner to view their own unconfirmed profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUnconfirmedUser);

      const controller = await setupController(prismaMock);
      const result = await controller.getProfileById(otherUserId, otherUserId);

      expect(result.userId).toBe(otherUserId);
      expect(result.profileConfirmedAt).toBeNull();
    });

    it('throws 403 when non-owner requests unconfirmed profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUnconfirmedUser);

      const controller = await setupController(prismaMock);

      await expect(
        controller.getProfileById(otherUserId, callerId),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
      );
    });

    it('throws 403 when non-owner requests a user without a profile row', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue({
        ...mockOtherUser,
        researcher_profiles: null,
      });

      const controller = await setupController(prismaMock);

      await expect(
        controller.getProfileById(otherUserId, callerId),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
      );
    });

    it('lets the owner read a user that has no profile row', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue({
        ...mockOtherUser,
        researcher_profiles: null,
      });

      const controller = await setupController(prismaMock);
      const result = await controller.getProfileById(otherUserId, otherUserId);

      expect(result.userId).toBe(otherUserId);
      expect(result.fullName).toBe('Trần Thị B');
      expect(result.bio).toBeNull();
    });

    it('throws 404 when target user does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

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
      prismaMock.users.findUniqueOrThrow.mockResolvedValue({
        ...mockConfirmedUser,
        researcher_profiles: {
          ...confirmedProfile,
          bio: 'Updated research focus.',
          availability_status: 'MENTORING_ONLY',
        },
      });
      prismaMock.researcher_profiles.upsert.mockResolvedValue({
        ...confirmedProfile,
        bio: 'Updated research focus.',
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
      expect(prismaMock.researcher_profiles.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: callerId },
          create: expect.objectContaining({
            user_id: callerId,
            bio: 'Updated research focus.',
          }),
          update: expect.objectContaining({
            bio: 'Updated research focus.',
            availability_status: AvailabilityStatusEnum.MENTORING_ONLY,
          }),
        }),
      );
    });

    it('creates the profile row when the user has none', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUniqueOrThrow.mockResolvedValue({
        ...mockUserWithoutProfile,
        researcher_profiles: {
          ...confirmedProfile,
          bio: 'A first bio.',
        },
      });
      prismaMock.researcher_profiles.upsert.mockResolvedValue({
        ...confirmedProfile,
        bio: 'A first bio.',
      });

      const controller = await setupController(prismaMock);
      await controller.updateMyProfile(callerId, { bio: 'A first bio.' });

      expect(prismaMock.researcher_profiles.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            user_id: callerId,
            bio: 'A first bio.',
          }),
        }),
      );
    });

    it('writes the account fields to users, not to the profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(mockConfirmedUser);
      prismaMock.researcher_profiles.upsert.mockResolvedValue(
        confirmedProfile,
      );

      const controller = await setupController(prismaMock);
      await controller.updateMyProfile(callerId, {
        fullName: 'Nguyễn Văn A',
        departmentUnit: 'Software Engineering',
        academicTitle: 'PGS',
        academicDegree: null,
      });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: callerId },
        data: {
          full_name: 'Nguyễn Văn A',
          department_unit: 'Software Engineering',
          academic_title: 'PGS',
          academic_degree: null,
        },
      });
      // The account fields never reach the profile table.
      expect(prismaMock.researcher_profiles.upsert).not.toHaveBeenCalled();
    });

    it('skips the users write when the payload carries no account field', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(mockConfirmedUser);
      prismaMock.researcher_profiles.upsert.mockResolvedValue(
        confirmedProfile,
      );

      const controller = await setupController(prismaMock);
      await controller.updateMyProfile(callerId, { bio: 'Only a bio.' });

      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('skips the profile write when the payload carries no profile field', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(mockConfirmedUser);

      const controller = await setupController(prismaMock);
      await controller.updateMyProfile(callerId, { fullName: 'New Name' });

      expect(prismaMock.researcher_profiles.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getInterestsByUserId', () => {
    const mockInterest = {
      id: 'i0000000-0000-0000-0000-000000000001',
      user_id: otherUserId,
      topic_id: 't0000000-0000-0000-0000-000000000001',
      source_type: 'DECLARED',
      status: 'ACTIVE',
      provenance_tag: 'HUMAN',
      evidence_note: null,
      declared_at: new Date('2026-11-01T09:00:00.000Z'),
      reviewed_at: new Date('2026-11-02T09:00:00.000Z'),
      research_topics: {
        id: 't0000000-0000-0000-0000-000000000001',
        name: 'Deep Learning',
        research_subfields: {
          id: 's0000000-0000-0000-0000-000000000001',
          name: 'Artificial Intelligence',
          research_fields: {
            id: 'f0000000-0000-0000-0000-000000000001',
            name: 'Computer Science',
          },
        },
      },
    };

    it('returns the interests with their taxonomy path', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue({
        ...mockOtherUser,
        researcher_profiles: {
          ...unconfirmedProfile,
          profile_confirmed_at: new Date('2026-11-01T09:00:00.000Z'),
        },
      });
      prismaMock.research_interests.findMany.mockResolvedValue([mockInterest]);

      const controller = await setupController(prismaMock);
      const result = await controller.getInterestsByUserId(
        otherUserId,
        callerId,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockInterest.id,
        userId: otherUserId,
        topicId: mockInterest.topic_id,
        status: 'ACTIVE',
        sourceType: 'DECLARED',
        topicPath: {
          topic: {
            id: 't0000000-0000-0000-0000-000000000001',
            name: 'Deep Learning',
          },
          subfield: {
            id: 's0000000-0000-0000-0000-000000000001',
            name: 'Artificial Intelligence',
          },
          field: {
            id: 'f0000000-0000-0000-0000-000000000001',
            name: 'Computer Science',
          },
        },
      });
    });

    it('refuses a non-owner when the profile is unconfirmed', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUnconfirmedUser);

      const controller = await setupController(prismaMock);

      await expect(
        controller.getInterestsByUserId(otherUserId, callerId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: domainErrorCodes.profiles.profileAccessDenied,
        }),
      );
      expect(prismaMock.research_interests.findMany).not.toHaveBeenCalled();
    });

    it('lets the owner read the interests of their own unconfirmed profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(mockUnconfirmedUser);
      prismaMock.research_interests.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock);

      await expect(
        controller.getInterestsByUserId(otherUserId, otherUserId),
      ).resolves.toEqual([]);
    });

    it('throws 404 when the target user does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.users.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.getInterestsByUserId('non-existent-user', callerId),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.profiles.profileNotFound,
        }),
      );
    });
  });
});
