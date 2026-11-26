import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PaginatedResultDto,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto.js';

export const fileAccessRequestStatuses = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'CANCELLED',
] as const;
export type FileAccessRequestStatus =
  (typeof fileAccessRequestStatuses)[number];

export const fileAccessBoxes = ['sent', 'received'] as const;
export type FileAccessBox = (typeof fileAccessBoxes)[number];

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateFileAccessRequestDto {
  @ApiPropertyOptional({
    description: 'Optional note to the Article owner explaining the request.',
    maxLength: 1000,
    example: 'I am reviewing related work for my thesis.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message?: string;
}

export class DecideFileAccessRequestDto {
  @ApiPropertyOptional({
    description: 'Optional reply shown to the requester.',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  response?: string;
}

export class ListFileAccessRequestsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description:
      '`sent` lists the caller’s own requests; `received` lists requests for Articles the caller manages.',
    enum: fileAccessBoxes,
  })
  @IsIn(fileAccessBoxes)
  box!: FileAccessBox;

  @ApiPropertyOptional({
    description: 'Only requests in this status.',
    enum: fileAccessRequestStatuses,
  })
  @IsOptional()
  @IsIn(fileAccessRequestStatuses)
  status?: FileAccessRequestStatus;

  @ApiPropertyOptional({
    description: 'Only requests for this Article.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  outputId?: string;
}

export class FileAccessPersonDto {
  @ApiProperty({ description: 'User identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Display name of the user.' })
  fullName!: string;
}

export class FileAccessArticleDto {
  @ApiProperty({ description: 'Article identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'Title of the current release, or null when the caller can no longer view the Article.',
    type: String,
    nullable: true,
  })
  title!: string | null;
}

export class FileAccessFileDto {
  @ApiProperty({ description: 'File identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'File name, or null when the caller can no longer view the Article.',
    type: String,
    nullable: true,
  })
  fileName!: string | null;

  @ApiProperty({ description: 'Whether the file is still available.' })
  isAvailable!: boolean;
}

export class FileAccessGrantDto {
  @ApiProperty({
    description: 'Grant identifier, used to revoke access.',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'When access was granted.', format: 'date-time' })
  grantedAt!: string;

  @ApiProperty({
    description: 'When access was revoked, or null while it is active.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  revokedAt!: string | null;
}

export class FileAccessRequestResponseDto {
  @ApiProperty({ description: 'Request identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Request status.',
    enum: fileAccessRequestStatuses,
  })
  status!: FileAccessRequestStatus;

  @ApiProperty({
    description: 'Note from the requester.',
    type: String,
    nullable: true,
  })
  message!: string | null;

  @ApiProperty({
    description: 'Reply from the Article owner.',
    type: String,
    nullable: true,
  })
  response!: string | null;

  @ApiProperty({
    description:
      'Why the request was cancelled, e.g. `FILE_UNAVAILABLE`; null otherwise.',
    type: String,
    nullable: true,
  })
  cancelReason!: string | null;

  @ApiProperty({
    description: 'When the request was sent.',
    format: 'date-time',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'When the request left PENDING, or null while pending.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  decidedAt!: string | null;

  @ApiProperty({
    description: 'Article the file belongs to.',
    type: FileAccessArticleDto,
  })
  article!: FileAccessArticleDto;

  @ApiProperty({ description: 'The requested file.', type: FileAccessFileDto })
  file!: FileAccessFileDto;

  @ApiProperty({
    description: 'Who asked for access.',
    type: FileAccessPersonDto,
  })
  requester!: FileAccessPersonDto;

  @ApiProperty({
    description: 'Current Article owner, or null when the Article has none.',
    type: FileAccessPersonDto,
    nullable: true,
  })
  owner!: FileAccessPersonDto | null;

  @ApiProperty({
    description: 'The grant issued on approval, or null.',
    type: FileAccessGrantDto,
    nullable: true,
  })
  grant!: FileAccessGrantDto | null;
}

export class FileAccessRequestPageDto extends PaginatedResultDto<FileAccessRequestResponseDto> {
  @ApiProperty({
    description: 'File access requests on this page.',
    type: FileAccessRequestResponseDto,
    isArray: true,
  })
  declare items: FileAccessRequestResponseDto[];
}
