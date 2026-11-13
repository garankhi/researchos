import { ApiProperty } from '@nestjs/swagger';
import { interest_source, interest_status } from '@researchos/database';
import { DataProvenanceType } from '@researchos/database';
import { DirectionTopicPathDto } from '../../groups/dto/group-direction.dto.js';

/**
 * One research interest of a researcher, with its taxonomy path.
 *
 * The taxonomy path is the same shape the group directions return
 * (`DirectionTopicPathDto`), so the frontend renders one component for
 * both: field → subfield → topic.
 *
 * `status` is carried so the profile tab can group the interests by
 * `ACTIVE`, `SUGGESTED` and `REJECTED` without a second request.
 */
export class ProfileInterestResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the interest.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Researcher who owns this interest.',
    format: 'uuid',
  })
  userId: string;

  @ApiProperty({
    description: 'Research topic referenced by this interest.',
    format: 'uuid',
  })
  topicId: string;

  @ApiProperty({
    enum: interest_status,
    description:
      'Current state of the interest: active, suggested by the platform, or rejected.',
  })
  status: interest_status;

  @ApiProperty({
    enum: interest_source,
    description:
      'Whether the interest was declared or inferred; preserved on review.',
  })
  sourceType: interest_source;

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
    description: 'Time the interest was first recorded.',
    format: 'date-time',
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

  @ApiProperty({
    description:
      'Full taxonomy context of the interest topic: field, subfield and topic.',
    type: DirectionTopicPathDto,
  })
  topicPath: DirectionTopicPathDto;
}
