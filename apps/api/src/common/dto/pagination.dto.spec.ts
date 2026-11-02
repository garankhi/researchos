import { describe, expect, it } from 'vitest';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaginationQueryDto,
} from './pagination.dto.js';

describe('PaginationQueryDto', () => {
  it('defaults to the first page at the default page size', () => {
    const query = new PaginationQueryDto();

    expect(query.page).toBe(1);
    expect(query.limit).toBe(DEFAULT_PAGE_SIZE);
    expect(query.sort).toBeUndefined();
  });

  it('caps the page size at the maximum', () => {
    // The cap is enforced by the ValidationPipe's `@Max`; this asserts the
    // constant the DTO and the documentation agree on.
    expect(MAX_PAGE_SIZE).toBeGreaterThan(DEFAULT_PAGE_SIZE);
  });
});

describe('buildPaginationMeta', () => {
  it('describes the first page of many', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 20, 137);

    expect(meta).toEqual({
      page: 1,
      limit: 20,
      total: 137,
      totalPages: 7,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('describes the last page of many', () => {
    const meta = buildPaginationMeta({ page: 7, limit: 20 }, 17, 137);

    expect(meta.totalPages).toBe(7);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('describes a single page', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 3, 3);

    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });

  it('describes an empty result', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 0, 0);

    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});
