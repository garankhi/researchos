import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OutputAudience,
  OutputFileVisibility,
  OutputImportState,
  OutputScopeType,
  OutputSharingStatus,
} from '@researchos/database';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { OutputAuthorResponseDto } from './output-author-response.dto.js';
import { OutputRevisionResponseDto } from './output-revision-response.dto.js';
import { OutputTopicResponseDto } from './output-topic-response.dto.js';

export class DownloadablePdfDto {
  @ApiProperty({
    description: 'Identifier used by the output file download endpoint.',
    type: String,
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Original filename for the downloadable PDF.',
    type: String,
  })
  fileName: string;
}

export class RequestableFileRequestDto {
  @ApiProperty({
    description: 'The caller’s latest access request for this file.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description:
      'Status of that request: PENDING, APPROVED, DECLINED, WITHDRAWN or CANCELLED.',
    type: String,
  })
  status: string;
}

export class RequestableFileDto {
  @ApiProperty({
    description: 'File identifier, used to request access.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'Original filename.', type: String })
  fileName: string;

  @ApiProperty({ description: 'MIME type of the file.', type: String })
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes.', type: Number })
  sizeBytes: number;

  @ApiProperty({
    description: 'The caller’s latest request for this file, or null.',
    type: RequestableFileRequestDto,
    nullable: true,
  })
  myRequest: RequestableFileRequestDto | null;
}

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
      'Where the work was posted: PERSONAL (its author owns it), GROUP (the ' +
      'group owns it) or PROJECT (the project owns it). Fixed at creation.',
    enum: OutputScopeType,
    example: OutputScopeType.PERSONAL,
  })
  scopeType: OutputScopeType;

  @ApiProperty({
    description:
      'The group the work was posted in. For a GROUP scope it is the group ' +
      'itself; for a PROJECT scope it is the parent group, when the project ' +
      'has one. Null for a personal work.',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  scopeGroupId: string | null;

  @ApiProperty({
    description:
      'The project the work was posted in. Set only for a PROJECT scope.',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  scopeProjectId: string | null;

  @ApiProperty({
    description:
      'Who may read the work: PRIVATE (the owner alone), CONTAINER (the ' +
      'narrow audience of the group or project) or FPTU_COMMUNITY (every ' +
      'signed-in researcher).',
    enum: OutputAudience,
    example: OutputAudience.FPTU_COMMUNITY,
  })
  audience: OutputAudience;

  @ApiProperty({
    description:
      'Whether the caller may change the audience of this work. The owner ' +
      'may for a personal work; the group leads may for a group work; the ' +
      'project lead and the parent group leads may for a project work. The ' +
      'poster of a container work may not: the container owns the post.',
    type: Boolean,
    example: false,
  })
  canChangeVisibility: boolean;

  @ApiProperty({
    description:
      'Affiliated research group whose banner the work carries. Display ' +
      'information only: it grants no authority over the work.',
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
    type: String,
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

  @ApiPropertyOptional({
    description:
      'A PDF on the current Home feed release that the caller may download.',
    type: DownloadablePdfDto,
  })
  downloadablePdf?: DownloadablePdfDto;

  @ApiPropertyOptional({
    description:
      'On the detail view, whether the current release has a private PDF unavailable to the caller.',
    type: Boolean,
  })
  hasRestrictedPdf?: boolean;

  @ApiPropertyOptional({
    description:
      'On the detail view, Private files of the current release the caller cannot download yet and may request.',
    type: [RequestableFileDto],
  })
  requestableFiles?: RequestableFileDto[];
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
