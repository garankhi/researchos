import { ApiProperty } from '@nestjs/swagger';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * A topic leaf node within the hierarchical taxonomy tree.
 */
export class TaxonomyTreeTopicDto {
  @ApiProperty({
    description: 'Unique identifier of the research topic (UUID).',
    example: 'c0000000-0000-0000-0000-000000000001',
  })
  id: string;

  @ApiProperty({
    description: 'Identifier of the parent research subfield.',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  subfieldId: string;

  @ApiProperty({
    description: 'Name of the research topic.',
    example: 'Deep Learning and Neural Networks',
  })
  name: string;

  @ApiProperty({
    description: 'Detailed description or keywords of the research topic.',
    example: 'Architectures, training techniques, and representations for deep artificial neural networks.',
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
    description: 'External identifier from the source provider (e.g. OpenAlex topic ID).',
    example: 'https://openalex.org/topics/T10001',
    nullable: true,
  })
  externalId: string | null;

  @ApiProperty({
    description: 'Whether this topic is active and selectable in the system.',
    example: true,
  })
  isActive: boolean;
}

/**
 * A subfield branch node within the hierarchical taxonomy tree.
 */
export class TaxonomyTreeSubfieldDto {
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

  @ApiProperty({
    description: 'List of research topics belonging to this subfield.',
    type: [TaxonomyTreeTopicDto],
  })
  topics: TaxonomyTreeTopicDto[];
}

/**
 * A field root node within the hierarchical taxonomy tree.
 */
export class TaxonomyTreeFieldDto {
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
    description: 'External identifier from the source provider (e.g. OpenAlex field ID).',
    example: 'https://openalex.org/fields/17',
    nullable: true,
  })
  externalId: string | null;

  @ApiProperty({
    description: 'Whether this field is active and selectable in the system.',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'List of research subfields belonging to this field.',
    type: [TaxonomyTreeSubfieldDto],
  })
  subfields: TaxonomyTreeSubfieldDto[];
}
