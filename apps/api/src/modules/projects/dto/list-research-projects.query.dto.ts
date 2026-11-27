import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import {
  PaginationQueryDto,
  parseBooleanQueryParam,
} from '../../../common/dto/pagination.dto.js';

/**
 * Query parameters for listing the research projects the caller may post
 * into.
 */
export class ListResearchProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search string matching the project title or code.',
    example: 'federated',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filter projects that belong to a specific research group (UUID).',
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      "Filter by the caller's relationship to the project: LEAD (the " +
      'caller leads it) or MEMBER (the caller is a project member).',
    type: String,
    enum: ['LEAD', 'MEMBER'],
  })
  @IsOptional()
  @IsString()
  relation?: 'LEAD' | 'MEMBER';

  @ApiPropertyOptional({
    description:
      'Filter by archive state. Archived projects are excluded unless the ' +
      'caller leads one of them.',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }) => parseBooleanQueryParam(obj, key))
  isActive?: boolean;
}
