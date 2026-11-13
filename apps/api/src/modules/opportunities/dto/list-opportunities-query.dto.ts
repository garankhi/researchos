import { ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStatus } from '@researchos/database';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Query parameters for listing visible research opportunities.
 *
 * The paging itself comes from the shared `PaginationQueryDto` — `page`,
 * `limit` and `sort` — so this endpoint paginates the way every other list
 * endpoint in the API does.
 */
export class ListOpportunitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by group scope.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Filter by project scope.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter by lifecycle status without widening visibility.',
    enum: OpportunityStatus,
  })
  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @ApiPropertyOptional({
    description:
      'Filter by the researcher who created the opportunity, without widening visibility.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}
