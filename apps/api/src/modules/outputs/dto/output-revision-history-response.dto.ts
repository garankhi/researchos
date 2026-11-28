import { ApiProperty } from '@nestjs/swagger';
import { PublicationStatusEnum } from '@researchos/database';

/**
 * The account behind a revision.
 *
 * A revision records who wrote it and who released it. Both are named
 * here because the history reads as a record of people, not of rows.
 */
export class OutputRevisionActorDto {
  @ApiProperty({
    description: 'User identifier of the account.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Display name of the account.',
    example: 'Nguyen Van A',
  })
  fullName: string;
}

/**
 * One metadata field that a revision changed.
 *
 * The field is named by a stable key (`title`, `abstract`, `venue`, ...)
 * so the frontend can render the label in its own language.
 */
export class OutputRevisionChangeDto {
  @ApiProperty({
    description:
      'Stable key of the changed field: `title`, `abstract`, `venue`, ' +
      '`publisher`, `publicationDate`, `volume`, `issue`, `pages`, ' +
      '`peerReviewed`, `externalUrl` or `authors`.',
    example: 'title',
  })
  field: string;

  @ApiProperty({
    description:
      'Value before the edit. Null when the field carried no value yet.',
    type: String,
    nullable: true,
    example: 'Deep Learning for Medical Image Classification',
  })
  previousValue: string | null;

  @ApiProperty({
    description: 'Value after the edit. Null when the edit cleared the field.',
    type: String,
    nullable: true,
    example: 'Deep Learning for Medical Image Segmentation',
  })
  currentValue: string | null;
}

/**
 * One entry of the edit history of a research output.
 */
export class OutputRevisionHistoryResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the revision.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Monotonically increasing revision number.',
    example: 2,
  })
  revisionNo: number;

  @ApiProperty({
    description: 'Title carried by this revision.',
    example: 'Deep Learning for Medical Image Classification',
  })
  title: string;

  @ApiProperty({
    description: 'Abstract carried by this revision.',
    nullable: true,
    example: 'In this paper, we propose a novel deep convolutional network...',
  })
  abstract: string | null;

  @ApiProperty({
    description: 'Publication venue carried by this revision.',
    nullable: true,
    example: 'IEEE Transactions on Medical Imaging',
  })
  venue: string | null;

  @ApiProperty({
    description: 'Publisher carried by this revision.',
    nullable: true,
    example: 'IEEE',
  })
  publisher: string | null;

  @ApiProperty({
    description: 'Publication year carried by this revision.',
    nullable: true,
    example: 2026,
  })
  publicationYear: number | null;

  @ApiProperty({
    description:
      'Publication date at the recorded precision: YYYY, YYYY-MM or YYYY-MM-DD.',
    nullable: true,
    example: '2026-11',
  })
  publicationDate: string | null;

  @ApiProperty({
    description:
      'Publication status of the work (`UNPUBLISHED` or `PUBLISHED`).',
    enum: PublicationStatusEnum,
    example: PublicationStatusEnum.PUBLISHED,
  })
  publicationStatus: PublicationStatusEnum;

  @ApiProperty({
    description: 'Type classification of the output (e.g. ARTICLE).',
    example: 'ARTICLE',
  })
  outputType: string;

  @ApiProperty({
    description: 'External URL pointing to the publication source.',
    nullable: true,
    example: 'https://doi.org/10.1109/TMI.2026.1234567',
  })
  externalUrl: string | null;

  @ApiProperty({
    description: 'Whether this revision is the one currently pinned.',
    example: true,
  })
  isCurrent: boolean;

  @ApiProperty({
    description: 'Timestamp when the revision record was created.',
    format: 'date-time',
    example: '2026-11-10T12:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description:
      'Timestamp when this revision was released / pinned. Null while the ' +
      'revision is the owner working copy.',
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T00:00:00.000Z',
  })
  releasedAt: string | null;

  @ApiProperty({
    description: 'The account that wrote this revision.',
    type: OutputRevisionActorDto,
  })
  createdBy: OutputRevisionActorDto;

  @ApiProperty({
    description: 'The account that released this revision, if any.',
    type: OutputRevisionActorDto,
    nullable: true,
  })
  releasedBy: OutputRevisionActorDto | null;

  @ApiProperty({
    description:
      'The metadata fields this revision changed, compared with the revision ' +
      'before it. Empty for the first revision.',
    type: [OutputRevisionChangeDto],
  })
  changes: OutputRevisionChangeDto[];
}
