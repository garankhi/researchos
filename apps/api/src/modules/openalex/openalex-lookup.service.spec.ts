import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { OpenAlexWorksCache } from './openalex-works-cache.js';
import { OpenAlexClient } from './openalex.client.js';
import type {
  OpenAlexAuthor,
  OpenAlexAuthorRecentWork,
  OpenAlexWork,
  OpenAlexWorkAuthor,
} from './openalex.types.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * A byline that sits at FPT University.
 *
 * The affiliation has to be on the authorship, because the works filter
 * pairs the name and the affiliation at the work level — the narrowing
 * to the named byline happens here.
 */
function makeAuthorEntry(
  order: number,
  name: string,
  affiliations: string[] = ['FPT University, Can Tho, Viet Nam'],
): OpenAlexWorkAuthor {
  return {
    order,
    name,
    isCorresponding: order === 1,
    authorId: null,
    orcid: null,
    affiliations,
  };
}

function makeWork(
  shortId: string,
  overrides: Partial<OpenAlexWork> = {},
): OpenAlexWork {
  return {
    id: `https://openalex.org/${shortId}`,
    shortId,
    doi: null,
    title: `Title ${shortId}`,
    abstract: null,
    venue: null,
    publicationYear: 2020,
    rawType: 'article',
    outputType: 'ARTICLE',
    url: null,
    // The researcher sits at FPT University on the byline. Every tier of
    // the resolution is scoped to FPT, so a work whose byline does not
    // carry the affiliation is not the researcher's work.
    authors: [makeAuthorEntry(1, 'Nguyen Van An')],
    ...overrides,
  };
}

function makeAuthor(overrides: Partial<OpenAlexAuthor> = {}): OpenAlexAuthor {
  return {
    id: 'https://openalex.org/A1',
    shortId: 'A1',
    displayName: 'Nguyen Van An',
    orcid: null,
    worksCount: null,
    affiliations: [],
    counts: {
      worksCount: null,
      citedByCount: null,
      hIndex: null,
      i10Index: null,
      twoYearMeanCitedness: null,
    },
    nameVariants: [],
    observedOrcids: [],
    topics: [],
    affiliationHistory: [],
    ...overrides,
  };
}

function makeService(deps: {
  profile: unknown;
  account?: unknown;
  author?: OpenAlexAuthor;
  pages?: OpenAlexWork[][];
  searched?: OpenAlexAuthor[];
  namePages?: OpenAlexWork[][];
  recentWorks?: Map<string, OpenAlexAuthorRecentWork[]>;
}): { service: OpenAlexLookupService; client: OpenAlexClient } {
  const prisma = {
    researcher_profiles: {
      findUnique: vi.fn(async () => deps.profile),
    },
    users: {
      findUnique: vi.fn(async () => deps.account ?? null),
    },
  } as unknown as PrismaService;

  const config = {
    get: () => undefined,
  } as unknown as ConfigService;
  const client = new OpenAlexClient(config);

  const pages = deps.pages ?? [];
  vi.spyOn(client, 'getAuthorById').mockResolvedValue(
    deps.author ?? makeAuthor(),
  );
  vi.spyOn(client, 'getAuthorByOrcid').mockResolvedValue(
    deps.author ?? makeAuthor(),
  );
  vi.spyOn(client, 'getWorksByAuthor').mockImplementation(
    async (_id: string, options?: { page?: number }) => {
      const page = options?.page ?? 1;
      const works = pages[page - 1] ?? [];
      const total = pages.flat().length;
      return { total, works };
    },
  );
  const namePages = deps.namePages ?? [];
  vi.spyOn(client, 'searchWorksByAuthorName').mockImplementation(
    async (name: string, options?: { page?: number }) => {
      if (name.trim() === '') {
        throw new CodedHttpException(
          domainErrorCodes.openalex.authorNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      const page = options?.page ?? 1;
      const works = namePages[page - 1] ?? [];
      const total = namePages.flat().length;
      return { total, works };
    },
  );
  vi.spyOn(client, 'searchAuthors').mockResolvedValue(deps.searched ?? []);

  /*
   * The recent works come with the candidate list, so the call is
   * stubbed here: the tests are about the lookup's own behaviour, and
   * an unstubbed call would reach the network.
   */
  vi.spyOn(client, 'getRecentWorksByAuthors').mockResolvedValue(
    deps.recentWorks ?? new Map(),
  );

  /*
   * The cache is a no-op here: the tests are about the lookup's own
   * behaviour, and a cache that never holds anything keeps the fetch
   * path under test.
   */
  const cache = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    drop: vi.fn(async () => undefined),
  } as unknown as OpenAlexWorksCache;

  return {
    service: new OpenAlexLookupService(prisma, client, cache),
    client,
  };
}

function profileWith(
  orcid: string | null,
  name = 'Nguyen Van An',
  openAlexAuthorId: string | null = null,
): unknown {
  return {
    user_id: USER_ID,
    orcid_id: orcid,
    openalex_author_id: openAlexAuthorId,
    users: { full_name: name, department_unit: 'FPTU' },
  };
}

describe('OpenAlexLookupService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves candidates through the confirmed OpenAlex author id', async () => {
    const { service, client } = makeService({
      profile: profileWith(null, 'Nguyen Van An', 'A5023888391'),
      author: makeAuthor({ shortId: 'A5023888391' }),
      pages: [[makeWork('W1')]],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('AUTHOR_ID');
    if (result.mode === 'AUTHOR_ID') {
      expect(result.works[0]).toMatchObject({ shortId: 'W1', confirmed: true });
    }
    expect(client.getAuthorByOrcid).not.toHaveBeenCalled();
  });

  it('resolves candidates through the ORCID path with confirmation', async () => {
    const { service, client } = makeService({
      profile: profileWith('0000-0002-1825-0097'),
      author: makeAuthor({
        orcid: 'https://orcid.org/0000-0002-1825-0097',
      }),
      pages: [[makeWork('W1'), makeWork('W2')]],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('ORCID');
    if (result.mode === 'ORCID') {
      expect(result.author.shortId).toBe('A1');
      expect(result.works).toHaveLength(2);
      expect(result.works[0]).toMatchObject({
        shortId: 'W1',
        confirmed: true,
      });
    }
    expect(client.getAuthorById).not.toHaveBeenCalled();
  });

  it('falls through to the name tier when the ORCID is unknown to OpenAlex', async () => {
    // An ORCID that was never claimed on OpenAlex resolves to nothing.
    // That is not a failure — the name tier is the permanent fallback.
    const { service, client } = makeService({
      profile: profileWith('0000-0002-1825-0097'),
      searched: [makeAuthor({ shortId: 'A1' })],
    });
    vi.mocked(client.getAuthorByOrcid).mockRejectedValue(
      new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      ),
    );

    const result = await service.findCandidates(USER_ID);

    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors).toHaveLength(1);
    }
  });

  it('attaches the recent works to the name candidates', async () => {
    // The works are the evidence the researcher recognises their own
    // papers by, so they travel with the candidate list.
    const work: OpenAlexAuthorRecentWork = {
      workId: 'https://openalex.org/W1',
      shortId: 'W1',
      title: 'A paper the researcher wrote',
      publicationYear: 2026,
      venue: 'Symmetry',
      affiliation: 'FPT University',
      authorIds: ['A1'],
    };
    const { service, client } = makeService({
      profile: profileWith(null, 'Nguyen Van An'),
      searched: [makeAuthor({ shortId: 'A1' })],
      recentWorks: new Map([['A1', [work]]]),
    });

    const result = await service.findCandidates(USER_ID);

    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors[0].recentWorks).toHaveLength(1);
      expect(result.authors[0].recentWorks[0]).toMatchObject({
        shortId: 'W1',
        title: 'A paper the researcher wrote',
      });
    }
    // One call covers every candidate, whatever the list holds.
    expect(client.getRecentWorksByAuthors).toHaveBeenCalledTimes(1);
    expect(client.getRecentWorksByAuthors).toHaveBeenCalledWith(['A1']);
  });

  it('keeps the candidates when the recent works cannot be fetched', async () => {
    // The works are an aid to recognition, not the point of the step:
    // a failure there must not cost the researcher their choices.
    const { service, client } = makeService({
      profile: profileWith(null, 'Nguyen Van An'),
      searched: [makeAuthor({ shortId: 'A1' })],
    });
    vi.mocked(client.getRecentWorksByAuthors).mockRejectedValue(
      new Error('OpenAlex is unreachable'),
    );

    const result = await service.findCandidates(USER_ID);

    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors).toHaveLength(1);
      expect(result.authors[0].recentWorks).toEqual([]);
    }
  });

  it('de-duplicates by DOI: preprint and published versions collapse', async () => {
    const { service } = makeService({
      profile: profileWith('0000-0002-1825-0097'),
      pages: [
        [
          makeWork('W1', { doi: '10.1234/dup' }),
          makeWork('W2', { doi: '10.1234/dup' }),
          makeWork('W3'),
        ],
      ],
    });
    const result = await service.findCandidates(USER_ID);
    if (result.mode === 'ORCID') {
      // W2 shares W1's DOI, W3 has no DOI so it is kept.
      expect(result.works.map((w) => w.shortId)).toEqual(['W1', 'W3']);
    } else {
      expect.unreachable('expected ORCID mode');
    }
  });

  it('falls back to the account name when there is no profile row', async () => {
    // A fresh researcher has no profile row. The account row carries
    // the name, so the name tier still resolves them.
    const { service } = makeService({
      profile: null,
      account: { full_name: 'Nguyen Van An' },
      searched: [makeAuthor({ shortId: 'A1' })],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors).toHaveLength(1);
    }
  });

  it('falls back to name search with the hard-coded FPT affiliation check', async () => {
    const { service } = makeService({
      profile: profileWith(null),
      searched: [
        makeAuthor({ shortId: 'A1', affiliations: ['FPT University'] }),
        makeAuthor({ shortId: 'A2', affiliations: ['Other University'] }),
      ],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors).toHaveLength(2);
      // The affiliation is the hard-coded FPT University, never the
      // researcher's department.
      expect(result.authors[0].affiliationMatch).toBe(true);
      expect(result.authors[1].affiliationMatch).toBe(false);
    }
  });

  it('lists works for a picked author as unconfirmed', async () => {
    const { service } = makeService({
      profile: profileWith(null),
      pages: [[makeWork('W9')]],
    });
    const works = await service.findWorksForAuthor('https://openalex.org/A2');
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ shortId: 'W9', confirmed: false });
  });

  it('carries the evidence a researcher needs to recognise a work', async () => {
    // The abstract, the byline and the landing page are what the
    // onboarding step shows on the work card, and what the researcher
    // reads to decide whether a paper is theirs. A preview without them
    // shows a title and a year, which is not enough to recognise a paper.
    const { service } = makeService({
      profile: profileWith(null),
      pages: [
        [
          makeWork('W-evidence', {
            abstract: 'An abstract of the work.',
            url: 'https://example.org/the-work',
            authors: [
              makeAuthorEntry(1, 'Nguyen Van An'),
              makeAuthorEntry(2, 'Tran Thi B'),
            ],
          }),
        ],
      ],
    });

    const works = await service.findWorksForAuthor('https://openalex.org/A2');

    expect(works[0]).toMatchObject({
      abstract: 'An abstract of the work.',
      url: 'https://example.org/the-work',
      authors: ['Nguyen Van An', 'Tran Thi B'],
    });
  });

  it('reports a work with no abstract and no url as null rather than undefined', async () => {
    // The wire format says `null` for an absent abstract and an absent
    // url, and `undefined` would drop the key entirely — the generated
    // client would then carry a field the server never sends.
    const { service } = makeService({
      profile: profileWith(null),
      pages: [[makeWork('W-bare')]],
    });

    const works = await service.findWorksForAuthor('https://openalex.org/A2');

    expect(works[0].abstract).toBeNull();
    expect(works[0].url).toBeNull();
  });

  it('drops a work whose byline sits at another institution', async () => {
    // The author id resolves the *work*, but the byline still has to be
    // at FPT University. A work the researcher only co-authored is
    // another researcher's work.
    const { service } = makeService({
      profile: profileWith(null, 'Nguyen Van An', 'A5023888391'),
      pages: [
        [
          makeWork('W-mine'),
          makeWork('W-theirs', {
            authors: [
              makeAuthorEntry(1, 'P Angel', ['Assam Agricultural University']),
            ],
          }),
        ],
      ],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('AUTHOR_ID');
    if (result.mode === 'AUTHOR_ID') {
      expect(result.works.map((w) => w.shortId)).toEqual(['W-mine']);
    }
  });

  it('falls back to name + FPT affiliation when the author id is blank', async () => {
    const { service, client } = makeService({
      profile: profileWith(null),
      namePages: [
        [makeWork('W7', { authors: [makeAuthorEntry(1, 'Nguyen Van An')] })],
      ],
    });
    const search = vi.spyOn(client, 'searchWorksByAuthorName');
    const idFetch = vi.spyOn(client, 'getWorksByAuthor');
    const works = await service.findWorksForAuthor('   ', {
      authorName: 'Nguyen Van An',
    });
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ shortId: 'W7', confirmed: false });
    expect(idFetch).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0][0]).toBe('Nguyen Van An');
    expect(search.mock.calls[0][1]).toMatchObject({
      affiliation: undefined,
      page: 1,
      perPage: 100,
    });
  });

  it('lists works by author name with the FPT affiliation default', async () => {
    const { service, client } = makeService({
      profile: profileWith(null),
      namePages: [
        [makeWork('W8', { authors: [makeAuthorEntry(1, 'Nguyen Van An')] })],
      ],
    });
    const search = vi.spyOn(client, 'searchWorksByAuthorName');
    const works = await service.findWorksByAuthorName('Nguyen Van An');
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ shortId: 'W8', confirmed: false });
    expect(search).toHaveBeenCalledOnce();
  });

  it('drops a work whose named byline is not at FPT University', async () => {
    const { service } = makeService({
      profile: profileWith(null),
      namePages: [
        [
          // The named byline is elsewhere; a co-author is at FPT. The
          // works filter pairs at the work level, so this one passes the
          // filter and has to be dropped here.
          makeWork('W-mine', {
            authors: [
              makeAuthorEntry(1, 'Nguyen Van An', ['FPT University']),
              makeAuthorEntry(2, 'Someone Else', ['FPT University']),
            ],
          }),
          makeWork('W-theirs', {
            authors: [
              makeAuthorEntry(1, 'Nguyen Van An', ['University of Hanoi']),
              makeAuthorEntry(2, 'Someone Else', ['FPT University']),
            ],
          }),
        ],
      ],
    });
    const works = await service.findWorksByAuthorName('Nguyen Van An');
    expect(works.map((w) => w.shortId)).toEqual(['W-mine']);
  });

  it('drops a work when the byline name is ambiguous', async () => {
    const { service } = makeService({
      profile: profileWith(null),
      namePages: [
        [
          makeWork('W-dup', {
            authors: [
              makeAuthorEntry(1, 'Nguyen Van An'),
              makeAuthorEntry(2, 'Nguyen Van An'),
            ],
          }),
        ],
      ],
    });
    const works = await service.findWorksByAuthorName('Nguyen Van An');
    // Two authorships match the name, so neither is the researcher —
    // the work is dropped rather than guessed at.
    expect(works).toHaveLength(0);
  });

  it('rejects the name fallback when both id and name are blank', async () => {
    const { service } = makeService({ profile: profileWith(null) });
    const err = await service
      .findWorksForAuthor('   ', { authorName: '   ' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'openalex_author_not_found',
    );
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
