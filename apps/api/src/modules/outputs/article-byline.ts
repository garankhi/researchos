import { createHash } from 'node:crypto';
import type {
  OutputAuthor,
  OutputRevision,
  Prisma,
} from '@researchos/database';
import type { OutputAuthorResponseDto } from './dto/output-author-response.dto.js';

type SnapshotAuthor = Prisma.JsonObject & { name: string; order: number };

export function snapshotAuthors(snapshot: Prisma.JsonValue): SnapshotAuthor[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.filter(
    (author): author is SnapshotAuthor =>
      !!author &&
      typeof author === 'object' &&
      !Array.isArray(author) &&
      typeof author.name === 'string' &&
      typeof author.order === 'number',
  );
}

/** Fill in the draft's missing author metadata before the release is locked. */
export function completeArticleByline(
  snapshot: Prisma.JsonValue,
  authors: OutputAuthor[],
): Prisma.InputJsonArray {
  const entries = snapshotAuthors(snapshot);
  if (entries.length === 0) {
    return authors.map((author) => ({
      id: author.id,
      name: author.author_name_string,
      order: author.author_order,
      userId: author.user_id,
      isCorresponding: author.is_corresponding_author,
    }));
  }

  const byOrder = new Map(
    authors.map((author) => [author.author_order, author]),
  );
  return entries.map((entry) => {
    const author = byOrder.get(entry.order);
    const match =
      author?.author_name_string === entry.name ? author : undefined;
    return {
      ...entry,
      ...(entry.id === undefined && match && { id: match.id }),
      userId:
        entry.userId === undefined ? (match?.user_id ?? null) : entry.userId,
      isCorresponding:
        entry.isCorresponding === undefined
          ? (match?.is_corresponding_author ?? false)
          : entry.isCorresponding,
    };
  });
}

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
  return snapshotAuthors(revision.authors_snapshot)
    .map((author) => ({
      id:
        typeof author.id === 'string'
          ? author.id
          : snapshotAuthorId(revision.id, author.order),
      outputId: revision.output_id,
      userId: typeof author.userId === 'string' ? author.userId : null,
      authorNameString: author.name,
      authorOrder: author.order,
      isCorrespondingAuthor: author.isCorresponding === true,
    }))
    .sort((a, b) => a.authorOrder - b.authorOrder);
}
