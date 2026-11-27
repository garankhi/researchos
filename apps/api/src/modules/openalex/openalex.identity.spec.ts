import { describe, expect, it } from 'vitest';
import {
  affiliationMatchesFpt,
  filterWorksByAuthorship,
  findAuthorshipByName,
  namesMatch,
  normalizeOrcidValue,
  resolveAuthorshipOrder,
  resolveSnapshotOrder,
  shortAuthorId,
} from './openalex.identity.js';
import type { OpenAlexWork, OpenAlexWorkAuthor } from './openalex.types.js';

function author(
  order: number,
  name: string,
  overrides: Partial<OpenAlexWorkAuthor> = {},
): OpenAlexWorkAuthor {
  return {
    order,
    name,
    isCorresponding: false,
    authorId: null,
    orcid: null,
    affiliations: ['FPT University, Can Tho, Viet Nam'],
    ...overrides,
  };
}

function work(authors: OpenAlexWorkAuthor[]): OpenAlexWork {
  return {
    id: 'https://openalex.org/W1',
    shortId: 'W1',
    doi: null,
    title: 'T',
    abstract: null,
    venue: null,
    publicationYear: 2020,
    rawType: 'article',
    outputType: 'ARTICLE',
    url: null,
    authors,
  };
}

describe('namesMatch', () => {
  it('matches the same name written in a different order', () => {
    expect(namesMatch('Thi Thuy An Ngo', 'Ngo Thi Thuy An')).toBe(true);
  });

  it('matches across diacritics', () => {
    expect(namesMatch('Nguyễn Văn An', 'Nguyen Van An')).toBe(true);
  });

  it('matches across a hyphen and an expanded given name', () => {
    expect(namesMatch('An-Van Nguyen', 'Nguyen Van An')).toBe(true);
  });

  it('drops honorifics and initials', () => {
    expect(namesMatch('Dr. T. A. Ngo', 'Thi Thuy An Ngo')).toBe(true);
  });

  it('rejects two researchers who share only a surname', () => {
    expect(namesMatch('Van An Nguyen', 'Thi Thuy An Ngo')).toBe(false);
  });

  it('rejects a byline that names a different given name', () => {
    // "Dat Quang Tran" and "Tran Quang" share the tokens `tran` and
    // `quang`, but `dat` is a different given name — a different
    // researcher at FPT University.
    expect(namesMatch('Dat Quang Tran', 'Tran Quang')).toBe(false);
    expect(namesMatch('Tran Quang Khai', 'Tran Quang')).toBe(false);
    expect(namesMatch('Quang-Duong Tran', 'Tran Quang')).toBe(false);
  });

  it('rejects a byline that carries an extra given name', () => {
    expect(namesMatch('Hien Tran Quang Nguyen', 'Tran Quang')).toBe(false);
    expect(namesMatch('Tran Quang Quan', 'Tran Quang')).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(namesMatch('   ', 'Nguyen Van An')).toBe(false);
    expect(namesMatch('Nguyen Van An', '')).toBe(false);
  });
});

describe('affiliationMatchesFpt', () => {
  it('matches a raw affiliation that carries the institution name', () => {
    expect(affiliationMatchesFpt(['FPT University, Can Tho, Viet Nam'])).toBe(
      true,
    );
  });

  it('rejects another institution', () => {
    expect(affiliationMatchesFpt(['University of Hanoi'])).toBe(false);
  });

  it('rejects an empty affiliation list', () => {
    expect(affiliationMatchesFpt([])).toBe(false);
    expect(affiliationMatchesFpt(null)).toBe(false);
  });
});

describe('findAuthorshipByName', () => {
  it('returns the authorship that pairs the name with FPT University', () => {
    const matched = findAuthorshipByName(
      work([
        author(1, 'Someone Else', { affiliations: ['FPT University'] }),
        author(2, 'Nguyen Van An', { affiliations: ['FPT University'] }),
      ]),
      'Nguyen Van An',
    );
    expect(matched?.order).toBe(2);
  });

  it('returns null when the name matches but the affiliation does not', () => {
    const matched = findAuthorshipByName(
      work([author(1, 'Nguyen Van An', { affiliations: ['Elsewhere'] })]),
      'Nguyen Van An',
    );
    expect(matched).toBeNull();
  });

  it('returns null when the name is ambiguous', () => {
    const matched = findAuthorshipByName(
      work([author(1, 'Nguyen Van An'), author(2, 'Nguyen Van An')]),
      'Nguyen Van An',
    );
    expect(matched).toBeNull();
  });
});

describe('filterWorksByAuthorship', () => {
  it('drops a work whose named byline is not at FPT University', () => {
    const kept = filterWorksByAuthorship(
      [
        work([author(1, 'Nguyen Van An')]),
        work([
          author(1, 'Nguyen Van An', { affiliations: ['Elsewhere'] }),
          author(2, 'Someone Else'),
        ]),
      ],
      'Nguyen Van An',
    );
    expect(kept).toHaveLength(1);
  });
});

describe('shortAuthorId', () => {
  it('reduces a canonical url to the short id', () => {
    expect(shortAuthorId('https://openalex.org/A5023888391')).toBe(
      'A5023888391',
    );
  });

  it('keeps a short id as it is', () => {
    expect(shortAuthorId('A5023888391')).toBe('A5023888391');
  });

  it('rejects a blank id', () => {
    expect(shortAuthorId('  ')).toBeNull();
    expect(shortAuthorId(null)).toBeNull();
  });
});

describe('normalizeOrcidValue', () => {
  it('reduces the url form to the bare form', () => {
    expect(normalizeOrcidValue('https://orcid.org/0000-0002-1825-0097')).toBe(
      '0000-0002-1825-0097',
    );
  });

  it('keeps the bare form as it is', () => {
    expect(normalizeOrcidValue('0000-0002-1825-0097')).toBe(
      '0000-0002-1825-0097',
    );
  });
});

describe('resolveAuthorshipOrder', () => {
  const identity = {
    openAlexAuthorId: 'A1',
    orcid: 'https://orcid.org/0000-0002-1825-0097',
    name: 'Nguyen Van An',
  };

  it('resolves through the OpenAlex author id first', () => {
    const resolved = resolveAuthorshipOrder(
      work([
        author(1, 'Someone Else', { authorId: 'A1' }),
        author(2, 'Nguyen Van An', {
          authorId: 'A2',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        }),
      ]),
      identity,
    );
    expect(resolved).toEqual({ order: 1, tier: 'AUTHOR_ID' });
  });

  it('refuses the OpenAlex author id when the byline is not at FPT', () => {
    // A merged OpenAlex profile carries the bylines of several
    // researchers. The id alone does not make the byline the
    // researcher's — the affiliation does.
    const resolved = resolveAuthorshipOrder(
      work([
        author(1, 'P Angel', {
          authorId: 'A1',
          affiliations: ['Assam Agricultural University'],
        }),
      ]),
      identity,
    );
    expect(resolved).toBeNull();
  });

  it('falls back to the ORCID', () => {
    const resolved = resolveAuthorshipOrder(
      work([
        author(1, 'Someone Else'),
        author(2, 'Nguyen Van An', {
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        }),
      ]),
      { ...identity, openAlexAuthorId: null },
    );
    expect(resolved).toEqual({ order: 2, tier: 'ORCID' });
  });

  it('refuses the ORCID when the byline is not at FPT', () => {
    // The same ORCID is claimed by authorships all over the world. A
    // byline at another institution is another person's work.
    const resolved = resolveAuthorshipOrder(
      work([
        author(1, 'P Angel', {
          orcid: 'https://orcid.org/0000-0002-1825-0097',
          affiliations: ['Assam Agricultural University'],
        }),
      ]),
      { ...identity, openAlexAuthorId: null },
    );
    expect(resolved).toBeNull();
  });

  it('falls back to the name plus the FPT affiliation', () => {
    const resolved = resolveAuthorshipOrder(
      work([author(1, 'Someone Else'), author(2, 'Nguyen Van An')]),
      { ...identity, openAlexAuthorId: null, orcid: null },
    );
    expect(resolved).toEqual({ order: 2, tier: 'NAME' });
  });

  it('resolves nothing when the name matches a byline at another institution', () => {
    const resolved = resolveAuthorshipOrder(
      work([author(1, 'Nguyen Van An', { affiliations: ['Elsewhere'] })]),
      { ...identity, openAlexAuthorId: null, orcid: null },
    );
    expect(resolved).toBeNull();
  });
});

describe('resolveSnapshotOrder', () => {
  const identity = {
    openAlexAuthorId: 'A1',
    orcid: 'https://orcid.org/0000-0002-1825-0097',
    name: 'Nguyen Van An',
  };

  it('resolves through the OpenAlex author id', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'Someone Else',
          order: 1,
          openAlexAuthorId: 'A1',
          affiliations: ['FPT University'],
        },
        { name: 'Nguyen Van An', order: 2, openAlexAuthorId: 'A2' },
      ],
      identity,
    );
    expect(order).toBe(1);
  });

  it('refuses the OpenAlex author id when the byline is not at FPT', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'P Angel',
          order: 1,
          openAlexAuthorId: 'A1',
          affiliations: ['Assam Agricultural University'],
        },
      ],
      identity,
    );
    expect(order).toBeNull();
  });

  it('refuses the ORCID when the byline is not at FPT', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'P Angel',
          order: 1,
          orcid: 'https://orcid.org/0000-0002-1825-0097',
          affiliations: ['Assam Agricultural University'],
        },
      ],
      { ...identity, openAlexAuthorId: null },
    );
    expect(order).toBeNull();
  });

  it('refuses the ORCID when the snapshot records no affiliation', () => {
    // An entry with no affiliation cannot be told apart from the
    // bylines that share the ORCID, so it does not qualify.
    const order = resolveSnapshotOrder(
      [
        {
          name: 'P Angel',
          order: 1,
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
      ],
      { ...identity, openAlexAuthorId: null },
    );
    expect(order).toBeNull();
  });

  it('refuses the ORCID when the snapshot records no affiliation but the name does match', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'Nguyen Van An',
          order: 1,
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
      ],
      { ...identity, openAlexAuthorId: null },
    );
    expect(order).toBe(1);
  });

  it('falls back to the ORCID', () => {
    const order = resolveSnapshotOrder(
      [
        { name: 'Someone Else', order: 1, orcid: null },
        {
          name: 'Nguyen Van An',
          order: 2,
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
      ],
      { ...identity, openAlexAuthorId: null },
    );
    expect(order).toBe(2);
  });

  it('falls back to the name, and accepts a snapshot with no affiliation', () => {
    const order = resolveSnapshotOrder([{ name: 'Nguyen Van An', order: 3 }], {
      ...identity,
      openAlexAuthorId: null,
      orcid: null,
    });
    expect(order).toBe(3);
  });

  it('checks the affiliation when the snapshot carries one', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'Nguyen Van An',
          order: 1,
          affiliations: ['University of Hanoi'],
        },
      ],
      { ...identity, openAlexAuthorId: null, orcid: null },
    );
    expect(order).toBeNull();
  });

  it('accepts the FPT affiliation written as a raw string', () => {
    const order = resolveSnapshotOrder(
      [
        {
          name: 'Nguyen Van An',
          order: 1,
          affiliations: 'FPT University, Can Tho, Viet Nam',
        },
      ],
      { ...identity, openAlexAuthorId: null, orcid: null },
    );
    expect(order).toBe(1);
  });

  it('resolves nothing when the name is ambiguous', () => {
    const order = resolveSnapshotOrder(
      [
        { name: 'Nguyen Van An', order: 1 },
        { name: 'Nguyen Van An', order: 2 },
      ],
      { ...identity, openAlexAuthorId: null, orcid: null },
    );
    expect(order).toBeNull();
  });

  it('resolves nothing for a snapshot that is not an array', () => {
    expect(
      resolveSnapshotOrder(null, {
        ...identity,
        openAlexAuthorId: null,
        orcid: null,
      }),
    ).toBeNull();
  });
});
