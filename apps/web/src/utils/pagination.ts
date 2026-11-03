'use client';

import { useState } from 'react';

/**
 * The pagination contract, as the frontend sees it.
 *
 * The backend's list endpoints all take the same `page`/`limit`/`sort`
 * query and all answer with the same payload: the records of one page plus
 * the metadata that describes it.
 *
 * The metadata sits **inside** the payload, next to `items`, rather than at
 * the envelope level. The Orval mutator unwraps the envelope down to `data`
 * and keeps nothing else, so a `meta` field beside the envelope would be
 * dropped on the way to the screen.
 *
 * A feature hook builds on this so every list screen paginates the same
 * way:
 *
 * ```typescript
 * const pagination = usePagination({ limit: 20 });
 * const query = useOpportunitiesControllerFindAll(pagination.query);
 *
 * return {
 *   ...query,
 *   items: query.data?.items ?? [],
 *   meta: query.data?.meta,
 *   pagination,
 * };
 * ```
 */

/**
 * The pagination metadata of one page.
 *
 * The shape mirrors the backend's `PaginationMetaDto`.
 */
export interface PaginationMeta {
  /** The page that was returned, 1-based. */
  page: number;
  /** How many records one page holds. */
  limit: number;
  /** How many records the query matched in total. */
  total: number;
  /** How many pages the result is split into. */
  totalPages: number;
  /** Whether a next page exists. */
  hasNextPage: boolean;
  /** Whether a previous page exists. */
  hasPreviousPage: boolean;
}

/**
 * The query parameters a list endpoint accepts.
 */
export interface PaginationQuery {
  page: number;
  limit: number;
  sort?: string;
}

/**
 * The default page size, matching the backend's default.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The largest page a request may ask for, matching the backend's cap.
 *
 * The backend enforces the same number. Keeping the two equal means the
 * frontend can size a page control without asking the server what its
 * maximum is.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * A paginated list payload: the records of one page plus its metadata.
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Drives the pagination of one list screen.
 *
 * The hook owns the current page and the page size, and returns the query
 * to send. It does not fetch anything — the feature's own hook does that
 * with the query this returns.
 *
 * The `limit` and `sort` options are the **initial** values. Changing them
 * later goes through `setLimit()` / `setSort()`, which also return to the
 * first page — the records on page 3 of the old ordering are not on page 3
 * of the new one, so keeping the number would show a page that does not
 * exist.
 *
 * @param options The initial page size and sort key.
 */
export function usePagination({
  limit = DEFAULT_PAGE_SIZE,
  sort,
}: {
  limit?: number;
  sort?: string;
} = {}) {
  const [page, setPage] = useState(1);
  const [currentSort, setCurrentSort] = useState(sort);
  const [currentLimit, setCurrentLimit] = useState(limit);

  const query: PaginationQuery = {
    page,
    limit: currentLimit,
    ...(currentSort ? { sort: currentSort } : {}),
  };

  return {
    /** The query to send to the list endpoint. */
    query,
    /** The current page, 1-based. */
    page,
    /** How many records one page holds. */
    limit: currentLimit,
    /** The sort key in effect. */
    sort: currentSort,

    /** Moves to a page. */
    goToPage: (next: number) => setPage(Math.max(1, next)),
    /**
     * Moves to the next page.
     *
     * The caller passes the metadata of the current page, so the move is a
     * no-op on the last page — the button is disabled there anyway, and a
     * stray call cannot walk past the end.
     */
    nextPage: (meta?: PaginationMeta) => {
      if (meta && !meta.hasNextPage) {
        return;
      }

      setPage((current) => current + 1);
    },
    /**
     * Moves to the previous page.
     *
     * Page 1 is the floor, so the page number never drops below it.
     */
    previousPage: (meta?: PaginationMeta) => {
      if (meta && !meta.hasPreviousPage) {
        return;
      }

      setPage((current) => Math.max(1, current - 1));
    },
    /** Changes the page size and returns to the first page. */
    setLimit: (next: number) => {
      setCurrentLimit(next);
      setPage(1);
    },
    /** Changes the sort key and returns to the first page. */
    setSort: (next: string | undefined) => {
      setCurrentSort(next);
      setPage(1);
    },
  };
}

/**
 * Reads the pagination metadata out of a list payload.
 *
 * Returns `undefined` when the payload is not paginated, so a caller can
 * tell "no results" from "no metadata".
 */
export function paginationMetaOf(payload: unknown): PaginationMeta | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const meta = (payload as { meta?: unknown }).meta;

  if (typeof meta !== 'object' || meta === null) {
    return undefined;
  }

  return meta as PaginationMeta;
}
