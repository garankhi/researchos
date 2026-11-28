import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexAuthorRecordService } from './openalex-author-record.service.js';
import { OpenAlexClient } from './openalex.client.js';
import type { OpenAlexAuthorRecord } from './openalex.types.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * A record shaped like the one OpenAlex returns for a researcher who
 * was at FPT University for one year and at another university before
 * that — the shape that makes the affiliation years matter.
 */
function makeRecord(
  overrides: Partial<OpenAlexAuthorRecord> = {},
): OpenAlexAuthorRecord {
  return {
    id: 'https://openalex.org/A5027558961',
    shortId: 'A5027558961',
    displayName: 'Nguyen Hoang Khoi Tran',
    orcid: 'https://orcid.org/0000-0001-7323-9213',
    observedOrcids: ['https://orcid.org/0000-0001-7323-9213'],
    names: ['Nguyen Hoang Khoi Tran', 'N. H. Tran', 'Tran, Nguyen H'],
    affiliations: [
      {
        institutionId: 'I109689652',
        ror: 'https://ror.org/03esj4g97',
        name: 'FPT University',
        countryCode: 'VN',
        institutionType: 'education',
        yearStart: 2023,
        yearEnd: 2023,
      },
      {
        institutionId: 'I47265099',
        ror: 'https://ror.org/04qva2324',
        name: 'Ho Chi Minh City University of Technology',
        countryCode: 'VN',
        institutionType: 'education',
        yearStart: 2021,
        yearEnd: 2021,
      },
    ],
    counts: {
      worksCount: 313,
      citedByCount: 14816,
      hIndex: 56,
      i10Index: 166,
      twoYearMeanCitedness: 12.304347826087,
    },
    topics: [],
    raw: { id: 'https://openalex.org/A5027558961' },
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    researcher_profiles: {
      upsert: vi.fn(async () => ({})),
    },
    researcher_author_names: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
    },
    researcher_affiliations: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
    },
    researcher_openalex_snapshots: {
      upsert: vi.fn(async () => ({})),
    },
    ...overrides,
  };
}

function makeService(tx: ReturnType<typeof makeTx>) {
  const prisma = {
    $transaction: vi.fn(async (run: (client: unknown) => unknown) => run(tx)),
  } as unknown as PrismaService;
  const client = {
    getAuthorRecord: vi.fn(async () => makeRecord()),
  } as unknown as OpenAlexClient;
  const service = new OpenAlexAuthorRecordService(prisma, client);
  return { service, prisma, client, tx };
}

describe('OpenAlexAuthorRecordService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the counts onto the profile', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const upsert = tx.researcher_profiles.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledOnce();
    const data = upsert.mock.calls[0][0].update;
    expect(data).toMatchObject({
      openalex_display_name: 'Nguyen Hoang Khoi Tran',
      openalex_works_count: 313,
      openalex_cited_by_count: 14816,
      openalex_h_index: 56,
      openalex_i10_index: 166,
      openalex_2yr_mean_citedness: 12.304347826087,
    });
  });

  it('sets the author id when the profile row is created', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const upsert = tx.researcher_profiles.upsert as ReturnType<typeof vi.fn>;
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      openalex_author_id: 'A5027558961',
    });
  });

  it('stores every observed byline spelling', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const create = tx.researcher_author_names.create as ReturnType<
      typeof vi.fn
    >;
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.map((call) => call[0].data.name)).toEqual([
      'Nguyen Hoang Khoi Tran',
      'N. H. Tran',
      'Tran, Nguyen H',
    ]);
  });

  it('marks the canonical name as canonical', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const create = tx.researcher_author_names.create as ReturnType<
      typeof vi.fn
    >;
    const canonical = create.mock.calls.filter(
      (call) => call[0].data.is_canonical,
    );
    expect(canonical).toHaveLength(1);
    expect(canonical[0][0].data.name).toBe('Nguyen Hoang Khoi Tran');
  });

  it('replaces the names rather than accumulating them', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const remove = tx.researcher_author_names.deleteMany as ReturnType<
      typeof vi.fn
    >;
    expect(remove).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
  });

  it('stores the affiliations with their years', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const create = tx.researcher_affiliations.create as ReturnType<
      typeof vi.fn
    >;
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toMatchObject({
      institution_id: 'I109689652',
      ror: 'https://ror.org/03esj4g97',
      name: 'FPT University',
      country_code: 'VN',
      institution_type: 'EDUCATION',
      year_start: 2023,
      year_end: 2023,
    });
  });

  it('marks the most recent affiliation as the primary one', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const create = tx.researcher_affiliations.create as ReturnType<
      typeof vi.fn
    >;
    const primary = create.mock.calls.filter((call) => call[0].data.is_primary);
    expect(primary).toHaveLength(1);
    expect(primary[0][0].data.institution_id).toBe('I109689652');
  });

  it('does not use OpenAlex "last known" for the primary affiliation', async () => {
    /*
     * The record OpenAlex reports for this researcher names the
     * University of Sydney as the last known institution, because that
     * is the institution of their latest authorship — not where they
     * work. The primary affiliation is the most recent one by year,
     * and the platform never reads OpenAlex's own "last known".
     */
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    const create = tx.researcher_affiliations.create as ReturnType<
      typeof vi.fn
    >;
    const ids = create.mock.calls.map((call) => call[0].data.institution_id);
    expect(ids).not.toContain('I129604602');
  });

  it('breaks a tie on the last year by the earlier start', async () => {
    /*
     * Two affiliations that both end in 2026: a home institution the
     * researcher has been at since 2020, and a one-year co-affiliation.
     * The longer one is where they work.
     */
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(
      USER_ID,
      makeRecord({
        affiliations: [
          {
            institutionId: 'I109689652',
            ror: null,
            name: 'FPT University',
            countryCode: 'VN',
            institutionType: 'education',
            yearStart: 2020,
            yearEnd: 2026,
          },
          {
            institutionId: 'I999',
            ror: null,
            name: 'Somewhere Else',
            countryCode: 'VN',
            institutionType: 'education',
            yearStart: 2026,
            yearEnd: 2026,
          },
        ],
      }),
    );

    const create = tx.researcher_affiliations.create as ReturnType<
      typeof vi.fn
    >;
    const primary = create.mock.calls.filter((call) => call[0].data.is_primary);
    expect(primary).toHaveLength(1);
    expect(primary[0][0].data.institution_id).toBe('I109689652');
  });

  it('maps an unknown institution type to OTHER', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.storeAuthorRecord(
      USER_ID,
      makeRecord({
        affiliations: [
          {
            institutionId: 'I1',
            ror: null,
            name: 'Something',
            countryCode: null,
            institutionType: 'space_agency',
            yearStart: 2020,
            yearEnd: 2021,
          },
        ],
      }),
    );

    const create = tx.researcher_affiliations.create as ReturnType<
      typeof vi.fn
    >;
    expect(create.mock.calls[0][0].data.institution_type).toBe('OTHER');
  });

  it('keeps the raw payload whole in the snapshot', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    const raw = {
      id: 'https://openalex.org/A5027558961',
      counts_by_year: [{ year: 2023, works_count: 11 }],
      topics: [{ id: 'https://openalex.org/T11409' }],
    };
    await service.storeAuthorRecord(USER_ID, makeRecord({ raw }));

    const upsert = tx.researcher_openalex_snapshots.upsert as ReturnType<
      typeof vi.fn
    >;
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].create.payload).toEqual(raw);
  });

  it('fetches the record before storing it', async () => {
    const tx = makeTx();
    const { service, client } = makeService(tx);

    await service.syncAuthorRecord(USER_ID, 'A5027558961');

    expect(client.getAuthorRecord).toHaveBeenCalledWith('A5027558961');
    expect(
      tx.researcher_profiles.upsert as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledOnce();
  });

  it('writes the four parts in one transaction', async () => {
    const tx = makeTx();
    const { service, prisma } = makeService(tx);

    await service.storeAuthorRecord(USER_ID, makeRecord());

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('swallows a failure to fetch the record', async () => {
    const tx = makeTx();
    const { service, client } = makeService(tx);
    vi.mocked(client.getAuthorRecord).mockRejectedValue(
      new Error('network down'),
    );

    const result = await service.trySyncAuthorRecord(USER_ID, 'A5027558961');

    expect(result).toBeNull();
  });

  it('propagates a missing author', async () => {
    const tx = makeTx();
    const { service, client } = makeService(tx);
    vi.mocked(client.getAuthorRecord).mockRejectedValue(
      new CodedHttpException(domainErrorCodes.openalex.authorNotFound, 404),
    );

    await expect(
      service.trySyncAuthorRecord(USER_ID, 'A9999999999'),
    ).rejects.toBeInstanceOf(CodedHttpException);
  });
});
