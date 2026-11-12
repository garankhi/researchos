import { HttpStatus } from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputImportState, PrismaService } from '@researchos/database';
import { CodedHttpException } from '../../common/errors/error-codes.js';
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

function makeDecisionService(options: {
  output?: {
    id: string;
    import_state: OutputImportState;
    owner_id: string | null;
  } | null;
  researcher?: boolean;
  view?: boolean;
  claim?: { author_id: string | null; status: string } | null;
  linkedAuthor?: { id: string } | null;
  profile?: { orcid_id: string | null } | null;
  revision?: { authors_snapshot: unknown } | null;
  authorRow?: { id: string; user_id: string | null } | null;
}) {
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join(' ');
      if (sql.includes('FROM research_outputs')) {
        return options.output ? [options.output] : [];
      }
      if (sql.includes('is_researcher')) {
        return [{ allowed: options.researcher ?? true }];
      }
      if (sql.includes('can_view_candidate')) {
        return [{ allowed: options.view ?? true }];
      }
      return [];
    }),
    publication_claims: {
      findUnique: vi.fn(async () => options.claim ?? null),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
    output_authors: {
      findFirst: vi.fn(async () => options.linkedAuthor ?? null),
      findUnique: vi.fn(async () => options.authorRow ?? null),
      update: vi.fn(async () => ({})),
    },
    researcher_profiles: {
      findUnique: vi.fn(async () => options.profile ?? null),
    },
    output_revisions: {
      findFirst: vi.fn(async () => options.revision ?? null),
    },
    research_outputs: {
      update: vi.fn(
        async (args: {
          data: { import_state: OutputImportState; owner_id: string };
        }) => ({
          id: OUT_1,
          import_state: args.data.import_state,
          owner_id: args.data.owner_id,
        }),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: unknown) => unknown) => run(tx)),
  } as unknown as PrismaService;
  const service = new OpenAlexCandidatesService(prisma);
  return { service, tx };
}

const CANDIDATE = {
  id: OUT_1,
  import_state: OutputImportState.CANDIDATE,
  owner_id: null,
};

const ORCID_SNAPSHOT = [
  {
    name: 'Nguyen Van An',
    order: 1,
    orcid: 'https://orcid.org/0000-0002-1825-0097',
  },
  { name: 'Tran Thi B', order: 2, orcid: null },
];

describe('OpenAlexCandidatesService decisions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a candidate: confirms the claim and takes ownership', async () => {
    const { service, tx } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'SUGGESTED' },
      linkedAuthor: { id: 'author-1' },
    });

    const result = await service.accept(USER_ID, OUT_1);

    expect(result).toEqual({
      id: OUT_1,
      importState: OutputImportState.ACCEPTED,
      claimStatus: 'CONFIRMED',
      ownerId: USER_ID,
    });
    expect(tx.publication_claims.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONFIRMED',
          author_id: 'author-1',
        }),
      }),
    );
    expect(tx.research_outputs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          import_state: OutputImportState.ACCEPTED,
          owner_id: USER_ID,
        },
      }),
    );
  });

  it('accepts by matching the profile ORCID against the draft snapshot', async () => {
    const { service, tx } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'SUGGESTED' },
      linkedAuthor: null,
      profile: { orcid_id: '0000-0002-1825-0097' },
      revision: { authors_snapshot: ORCID_SNAPSHOT },
      authorRow: { id: 'author-1', user_id: null },
    });

    const result = await service.accept(USER_ID, OUT_1);

    expect(result.claimStatus).toBe('CONFIRMED');
    expect(tx.output_authors.update).toHaveBeenCalledOnce();
    expect(tx.publication_claims.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ author_id: 'author-1' }),
      }),
    );
  });

  it('refuses an accept with no linkable authorship position', async () => {
    const { service } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'SUGGESTED' },
      linkedAuthor: null,
      profile: { orcid_id: null },
    });

    const err = await service.accept(USER_ID, OUT_1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'openalex_author_not_found',
    );
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('refuses an accept when the authorship position belongs to someone else', async () => {
    const { service } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'SUGGESTED' },
      linkedAuthor: null,
      profile: { orcid_id: '0000-0002-1825-0097' },
      revision: { authors_snapshot: ORCID_SNAPSHOT },
      authorRow: { id: 'author-1', user_id: 'other-user' },
    });

    const err = await service.accept(USER_ID, OUT_1).catch((e: unknown) => e);

    expect(err).toMatchObject({
      status: HttpStatus.CONFLICT,
      code: domainErrorCodes.openalex.authorConflict,
    });
  });

  it('repeating an accept returns the current state without writing', async () => {
    const { service, tx } = makeDecisionService({
      output: {
        ...CANDIDATE,
        import_state: OutputImportState.ACCEPTED,
        owner_id: USER_ID,
      },
      claim: { author_id: 'author-1', status: 'CONFIRMED' },
    });

    const result = await service.accept(USER_ID, OUT_1);

    expect(result).toMatchObject({
      claimStatus: 'CONFIRMED',
      ownerId: USER_ID,
    });
    expect(tx.publication_claims.update).not.toHaveBeenCalled();
    expect(tx.research_outputs.update).not.toHaveBeenCalled();
  });

  it('a co-author accepting an already-accepted work attaches without taking ownership', async () => {
    const { service, tx } = makeDecisionService({
      output: {
        id: OUT_1,
        import_state: OutputImportState.ACCEPTED,
        owner_id: 'first-claimer',
      },
      claim: { author_id: null, status: 'SUGGESTED' },
      linkedAuthor: { id: 'author-2' },
    });

    const result = await service.accept(USER_ID, OUT_1);

    expect(result).toMatchObject({
      importState: OutputImportState.ACCEPTED,
      ownerId: 'first-claimer',
      claimStatus: 'CONFIRMED',
    });
    expect(tx.research_outputs.update).not.toHaveBeenCalled();
  });

  it('rejects a candidate without touching the work', async () => {
    const { service, tx } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'SUGGESTED' },
    });

    const result = await service.reject(USER_ID, OUT_1);

    expect(result).toEqual({
      id: OUT_1,
      importState: OutputImportState.CANDIDATE,
      claimStatus: 'REJECTED',
      ownerId: null,
    });
    expect(tx.publication_claims.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
    expect(tx.research_outputs.update).not.toHaveBeenCalled();
  });

  it('repeating a reject returns the current state without writing', async () => {
    const { service, tx } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'REJECTED' },
    });

    const result = await service.reject(USER_ID, OUT_1);

    expect(result.claimStatus).toBe('REJECTED');
    expect(tx.publication_claims.update).not.toHaveBeenCalled();
  });

  it('refuses an owner reject of an accepted work', async () => {
    const { service } = makeDecisionService({
      output: {
        ...CANDIDATE,
        import_state: OutputImportState.ACCEPTED,
        owner_id: USER_ID,
      },
      claim: { author_id: 'author-1', status: 'CONFIRMED' },
    });

    const err = await service.reject(USER_ID, OUT_1).catch((e: unknown) => e);

    expect(err).toMatchObject({
      status: HttpStatus.CONFLICT,
      code: domainErrorCodes.openalex.decisionDenied,
    });
  });

  it('accepts after a rejection by confirming the same claim row', async () => {
    const { service, tx } = makeDecisionService({
      output: CANDIDATE,
      claim: { author_id: null, status: 'REJECTED' },
      linkedAuthor: { id: 'author-1' },
    });

    const result = await service.accept(USER_ID, OUT_1);

    expect(result.claimStatus).toBe('CONFIRMED');
    expect(tx.publication_claims.create).not.toHaveBeenCalled();
    expect(tx.publication_claims.update).toHaveBeenCalledOnce();
  });

  it('returns 404 when the work does not exist', async () => {
    const { service } = makeDecisionService({ output: null });

    for (const action of ['accept', 'reject'] as const) {
      const err = await service[action](USER_ID, OUT_1).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(CodedHttpException);
      expect((err as CodedHttpException).message).toBe(
        'openalex_work_not_found',
      );
      expect((err as CodedHttpException).getStatus()).toBe(
        HttpStatus.NOT_FOUND,
      );
    }
  });

  it('returns 404 when the candidate is not visible to the caller', async () => {
    const { service } = makeDecisionService({
      output: CANDIDATE,
      view: false,
    });

    const err = await service.accept(USER_ID, OUT_1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('openalex_work_not_found');
  });

  it('refuses a decision from a caller without researcher access', async () => {
    const { service } = makeDecisionService({
      output: CANDIDATE,
      researcher: false,
    });

    const err = await service.reject(USER_ID, OUT_1).catch((e: unknown) => e);

    expect(err).toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.identity.researcherRequired,
    });
  });
});
