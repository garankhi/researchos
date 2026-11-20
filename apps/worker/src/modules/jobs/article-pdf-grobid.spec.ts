import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enrichArticlePdfMetadata as enrich,
  mergeGrobidMetadata,
  readGrobidHeader,
} from './article-pdf-grobid.js';

const enrichArticlePdfMetadata = (
  ...args: Parameters<typeof enrich> extends [...infer Args, unknown]
    ? Args
    : never
) =>
  enrich(...args, async ({ metadata, evidence, xml }) =>
    mergeGrobidMetadata(metadata, evidence, xml),
  );

const author = (given: string, family: string, affiliation = '') =>
  '<author><persName><forename>' +
  given +
  '</forename><surname>' +
  family +
  '</surname></persName>' +
  affiliation +
  '</author>';

const page = (...texts: string[]) =>
  texts.map((text, index) => ({
    text,
    y: index * 12,
    height: 12,
    left: 20,
    right: 240,
  }));

function tei(analytic: string, monograph = '', abstract = ''): string {
  return `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
    <publicationStmt><date when="2026-11-01"/></publicationStmt>
    <sourceDesc><biblStruct><analytic>${analytic}</analytic>
      <monogr><imprint>${monograph}</imprint></monogr>
    </biblStruct></sourceDesc></fileDesc>
    <profileDesc>${abstract}</profileDesc></teiHeader>
    <text><body><figure><idno type="DOI">10.1234/figure</idno></figure></body></text></TEI>`;
}

describe('readGrobidHeader', () => {
  it('reads the article header, including the order and diacritics of the visible byline', () => {
    const xml = tei(
      `<title level="a" type="main">Nước &amp; mùa vụ</title>
      <author><persName><forename type="first">Thị Mai</forename>
        <surname>Nguyễn</surname></persName></author>
      <author><persName><forename type="first">An</forename>
        <surname>Lê</surname></persName></author>
      <idno type="DOI">https://doi.org/10.1234/study</idno>`,
      '<date type="submitted" when="2024-01-03"/><date type="published" when="2024-05"/>',
      '<abstract><div><p>First <hi>paragraph</hi>.</p><p>Second paragraph.</p></div></abstract>',
    );
    expect(
      readGrobidHeader(xml, 'Nước & mùa vụ\nNguyễn Thị Mai và Lê An'),
    ).toEqual({
      title: 'Nước & mùa vụ',
      authorNames: ['Nguyễn Thị Mai', 'Lê An'],
      abstract: 'First paragraph. Second paragraph.',
      publicationDate: '2024-05',
      doi: '10.1234/study',
    });
  });

  it('ignores ambiguous DOI candidates, nonpublication dates and identifiers inside captions', () => {
    const xml = tei(
      '<title level="a">Water clarity</title><idno type="DOI">10.1234/one</idno><idno type="DOI">10.1234/two</idno>',
      '<date type="accepted" when="2024-01-03"/>',
    );
    expect(readGrobidHeader(xml, 'Water clarity')).toEqual({
      title: 'Water clarity',
    });
    expect(
      readGrobidHeader(tei('<title>Water clarity</title>'), 'Water clarity'),
    ).toEqual({
      title: 'Water clarity',
    });
  });

  it('rejects malformed TEI and document types', () => {
    expect(() => readGrobidHeader('<TEI><teiHeader>', '')).toThrow();
    expect(() => readGrobidHeader('<!DOCTYPE TEI>' + tei(''), '')).toThrow();
  });

  it.each([false, true])(
    'preserves wrapped authors and removes a corroborated affiliation (%s)',
    (affiliation) => {
      const lines = [
        ['Mai Nguyen, Bao Tran, An Le', 18],
        ['†', 28],
        [affiliation ? 'River Studies' : 'Thanh Pham', 30],
        ['Watershed Institute', 44],
        ['contact@river.example', 72],
        ['Abstract', 100],
      ] as const;
      const page = lines.map(([text, y]) => ({
        text,
        y,
        height: 12,
        left: 20,
        right: 240,
      }));
      const xml = tei(
        [
          ['Mai', 'Nguyen'],
          ['Bao', 'Tran'],
          ['An', 'Le'],
          affiliation ? ['River', 'Studies'] : ['Thanh', 'Pham'],
        ]
          .map(([given, family]) =>
            author(
              given,
              family,
              affiliation && given === 'Mai'
                ? '<affiliation><orgName>River Studies</orgName></affiliation>'
                : '',
            ),
          )
          .join(''),
      );
      expect(
        readGrobidHeader(xml, lines.map(([text]) => text).join('\n'), page)
          .authorNames,
      ).toEqual([
        'Mai Nguyen',
        'Bao Tran',
        'An Le',
        ...(affiliation ? [] : ['Thanh Pham']),
      ]);
    },
  );

  it('preserves Vietnamese display order across Unicode forms and keeps distinct same-name authors', () => {
    const xml = tei(
      author('Thị Mai', 'Nguyễn') +
        author(
          'John',
          'Smith',
          '<affiliation><orgName>North Lab</orgName></affiliation>',
        ) +
        author(
          'John',
          'Smith',
          '<affiliation><orgName>South Lab</orgName></affiliation>',
        ),
    );
    const texts = ['Nguyễn Thị Mai', 'John Smith', 'John Smith'].map((name) =>
      name.normalize('NFD'),
    );
    expect(
      readGrobidHeader(xml, texts.join('\n'), page(...texts)).authorNames,
    ).toEqual(['Nguyễn Thị Mai', 'John Smith', 'John Smith']);
  });

  it.each([false, true])(
    'joins adjacent TEI fragments only when they exactly cover a visible author (%s)',
    (sameOrder) => {
      const names = [
        author('Hồng Minh', 'Hoàng'),
        author('Văn', 'Phạm'),
        author('Đăng', 'Trí'),
      ];
      if (!sameOrder) [names[1], names[2]] = [names[2], names[1]];
      const visible = 'Hồng Minh Hoàng và Văn Phạm Đăng Trí';
      expect(
        readGrobidHeader(tei(names.join('')), visible, page(visible))
          .authorNames,
      ).toEqual(
        sameOrder
          ? ['Hồng Minh Hoàng', 'Văn Phạm Đăng Trí']
          : ['Hồng Minh Hoàng', 'Đăng Trí', 'Văn Phạm'],
      );
    },
  );

  it('keeps an arXiv revision stamp out of publicationDate', () => {
    expect(
      readGrobidHeader(
        tei(
          '<title>Water clarity</title>',
          '<date type="published" when="2023-08-02"/>',
        ),
        'Water clarity\narXiv:1706.03762v7 [cs.CL] 2 Aug 2023',
      ),
    ).toEqual({ title: 'Water clarity' });
  });
});

describe('enrichArticlePdfMetadata', () => {
  const settings = {
    endpoint: new URL('http://127.0.0.1:8070/api/processHeaderDocument'),
    timeoutMs: 100,
  };
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const evidence = {
    hasText: true,
    firstPage: [
      { text: 'Water clarity', x: 0, y: 0, height: 14, left: 40, right: 140 },
    ],
  };

  afterEach(() => vi.unstubAllGlobals());

  it('uses multipart header extraction to fill gaps while retaining grounded parser fields', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          tei(
            '<title>Different title</title><author><persName><forename>Mai</forename><surname>Nguyen</surname></persName></author>',
          ),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await enrichArticlePdfMetadata(
      { title: 'Water clarity', publicationDate: '2025' },
      evidence,
      pdf,
      settings,
      new AbortController().signal,
    );
    expect(result).toEqual({
      title: 'Water clarity',
      authorNames: ['Mai Nguyen'],
      publicationDate: '2025',
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      settings.endpoint,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: expect.any(FormData),
      }),
    );
    const body = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('consolidateHeader')).toBe('0');
    expect(await (body.get('input') as Blob).text()).toBe('%PDF-1.4');
  });

  it.each([204, 503])(
    'keeps partial parser metadata when GROBID returns %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status })),
      );
      const metadata = { title: 'Water clarity' };
      await expect(
        enrichArticlePdfMetadata(
          metadata,
          evidence,
          pdf,
          settings,
          new AbortController().signal,
        ),
      ).resolves.toEqual(metadata);
    },
  );

  it('keeps the baseline when GROBID returns malformed TEI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<teiHeader>broken')),
    );
    const metadata = { title: 'Water clarity' };
    await expect(
      enrichArticlePdfMetadata(
        metadata,
        evidence,
        pdf,
        settings,
        new AbortController().signal,
      ),
    ).resolves.toEqual(metadata);
  });

  it('omits an idno that appears only under a figure caption in the PDF', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            tei(
              '<title>Water clarity</title><idno type="DOI">10.1234/figure</idno>',
            ),
          ),
      ),
    );
    const metadata = { title: 'Water clarity' };
    const caption = [
      { ...evidence.firstPage[0], y: 25, text: 'Figure 1. Water samples' },
      { ...evidence.firstPage[0], y: 35, text: 'DOI: 10.1234/figure' },
    ];
    await expect(
      enrichArticlePdfMetadata(
        metadata,
        { ...evidence, firstPage: [...evidence.firstPage, ...caption] },
        pdf,
        settings,
        new AbortController().signal,
      ),
    ).resolves.toEqual(metadata);
  });

  it('requires DOI evidence in the bibliography rather than a mention in the abstract', () => {
    const xml = tei('<idno type="DOI">10.1234/previous</idno>');
    expect(
      mergeGrobidMetadata(
        {},
        {
          hasText: true,
          firstPage: page(
            'Water clarity',
            'Abstract: We compared results at 10.1234/previous',
          ),
        },
        xml,
      ),
    ).toEqual({});
    expect(
      mergeGrobidMetadata(
        {},
        {
          hasText: true,
          firstPage: page('Water clarity', '10.1234/previous', 'Abstract'),
        },
        xml,
      ),
    ).toEqual({ doi: '10.1234/previous' });
  });

  it('keeps date precision and rejects a mislabeled acceptance date', () => {
    const xml = tei('', '<date type="published" when="2025-05-16"/>');
    expect(
      mergeGrobidMetadata(
        {},
        {
          hasText: true,
          firstPage: page('Water clarity', 'Accepted 16 May 2025'),
        },
        xml,
      ),
    ).toEqual({});
    expect(
      mergeGrobidMetadata(
        {},
        {
          hasText: true,
          firstPage: page('Water clarity', 'Published: May 16, 2025'),
        },
        xml,
      ),
    ).toEqual({ publicationDate: '2025-05-16' });
    expect(
      mergeGrobidMetadata(
        {},
        {
          hasText: true,
          firstPage: page('Water clarity', 'Ngày xuất bản: 05/2025'),
        },
        tei('', '<date type="published" when="2025-05"/>'),
      ),
    ).toEqual({ publicationDate: '2025-05' });
  });

  it.each([undefined, 'Water samples showed improved clarity.'])(
    'replaces a conflicting byline independently of the title (%s)',
    async (abstract) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(tei(author('Mai', 'Nguyen')))),
      );
      const metadata = {
        title: 'Water clarity',
        authorNames: ['Office Account'],
        abstract,
      };
      const firstPage = page(
        'Water clarity',
        'Mai Nguyen',
        'Abstract: Water samples showed improved clarity.',
      );
      await expect(
        enrichArticlePdfMetadata(
          metadata,
          { hasText: true, firstPage },
          pdf,
          settings,
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({
        title: 'Water clarity',
        authorNames: ['Mai Nguyen'],
      });
    },
  );

  it('discards a result received after the deadline during header mapping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(tei('<title>Water clarity</title>'))),
    );
    const sharedDeadline = new AbortController();
    const metadata = { authorNames: ['Mai Nguyen'] };
    const mapHeader = vi.fn(async () => {
      sharedDeadline.abort();
      return { title: 'Water clarity' };
    });
    await expect(
      enrich(
        metadata,
        evidence,
        pdf,
        settings,
        sharedDeadline.signal,
        mapHeader,
      ),
    ).resolves.toEqual(metadata);
    expect(mapHeader).toHaveBeenCalledOnce();
  });

  it('keeps partial parser metadata when the shared extraction deadline expires during the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: URL, { signal }: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
    );
    const metadata = { title: 'Water clarity' };
    const deadline = new AbortController();
    const result = enrichArticlePdfMetadata(
      metadata,
      evidence,
      pdf,
      settings,
      deadline.signal,
    );
    deadline.abort();
    await expect(result).resolves.toEqual(metadata);
  });

  it('does not send scanned PDFs or text PDFs with complete core fields', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const complete = {
      title: 'Water clarity',
      authorNames: ['Mai Nguyen'],
      abstract: 'A clear result.',
    };
    const signal = new AbortController().signal;
    await expect(
      enrichArticlePdfMetadata(complete, evidence, pdf, settings, signal),
    ).resolves.toEqual(complete);
    await expect(
      enrichArticlePdfMetadata(
        {},
        { ...evidence, hasText: false },
        pdf,
        settings,
        signal,
      ),
    ).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('replaces an abstract interrupted by an arXiv page stamp', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            tei(
              '',
              '',
              '<abstract><p>Our measurements showed a clear result.</p></abstract>',
            ),
          ),
      ),
    );
    await expect(
      enrichArticlePdfMetadata(
        {
          title: 'Water clarity',
          authorNames: ['Mai Nguyen'],
          abstract:
            'Our measurements arXiv:2005.11401v4 [cs.CL] showed a clear result.',
        },
        evidence,
        pdf,
        settings,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      abstract: 'Our measurements showed a clear result.',
    });
  });
});
