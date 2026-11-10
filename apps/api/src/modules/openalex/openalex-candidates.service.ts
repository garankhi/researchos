import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type ClaimStatus } from '@researchos/database';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import {
  CandidateWorkDto,
  CandidateWorksCountDto,
  PaginatedCandidateWorksResponseDto,
} from './dto/candidate-work-response.dto.js';
import { ListCandidateWorksQueryDto } from './dto/list-candidate-works.query.dto.js';
import { OPENALEX_SOURCE } from './openalex-ingest.service.js';

/** One row of the suggestion queue: the work id and its DOI. */
interface SuggestionRow {
  /** The `research_outputs.id` of the candidate. */
  id: string;
  /** The normalised DOI, or null when the work has none. */
  doi: string | null;
}

/** The editable draft revision a candidate is read through. */
interface DraftRevision {
  title: string;
  abstract: string | null;
  venue: string | null;
  publication_year: number | null;
  output_type: string;
  external_url: string | null;
  authors_snapshot: unknown;
}

/** The caller's own claim row on a candidate. */
interface ClaimRow {
  status: ClaimStatus;
  match_source: string;
}

/**
 * Reads author display names out of a revision's authors snapshot.
 *
 * The snapshot is the `[{ name, order, ... }]` array the ingest wrote, in
 * arbitrary order. Entries without a usable name fall back to
 * `Unknown author`, matching the ingest's own fallback. Anything that is
 * not an array yields no authors rather than a crash.
 */
function toAuthorNames(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  return snapshot
    .filter(
      (entry): entry is { name?: unknown; order?: unknown } =>
        typeof entry === 'object' && entry !== null,
    )
    .sort((a, b) => toOrder(a.order) - toOrder(b.order))
    .map((entry) =>
      typeof entry.name === 'string' && entry.name !== ''
        ? entry.name
        : 'Unknown author',
    );
}

function toOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The stored-candidate reads of the pull (RES-138).
 *
 * Lists the candidates the ingest (RES-137) persisted with
 * `import_state = 'CANDIDATE'` and counts the ones still awaiting the
 * researcher's decision, for the entry card. Both read the stored rows —
 * never OpenAlex — through `visible_candidate_suggestions`, so a rejected
 * work stays a candidate and only leaves *this* researcher's queue, while
 * a co-author still sees it.
 *
 * The researcher always comes from the session: a caller only ever sees
 * their own candidates.
 */
@Injectable()
export class OpenAlexCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists the caller's stored candidates, newest pull first.
   *
   * Each item carries the draft revision (title, abstract, venue, year,
   * type, URL, authors), the OpenAlex id from the external-id link and
   * the caller's own claim row. Storage failures propagate as 500s —
   * this endpoint never calls the external API.
   */
  async findAll(
    userId: string,
    query: ListCandidateWorksQueryDto,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    const { rows, total } = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<SuggestionRow[]>`
          SELECT o.id, s.doi
          FROM visible_candidate_suggestions(${userId}::uuid) AS s
          JOIN research_outputs AS o ON o.id = s.output_id
          ORDER BY o.created_at DESC, o.id DESC
          LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
        `;
        const [count] = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total
          FROM visible_candidate_suggestions(${userId}::uuid) AS s
        `;
        return { rows, total: Number(count?.total ?? 0n) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    if (rows.length === 0) {
      return { items: [], meta: buildPaginationMeta(query, 0, total) };
    }

    const ids = rows.map((row) => row.id);
    const [revisions, externalIds, claims] = await Promise.all([
      this.prisma.output_revisions.findMany({
        where: { output_id: { in: ids }, released_at: null },
      }),
      this.prisma.output_external_ids.findMany({
        where: { output_id: { in: ids }, source: OPENALEX_SOURCE },
        orderBy: { external_id: 'asc' },
      }),
      this.prisma.publication_claims.findMany({
        where: { output_id: { in: ids }, user_id: userId },
      }),
    ]);

    const revisionByOutput = new Map(
      revisions.map((revision) => [revision.output_id, revision]),
    );
    // A work can carry two OpenAlex rows (the re-import id plus the
    // DOI-match id); the first one identifies the candidate.
    const externalByOutput = new Map<string, string>();
    for (const link of externalIds) {
      if (!externalByOutput.has(link.output_id)) {
        externalByOutput.set(link.output_id, link.external_id);
      }
    }
    const claimByOutput = new Map(
      claims.map((claim) => [claim.output_id, claim]),
    );

    const items = rows.map((row) =>
      this.toCandidate(
        row,
        revisionByOutput.get(row.id),
        externalByOutput.get(row.id) ?? null,
        claimByOutput.get(row.id) ?? null,
      ),
    );
    return { items, meta: buildPaginationMeta(query, items.length, total) };
  }

  /**
   * Counts the caller's candidates still awaiting a decision.
   *
   * Cheap by design: it answers without the full list, so the entry card
   * can render before the pull runs.
   */
  async count(userId: string): Promise<CandidateWorksCountDto> {
    const [row] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM visible_candidate_suggestions(${userId}::uuid) AS s
    `;
    return { count: Number(row?.total ?? 0n) };
  }

  private toCandidate(
    row: SuggestionRow,
    revision: DraftRevision | undefined,
    openalexId: string | null,
    claim: ClaimRow | null,
  ): CandidateWorkDto {
    return {
      id: row.id,
      openalexId,
      doi: row.doi,
      // The ingest always writes a draft revision, so a missing one is
      // corrupt data rather than an empty candidate — fall back instead
      // of 500ing the whole page.
      title: revision?.title ?? 'Untitled work',
      abstract: revision?.abstract ?? null,
      venue: revision?.venue ?? null,
      publicationYear: revision?.publication_year ?? null,
      outputType: revision?.output_type ?? 'PAPER',
      url: revision?.external_url ?? null,
      authors: toAuthorNames(revision?.authors_snapshot),
      claimStatus: claim?.status ?? null,
      matchSource: claim?.match_source ?? null,
    };
  }
}
