import { createHash } from 'node:crypto';
import type { OutputRevision } from '@researchos/database';
import type { OutputAuthorResponseDto } from './dto/output-author-response.dto.js';

/** Older snapshots predate author IDs. Give their entries stable display IDs. */
function snapshotAuthorId(revisionId: string, order: number): string {
  const hex = createHash('sha256')
    .update(`${revisionId}:${order}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function readArticleByline(
  revision: OutputRevision,
): OutputAuthorResponseDto[] {
  if (!Array.isArray(revision.authors_snapshot)) return [];

  return revision.authors_snapshot
    .flatMap((author) => {
      if (
        !author ||
        typeof author !== 'object' ||
        Array.isArray(author) ||
        typeof author.name !== 'string' ||
        typeof author.order !== 'number'
      ) {
        return [];
      }
      return [
        {
          id:
            typeof author.id === 'string'
              ? author.id
              : snapshotAuthorId(revision.id, author.order),
          outputId: revision.output_id,
          userId: typeof author.userId === 'string' ? author.userId : null,
          authorNameString: author.name,
          authorOrder: author.order,
          isCorrespondingAuthor: author.isCorresponding === true,
        },
      ];
    })
    .sort((a, b) => a.authorOrder - b.authorOrder);
}
