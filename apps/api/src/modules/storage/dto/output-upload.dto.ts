import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputFileVisibility } from '@researchos/database';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const maxUploadBytes = 5 * 1024 ** 3;

export class CreateOutputUploadDto {
  @ApiProperty({
    description: 'File name without a directory path.',
    maxLength: 255,
  })
  @IsString()
  @Length(1, 255)
  @Matches(/^[^\\/\p{Cc}]+$/u)
  fileName!: string;

  @ApiProperty({
    description: 'MIME type sent with the PUT request.',
    example: 'application/pdf',
  })
  @IsString()
  @Length(3, 100)
  @Matches(/^[\w.+-]+\/[\w.+-]+$/u)
  mimeType!: string;

  @ApiProperty({
    description: 'Expected file size in bytes.',
    type: 'integer',
    minimum: 1,
    maximum: maxUploadBytes,
  })
  @IsInt()
  @Min(1)
  @Max(maxUploadBytes)
  sizeBytes!: number;

  @ApiProperty({
    description: 'SHA-256 of the file as a 64-character hex digest.',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[a-f\d]{64}$/iu)
  sha256!: string;

  @ApiPropertyOptional({
    description: 'File visibility. Defaults to PRIVATE.',
    enum: OutputFileVisibility,
    enumName: 'OutputFileVisibility',
  })
  @IsOptional()
  @IsEnum(OutputFileVisibility)
  visibility?: OutputFileVisibility;

  @ApiPropertyOptional({
    description:
      'Required for RESEARCH_GROUP visibility and omitted otherwise.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  accessGroupId?: string;
}

export class ConfirmOutputUploadDto {
  @ApiProperty({ description: 'Token issued by the API for this upload.' })
  @IsString()
  @Length(1, 4096)
  uploadToken!: string;
}

export class OutputUploadResponseDto {
  @ApiProperty({ description: 'Presigned URL for a single PUT upload.' })
  uploadUrl!: string;

  @ApiProperty({
    description:
      'Headers to send with the PUT request. Use a raw File or Blob body so the browser sends its signed Content-Length automatically.',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  headers!: Record<string, string>;

  @ApiProperty({
    description: 'Token to send to the confirmation endpoint after uploading.',
  })
  uploadToken!: string;
}

export class OutputFileResponseDto {
  @ApiProperty({
    description: 'Identifier of the confirmed file.',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Identifier of the parent output.',
    format: 'uuid',
  })
  outputId!: string;

  @ApiProperty({ description: 'Original file name.' })
  fileName!: string;

  @ApiProperty({ description: 'Content-Type stored on the uploaded object.' })
  mimeType!: string;

  @ApiProperty({ description: 'Verified size in bytes.', type: 'integer' })
  sizeBytes!: number;

  @ApiProperty({ description: 'Verified SHA-256 as a hex digest.' })
  sha256!: string;

  @ApiProperty({
    description: 'File visibility.',
    enum: OutputFileVisibility,
    enumName: 'OutputFileVisibility',
  })
  visibility!: OutputFileVisibility;

  @ApiProperty({
    description: 'Group allowed by the file visibility, if applicable.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  accessGroupId!: string | null;
}
