import { ApiProperty } from '@nestjs/swagger';
import { OutputFileVisibility } from '@researchos/database';

/**
 * File metadata attached to a research output.
 */
export class OutputFileResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the output file.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Research output identifier.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  outputId: string;

  @ApiProperty({
    description: 'Original name of the uploaded file.',
    example: 'manuscript.pdf',
  })
  fileName: string;

  @ApiProperty({
    description: 'MIME content type of the file.',
    example: 'application/pdf',
  })
  mimeType: string;

  @ApiProperty({
    description: 'Size of the file in bytes.',
    example: 1048576,
  })
  sizeBytes: number;

  @ApiProperty({
    description: 'SHA-256 digest of the file contents.',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  sha256: string;

  @ApiProperty({
    description:
      'Visibility scope of the file (`PRIVATE`, `RESEARCH_GROUP`, `FPTU_COMMUNITY`).',
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
    description: 'Timestamp when the file was uploaded.',
    format: 'date-time',
    example: '2026-11-11T00:00:00.000Z',
  })
  uploadedAt: string;
}
