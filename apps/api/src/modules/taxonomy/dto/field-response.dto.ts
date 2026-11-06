import { ApiProperty } from '@nestjs/swagger';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * A Level 1 research field in the taxonomy (e.g., Computer Science, Medicine).
 */
export class FieldResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the research field (UUID).',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  id: string;

  @ApiProperty({
    description: 'Stable internal code for the field.',
    example: 'FIELD-CS',
    nullable: true,
  })
  internalCode: string | null;

  @ApiProperty({
    description: 'English name of the research field.',
    example: 'Computer Science',
  })
  name: string;

  @ApiProperty({
    description: 'Vietnamese translated name of the research field.',
    example: 'Khoa học máy tính',
    nullable: true,
  })
  nameVi: string | null;

  @ApiProperty({
    description: 'Detailed description or scope of the research field.',
    example: 'Study of computation, information, and automation.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Source of the taxonomy entry (OPENALEX or LOCAL).',
    enum: TaxonomySource,
    example: TaxonomySource.OPENALEX,
  })
  source: TaxonomySource;

  @ApiProperty({
    description:
      'External identifier from the source provider (e.g. OpenAlex field ID).',
    example: 'https://openalex.org/fields/17',
    nullable: true,
  })
  externalId: string | null;

  @ApiProperty({
    description: 'Whether this field is active and selectable in the system.',
    example: true,
  })
  isActive: boolean;
}
