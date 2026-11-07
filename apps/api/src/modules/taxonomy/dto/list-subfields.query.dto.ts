import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { parseBooleanQueryParam } from '../../../common/dto/pagination.dto.js';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * Query filters for listing research subfields of a given field.
 */
export class ListSubfieldsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter subfields by origin source (OPENALEX or LOCAL).',
    enum: TaxonomySource,
  })
  @IsOptional()
  @IsEnum(TaxonomySource)
  source?: TaxonomySource;

  @ApiPropertyOptional({
    description:
      'Filter subfields by active status. Defaults to true (only active rows).',
    example: true,
  })
  @IsOptional()
  @Transform(({ obj, key }) => parseBooleanQueryParam(obj, key, true))
  @IsBoolean()
  isActive?: boolean = true;
}
