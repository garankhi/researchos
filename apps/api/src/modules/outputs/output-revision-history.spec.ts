import {
  PublicationStatusEnum,
  type OutputRevision,
} from '@researchos/database';
import { describe, expect, it } from 'vitest';
import { diffRevisions } from './output-revision-history.js';

const revision = (overrides: Partial<OutputRevision> = {}): OutputRevision =>
  ({
    id: 'rev-1',
    output_id: 'out-1',
    revision_no: 1,
    title: 'The Original Title',
    abstract: 'The original abstract',
    venue: 'Journal of Software',
    publisher: 'FPT Press',
    publication_year: 2026,
    publication_date: '2026-11',
    publication_status: PublicationStatusEnum.PUBLISHED,
    output_type: 'ARTICLE',
    volume: '12',
    issue: 'S1',
    pages: '101-113',
    peer_reviewed: true,
    external_url: 'https://doi.org/10.1234/test.2026',
    authors_snapshot: [{ name: 'Prof. Author', order: 1 }],
    created_by: 'user-1',
    released_by: 'user-1',
    released_at: new Date('2026-11-11T00:00:00.000Z'),
    created_at: new Date('2026-11-10T12:00:00.000Z'),
    updated_at: new Date('2026-11-10T12:00:00.000Z'),
    ...overrides,
  }) as OutputRevision;

describe('diffRevisions', () => {
  it('reports nothing when the two revisions carry the same metadata', () => {
    expect(diffRevisions(revision(), revision())).toEqual([]);
  });

  it('reports the fields that changed, with the values on both sides', () => {
    const changes = diffRevisions(
      revision(),
      revision({ title: 'A Newer Title', venue: 'Journal of Hardware' }),
    );

    expect(changes).toEqual([
      {
        field: 'title',
        previousValue: 'The Original Title',
        currentValue: 'A Newer Title',
      },
      {
        field: 'venue',
        previousValue: 'Journal of Software',
        currentValue: 'Journal of Hardware',
      },
    ]);
  });

  it('reports a field that was cleared as a change to no value', () => {
    const changes = diffRevisions(revision(), revision({ abstract: null }));

    expect(changes).toEqual([
      {
        field: 'abstract',
        previousValue: 'The original abstract',
        currentValue: null,
      },
    ]);
  });

  it('reports a changed byline as one field', () => {
    const changes = diffRevisions(
      revision(),
      revision({
        authors_snapshot: [
          { name: 'Prof. Author', order: 1 },
          { name: 'Dr. Coauthor', order: 2 },
        ],
      }),
    );

    expect(changes).toEqual([
      {
        field: 'authors',
        previousValue: 'Prof. Author',
        currentValue: 'Prof. Author, Dr. Coauthor',
      },
    ]);
  });

  it('falls back to the publication year when the date carries no precision', () => {
    const changes = diffRevisions(
      revision({ publication_date: null }),
      revision({ publication_date: null, publication_year: 2027 }),
    );

    expect(changes).toEqual([
      { field: 'publicationDate', previousValue: '2026', currentValue: '2027' },
    ]);
  });
});
