import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@researchos/database';
import { ListCandidateWorksQueryDto } from './dto/list-candidate-works.query.dto.js';
import { OpenAlexCandidatesService } from './openalex-candidates.service.js';
import { OPENALEX_SOURCE } from './openalex-ingest.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OUT_1 = '11111111-1111-4111-8111-111111111111';
const OUT_2 = '22222222-2222-4222-8222-222222222222';

function makeRevision(
  outputId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    output_id: outputId,
    title: `Title ${outputId.slice(0, 8)}`,
    abstract: 'An abstract',
    venue: 'A venue',
    publication_year: 2020,
    output_type: 'PAPER',
    external_url: 'https://example.org/work',
    authors_snapshot: [
      {
        name: 'Tran Thi B',
        order: 2,
        orcid: null,
        isCorresponding: false,
      },
      {
        name: 'Nguyen Van An',
        order: 1,
        orcid: 'https://orcid.org/0000-0002-1825-0097',
        isCorresponding: true,
      },
    ],
    ...overrides,
  };
}

function makeService(options: {
  suggestionRows?: { id: string; doi: string | null }[];
  total?: bigint;
  countTotal?: bigint;
  revisions?: unknown[];
  externalIds?: unknown[];
  claims?: unknown[];
}) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(options.suggestionRows ?? [])
      .mockResolvedValueOnce([{ total: options.total ?? 0n }]),
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: unknown) => unknown) => run(tx)),
    $queryRaw: vi.fn(async () => [{ total: options.countTotal ?? 0n }]),
    output_revisions: {
      findMany: vi.fn(async () => options.revisions ?? []),
    },
    output_external_ids: {
      findMany: vi.fn(async () => options.externalIds ?? []),
    },
    publication_claims: {
      findMany: vi.fn(async () => options.claims ?? []),
    },
  } as unknown as PrismaService;
  const service = new OpenAlexCandidatesService(prisma);
  return { service, prisma, tx };
}

function suggestionSql(tx: { $queryRaw: ReturnType<typeof vi.fn> }): string {
  return tx.$queryRaw.mock.calls
    .map((call) => (call[0] as TemplateStringsArray).join(' '))
    .join('\n');
}

describe('OpenAlexCandidatesService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists stored candidates with the revision, OpenAlex id and own claim', async () => {
    const { service, prisma, tx } = makeService({
      suggestionRows: [
        { id: OUT_1, doi: '10.1234/one' },
        { id: OUT_2, doi: null },
      ],
      total: 2n,
      revisions: [makeRevision(OUT_1), makeRevision(OUT_2)],
      externalIds: [
        { output_id: OUT_1, external_id: 'https://openalex.org/W1' },
        { output_id: OUT_2, external_id: 'https://openalex.org/W2' },
      ],
      claims: [
        {
          output_id: OUT_1,
          user_id: USER_ID,
          status: 'SUGGESTED',
          match_source: 'OPENALEX:A1',
        },
      ],
    });

    const result = await service.findAll(
      USER_ID,
      new ListCandidateWorksQueryDto(),
    );

    // The queue comes from the suggestion function, not a hand-rolled
    // predicate: the exclusion of rejected claims lives in one place.
    expect(suggestionSql(tx)).toContain('visible_candidate_suggestions');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: OUT_1,
      openalexId: 'https://openalex.org/W1',
      doi: '10.1234/one',
      title: 'Title 11111111',
      abstract: 'An abstract',
      venue: 'A venue',
      publicationYear: 2020,
      outputType: 'PAPER',
      url: 'https://example.org/work',
      // Snapshot order is normalised into author order.
      authors: ['Nguyen Van An', 'Tran Thi B'],
      claimStatus: 'SUGGESTED',
      matchSource: 'OPENALEX:A1',
    });
    // A candidate the caller pulled without a claim arrives with an empty
    // claim rather than being hidden.
    expect(result.items[1]).toMatchObject({
      id: OUT_2,
      doi: null,
      claimStatus: null,
      matchSource: null,
    });
    expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(prisma.output_external_ids.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          output_id: { in: [OUT_1, OUT_2] },
          source: OPENALEX_SOURCE,
        },
      }),
    );
  });

  it('counts the remaining candidates without the full list', async () => {
    const { service, prisma } = makeService({ countTotal: 3n });

    const result = await service.count(USER_ID);

    expect(result).toEqual({ count: 3 });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.output_revisions.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty page without detail queries when there is nothing queued', async () => {
    const { service, prisma } = makeService({
      suggestionRows: [],
      total: 0n,
    });

    const result = await service.findAll(
      USER_ID,
      new ListCandidateWorksQueryDto(),
    );

    expect(result).toEqual({
      items: [],
      meta: expect.objectContaining({ total: 0, totalPages: 0 }),
    });
    expect(prisma.output_revisions.findMany).not.toHaveBeenCalled();
    expect(prisma.output_external_ids.findMany).not.toHaveBeenCalled();
    expect(prisma.publication_claims.findMany).not.toHaveBeenCalled();
  });

  it('falls back instead of failing when the revision, link or claim is missing', async () => {
    const { service } = makeService({
      suggestionRows: [{ id: OUT_1, doi: null }],
      total: 1n,
      revisions: [],
      externalIds: [],
      claims: [],
    });

    const result = await service.findAll(
      USER_ID,
      new ListCandidateWorksQueryDto(),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: OUT_1,
      openalexId: null,
      title: 'Untitled work',
      abstract: null,
      authors: [],
      claimStatus: null,
      matchSource: null,
    });
  });

  it('falls back to Unknown author for snapshot entries without a name', async () => {
    const { service } = makeService({
      suggestionRows: [{ id: OUT_1, doi: null }],
      total: 1n,
      revisions: [
        makeRevision(OUT_1, {
          authors_snapshot: [{ name: '', order: 1 }, null, 'noise'],
        }),
      ],
      externalIds: [],
      claims: [],
    });

    const result = await service.findAll(
      USER_ID,
      new ListCandidateWorksQueryDto(),
    );

    expect(result.items[0].authors).toEqual(['Unknown author']);
  });
});
