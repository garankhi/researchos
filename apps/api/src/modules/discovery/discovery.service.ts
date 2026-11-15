import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OutputFileVisibility,
  Prisma,
  PrismaService,
  SearchEntityType,
} from '@researchos/database';
import { maxLength, minLength } from 'class-validator';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
  SearchQueryDto,
  SearchTab,
} from './dto/search-query.dto.js';
import { SearchCountsQueryDto } from './dto/search-counts-query.dto.js';
import { SearchCountsResponseDto } from './dto/search-counts-response.dto.js';
import {
  PaginatedSearchResultsResponseDto,
  SearchResultItemDto,
} from './dto/search-result-response.dto.js';

/**
 * Maximum statement execution time (in milliseconds) for a single search query.
 */
export const SEARCH_STATEMENT_TIMEOUT_MS = 2000;

const SEARCH_SORT_FIELDS = {
  rank: 'rank',
  title: 'title',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
} as const;

type SearchSortColumn =
  (typeof SEARCH_SORT_FIELDS)[keyof typeof SEARCH_SORT_FIELDS];

interface RawSearchIndexRow {
  entity_type: SearchEntityType;
  entity_id: string;
  revision_id: string | null;
  owner_id: string | null;
  visibility: OutputFileVisibility;
  access_group_id: string | null;
  title: string;
  body: string | null;
  authors_text: string | null;
  rank: number | string;
  updated_at: Date | string;
}

/**
 * One row of the per-tab count query: a `bigint` total per search tab.
 */
interface RawSearchCountRow {
  research: bigint | number | null;
  people: bigint | number | null;
  group_count: bigint | number | null;
  opportunity: bigint | number | null;
}

/**
 * Converts a PostgreSQL `bigint` count into a plain number for the wire.
 */
function toCount(value: bigint | number | null | undefined): number {
  return Number(value ?? 0);
}

/**
 * Escapes `%`, `_`, and `\` before building a PostgreSQL `ILIKE ... ESCAPE '\'` pattern
 * so user input is matched literally by the trigram index.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

function visibleSearchMatches(actorId: string, query: string): Prisma.Sql {
  const term = typeof query === 'string' ? query.trim() : '';
  if (
    !minLength(term, MIN_SEARCH_QUERY_LENGTH) ||
    !maxLength(term, MAX_SEARCH_QUERY_LENGTH) ||
    term.includes('\0')
  ) {
    throw new BadRequestException('validation_failed');
  }

  const likePattern = `%${escapeLikePattern(term)}%`;
  return Prisma.sql`
    FROM visible_search_index(${actorId}::uuid) v,
         websearch_to_tsquery('simple', ${term}) q
    WHERE (v.doc @@ q OR v.title ILIKE ${likePattern} ESCAPE '\\')
  `;
}

/**
 * Service backing the tabbed search endpoint (`GET /search`).
 *
 * - Each tab executes a separate, dedicated query over its slice of `search_index`
 *   (`OUTPUT`, `RESEARCHER`, `GROUP`, `OPPORTUNITY`).
 * - Permission filtering is applied inside the SQL query via `visible_search_index(actor)`
 *   so unauthorized records never enter the result set and `PRIVATE` shared works
 *   remain findable by their owner.
 * - Ranking uses `ts_rank` on text relevance only (`BR-11`, `S-33`).
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    actorId: string,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    switch (query.tab) {
      case SearchTab.RESEARCH:
        return this.searchResearchOutputs(actorId, query);
      case SearchTab.PEOPLE:
        return this.searchResearchers(actorId, query);
      case SearchTab.GROUP:
        return this.searchGroups(actorId, query);
      case SearchTab.OPPORTUNITY:
        return this.searchOpportunities(actorId, query);
      default:
        throw new BadRequestException('validation_failed');
    }
  }

  /**
   * Counts the permission-filtered matches of one term per search tab.
   *
   * The counts endpoint exists so a tab badge for a tab nobody has visited
   * yet has a source: one request replaces four `limit=1` requests that only
   * exist to read a total.
   *
   * Every count is permission-filtered exactly like the results it counts —
   * the same `visible_search_index(actor)` predicate over the same matching
   * expression — so a caller never sees a total for a slice they cannot read.
   */
  async counts(
    actorId: string,
    query: SearchCountsQueryDto,
  ): Promise<SearchCountsResponseDto> {
    const matches = visibleSearchMatches(actorId, query.q);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${SEARCH_STATEMENT_TIMEOUT_MS}ms'`,
      );

      const rows = await tx.$queryRaw<RawSearchCountRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE v.entity_type = ${SearchEntityType.OUTPUT}::search_entity_type)::bigint AS research,
          COUNT(*) FILTER (WHERE v.entity_type = ${SearchEntityType.RESEARCHER}::search_entity_type)::bigint AS people,
          COUNT(*) FILTER (WHERE v.entity_type = ${SearchEntityType.GROUP}::search_entity_type)::bigint AS group_count,
          COUNT(*) FILTER (WHERE v.entity_type = ${SearchEntityType.OPPORTUNITY}::search_entity_type)::bigint AS opportunity
        ${matches}
      `);

      const row = rows[0];

      return {
        research: toCount(row?.research),
        people: toCount(row?.people),
        group: toCount(row?.group_count),
        opportunity: toCount(row?.opportunity),
      };
    });
  }

  /**
   * Queries the `OUTPUT` slice of `search_index` for the `research` tab.
   */
  async searchResearchOutputs(
    actorId: string,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    return this.executeSliceQuery(actorId, SearchEntityType.OUTPUT, query);
  }

  /**
   * Queries the `RESEARCHER` slice of `search_index` for the `people` tab.
   * Ranking is strictly text relevance (`ts_rank`) with no computed faculty metric (`BR-11`, `S-33`).
   */
  async searchResearchers(
    actorId: string,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    return this.executeSliceQuery(actorId, SearchEntityType.RESEARCHER, query);
  }

  /**
   * Queries the `GROUP` slice of `search_index` for the `group` tab.
   */
  async searchGroups(
    actorId: string,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    return this.executeSliceQuery(actorId, SearchEntityType.GROUP, query);
  }

  /**
   * Queries the `OPPORTUNITY` slice of `search_index` for the `opportunity` tab.
   */
  async searchOpportunities(
    actorId: string,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    return this.executeSliceQuery(actorId, SearchEntityType.OPPORTUNITY, query);
  }

  private async executeSliceQuery(
    actorId: string,
    entityType: SearchEntityType,
    query: SearchQueryDto,
  ): Promise<PaginatedSearchResultsResponseDto> {
    const matches = Prisma.sql`
      ${visibleSearchMatches(actorId, query.q)}
      AND v.entity_type = ${entityType}::search_entity_type
    `;

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (page - 1) * limit;

    const parsedSort = parseSortParam<SearchSortColumn>(
      query.sort,
      SEARCH_SORT_FIELDS,
      { rank: 'desc' },
    );
    if (!parsedSort) {
      throw new BadRequestException('validation_failed');
    }

    const orderBySql = this.buildOrderByClause(parsedSort);
    // Use one snapshot for both the total and the page while the index changes.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${SEARCH_STATEMENT_TIMEOUT_MS}ms'`,
        );

        const countRows = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS total
          ${matches}
        `);

        const total = toCount(countRows[0]?.total);
        const pagination = { page, limit };

        if (offset >= total) {
          return {
            items: [],
            meta: buildPaginationMeta(pagination, 0, total),
          };
        }

        const rows = await tx.$queryRaw<RawSearchIndexRow[]>(Prisma.sql`
          SELECT
            v.entity_type,
            v.entity_id,
            v.revision_id,
            v.owner_id,
            v.visibility,
            v.access_group_id,
            v.title,
            v.body,
            v.authors_text,
            ts_rank(v.doc, q)::float8 AS rank,
            v.updated_at
          ${matches}
          ORDER BY ${orderBySql}
          LIMIT ${limit}
          OFFSET ${offset}
        `);

        const items = rows.map((row) => this.mapRowToDto(row));

        return {
          items,
          meta: buildPaginationMeta(pagination, items.length, total),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private buildOrderByClause(
    sort: Partial<Record<SearchSortColumn, 'asc' | 'desc'>>,
  ): Prisma.Sql {
    if (sort.title) {
      return sort.title === 'asc'
        ? Prisma.sql`v.title ASC, rank DESC, v.entity_id ASC`
        : Prisma.sql`v.title DESC, rank DESC, v.entity_id ASC`;
    }

    if (sort.updated_at) {
      return sort.updated_at === 'asc'
        ? Prisma.sql`v.updated_at ASC, rank DESC, v.entity_id ASC`
        : Prisma.sql`v.updated_at DESC, rank DESC, v.entity_id ASC`;
    }

    if (sort.rank === 'asc') {
      return Prisma.sql`rank ASC, v.updated_at DESC, v.entity_id ASC`;
    }

    return Prisma.sql`rank DESC, v.updated_at DESC, v.entity_id ASC`;
  }

  private mapRowToDto(row: RawSearchIndexRow): SearchResultItemDto {
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      revisionId: row.revision_id ?? null,
      ownerId: row.owner_id ?? null,
      visibility: row.visibility,
      accessGroupId: row.access_group_id ?? null,
      title: row.title,
      body: row.body ?? null,
      authorsText: row.authors_text ?? null,
      rank: typeof row.rank === 'number' ? row.rank : Number(row.rank),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
    };
  }
}
