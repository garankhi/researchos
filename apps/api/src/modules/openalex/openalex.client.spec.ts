import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeDoi } from '@researchos/publication-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  mapOutputType,
  OpenAlexClient,
  reconstructAbstract,
} from './openalex.client.js';

function makeClient(
  mailto = 'test@researchos.local',
  apiKey?: string,
): OpenAlexClient {
  const config = {
    get: (key: string) => {
      if (key === 'OPENALEX_MAILTO') return mailto;
      if (key === 'OPENALEX_API_KEY') return apiKey;
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

  it.each([
    ['DOI:10.1000/Res#Test', '10.1000/res#test'],
    [
      'http://dx.doi.org/10.1000/Res%23Test?noredirect#copy',
      '10.1000/res#test',
    ],
    ['https://doi.org/10.1000/Res%3FTest', '10.1000/res?test'],
    ['https://doi.org/10.1000/literal%2523', '10.1000/literal%23'],
    ['10.1000/literal%23', '10.1000/literal%23'],
    ['https://doi.org/10.1000/./%C3%89', '10.1000/./É'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeDoi(value)).toBe(expected);
  });

  it.each(['%xy', '%e9', '%00'])(
    'rejects an invalid URL path escape %s',
    (escape) => {
      expect(normalizeDoi(`https://doi.org/10.1000/res${escape}`)).toBeNull();
    },
  );

  it('returns null for missing or blank DOIs', () => {
    expect(normalizeDoi(null)).toBeNull();
    expect(normalizeDoi('  ')).toBeNull();
  });
});

describe('mapOutputType', () => {
  it('maps known OpenAlex types', () => {
    expect(mapOutputType('article')).toBe('ARTICLE');
    expect(mapOutputType('dataset')).toBe('DATASET');
    expect(mapOutputType('book')).toBe('BOOK');
  });

  it('defaults unknown and missing types to ARTICLE', () => {
    expect(mapOutputType('something-new')).toBe('ARTICLE');
    expect(mapOutputType(null)).toBe('ARTICLE');
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

  it('resolves an author by its id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('/authors/A5023888391');
        return jsonResponse({
          id: 'https://openalex.org/A5023888391',
          display_name: 'Jane Doe',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
          works_count: 3,
        });
      }),
    );
    const author = await makeClient().getAuthorById('A5023888391');
    expect(author).toMatchObject({
      id: 'https://openalex.org/A5023888391',
      shortId: 'A5023888391',
      displayName: 'Jane Doe',
    });
  });

  it('raises author_not_found for a blank author id', async () => {
    const fetch = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const err = await makeClient()
      .getAuthorById('  ')
      .catch((e: unknown) => e);
    expect((err as CodedHttpException).message).toBe(
      'openalex_author_not_found',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('carries the recognition fields on a searched author', async () => {
    // The candidate list has to carry the evidence the researcher
    // recognises themselves by, and the search payload already holds
    // all of it — so no extra request is spent on it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              id: 'https://openalex.org/A1',
              display_name: 'Jane Doe',
              display_name_alternatives: ['J. Doe', 'Doe, Jane'],
              works_count: 42,
              cited_by_count: 318,
              summary_stats: { h_index: 7, i10_index: 4 },
              observed_orcids: ['https://orcid.org/0000-0002-1825-0097'],
              topics: [{ id: 'T1', display_name: 'Topic One', count: 3 }],
              affiliations: [
                {
                  institution: {
                    id: 'https://openalex.org/I109689652',
                    display_name: 'FPT University',
                    country_code: 'VN',
                    type: 'education',
                  },
                  years: [2020, 2026],
                },
              ],
            },
          ],
        }),
      ),
    );

    const [author] = await makeClient().searchAuthors('Jane Doe');

    expect(author.counts).toEqual({
      worksCount: 42,
      citedByCount: 318,
      hIndex: 7,
      i10Index: 4,
      twoYearMeanCitedness: null,
    });
    // The display name is shown on the card already, so it is not
    // repeated among the variants.
    expect(author.nameVariants).toEqual(['J. Doe', 'Doe, Jane']);
    expect(author.observedOrcids).toEqual([
      'https://orcid.org/0000-0002-1825-0097',
    ]);
    expect(author.topics[0]).toMatchObject({ name: 'Topic One', count: 3 });
    expect(author.affiliationHistory[0]).toMatchObject({
      institutionId: 'I109689652',
      name: 'FPT University',
      yearStart: 2020,
      yearEnd: 2026,
    });
  });

  it('buckets the recent works per author in one call', async () => {
    // One listing covers every candidate: the works are then bucketed
    // from the authorships the payload already carries.
    const fetch = vi.fn(async (url: unknown) => {
      // The filter is percent-encoded in the query string, so the pipe
      // between the ids arrives as %7C.
      expect(decodeURIComponent(String(url))).toContain('author.id:A1|A2');
      return jsonResponse({
        results: [
          {
            id: 'https://openalex.org/W1',
            title: 'A paper of the first author',
            publication_year: 2026,
            primary_location: { source: { display_name: 'Symmetry' } },
            authorships: [
              {
                author: { id: 'https://openalex.org/A1' },
                institutions: [{ display_name: 'FPT University' }],
              },
            ],
          },
          {
            id: 'https://openalex.org/W2',
            title: 'A paper of the second author',
            publication_year: 2025,
            authorships: [
              {
                author: { id: 'https://openalex.org/A2' },
                institutions: [{ display_name: 'Another University' }],
              },
            ],
          },
          {
            id: 'https://openalex.org/W3',
            title: 'A paper of both authors',
            publication_year: 2024,
            authorships: [
              { author: { id: 'https://openalex.org/A1' } },
              { author: { id: 'https://openalex.org/A2' } },
            ],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetch);

    const buckets = await makeClient().getRecentWorksByAuthors(['A1', 'A2']);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(buckets.get('A1')?.map((work) => work.shortId)).toEqual([
      'W1',
      'W3',
    ]);
    expect(buckets.get('A2')?.map((work) => work.shortId)).toEqual([
      'W2',
      'W3',
    ]);
    expect(buckets.get('A1')?.[0]).toMatchObject({
      title: 'A paper of the first author',
      publicationYear: 2026,
      venue: 'Symmetry',
      affiliation: 'FPT University',
    });
  });

  it('returns an empty bucket for an author without works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [] })),
    );

    const buckets = await makeClient().getRecentWorksByAuthors(['A1', 'A2']);

    expect(buckets.get('A1')).toEqual([]);
    expect(buckets.get('A2')).toEqual([]);
  });

  it('shapes the full author record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'https://openalex.org/A5027558961',
          display_name: 'Nguyen Hoang Khoi Tran',
          orcid: 'https://orcid.org/0000-0001-7323-9213',
          works_count: 313,
          cited_by_count: 14816,
          summary_stats: {
            h_index: 56,
            i10_index: 166,
            '2yr_mean_citedness': 12.3,
          },
          display_name_alternatives: ['N. H. Tran', 'Tran, Nguyen H'],
          affiliations: [
            {
              institution: {
                id: 'https://openalex.org/I109689652',
                ror: 'https://ror.org/03esj4g97',
                display_name: 'FPT University',
                country_code: 'VN',
                type: 'education',
              },
              years: [2023],
            },
          ],
        }),
      ),
    );

    const record = await makeClient().getAuthorRecord('A5027558961');

    expect(record.shortId).toBe('A5027558961');
    expect(record.counts).toEqual({
      worksCount: 313,
      citedByCount: 14816,
      hIndex: 56,
      i10Index: 166,
      twoYearMeanCitedness: 12.3,
    });
  });

  it('collects the observed byline spellings, canonical name included', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'https://openalex.org/A1',
          display_name: 'Jane Doe',
          display_name_alternatives: ['J. Doe', 'Doe, Jane'],
        }),
      ),
    );

    const record = await makeClient().getAuthorRecord('A1');

    expect(record.names).toEqual(['Jane Doe', 'J. Doe', 'Doe, Jane']);
  });

  it('reads the years of an affiliation as a range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'https://openalex.org/A1',
          display_name: 'Jane Doe',
          affiliations: [
            {
              institution: {
                id: 'https://openalex.org/I109689652',
                display_name: 'FPT University',
                type: 'education',
              },
              years: [2023, 2021, 2022],
            },
          ],
        }),
      ),
    );

    const record = await makeClient().getAuthorRecord('A1');

    expect(record.affiliations[0]).toMatchObject({
      institutionId: 'I109689652',
      yearStart: 2021,
      yearEnd: 2023,
    });
  });

  it('keeps the raw payload whole', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'https://openalex.org/A1',
          display_name: 'Jane Doe',
          counts_by_year: [{ year: 2023, works_count: 11 }],
        }),
      ),
    );

    const record = await makeClient().getAuthorRecord('A1');

    expect(record.raw.counts_by_year).toEqual([
      { year: 2023, works_count: 11 },
    ]);
  });

  it('resolves an author by ORCID, scoped to FPT University', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const href = String(url);
        expect(href).toContain('filter=orcid%3A0000-0002-1825-0097');
        // The affiliation scope is what makes the ORCID answer
        // trustworthy: an ORCID is often claimed by a merged author
        // profile at another institution.
        expect(href).toContain('affiliations.institution.id');
        expect(href).toContain('I109689652');
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
              doi: 'https://doi.org/10.1234/ABC%23edition',
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
      doi: '10.1234/abc#edition',
      title: 'Some title',
      abstract: 'Some title',
      venue: 'Nature',
      publicationYear: 2020,
      outputType: 'ARTICLE',
    });
    expect(page.works[0].authors).toEqual([
      {
        order: 1,
        name: 'Doe, Jane',
        isCorresponding: true,
        authorId: 'https://openalex.org/A1',
        orcid: 'https://orcid.org/0000-0002-1825-0097',
        affiliations: [],
      },
      {
        order: 2,
        name: 'John Smith',
        isCorresponding: false,
        authorId: null,
        orcid: null,
        affiliations: [],
      },
    ]);
  });

  it('scopes the works of an author to FPT University', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const href = String(url);
        expect(href).toContain('author.id%3AA1');
        // An OpenAlex author profile accumulates the works of every
        // byline merged into it, so the affiliation scope is what keeps
        // the pull from claiming another researcher's work.
        expect(href).toContain('authorships.institutions.id');
        expect(href).toContain('I109689652');
        return jsonResponse({ meta: { count: 0 }, results: [] });
      }),
    );
    await makeClient().getWorksByAuthor('A1');
  });

  it('scopes the author search to FPT University', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const href = String(url);
        expect(href).toContain('search=Nguyen');
        // A Vietnamese name matches thousands of authors worldwide;
        // the affiliation scope is what makes the list meaningful.
        expect(href).toContain('affiliations.institution.id');
        expect(href).toContain('I109689652');
        return jsonResponse({ results: [] });
      }),
    );
    await makeClient().searchAuthors('Nguyen');
  });

  it('sends the API key on every request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('api_key=test-key');
        return jsonResponse({ results: [] });
      }),
    );
    await makeClient('test@researchos.local', 'test-key').searchAuthors(
      'Nguyen',
    );
  });

  it('omits the API key when none is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).not.toContain('api_key');
        return jsonResponse({ results: [] });
      }),
    );
    await makeClient().searchAuthors('Nguyen');
  });

  it('keeps the affiliation of each authorship on the author entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          meta: { count: 1 },
          results: [
            {
              id: 'https://openalex.org/W1',
              title: 'T',
              type: 'article',
              authorships: [
                {
                  raw_author_name: 'Nguyen Van An',
                  raw_affiliation_strings: [
                    'FPT University, Can Tho, Viet Nam',
                  ],
                  institutions: [
                    { institution: { display_name: 'FPT University' } },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );
    const page = await makeClient().getWorksByAuthor('A1');
    expect(page.works[0].authors[0].affiliations).toEqual([
      'FPT University, Can Tho, Viet Nam',
      'FPT University',
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

  it('searches authors by name with affiliations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('search=Nguyen');
        return jsonResponse({
          results: [
            {
              id: 'https://openalex.org/A1',
              display_name: 'Nguyen Van An',
              last_known_institutions: [{ display_name: 'FPT University' }],
              works_count: 5,
            },
          ],
        });
      }),
    );
    const authors = await makeClient().searchAuthors('Nguyen Van An');
    expect(authors).toHaveLength(1);
    expect(authors[0]).toMatchObject({
      shortId: 'A1',
      displayName: 'Nguyen Van An',
      worksCount: 5,
    });
    expect(authors[0].affiliations).toEqual(['FPT University']);
  });

  it('returns an empty list for a blank author search', async () => {
    const fetch = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetch);
    await expect(makeClient().searchAuthors('   ')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('searches works by byline name plus the FPT affiliation fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const text = String(url);
        expect(text).toContain('/works?');
        expect(text).toContain('raw_author_name.search');
        // The affiliation is the institution id, not the raw string: it
        // matches the institution OpenAlex normalised every FPT
        // affiliation to, including the messy bylines.
        expect(text).toContain('authorships.institutions.id');
        expect(text).toContain('I109689652');
        // The name is not quoted. Quoting narrows the search to an
        // exact string most bylines never match.
        expect(text).not.toContain('%22Nguyen+Van+An%22');
        return jsonResponse({
          meta: { count: 1 },
          results: [
            {
              id: 'https://openalex.org/W9',
              title: 'Fallback work',
              type: 'article',
              authorships: [],
            },
          ],
        });
      }),
    );
    const page = await makeClient().searchWorksByAuthorName('Nguyen Van An');
    expect(page.total).toBe(1);
    expect(page.works[0]).toMatchObject({ shortId: 'W9' });
  });

  it('rejects a blank byline name without calling OpenAlex', async () => {
    const fetch = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetch);
    const err = await makeClient()
      .searchWorksByAuthorName('   ')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'openalex_author_not_found',
    );
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(fetch).not.toHaveBeenCalled();
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
