import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStatus } from '@researchos/database';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListOpportunitiesQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(21474836)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum records per page.',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

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
}
