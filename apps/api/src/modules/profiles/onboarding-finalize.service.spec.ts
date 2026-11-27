import { HttpStatus } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityStatusEnum } from './dto/availability-status.enum.js';
import { OnboardingFinalizeService } from './onboarding-finalize.service.js';

/**
 * The finalize half of the onboarding.
 *
 * The wizard is a draft, so this is the one write that turns the
 * researcher's answers into stored rows. The tests below cover the
 * three things that can go wrong: an interest set that does not match
 * what was stored, an ORCID that belongs to somebody else, and a work
 * that OpenAlex no longer has.
 */
describe('OnboardingFinalizeService', () => {
  const userId = 'u0000000-0000-0000-0000-000000000001';
  const topicId = 'a0000000-0000-0000-0000-000000000001';
  const otherTopicId = 'a0000000-0000-0000-0000-000000000002';

  const storedUser = {
    id: userId,
    full_name: 'Nguyễn Văn A',
    email: 'nguyenvana@fpt.edu.vn',
    department_unit: 'Software Engineering',
    academic_title: 'PGS',
    academic_degree: 'TS',
    user_type: 'FACULTY',
    researcher_profiles: {
      user_id: userId,
      orcid_id: '0000-0002-1825-0097',
      scopus_author_id: null,
      google_scholar_url: null,
      availability_status: 'OPEN_FOR_COLLABORATION',
      bio: 'A bio.',
      avatar_storage_key: null,
      profile_confirmed_at: null,
      papers_reviewed_at: null,
      onboarding_completed_at: new Date('2026-11-27T12:00:00.000Z'),
      last_synced_at: null,
      llkh_last_exported_at: null,
      updated_at: new Date('2026-11-27T12:00:00.000Z'),
    },
  };

  const createPrismaMock = () => {
    const prismaMock = {
      users: {
        update: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      researcher_profiles: {
        upsert: vi.fn(),
      },
      research_interests: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      research_topics: {
        findMany: vi.fn(),
      },
    };

    return Object.assign(prismaMock, {
      $transaction: vi.fn(async (run: (client: unknown) => unknown) =>
        run(prismaMock),
      ),
    });
  };

  const createPullMock = () => ({
    pullDecidedWorks: vi.fn().mockResolvedValue({
      mode: 'AUTHOR_ID',
      authorId: 'A5023888391',
      outputIds: new Map<string, string>(),
      skipped: [],
    }),
  });

  const createCandidatesMock = () => ({
    accept: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
  });

  const setupService = (
    prismaMock: ReturnType<typeof createPrismaMock>,
    pullMock = createPullMock(),
    candidatesMock = createCandidatesMock(),
  ) => {
    const service = new OnboardingFinalizeService(
      prismaMock as unknown as PrismaService,
      pullMock as never,
      candidatesMock as never,
    );
    return { service, pullMock, candidatesMock };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('the interests', () => {
    it('refuses an empty interest set', async () => {
      const prismaMock = createPrismaMock();
      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, { topicIds: [] }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: domainErrorCodes.profiles.onboardingRequiresInterest,
        }),
      );
    });

    it('refuses a topic that does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([]);
      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, { topicIds: [topicId] }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: domainErrorCodes.interests.topicNotFound,
        }),
      );
    });

    it('refuses a topic that is retired', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: false },
      ]);
      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, { topicIds: [topicId] }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: domainErrorCodes.interests.topicInactive,
        }),
      );
    });

    it('declares a topic that has no stored interest', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const { service } = setupService(prismaMock);
      await service.finalize(userId, { topicIds: [topicId] });

      expect(prismaMock.research_interests.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: userId,
          topic_id: topicId,
          source_type: 'DECLARED',
          status: 'ACTIVE',
          provenance_tag: 'HUMAN',
        }),
      });
    });

    it('rejects a stored active interest the researcher removed', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([
        { id: 'i1', topic_id: topicId, status: 'ACTIVE' },
        { id: 'i2', topic_id: otherTopicId, status: 'ACTIVE' },
      ]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const { service } = setupService(prismaMock);
      await service.finalize(userId, { topicIds: [topicId] });

      // The interest the researcher kept is left alone; the one they
      // removed is rejected rather than deleted.
      expect(prismaMock.research_interests.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.research_interests.update).toHaveBeenCalledWith({
        where: { id: 'i2' },
        data: expect.objectContaining({ status: 'REJECTED' }),
      });
    });

    it('brings a rejected interest back to life', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([
        { id: 'i1', topic_id: topicId, status: 'REJECTED' },
      ]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const { service } = setupService(prismaMock);
      await service.finalize(userId, { topicIds: [topicId] });

      expect(prismaMock.research_interests.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
      expect(prismaMock.research_interests.create).not.toHaveBeenCalled();
    });
  });

  describe('the profile', () => {
    beforeEach(() => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);
    });

    it('records the confirmed OpenAlex author', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const { service } = setupService(prismaMock);
      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'https://openalex.org/A5023888391',
      });

      expect(prismaMock.researcher_profiles.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            openalex_author_id: 'A5023888391',
          }),
        }),
      );
    });

    it('refuses an ORCID another researcher already holds', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const constraint = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      prismaMock.researcher_profiles.upsert.mockRejectedValue(constraint);

      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, {
          topicIds: [topicId],
          orcidId: '0000-0002-1825-0097',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.profiles.orcidAlreadyClaimed,
        }),
      );
    });

    it('stamps the completion on the profile', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const { service } = setupService(prismaMock);
      await service.finalize(userId, { topicIds: [topicId] });

      expect(prismaMock.researcher_profiles.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            onboarding_completed_at: expect.any(Date),
          }),
        }),
      );
    });  });

  describe('the works', () => {
    it('pulls only the works the researcher decided on', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const pullMock = createPullMock();
      const { service } = setupService(prismaMock, pullMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'A5023888391',
        works: [
          { workId: 'W2741809807', accepted: true, visibility: 'PRIVATE' },
          { workId: 'W1234567890', accepted: false },
        ],
      });

      expect(pullMock.pullDecidedWorks).toHaveBeenCalledWith(
        userId,
        ['W2741809807', 'W1234567890'],
        'A5023888391',
      );
    });

    it('accepts the accepted works and rejects the rejected ones', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const pullMock = createPullMock();
      pullMock.pullDecidedWorks.mockResolvedValue({
        mode: 'AUTHOR_ID',
        authorId: 'A5023888391',
        outputIds: new Map([
          ['W2741809807', 'out-1'],
          ['W1234567890', 'out-2'],
        ]),
        skipped: [],
      });
      const candidatesMock = createCandidatesMock();
      const { service } = setupService(prismaMock, pullMock, candidatesMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        works: [
          { workId: 'W2741809807', accepted: true, visibility: 'PRIVATE' },
          { workId: 'W1234567890', accepted: false },
        ],
      });

      expect(candidatesMock.accept).toHaveBeenCalledWith(userId, 'out-1', {
        visibility: 'PRIVATE',
      });
      expect(candidatesMock.reject).toHaveBeenCalledWith(userId, 'out-2');
    });

    it('skips a work the pull could not fetch', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const pullMock = createPullMock();
      pullMock.pullDecidedWorks.mockResolvedValue({
        mode: 'AUTHOR_ID',
        authorId: 'A5023888391',
        outputIds: new Map(),
        skipped: ['W999'],
      });
      const candidatesMock = createCandidatesMock();
      const { service } = setupService(prismaMock, pullMock, candidatesMock);

      // A stale work must not fail the whole finalize.
      await expect(
        service.finalize(userId, {
          topicIds: [topicId],
          works: [{ workId: 'W999', accepted: true }],
        }),
      ).resolves.toBeDefined();

      expect(candidatesMock.accept).not.toHaveBeenCalled();
      expect(candidatesMock.reject).not.toHaveBeenCalled();
    });

    it('does not pull anything when no work was decided on', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const pullMock = createPullMock();
      const { service } = setupService(prismaMock, pullMock);

      await service.finalize(userId, { topicIds: [topicId] });

      expect(pullMock.pullDecidedWorks).not.toHaveBeenCalled();
    });
  });
});
