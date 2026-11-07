import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  PaginationQueryDto,
  parseBooleanQueryParam,
} from '../../../common/dto/pagination.dto.js';

/**
 * Query parameters for searching, filtering, and paginating research groups.
 */
export class ListResearchGroupsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search string matching group name or group code.',
    example: 'AI-LAB',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter groups led by a specific researcher (UUID).',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    description: 'Filter groups by active status.',
    example: true,
  })
  @IsOptional()
  @Transform(({ obj, key }) => parseBooleanQueryParam(obj, key))
  @IsBoolean()
  isActive?: boolean;
}
