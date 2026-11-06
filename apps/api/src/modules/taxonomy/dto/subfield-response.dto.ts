import { ApiProperty } from '@nestjs/swagger';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * A Level 2 research subfield in the taxonomy (e.g., Artificial Intelligence).
 */
export class SubfieldResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the research subfield (UUID).',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  id: string;

  @ApiProperty({
    description: 'Identifier of the parent research field.',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  fieldId: string;

  @ApiProperty({
    description: 'Stable internal code for the subfield.',
    example: 'SUBFIELD-AI',
    nullable: true,
  })
  internalCode: string | null;

  @ApiProperty({
    description: 'English name of the research subfield.',
    example: 'Artificial Intelligence',
  })
  name: string;

  @ApiProperty({
    description: 'Vietnamese translated name of the research subfield.',
    example: 'Trí tuệ nhân tạo',
    nullable: true,
  })
  nameVi: string | null;

  @ApiProperty({
    description: 'Detailed description or scope of the research subfield.',
    example: 'Theory and development of computer systems able to perform tasks requiring human intelligence.',
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
    description: 'External identifier from the source provider (e.g. OpenAlex subfield ID).',
    example: 'https://openalex.org/subfields/1702',
    nullable: true,
  })
  externalId: string | null;

  @ApiProperty({
    description: 'Whether this subfield is active and selectable in the system.',
    example: true,
  })
  isActive: boolean;
}
