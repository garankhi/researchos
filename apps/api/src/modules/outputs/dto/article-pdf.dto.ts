import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputFileVisibility } from '@researchos/database';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export const articlePdfVisibilities = [
  OutputFileVisibility.PRIVATE,
  OutputFileVisibility.FPTU_COMMUNITY,
] as const;

export type ArticlePdfVisibility = (typeof articlePdfVisibilities)[number];

export class UpdateArticlePdfVisibilityDto {
  @ApiProperty({
    enum: [...articlePdfVisibilities],
    description: 'Visibility of the PDF, independent of the Article.',
  })
  @IsIn([...articlePdfVisibilities], { message: 'output_visibility_invalid' })
  fileVisibility!: ArticlePdfVisibility;
}

export class AttachArticlePdfDto extends UpdateArticlePdfVisibilityDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'An unclaimed, verified PDF upload belonging to the caller.',
  })
  @IsUUID(undefined, { message: 'id_uuid' })
  uploadId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Current release ID observed when editing the Article.',
  })
  @IsUUID(undefined, { message: 'id_uuid' })
  expectedRevisionId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Required to replace a specific PDF in the current release.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID(undefined, { message: 'id_uuid' })
  replaceFileId?: string;
}

export class ArticlePdfRevisionResponseDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Current release ID after editing the Article PDF.',
  })
  revisionId!: string;
}

export class AttachArticlePdfResponseDto extends ArticlePdfRevisionResponseDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'File ID of the attached PDF.',
  })
  fileId!: string;
}
