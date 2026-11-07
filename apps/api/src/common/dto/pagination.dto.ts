import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * The default page size when a request does not ask for one.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The largest page a request may ask for.
 *
 * A list endpoint that honours an unbounded `limit` can be asked for the
 * whole table, which is a denial of service with a query parameter. The
 * cap turns that into a bounded request; a caller that wants more pages
 * asks for more pages.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * The query every list endpoint accepts.
 *
 * The three fields are the same on every list route, so the frontend has
 * one list-hook convention instead of one per resource.
 *
 * A list endpoint takes this DTO with `@Query() query: PaginationQueryDto`
 * — not scattered `@Query('page')` parameters. A query DTO field carries
 * its `description` through `@ApiProperty` into the spec, and the
 * `ValidationPipe` coerces and validates it in one place.
 *
 * ```typescript
 * @Get()
 * findAll(@Query() query: PaginationQueryDto): PaginatedResultDto<OpportunityDto> {
 *   ...
 * }
 * ```
 */
export class PaginationQueryDto {
  @ApiProperty({
    description: 'Page number, 1-based.',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    description: 'How many records one page holds.',
    example: DEFAULT_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiProperty({
    description:
      'Sort key, e.g. `createdAt` or `-createdAt` for descending. The ' +
      'fields a resource accepts are the ones its service allows.',
    example: '-createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  sort?: string;
}

/**
 * The metadata every paginated response carries.
 *
 * It sits inside the payload — next to `items`, not next to the envelope —
 * so the frontend's Orval mutator keeps it. The mutator unwraps the
 * envelope down to `data` and keeps nothing else, so a `meta` field at the
 * envelope level would be dropped on the way to the screen.
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'The page that was returned, 1-based.',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'How many records one page holds.',
    example: DEFAULT_PAGE_SIZE,
  })
  limit: number;

  @ApiProperty({
    description: 'How many records the query matched in total.',
    example: 137,
  })
  total: number;

  @ApiProperty({
    description: 'How many pages the result is split into.',
    example: 7,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Whether a next page exists.',
    example: true,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Whether a previous page exists.',
    example: false,
  })
  hasPreviousPage: boolean;
}

/**
 * A list payload: the records of one page plus the pagination metadata.
 *
 * The generic parameter is the record type, so the generated client knows
 * what `items` holds.
 *
 * ```typescript
 * return {
 *   items: records,
 *   meta: buildPaginationMeta(query, records.length, total),
 * };
 * ```
 */
export class PaginatedResultDto<T = unknown> {
  @ApiProperty({
    description: 'The records of this page.',
    isArray: true,
    type: Object,
  })
  items: T[];

  @ApiProperty({
    description: 'The pagination metadata of this page.',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}

/**
 * Parses a boolean query parameter from the raw query object before
 * `class-transformer`'s `enableImplicitConversion` coerces non-empty strings
 * such as `"false"`, `"0"` or invalid literals into `true`.
 *
 * Returns `true` or `false` for recognised boolean representations,
 * `defaultValue` when the parameter is omitted, and the raw value untouched
 * when unrecognized so `@IsBoolean()` rejects it with `400 Bad Request`.
 */
export function parseBooleanQueryParam(
  obj: Record<string, unknown> | undefined,
  key: string,
  defaultValue?: boolean,
): unknown {
  const raw = obj?.[key];

  if (raw === undefined) {
    return defaultValue;
  }

  if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
    return true;
  }

  if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
    return false;
  }

  return raw;
}

/**
 * Resolves a `PaginationQueryDto.sort` value (e.g. `name`, `-createdAt`)
 * against an allowlist of sortable fields, returning a Prisma-compatible
 * `{ [column]: 'asc' | 'desc' }` object or `null` when the key is not allowed.
 */
export function parseSortParam<Column extends string>(
  sort: string | undefined,
  allowedFields: Record<string, Column>,
  defaultOrder: Partial<Record<Column, 'asc' | 'desc'>>,
): Partial<Record<Column, 'asc' | 'desc'>> | null {
  if (sort === undefined) {
    return defaultOrder;
  }

  const trimmed = sort.trim();
  if (trimmed.length === 0) {
    return defaultOrder;
  }

  const isDesc = trimmed.startsWith('-');
  const isAscPrefix = trimmed.startsWith('+');
  const rawField = isDesc || isAscPrefix ? trimmed.slice(1) : trimmed;

  if (!rawField || !Object.hasOwn(allowedFields, rawField)) {
    return null;
  }

  const column = allowedFields[rawField];
  return { [column]: isDesc ? 'desc' : 'asc' } as Partial<
    Record<Column, 'asc' | 'desc'>
  >;
}

/**
 * Builds the pagination metadata for one page.
 *
 * @param query The parsed pagination query.
 * @param count How many records the page holds.
 * @param total How many records the query matched in total.
 */
export function buildPaginationMeta(
  query: Pick<PaginationQueryDto, 'page' | 'limit'>,
  count: number,
  total: number,
): PaginationMetaDto {
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1 && total > 0,
  };
}
