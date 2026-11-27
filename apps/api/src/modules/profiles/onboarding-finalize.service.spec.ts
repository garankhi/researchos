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
      researcher_affiliations: {
        deleteMany: vi.fn(),
        create: vi.fn(),
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

  const createAuthorRecordsMock = () => ({
    trySyncAuthorRecord: vi.fn().mockResolvedValue(null),
  });

  const setupService = (
    prismaMock: ReturnType<typeof createPrismaMock>,
    pullMock = createPullMock(),
    candidatesMock = createCandidatesMock(),
    authorRecordsMock = createAuthorRecordsMock(),
  ) => {
    const service = new OnboardingFinalizeService(
      prismaMock as unknown as PrismaService,
      pullMock as never,
      candidatesMock as never,
      authorRecordsMock as never,
    );
    return { service, pullMock, candidatesMock, authorRecordsMock };
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

  describe('the OpenAlex author record', () => {
    it('stores the record of the confirmed author', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const authorRecordsMock = createAuthorRecordsMock();
      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'A5023888391',
      });

      expect(authorRecordsMock.trySyncAuthorRecord).toHaveBeenCalledWith(
        userId,
        'A5023888391',
      );
    });

    it('does not store a record when no author was confirmed', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const authorRecordsMock = createAuthorRecordsMock();
      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await service.finalize(userId, { topicIds: [topicId] });

      expect(authorRecordsMock.trySyncAuthorRecord).not.toHaveBeenCalled();
    });

    it('finishes the onboarding even when the record cannot be stored', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);

      const authorRecordsMock = createAuthorRecordsMock();
      /*
       * The record service swallows a failed fetch and reports it as
       * "nothing stored". The record is an enrichment: the researcher
       * came to confirm their author, and the profile is written
       * either way — a failed fetch must not take the onboarding down
       * with it.
       */
      authorRecordsMock.trySyncAuthorRecord.mockResolvedValue(null);
      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await expect(
        service.finalize(userId, {
          topicIds: [topicId],
          openAlexAuthorId: 'A5023888391',
        }),
      ).resolves.toBeDefined();
    });
  });

  /**
   * The affiliation timeline the researcher corrected.
   *
   * The affiliation rows are the one place where two writers meet: the
   * OpenAlex sync writes them from what OpenAlex reports, and the
   * onboarding writes them from what the researcher stated. The sync
   * replaces the caller's rows, so the order of the two writes decides
   * whose version survives — and the tests below pin that order down.
   */
  describe('the affiliations', () => {
    /**
     * A prisma mock whose affiliation rows are kept in an array, so a
     * test can look at what is stored when the finalize is done rather
     * than at which calls were made.
     */
    const createStatefulPrismaMock = () => {
      const prismaMock = createPrismaMock();
      const rows: Array<Record<string, unknown>> = [];

      prismaMock.researcher_affiliations.deleteMany.mockImplementation(
        async () => {
          rows.length = 0;
          return { count: 0 };
        },
      );
      prismaMock.researcher_affiliations.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => {
          rows.push(args.data);
          return args.data;
        },
      );

      return { prismaMock, rows };
    };

    const seedInterests = (prismaMock: ReturnType<typeof createPrismaMock>) => {
      prismaMock.research_topics.findMany.mockResolvedValue([
        { id: topicId, is_active: true },
      ]);
      prismaMock.research_interests.findMany.mockResolvedValue([]);
      prismaMock.users.findUniqueOrThrow.mockResolvedValue(storedUser);
    };

    it('writes the affiliations the researcher sent', async () => {
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        affiliations: [
          {
            institutionId: 'I109689652',
            name: 'FPT University',
            ror: '05dxps055',
            countryCode: 'VN',
            institutionType: 'EDUCATION',
            yearStart: 2020,
            yearEnd: null,
          },
        ],
      });

      expect(rows).toEqual([
        {
          user_id: userId,
          institution_id: 'I109689652',
          ror: '05dxps055',
          name: 'FPT University',
          country_code: 'VN',
          institution_type: 'EDUCATION',
          year_start: 2020,
          year_end: null,
          is_primary: true,
        },
      ]);
    });

    it('replaces the rows that were there', async () => {
      // The timeline is a full set, not a delta: the rows that are gone
      // are removed, exactly like the interests.
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        affiliations: [
          {
            institutionId: 'I109689652',
            name: 'FPT University',
            yearStart: 2020,
          },
        ],
      });

      expect(
        prismaMock.researcher_affiliations.deleteMany,
      ).toHaveBeenCalledWith({ where: { user_id: userId } });
      expect(rows).toHaveLength(1);
    });

    it('marks the affiliation the researcher is at now as the primary one', async () => {
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        affiliations: [
          {
            institutionId: 'I1',
            name: 'Old University',
            yearStart: 2010,
            yearEnd: 2019,
          },
          {
            institutionId: 'I2',
            name: 'Current University',
            yearStart: 2020,
            yearEnd: null,
          },
        ],
      });

      expect(rows.map((row) => [row.institution_id, row.is_primary])).toEqual([
        ['I1', false],
        ['I2', true],
      ]);
    });

    it("keeps the researcher's affiliations when the OpenAlex sync runs", async () => {
      /*
       * The regression this whole field exists for.
       *
       * The OpenAlex sync replaces the caller's affiliation rows with
       * the ones OpenAlex reports. The mock below does exactly that, so
       * if the researcher's affiliations were written *before* the sync,
       * this test would see OpenAlex's rows and fail.
       */
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const authorRecordsMock = createAuthorRecordsMock();
      authorRecordsMock.trySyncAuthorRecord.mockImplementation(async () => {
        // What the sync does: the caller's rows are deleted and the
        // ones OpenAlex reports are created in their place.
        rows.length = 0;
        rows.push({
          user_id: userId,
          institution_id: 'I-OPENALEX',
          ror: null,
          name: 'What OpenAlex Says',
          country_code: 'US',
          institution_type: 'EDUCATION',
          year_start: 2015,
          year_end: 2020,
          is_primary: true,
        });
        return null;
      });

      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'A5023888391',
        affiliations: [
          {
            institutionId: 'I109689652',
            name: 'FPT University',
            yearStart: 2020,
            yearEnd: null,
          },
        ],
      });

      // The researcher's row is the one that survives, not OpenAlex's.
      expect(rows).toEqual([
        {
          user_id: userId,
          institution_id: 'I109689652',
          ror: null,
          name: 'FPT University',
          country_code: null,
          institution_type: null,
          year_start: 2020,
          year_end: null,
          is_primary: true,
        },
      ]);
    });

    it('leaves the OpenAlex rows alone when no affiliation was sent', async () => {
      // A researcher who did not edit the timeline must not have their
      // rows touched: the OpenAlex sync is the only writer, as before.
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const authorRecordsMock = createAuthorRecordsMock();
      authorRecordsMock.trySyncAuthorRecord.mockImplementation(async () => {
        rows.push({
          user_id: userId,
          institution_id: 'I-OPENALEX',
          is_primary: true,
        });
        return null;
      });

      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'A5023888391',
      });

      expect(prismaMock.researcher_affiliations.create).not.toHaveBeenCalled();
      expect(
        prismaMock.researcher_affiliations.deleteMany,
      ).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });

    it('removes every row when the researcher cleared the timeline', async () => {
      /*
       * An empty list is not the same as an omitted field: an omitted
       * field means the researcher never touched the timeline, and an
       * empty one means they removed every affiliation on purpose. The
       * second is a decision, and the stored rows must go.
       */
      const { prismaMock, rows } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const authorRecordsMock = createAuthorRecordsMock();
      authorRecordsMock.trySyncAuthorRecord.mockImplementation(async () => {
        rows.push({
          user_id: userId,
          institution_id: 'I-OPENALEX',
          is_primary: true,
        });
        return null;
      });

      const { service } = setupService(
        prismaMock,
        createPullMock(),
        createCandidatesMock(),
        authorRecordsMock,
      );

      await service.finalize(userId, {
        topicIds: [topicId],
        openAlexAuthorId: 'A5023888391',
        affiliations: [],
      });

      expect(prismaMock.researcher_affiliations.deleteMany).toHaveBeenCalledWith(
        { where: { user_id: userId } },
      );
      expect(prismaMock.researcher_affiliations.create).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('refuses an affiliation that ends before it starts', async () => {
      const { prismaMock } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, {
          topicIds: [topicId],
          affiliations: [
            {
              institutionId: 'I109689652',
              name: 'FPT University',
              yearStart: 2020,
              yearEnd: 2019,
            },
          ],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: domainErrorCodes.profiles.onboardingAffiliationYearsInvalid,
        }),
      );
    });

    it('writes nothing when the affiliation years are refused', async () => {
      // The check runs before the first write, so a timeline that cannot
      // be stored never leaves a half-written onboarding behind.
      const { prismaMock } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await expect(
        service.finalize(userId, {
          topicIds: [topicId],
          affiliations: [
            {
              institutionId: 'I109689652',
              name: 'FPT University',
              yearStart: 2020,
              yearEnd: 2019,
            },
          ],
        }),
      ).rejects.toThrow();

      expect(prismaMock.researcher_profiles.upsert).not.toHaveBeenCalled();
      expect(prismaMock.research_interests.create).not.toHaveBeenCalled();
      expect(prismaMock.researcher_affiliations.create).not.toHaveBeenCalled();
    });

    it('still writes the account, the profile and the interests', async () => {
      // The new field must not change what the rest of the finalize
      // does.
      const { prismaMock } = createStatefulPrismaMock();
      seedInterests(prismaMock);

      const { service } = setupService(prismaMock);

      await service.finalize(userId, {
        topicIds: [topicId],
        fullName: 'PGS. TS. Nguyễn Văn A',
        affiliations: [
          {
            institutionId: 'I109689652',
            name: 'FPT University',
          },
        ],
      });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          full_name: 'PGS. TS. Nguyễn Văn A',
        }),
      });
      expect(prismaMock.researcher_profiles.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            onboarding_completed_at: expect.any(Date),
          }),
        }),
      );
      expect(prismaMock.research_interests.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: userId,
          topic_id: topicId,
          status: 'ACTIVE',
        }),
      });
    });
  });
});
