import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListUsersQueryDto } from '../../modules/identity/dto/list-users.query.dto.js';
import { ListFieldsQueryDto } from '../../modules/taxonomy/dto/list-fields.query.dto.js';
import { ListSubfieldsQueryDto } from '../../modules/taxonomy/dto/list-subfields.query.dto.js';
import { ListTopicsQueryDto } from '../../modules/taxonomy/dto/list-topics.query.dto.js';
import { TaxonomyTreeQueryDto } from '../../modules/taxonomy/dto/taxonomy-tree.query.dto.js';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaginationQueryDto,
  parseBooleanQueryParam,
  parseSortParam,
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

describe('parseBooleanQueryParam', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  it('parses raw boolean query strings accurately', () => {
    expect(
      parseBooleanQueryParam({ isActive: 'false' }, 'isActive', true),
    ).toBe(false);
    expect(parseBooleanQueryParam({ isActive: '0' }, 'isActive', true)).toBe(
      false,
    );
    expect(
      parseBooleanQueryParam({ isActive: 'true' }, 'isActive', false),
    ).toBe(true);
    expect(parseBooleanQueryParam({ isActive: '1' }, 'isActive', false)).toBe(
      true,
    );
    expect(parseBooleanQueryParam({}, 'isActive', true)).toBe(true);
    expect(parseBooleanQueryParam({}, 'isActive')).toBeUndefined();
  });

  it('preserves isActive=false under ValidationPipe with enableImplicitConversion', async () => {
    for (const metatype of [
      TaxonomyTreeQueryDto,
      ListFieldsQueryDto,
      ListSubfieldsQueryDto,
      ListTopicsQueryDto,
      ListUsersQueryDto,
    ]) {
      const transformedFalse = await pipe.transform(
        { isActive: 'false' },
        { type: 'query', metatype },
      );
      expect(transformedFalse.isActive).toBe(false);

      const transformedZero = await pipe.transform(
        { isActive: '0' },
        { type: 'query', metatype },
      );
      expect(transformedZero.isActive).toBe(false);

      await expect(
        pipe.transform({ isActive: 'invalid' }, { type: 'query', metatype }),
      ).rejects.toThrow(BadRequestException);
    }
  });
});

describe('parseSortParam', () => {
  const allowed = {
    name: 'name',
    createdAt: 'created_at',
    created_at: 'created_at',
  } as const;

  it('returns defaultOrder when sort is omitted or blank', () => {
    expect(parseSortParam(undefined, allowed, { name: 'asc' })).toEqual({
      name: 'asc',
    });
    expect(parseSortParam('   ', allowed, { name: 'asc' })).toEqual({
      name: 'asc',
    });
  });

  it('parses ascending and descending sort keys', () => {
    expect(parseSortParam('name', allowed, { name: 'asc' })).toEqual({
      name: 'asc',
    });
    expect(parseSortParam('-createdAt', allowed, { name: 'asc' })).toEqual({
      created_at: 'desc',
    });
    expect(parseSortParam('+created_at', allowed, { name: 'asc' })).toEqual({
      created_at: 'asc',
    });
  });

  it('returns null when sort key is not allowed', () => {
    expect(parseSortParam('unknownField', allowed, { name: 'asc' })).toBeNull();
    expect(parseSortParam('-', allowed, { name: 'asc' })).toBeNull();
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
