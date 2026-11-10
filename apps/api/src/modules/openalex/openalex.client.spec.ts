import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  mapOutputType,
  normalizeDoi,
  OpenAlexClient,
  reconstructAbstract,
} from './openalex.client.js';

function makeClient(mailto = 'test@researchos.local'): OpenAlexClient {
  const config = {
    get: (key: string) => {
      if (key === 'OPENALEX_MAILTO') return mailto;
      return undefined;
    },
  } as unknown as ConfigService;
  return new OpenAlexClient(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('reconstructAbstract', () => {
  it('rebuilds text from the inverted index', () => {
    expect(
      reconstructAbstract({ Hello: [0], world: [1], again: [3], there: [2] }),
    ).toBe('Hello world there again');
  });

  it('returns null when there is no index', () => {
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract(undefined)).toBeNull();
    expect(reconstructAbstract({})).toBeNull();
  });

  it('skips corrupt positions instead of duplicating tokens', () => {
    expect(
      reconstructAbstract({ a: [0, 0, -1], b: [1.5 as never, 1] } as never),
    ).toBe('a b');
  });
});

describe('normalizeDoi', () => {
  it('strips the URL prefix and lowercases', () => {
    expect(normalizeDoi('https://doi.org/10.1234/ABC')).toBe('10.1234/abc');
    expect(normalizeDoi('DOI:10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoi('10.1234/abc')).toBe('10.1234/abc');
  });

  it('returns null for missing or blank DOIs', () => {
    expect(normalizeDoi(null)).toBeNull();
    expect(normalizeDoi('  ')).toBeNull();
  });
});

describe('mapOutputType', () => {
  it('maps known OpenAlex types', () => {
    expect(mapOutputType('article')).toBe('PAPER');
    expect(mapOutputType('dataset')).toBe('DATASET');
    expect(mapOutputType('book')).toBe('BOOK');
  });

  it('defaults unknown and missing types to PAPER', () => {
    expect(mapOutputType('something-new')).toBe('PAPER');
    expect(mapOutputType(null)).toBe('PAPER');
  });
});

describe('OpenAlexClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the configured mailto in the user agent', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(
          (init?.headers as Record<string, string>)?.['User-Agent'] ?? '',
        );
        return jsonResponse({ results: [] });
      }),
    );
    const client = makeClient('lab@fptu.edu.vn');
    await expect(
      client.getWorksByAuthor('https://openalex.org/A1'),
    ).resolves.toMatchObject({ total: 0, works: [] });
    expect(seen[0]).toContain('mailto:lab@fptu.edu.vn');
  });

  it('resolves an author by ORCID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('filter=orcid%3A0000-0002-1825-0097');
        return jsonResponse({
          results: [
            {
              id: 'https://openalex.org/A5023888391',
              display_name: 'Jane Doe',
              orcid: 'https://orcid.org/0000-0002-1825-0097',
              works_count: 3,
            },
          ],
        });
      }),
    );
    const author = await makeClient().getAuthorByOrcid('0000-0002-1825-0097');
    expect(author).toMatchObject({
      id: 'https://openalex.org/A5023888391',
      shortId: 'A5023888391',
      displayName: 'Jane Doe',
      worksCount: 3,
    });
  });

  it('raises author_not_found when OpenAlex knows no such ORCID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [] })),
    );
    const err = await makeClient()
      .getAuthorByOrcid('0000-0000-0000-0000')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'openalex_author_not_found',
    );
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('shapes works with reconstructed abstracts and ordered authors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          meta: { count: 1 },
          results: [
            {
              id: 'https://openalex.org/W2741809807',
              doi: 'https://doi.org/10.1234/ABC',
              title: '  Some title  ',
              abstract_inverted_index: { Some: [0], title: [1] },
              primary_location: { source: { display_name: 'Nature' } },
              publication_year: 2020,
              type: 'article',
              authorships: [
                {
                  raw_author_name: 'Doe, Jane',
                  is_corresponding: true,
                  author: {
                    id: 'https://openalex.org/A1',
                    orcid: 'https://orcid.org/0000-0002-1825-0097',
                  },
                },
                {
                  raw_author_name: '',
                  author: { display_name: 'John Smith' },
                },
              ],
            },
          ],
        }),
      ),
    );
    const page = await makeClient().getWorksByAuthor('https://openalex.org/A1');
    expect(page.total).toBe(1);
    expect(page.works[0]).toMatchObject({
      shortId: 'W2741809807',
      doi: '10.1234/abc',
      title: 'Some title',
      abstract: 'Some title',
      venue: 'Nature',
      publicationYear: 2020,
      outputType: 'PAPER',
    });
    expect(page.works[0].authors).toEqual([
      {
        order: 1,
        name: 'Doe, Jane',
        isCorresponding: true,
        authorId: 'https://openalex.org/A1',
        orcid: 'https://orcid.org/0000-0002-1825-0097',
      },
      {
        order: 2,
        name: 'John Smith',
        isCorresponding: false,
        authorId: null,
        orcid: null,
      },
    ]);
  });

  it('fetches a single work and maps a missing abstract to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('/works/W1');
        return jsonResponse({
          id: 'https://openalex.org/W1',
          title: 'T',
          type: 'dataset',
          authorships: [],
        });
      }),
    );
    const work = await makeClient().getWork('W1');
    expect(work.abstract).toBeNull();
    expect(work.outputType).toBe('DATASET');
  });

  it('raises work_not_found on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 404)),
    );
    const err = await makeClient()
      .getWork('W-missing')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('openalex_work_not_found');
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('retries a rate limit then succeeds', async () => {
    const fetch = vi.fn(async () => jsonResponse({ results: [] }));
    fetch
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 0 }, results: [] }));
    vi.stubGlobal('fetch', fetch);
    const page = await makeClient().getWorksByAuthor('A1');
    expect(page.total).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces upstream failures as unavailable, never a 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );
    const err = await makeClient()
      .getAuthorByOrcid('0000-0002-1825-0097')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('openalex_unavailable');
    expect((err as CodedHttpException).getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
