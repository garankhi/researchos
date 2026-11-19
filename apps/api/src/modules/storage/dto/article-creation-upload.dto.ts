import { ApiProperty, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, Matches, ValidateBy } from 'class-validator';
import { submittedValue } from '../../../common/dto/submitted-value.js';
import { OutputUploadResponseDto } from './output-upload.dto.js';

export const articlePdfMimeType = 'application/pdf';
const maxArticlePdfBytes = 50 * 1024 * 1024;
const uploadStatuses = ['PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED'] as const;
const metadataStatuses = [
  'NOT_STARTED',
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
] as const;

export class CreateArticlePdfUploadDto {
  @ApiProperty({
    description: 'SHA-256 of the file as a 64-character hex digest.',
    minLength: 64,
    maxLength: 64,
  })
  @Transform(submittedValue)
  @Matches(/^[a-f\d]{64}$/iu, { message: 'article_pdf_sha256_invalid' })
  sha256!: string;

  @ApiProperty({ description: 'Original PDF file name.', maxLength: 255 })
  @Transform(submittedValue)
  @Matches(/^(?=.*\S)[^\\/\p{Cc}]{1,255}$/u, {
    message: 'article_pdf_file_name_invalid',
  })
  fileName!: string;

  @ApiProperty({
    enum: [articlePdfMimeType],
    description: 'PDF content type to send with the signed PUT request.',
  })
  @Transform(submittedValue)
  @Equals(articlePdfMimeType, { message: 'article_pdf_mime_type_invalid' })
  mimeType!: typeof articlePdfMimeType;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: maxArticlePdfBytes,
    description: 'Exact size of the PDF in bytes.',
  })
  @Transform(submittedValue)
  @ValidateBy(
    {
      name: 'articlePdfSize',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= maxArticlePdfBytes,
      },
    },
    { message: 'article_pdf_size_invalid' },
  )
  sizeBytes!: number;
}

export class ArticlePdfUploadResponseDto extends PickType(
  OutputUploadResponseDto,
  ['uploadUrl', 'headers'],
) {
  @ApiProperty({
    format: 'uuid',
    description: 'Identifier of the new upload session.',
  })
  uploadId!: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Upload session expiry. The signed PUT URL expires in five minutes.',
  })
  expiresAt!: string;
}

export class ArticlePdfUploadStatusDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identifier of the upload session.',
  })
  uploadId!: string;

  @ApiProperty({ description: 'Original PDF file name.' })
  fileName!: string;

  @ApiProperty({
    enum: [articlePdfMimeType],
    description: 'Declared PDF content type.',
  })
  mimeType!: typeof articlePdfMimeType;

  @ApiProperty({ type: 'integer', description: 'Declared PDF size in bytes.' })
  sizeBytes!: number;

  @ApiProperty({
    format: 'date-time',
    description: 'Time after which the upload cannot be attached.',
  })
  expiresAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Time at which the stored PDF was verified, if available.',
  })
  verifiedAt!: string | null;

  @ApiProperty({
    enum: uploadStatuses,
    description: 'State of the temporary upload.',
  })
  status!: (typeof uploadStatuses)[number];

  @ApiProperty({
    enum: metadataStatuses,
    description: 'State of optional PDF metadata extraction.',
  })
  metadataStatus!: (typeof metadataStatuses)[number];
}
