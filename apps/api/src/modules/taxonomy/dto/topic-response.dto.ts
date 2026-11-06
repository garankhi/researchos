import { ApiProperty } from '@nestjs/swagger';
import { TaxonomySource } from './taxonomy-source.enum.js';

/**
 * A Level 3 research topic in the taxonomy (e.g., Deep Learning, Natural Language Processing).
 */
export class TopicResponseDto {
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
    example:
      'Architectures, training techniques, and representations for deep artificial neural networks.',
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
      'External identifier from the source provider (e.g. OpenAlex topic ID).',
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
