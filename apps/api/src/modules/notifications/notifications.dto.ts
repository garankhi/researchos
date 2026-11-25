import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationLocale, NotificationType } from '@researchos/database';
import {
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsTimeZone,
} from 'class-validator';
import { PaginatedResultDto } from '../../common/dto/pagination.dto.js';

export class NotificationDto {
  @ApiProperty({ description: 'Unique notification ID.', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Title in the recipient’s preferred language.' })
  title!: string;
  @ApiProperty({ description: 'Notification detail or actor name.' })
  body!: string;
  @ApiProperty({ description: 'Relative path to the notification target.' })
  link!: string;
  @ApiProperty({
    description: 'When the notification was created.',
    format: 'date-time',
    type: String,
  })
  createdAt!: string;
  @ApiProperty({
    description: 'When the notification was read, if read.',
    format: 'date-time',
    type: String,
    nullable: true,
  })
  readAt!: string | null;
}

export class NotificationPageDto extends PaginatedResultDto<NotificationDto> {
  @ApiProperty({
    description: 'Notifications in this page.',
    type: [NotificationDto],
  })
  declare items: NotificationDto[];
}

export class NotificationCountDto {
  @ApiProperty({
    description: 'Number of notifications counted or updated.',
    minimum: 0,
  })
  count!: number;
}

export class NotificationPreferencesDto {
  @ApiProperty({ description: 'Whether live WebSocket delivery is enabled.' })
  websocketEnabled!: boolean;
  @ApiProperty({ description: 'Whether device push delivery is enabled.' })
  pushEnabled!: boolean;
  @ApiProperty({
    description: 'Event types excluded from notification delivery.',
    enum: NotificationType,
    isArray: true,
    enumName: 'NotificationType',
  })
  mutedTypes!: NotificationType[];
  @ApiProperty({ description: 'IANA time zone for the recipient.' })
  timezone!: string;
  @ApiProperty({
    description: 'Locale the notification copy is rendered in.',
    enum: NotificationLocale,
    enumName: 'NotificationLocale',
  })
  locale!: NotificationLocale;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Whether live WebSocket delivery is enabled.',
  })
  @IsOptional()
  @IsBoolean()
  websocketEnabled?: boolean;
  @ApiPropertyOptional({
    description: 'Whether device push delivery is enabled.',
  })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
  @ApiPropertyOptional({
    description: 'Event types excluded from notification delivery.',
    enum: NotificationType,
    isArray: true,
    enumName: 'NotificationType',
  })
  @IsOptional()
  @ArrayUnique()
  @IsEnum(NotificationType, { each: true })
  mutedTypes?: NotificationType[];
  @ApiPropertyOptional({ description: 'IANA time zone for the recipient.' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
  @ApiPropertyOptional({
    description: 'Locale the notification copy is rendered in.',
    enum: NotificationLocale,
    enumName: 'NotificationLocale',
  })
  @IsOptional()
  @IsEnum(NotificationLocale)
  locale?: NotificationLocale;
}
