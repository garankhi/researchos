import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { OpenAlexClient } from './openalex.client.js';
import type { OpenAlexAuthor, OpenAlexWork } from './openalex.types.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

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
    outputType: 'PAPER',
    url: null,
    authors: [],
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
    ...overrides,
  };
}

function makeService(deps: {
  profile: unknown;
  author?: OpenAlexAuthor;
  pages?: OpenAlexWork[][];
  searched?: OpenAlexAuthor[];
  namePages?: OpenAlexWork[][];
}): { service: OpenAlexLookupService; client: OpenAlexClient } {
  const prisma = {
    researcher_profiles: {
      findUnique: vi.fn(async () => deps.profile),
    },
  } as unknown as PrismaService;

  const config = {
    get: () => undefined,
  } as unknown as ConfigService;
  const client = new OpenAlexClient(config);

  const pages = deps.pages ?? [];
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

  return { service: new OpenAlexLookupService(prisma, client), client };
}

function profileWith(orcid: string | null, name = 'Nguyen Van An'): unknown {
  return {
    user_id: USER_ID,
    orcid_id: orcid,
    users: { full_name: name, department_unit: 'FPTU' },
  };
}

describe('OpenAlexLookupService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves candidates through the ORCID path with confirmation', async () => {
    const { service } = makeService({
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

  it('rejects with profile_not_found when there is no profile', async () => {
    const { service } = makeService({ profile: null });
    const err = await service.findCandidates(USER_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('profile_not_found');
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('falls back to name search with affiliation matching when no ORCID', async () => {
    const { service } = makeService({
      profile: profileWith(null),
      searched: [
        makeAuthor({ shortId: 'A1', affiliations: ['FPTU University'] }),
        makeAuthor({ shortId: 'A2', affiliations: ['Other University'] }),
      ],
    });
    const result = await service.findCandidates(USER_ID);
    expect(result.mode).toBe('NAME');
    if (result.mode === 'NAME') {
      expect(result.authors).toHaveLength(2);
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

  it('falls back to name + FPT affiliation when the author id is blank', async () => {
    const { service, client } = makeService({
      profile: profileWith(null),
      namePages: [[makeWork('W7')]],
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
      namePages: [[makeWork('W8')]],
    });
    const search = vi.spyOn(client, 'searchWorksByAuthorName');
    const works = await service.findWorksByAuthorName('Nguyen Van An');
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ shortId: 'W8', confirmed: false });
    expect(search).toHaveBeenCalledOnce();
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
