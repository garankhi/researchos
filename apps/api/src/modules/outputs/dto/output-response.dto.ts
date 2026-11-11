import { ApiProperty } from '@nestjs/swagger';
import {
  OutputFileVisibility,
  OutputImportState,
  OutputSharingStatus,
} from '@researchos/database';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { OutputAuthorResponseDto } from './output-author-response.dto.js';
import { OutputRevisionResponseDto } from './output-revision-response.dto.js';
import { OutputTopicResponseDto } from './output-topic-response.dto.js';

/**
 * Full details of a research output with its pinned / current release.
 */
export class OutputResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the research output.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description:
      'Digital Object Identifier (DOI) normalized without URL prefixes.',
    nullable: true,
    example: '10.1109/tmi.2026.1234567',
  })
  doi: string | null;

  @ApiProperty({
    description: 'Owner researcher user ID.',
    format: 'uuid',
    nullable: true,
    example: '22222222-2222-4222-8222-222222222222',
  })
  ownerId: string | null;

  @ApiProperty({
    description: 'Internal sharing status (`DRAFT`, `SHARED`, or `ARCHIVED`).',
    enum: OutputSharingStatus,
    example: OutputSharingStatus.SHARED,
  })
  sharingStatus: OutputSharingStatus;

  @ApiProperty({
    description:
      'Visibility scope (`PRIVATE`, `RESEARCH_GROUP`, or `FPTU_COMMUNITY`).',
    enum: OutputFileVisibility,
    example: OutputFileVisibility.FPTU_COMMUNITY,
  })
  visibility: OutputFileVisibility;

  @ApiProperty({
    description:
      'Research group identifier scoping access when visibility is RESEARCH_GROUP; null otherwise.',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  accessGroupId: string | null;

  @ApiProperty({
    description: 'Import lifecycle state (`NONE`, `CANDIDATE`, or `ACCEPTED`).',
    enum: OutputImportState,
    example: OutputImportState.NONE,
  })
  importState: OutputImportState;

  @ApiProperty({
    description:
      'UUID of the currently pinned / released revision (`output_revisions.id`).',
    format: 'uuid',
    nullable: true,
    example: '33333333-3333-4333-8333-333333333333',
  })
  currentReleaseId: string | null;

  @ApiProperty({
    description: 'Timestamp when the output was first shared publicly.',
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T00:00:00.000Z',
  })
  firstSharedAt: string | null;

  @ApiProperty({
    description:
      'Currently pinned revision metadata (or the owner working copy draft if unpublished).',
    type: OutputRevisionResponseDto,
    nullable: true,
  })
  currentRevision: OutputRevisionResponseDto | null;

  @ApiProperty({
    description:
      'Ordered list of authors associated with this research output.',
    type: [OutputAuthorResponseDto],
  })
  authors: OutputAuthorResponseDto[];

  @ApiProperty({
    description:
      'Hierarchical research taxonomy topics linked to this research output.',
    type: [OutputTopicResponseDto],
  })
  topics: OutputTopicResponseDto[];
}

/**
 * Paginated response of research outputs.
 */
export class PaginatedOutputsResponseDto extends PaginatedResultDto<OutputResponseDto> {
  @ApiProperty({
    description: 'List of research outputs on this page.',
    type: [OutputResponseDto],
  })
  declare items: OutputResponseDto[];
}
