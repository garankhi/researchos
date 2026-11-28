import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DigestDeliveryStatus,
  DigestSubjectType,
  NotificationLocale,
  type Prisma,
} from '@researchos/database';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsTimeZone,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginatedResultDto } from '../../common/dto/pagination.dto.js';

export class UpdateDigestPreferencesDto {
  @ApiPropertyOptional({ description: 'Whether to receive the weekly digest.' })
  @Type(() => Object)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'IANA time zone used to determine the weekly period.',
    example: 'Asia/Ho_Chi_Minh',
    maxLength: 100,
  })
  @Type(() => Object)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsTimeZone()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Language used to render the digest.',
    enum: NotificationLocale,
    enumName: 'NotificationLocale',
  })
  @Type(() => Object)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NotificationLocale)
  language?: NotificationLocale;
}

export class DigestPreferencesDto {
  @ApiProperty({ description: 'Whether to receive the weekly digest.' })
  enabled!: boolean;

  @ApiProperty({
    description: 'IANA time zone used to determine the weekly period.',
    example: 'Asia/Ho_Chi_Minh',
  })
  timezone!: string;

  @ApiProperty({
    description: 'Language used to render the digest.',
    example: 'vi',
  })
  language!: string;

  @ApiProperty({
    description: 'When these preferences were saved.',
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;
}

export class DigestDeliveryDto {
  @ApiProperty({ description: 'ID of the digest delivery.', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Inclusive start of the delivery period.',
    type: String,
    format: 'date-time',
  })
  periodStart!: Date;

  @ApiProperty({
    description: 'Exclusive end of the delivery period.',
    type: String,
    format: 'date-time',
  })
  periodEnd!: Date;

  @ApiProperty({
    description: 'Current delivery status.',
    enum: DigestDeliveryStatus,
    enumName: 'DigestDeliveryStatus',
  })
  status!: DigestDeliveryStatus;

  @ApiProperty({
    description: 'Number of delivery attempts.',
    minimum: 0,
    maximum: 5,
  })
  attempts!: number;

  @ApiProperty({
    description: 'When the mail provider accepted the digest, if sent.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  sentAt!: Date | null;

  @ApiProperty({
    description: 'When the delivery was staged.',
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;
}

export class DigestItemDto {
  @ApiProperty({
    description: 'Type of research item included in the digest.',
    enum: DigestSubjectType,
    enumName: 'DigestSubjectType',
  })
  subjectType!: DigestSubjectType;

  @ApiProperty({ description: 'ID of the research item.', format: 'uuid' })
  subjectId!: string;

  @ApiProperty({
    description: 'ID of the selected research update.',
    format: 'uuid',
  })
  eventId!: string;

  @ApiProperty({
    description: 'Follow targets that matched this research item.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  matchedReasons!: Prisma.JsonValue;

  @ApiProperty({
    description: 'Stored content for this research item in the delivery.',
    type: 'object',
    additionalProperties: true,
  })
  contentSnapshot!: Prisma.JsonValue;
}

export class DigestDeliveryDetailDto extends DigestDeliveryDto {
  @ApiProperty({
    description: 'Visible items in this delivery.',
    type: [DigestItemDto],
  })
  items!: DigestItemDto[];
}

export class DigestDeliveryPageDto extends PaginatedResultDto<DigestDeliveryDto> {
  @ApiProperty({
    description: 'Deliveries in this page.',
    type: [DigestDeliveryDto],
  })
  declare items: DigestDeliveryDto[];
}
