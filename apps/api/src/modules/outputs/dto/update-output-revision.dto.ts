import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * The editable metadata of a work's draft revision.
 *
 * Every field is optional: a partial update sends only what changed, and
 * an absent field keeps its stored value. A nullable field sent as
 * `null` clears the stored value.
 *
 * `authorsSnapshot` is deliberately absent. The snapshot is shared with
 * `output_authors` and with the accept path's authorship resolution
 * (`resolveAuthorId` matches the caller's ORCID against it), so editing
 * it here would break the authorship mapping for co-authors.
 */
export class UpdateOutputRevisionDto {
  @ApiPropertyOptional({
    description: 'Title of the work. Must not be blank once released.',
    type: String,
    maxLength: 500,
    example: 'Deep Learning for Medical Image Classification',
  })
  @IsOptional()
  @IsString({ message: 'title_invalid' })
  @MaxLength(500, { message: 'revision_title_too_long' })
  title?: string;

  @ApiPropertyOptional({
    description:
      'Abstract or summary of the work. Send null to clear the stored abstract.',
    type: String,
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'abstract_invalid' })
  @MaxLength(20000, { message: 'abstract_too_long' })
  abstract?: string | null;

  @ApiPropertyOptional({
    description:
      'Publication venue or journal name. Send null to clear the stored venue.',
    type: String,
    nullable: true,
    maxLength: 255,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'venue_invalid' })
  @MaxLength(255, { message: 'venue_too_long' })
  venue?: string | null;

  @ApiPropertyOptional({
    description:
      'Calendar year of publication. Send null to clear the stored year.',
    type: Number,
    nullable: true,
    minimum: 1000,
    maximum: 9999,
    example: 2026,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt({ message: 'publication_year_invalid' })
  @Min(1000, { message: 'publication_year_invalid' })
  @Max(9999, { message: 'publication_year_invalid' })
  publicationYear?: number | null;

  @ApiPropertyOptional({
    description:
      'External URL pointing to the publication source. Send null to clear the stored link.',
    type: String,
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUrl({}, { message: 'external_url_invalid' })
  @MaxLength(2000, { message: 'external_url_too_long' })
  externalUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Type classification of the work (e.g. PAPER, DATASET, PREPRINT).',
    type: String,
    maxLength: 50,
    example: 'PAPER',
  })
  @IsOptional()
  @IsString({ message: 'output_type_invalid' })
  @MaxLength(50, { message: 'output_type_too_long' })
  outputType?: string;
}
