import type { OutputRevision } from '@researchos/database';
import type { OutputRevisionChangeDto } from './dto/output-revision-history-response.dto.js';

/**
 * The metadata fields the edit history compares.
 *
 * The key is what the frontend renders the label from, so it stays stable
 * and machine-readable — the wording belongs to the frontend's catalog.
 */
const TRACKED_FIELDS = [
  { key: 'title', read: (r: OutputRevision) => r.title },
  { key: 'abstract', read: (r: OutputRevision) => r.abstract ?? null },
  { key: 'venue', read: (r: OutputRevision) => r.venue ?? null },
  { key: 'publisher', read: (r: OutputRevision) => r.publisher ?? null },
  {
    key: 'publicationDate',
    read: (r: OutputRevision) =>
      r.publication_date ?? r.publication_year?.toString() ?? null,
  },
  { key: 'volume', read: (r: OutputRevision) => r.volume ?? null },
  { key: 'issue', read: (r: OutputRevision) => r.issue ?? null },
  { key: 'pages', read: (r: OutputRevision) => r.pages ?? null },
  {
    key: 'peerReviewed',
    read: (r: OutputRevision) =>
      r.peer_reviewed === null ? null : String(r.peer_reviewed),
  },
  { key: 'externalUrl', read: (r: OutputRevision) => r.external_url ?? null },
] as const;

/**
 * The byline of a revision, flattened for comparison.
 *
 * A revision keeps its own snapshot of the authors, so a change of byline
 * is a change of the snapshot. It is compared as one field: the history
 * says "the authors changed", not which name moved.
 */
function readAuthors(revision: OutputRevision): string | null {
  if (!Array.isArray(revision.authors_snapshot)) return null;
  const names = revision.authors_snapshot
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return null;
      }
      const name = (entry as { name?: unknown }).name;
      return typeof name === 'string' ? name : null;
    })
    .filter((name): name is string => name !== null);
  return names.length > 0 ? names.join(', ') : null;
}

/**
 * The fields one revision changed compared with the revision before it.
 *
 * A field that kept its value is not a change, and neither is one that
 * was empty before and empty after. The result is ordered by the field
 * list above, so the history reads the same way every time.
 */
export function diffRevisions(
  previous: OutputRevision,
  current: OutputRevision,
): OutputRevisionChangeDto[] {
  const changes: OutputRevisionChangeDto[] = [];

  for (const { key, read } of TRACKED_FIELDS) {
    const previousValue = read(previous);
    const currentValue = read(current);
    if (previousValue !== currentValue) {
      changes.push({ field: key, previousValue, currentValue });
    }
  }

  const previousAuthors = readAuthors(previous);
  const currentAuthors = readAuthors(current);
  if (previousAuthors !== currentAuthors) {
    changes.push({
      field: 'authors',
      previousValue: previousAuthors,
      currentValue: currentAuthors,
    });
  }

  return changes;
}
