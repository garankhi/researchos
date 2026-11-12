import { ApiProperty } from '@nestjs/swagger';
import {
  DataProvenanceType,
  interest_source,
  interest_status,
} from '@researchos/database';

export class InterestResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Unique interest identifier.' })
  id: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Researcher who owns this interest.',
  })
  userId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Research topic referenced by this interest.',
  })
  topicId: string;

  @ApiProperty({
    enum: interest_source,
    description:
      'Whether the interest was declared or inferred; preserved on review.',
  })
  sourceType: interest_source;

  @ApiProperty({
    enum: interest_status,
    description: 'Current suggestion or researcher review state.',
  })
  status: interest_status;

  @ApiProperty({
    enum: DataProvenanceType,
    description: 'Origin of the evidence supporting the interest.',
  })
  provenanceTag: DataProvenanceType;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'System-recorded supporting evidence, when available.',
  })
  evidenceNote: string | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Time the interest was first recorded.',
  })
  declaredAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Time of the latest researcher decision, or null before review.',
  })
  reviewedAt: string | null;
}
