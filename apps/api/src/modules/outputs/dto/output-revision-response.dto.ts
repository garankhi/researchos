import { ApiProperty } from '@nestjs/swagger';
import { PublicationStatusEnum } from '@researchos/database';

/**
 * Metadata revision of a research output.
 */
export class OutputRevisionResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the output revision.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Output identifier this revision belongs to.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  outputId: string;

  @ApiProperty({
    description: 'Monotonically increasing revision number.',
    example: 1,
  })
  revisionNo: number;

  @ApiProperty({
    description: 'Title of the research publication.',
    example: 'Deep Learning for Medical Image Classification',
  })
  title: string;

  @ApiProperty({
    description: 'Abstract or summary of the publication.',
    nullable: true,
    example: 'In this paper, we propose a novel deep convolutional network...',
  })
  abstract: string | null;

  @ApiProperty({
    description: 'Publication venue or journal name.',
    nullable: true,
    example: 'IEEE Transactions on Medical Imaging',
  })
  venue: string | null;

  @ApiProperty({
    description: 'Publisher organization or house.',
    nullable: true,
    example: 'IEEE',
  })
  publisher: string | null;

  @ApiProperty({
    description: 'Calendar year of publication.',
    nullable: true,
    example: 2026,
  })
  publicationYear: number | null;

  @ApiProperty({
    description:
      'Publication status of the work (`UNPUBLISHED` or `PUBLISHED`).',
    enum: PublicationStatusEnum,
    example: PublicationStatusEnum.PUBLISHED,
  })
  publicationStatus: PublicationStatusEnum;

  @ApiProperty({
    description: 'Type classification of the output (e.g. PAPER, DATASET).',
    example: 'PAPER',
  })
  outputType: string;

  @ApiProperty({
    description: 'External URL pointing to the publication source.',
    nullable: true,
    example: 'https://doi.org/10.1109/TMI.2026.1234567',
  })
  externalUrl: string | null;

  @ApiProperty({
    description:
      'Timestamp when this revision was officially released / pinned.',
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T00:00:00.000Z',
  })
  releasedAt: string | null;

  @ApiProperty({
    description: 'Timestamp when this revision record was created.',
    format: 'date-time',
    example: '2026-11-10T12:00:00.000Z',
  })
  createdAt: string;
}
