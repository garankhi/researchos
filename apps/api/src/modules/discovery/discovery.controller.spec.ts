import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OutputAudience,
  OutputScopeType,
  PrismaService,
  SearchEntityType,
} from '@researchos/database';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryController } from './discovery.controller.js';
import {
  DiscoveryService,
  escapeLikePattern,
  SEARCH_STATEMENT_TIMEOUT_MS,
} from './discovery.service.js';
import { SearchCountsQueryDto } from './dto/search-counts-query.dto.js';
import { SearchQueryDto, SearchTab } from './dto/search-query.dto.js';

describe('DiscoveryController & DiscoveryService', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const outputId = '22222222-2222-4222-8222-222222222222';
  const revisionId = '33333333-3333-4333-8333-333333333333';
  const researcherId = '44444444-4444-4444-8444-444444444444';
  const groupId = '55555555-5555-4555-8555-555555555555';
  const opportunityId = '66666666-6666-4666-8666-666666666666';
  const leadId = '77777777-7777-4777-8777-777777777777';

  const createTxMock = () => ({
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn(),
  });

  const createPrismaMock = (tx = createTxMock()) => ({
    tx,
    $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DiscoveryController],
      providers: [
        DiscoveryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    return {
      controller: moduleRef.get<DiscoveryController>(DiscoveryController),
      service: moduleRef.get<DiscoveryService>(DiscoveryService),
    };
  };

  describe('escapeLikePattern', () => {
    it("escapes %, _, and \\ characters for ILIKE ESCAPE '\\'", () => {
      expect(escapeLikePattern('100% _ai_ \\model')).toBe(
        '100\\% \\_ai\\_ \\\\model',
      );
    });
  });

  describe('tab-separated slice queries and permission filtering', () => {
    it('queries the OUTPUT slice via visible_search_index(actor) for tab=research, including PRIVATE owner works', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.OUTPUT,
            entity_id: outputId,
            revision_id: revisionId,
            owner_id: actorId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.PRIVATE,
            access_group_id: null,
            title: 'Private Shared Quantum Paper',
            body: 'Quantum computing abstract',
            authors_text: 'Dr. Owner',
            subtitle_entity_type: null,
            subtitle_entity_id: null,
            rank: 0.75,
            updated_at: new Date('2026-11-10T10:00:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.search(actorId, {
        tab: SearchTab.RESEARCH,
        q: 'quantum',
        page: 1,
        limit: 20,
      });

      expect(prismaMock.tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL statement_timeout = '${SEARCH_STATEMENT_TIMEOUT_MS}ms'`,
      );
      expect(prismaMock.tx.$queryRaw).toHaveBeenCalledTimes(2);

      const countSql = prismaMock.tx.$queryRaw.mock.calls[0][0];
      expect(countSql.strings.join(' ')).toContain('visible_search_index(');
      expect(countSql.strings.join(' ')).toContain('websearch_to_tsquery(');
      expect(countSql.values).toContain(actorId);
      expect(countSql.values).toContain(SearchEntityType.OUTPUT);
      expect(countSql.values).toContain('quantum');
      expect(countSql.values).toContain('%quantum%');

      expect(result.items).toEqual([
        {
          entityType: SearchEntityType.OUTPUT,
          entityId: outputId,
          revisionId,
          ownerId: actorId,
          scopeType: OutputScopeType.PERSONAL,
          audience: OutputAudience.PRIVATE,
          accessGroupId: null,
          title: 'Private Shared Quantum Paper',
          body: 'Quantum computing abstract',
          authorsText: 'Dr. Owner',
          subtitleEntityType: null,
          subtitleEntityId: null,
          rank: 0.75,
          updatedAt: '2026-11-10T10:00:00.000Z',
        },
      ]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('queries the RESEARCHER slice for tab=people and ranks strictly by ts_rank text relevance (BR-11, S-33)', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.RESEARCHER,
            entity_id: researcherId,
            revision_id: null,
            owner_id: researcherId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
            access_group_id: null,
            title: 'Dr. Nguyen Van A',
            body: 'Researcher in NLP and speech recognition',
            authors_text: 'Nguyen Van A',
            subtitle_entity_type: null,
            subtitle_entity_id: null,
            rank: '0.42',
            updated_at: '2026-11-10T11:00:00.000Z',
          },
        ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.search(actorId, {
        tab: SearchTab.PEOPLE,
        q: 'Nguyen',
        page: 1,
        limit: 10,
      });

      const selectSql = prismaMock.tx.$queryRaw.mock.calls[1][0];
      expect(selectSql.strings.join(' ')).toContain(
        'ts_rank(v.doc, q)::float8 AS rank',
      );
      expect(selectSql.values).toContain(SearchEntityType.RESEARCHER);
      expect(result.items[0].entityType).toBe(SearchEntityType.RESEARCHER);
      expect(result.items[0].rank).toBe(0.42);
    });

    it('queries the GROUP slice for tab=group', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.GROUP,
            entity_id: groupId,
            revision_id: null,
            owner_id: actorId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
            access_group_id: null,
            title: 'AI & Robotics Lab',
            body: 'Autonomous systems research group',
            authors_text: 'Dr. Lead',
            subtitle_entity_type: SearchEntityType.RESEARCHER,
            subtitle_entity_id: leadId,
            rank: 0.61,
            updated_at: new Date('2026-11-10T12:00:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.search(actorId, {
        tab: SearchTab.GROUP,
        q: 'Robotics',
        page: 1,
        limit: 20,
      });

      const selectSql = prismaMock.tx.$queryRaw.mock.calls[1][0];
      expect(selectSql.values).toContain(SearchEntityType.GROUP);
      expect(result.items[0].entityType).toBe(SearchEntityType.GROUP);
      expect(result.items[0].entityId).toBe(groupId);
      // The subtitle of a group names its leader, so the client can link
      // the name to that leader's profile.
      expect(result.items[0].authorsText).toBe('Dr. Lead');
      expect(result.items[0].subtitleEntityType).toBe(
        SearchEntityType.RESEARCHER,
      );
      expect(result.items[0].subtitleEntityId).toBe(leadId);
    });

    it('joins the subtitle before the WHERE clause, so the SQL parses', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.GROUP,
            entity_id: groupId,
            revision_id: null,
            owner_id: actorId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
            access_group_id: null,
            title: 'AI & Robotics Lab',
            body: 'Autonomous systems research group',
            authors_text: 'Dr. Lead',
            subtitle_entity_type: SearchEntityType.RESEARCHER,
            subtitle_entity_id: leadId,
            rank: 0.61,
            updated_at: new Date('2026-11-10T12:00:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      await controller.search(actorId, {
        tab: SearchTab.GROUP,
        q: 'Robotics',
        page: 1,
        limit: 20,
      });

      // A join written after the WHERE clause is a syntax error, and the
      // error only shows up against a real database.
      const selectSql =
        prismaMock.tx.$queryRaw.mock.calls[1][0].strings.join(' ');
      const joinAt = selectSql.indexOf('LEFT JOIN LATERAL');
      const whereAt = selectSql.indexOf('WHERE (v.doc @@ q');
      expect(joinAt).toBeGreaterThan(-1);
      expect(whereAt).toBeGreaterThan(-1);
      expect(joinAt).toBeLessThan(whereAt);
    });

    it('queries the OPPORTUNITY slice for tab=opportunity', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.OPPORTUNITY,
            entity_id: opportunityId,
            revision_id: null,
            owner_id: actorId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
            access_group_id: null,
            title: 'RA Position in Computer Vision',
            body: 'Seeking student researchers',
            authors_text: 'AI & Robotics Lab',
            subtitle_entity_type: SearchEntityType.GROUP,
            subtitle_entity_id: groupId,
            rank: 0.55,
            updated_at: new Date('2026-11-10T12:30:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.search(actorId, {
        tab: SearchTab.OPPORTUNITY,
        q: 'Vision',
        page: 1,
        limit: 20,
      });

      const selectSql = prismaMock.tx.$queryRaw.mock.calls[1][0];
      expect(selectSql.values).toContain(SearchEntityType.OPPORTUNITY);
      expect(result.items[0].entityType).toBe(SearchEntityType.OPPORTUNITY);
      expect(result.items[0].entityId).toBe(opportunityId);
      // The subtitle of an opportunity names the group that published it,
      // so the client can link the name to that group's screen.
      expect(result.items[0].authorsText).toBe('AI & Robotics Lab');
      expect(result.items[0].subtitleEntityType).toBe(SearchEntityType.GROUP);
      expect(result.items[0].subtitleEntityId).toBe(groupId);
    });

    it('returns an empty list with pagination metadata (not 404) when no rows match', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ total: 0n }]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.search(actorId, {
        tab: SearchTab.RESEARCH,
        q: 'nonexistentterm',
        page: 2,
        limit: 15,
      });

      expect(prismaMock.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        items: [],
        meta: {
          page: 2,
          limit: 15,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    });

    it('supports sorting by title and updatedAt and rejects unknown sort keys with 400', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            entity_type: SearchEntityType.OUTPUT,
            entity_id: outputId,
            revision_id: revisionId,
            owner_id: actorId,
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
            access_group_id: null,
            title: 'Alpha Paper',
            body: null,
            authors_text: null,
            subtitle_entity_type: null,
            subtitle_entity_id: null,
            rank: 0.2,
            updated_at: new Date('2026-11-10T10:00:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      await controller.search(actorId, {
        tab: SearchTab.RESEARCH,
        q: 'Alpha',
        page: 1,
        limit: 20,
        sort: 'title',
      });

      const selectSql = prismaMock.tx.$queryRaw.mock.calls[1][0];
      expect(selectSql.strings.join(' ')).toContain('v.title ASC');

      await expect(
        controller.search(actorId, {
          tab: SearchTab.RESEARCH,
          q: 'Alpha',
          page: 1,
          limit: 20,
          sort: 'invalidField',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('per-tab counts', () => {
    it('returns one permission-filtered total per tab for the term', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([
        {
          research: 12n,
          people: 3n,
          group_count: 2n,
          opportunity: 7n,
        },
      ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.counts(actorId, {
        q: 'machine learning',
      });

      expect(prismaMock.tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL statement_timeout = '${SEARCH_STATEMENT_TIMEOUT_MS}ms'`,
      );
      expect(prismaMock.tx.$queryRaw).toHaveBeenCalledTimes(1);

      const countSql = prismaMock.tx.$queryRaw.mock.calls[0][0];
      expect(countSql.strings.join(' ')).toContain('visible_search_index(');
      expect(countSql.strings.join(' ')).toContain('websearch_to_tsquery(');
      expect(countSql.strings.join(' ')).toContain('COUNT(*) FILTER');
      expect(countSql.values).toContain(actorId);
      expect(countSql.values).toContain('machine learning');
      expect(countSql.values).toContain('%machine learning%');

      expect(result).toEqual({
        research: 12,
        people: 3,
        group: 2,
        opportunity: 7,
      });
    });

    it('returns zero for every tab when nothing matches', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([
        {
          research: 0n,
          people: 0n,
          group_count: 0n,
          opportunity: 0n,
        },
      ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.counts(actorId, { q: 'nonexistentterm' });

      expect(result).toEqual({
        research: 0,
        people: 0,
        group: 0,
        opportunity: 0,
      });
    });

    it('rejects a term outside the [2, 200] length bounds', async () => {
      const prismaMock = createPrismaMock();
      const { controller } = await setupController(prismaMock);

      await expect(controller.counts(actorId, { q: ' a ' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.counts(actorId, { q: 'x'.repeat(201) }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('SearchQueryDto validation', () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    it('accepts valid tab and trims query string q', async () => {
      const transformed = (await pipe.transform(
        {
          tab: 'research',
          q: '  deep learning  ',
          page: '2',
          limit: '25',
        },
        { type: 'query', metatype: SearchQueryDto },
      )) as SearchQueryDto;

      expect(transformed.tab).toBe(SearchTab.RESEARCH);
      expect(transformed.q).toBe('deep learning');
      expect(transformed.page).toBe(2);
      expect(transformed.limit).toBe(25);
    });

    it('rejects loose or unknown tab values', async () => {
      await expect(
        pipe.transform(
          { tab: 'invalid_tab', q: 'machine learning' },
          { type: 'query', metatype: SearchQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects query terms shorter than 2 characters after trimming', async () => {
      await expect(
        pipe.transform(
          { tab: 'people', q: ' a ' },
          { type: 'query', metatype: SearchQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects query terms exceeding 200 characters', async () => {
      await expect(
        pipe.transform(
          { tab: 'group', q: 'x'.repeat(201) },
          { type: 'query', metatype: SearchQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects limit above MAX_PAGE_SIZE (100)', async () => {
      await expect(
        pipe.transform(
          { tab: 'opportunity', q: 'grant', limit: '101' },
          { type: 'query', metatype: SearchQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SearchCountsQueryDto validation', () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    it('trims the query string q', async () => {
      const transformed = (await pipe.transform(
        { q: '  deep learning  ' },
        { type: 'query', metatype: SearchCountsQueryDto },
      )) as SearchCountsQueryDto;

      expect(transformed.q).toBe('deep learning');
    });

    it('rejects query terms shorter than 2 characters after trimming', async () => {
      await expect(
        pipe.transform(
          { q: ' a ' },
          { type: 'query', metatype: SearchCountsQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects query terms exceeding 200 characters', async () => {
      await expect(
        pipe.transform(
          { q: 'x'.repeat(201) },
          { type: 'query', metatype: SearchCountsQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
