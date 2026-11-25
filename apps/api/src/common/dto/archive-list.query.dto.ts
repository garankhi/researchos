import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto.js';

const archiveFilters = ['false', 'true', 'all'] as const;

export class ArchiveListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Use false for active rows, true for archived rows, or all for both. Archived rows require management permission.',
    enum: [...archiveFilters],
  })
  @IsOptional()
  @IsIn(archiveFilters)
  archived?: (typeof archiveFilters)[number];
}

export function archiveFilter(archived: ArchiveListQueryDto['archived']) {
  if (archived === 'all') return {};
  return { archived_at: archived === 'true' ? { not: null } : null };
}
