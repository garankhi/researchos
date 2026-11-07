import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  PaginationQueryDto,
  parseBooleanQueryParam,
} from '../../../common/dto/pagination.dto.js';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * Query parameters for filtering and paginating research topics.
 */
export class ListTopicsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter topics by parent subfield identifier (UUID).',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  subfieldId?: string;

  @ApiPropertyOptional({
    description: 'Search string to match topic name (fuzzy / trigram search).',
    example: 'Machine Learning',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter topics by origin source (OPENALEX or LOCAL).',
    enum: TaxonomySource,
  })
  @IsOptional()
  @IsEnum(TaxonomySource)
  source?: TaxonomySource;

  @ApiPropertyOptional({
    description:
      'Filter topics by active status. Defaults to true (only active rows).',
    example: true,
  })
  @IsOptional()
  @Transform(({ obj, key }) => parseBooleanQueryParam(obj, key, true))
  @IsBoolean()
  isActive?: boolean = true;
}
