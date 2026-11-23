import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PrismaService } from '@researchos/database';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  PaginationQueryDto,
  buildPaginationMeta,
} from '../../common/dto/pagination.dto.js';
import {
  NotificationCountDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto.js';

const visibility = (recipient_id: string) => ({
  recipient_id,
  archived_at: null,
});
const preferencesDto = (row: {
  websocket_enabled: boolean;
  push_enabled: boolean;
  muted_types: NotificationPreferencesDto['mutedTypes'];
  timezone: string;
}): NotificationPreferencesDto => ({
  websocketEnabled: row.websocket_enabled,
  pushEnabled: row.push_enabled,
  mutedTypes: row.muted_types,
  timezone: row.timezone,
});

@ApiCookieAuth()
@ApiTags('notifications')
@ApiUnauthorizedResponse({ description: 'A valid session is required.' })
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Lists the signed-in user’s inbox' })
  @ApiOkResponse({
    description: 'Notification inbox page.',
    type: NotificationPageDto,
  })
  async list(
    @CurrentUserId() userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<NotificationPageDto> {
    if (query.sort && !['createdAt', '-createdAt'].includes(query.sort))
      throw new BadRequestException();
    const direction = query.sort === 'createdAt' ? 'asc' : 'desc';
    const where = visibility(userId);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notifications.findMany({
        where,
        orderBy: [{ created_at: direction }, { id: direction }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notifications.count({ where }),
    ]);
    return {
      items: rows.map(({ id, title, body, link, created_at, read_at }) => ({
        id,
        title,
        body,
        link,
        createdAt: created_at.toISOString(),
        readAt: read_at?.toISOString() ?? null,
      })),
      meta: buildPaginationMeta(query, rows.length, total),
    };
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Counts unread notifications for the signed-in user',
  })
  @ApiOkResponse({
    description: 'Unread notification count.',
    type: NotificationCountDto,
  })
  async unread(@CurrentUserId() userId: string): Promise<NotificationCountDto> {
    return {
      count: await this.prisma.notifications.count({
        where: { ...visibility(userId), read_at: null },
      }),
    };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marks all visible notifications as read' })
  @ApiOkResponse({
    description: 'Number of newly read notifications.',
    type: NotificationCountDto,
  })
  readAll(@CurrentUserId() userId: string): Promise<NotificationCountDto> {
    return this.prisma.notifications.updateMany({
      where: { ...visibility(userId), read_at: null },
      data: { read_at: new Date() },
    });
  }

  @Patch(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marks one notification as read' })
  @ApiParam({
    name: 'id',
    description: 'ID of the notification.',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'The notification is read.' })
  @ApiNotFoundResponse({
    description: 'The notification is unavailable to the caller.',
  })
  async read(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const where = { ...visibility(userId), id };
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notifications.updateMany({
        where: { ...where, read_at: null },
        data: { read_at: new Date() },
      });
      if (
        !count &&
        !(await tx.notifications.findFirst({ where, select: { id: true } }))
      ) {
        throw new NotFoundException();
      }
    });
  }

  @Patch(':id/archive')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archives one notification' })
  @ApiParam({
    name: 'id',
    description: 'ID of the notification.',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'The notification is archived.' })
  @ApiNotFoundResponse({
    description: 'The notification is unavailable to the caller.',
  })
  async archive(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { count } = await this.prisma.notifications.updateMany({
      where: { ...visibility(userId), id },
      data: { archived_at: new Date() },
    });
    if (!count) throw new NotFoundException();
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Reads the signed-in user’s notification preferences',
  })
  @ApiOkResponse({
    description: 'Notification preferences.',
    type: NotificationPreferencesDto,
  })
  async preferences(
    @CurrentUserId() userId: string,
  ): Promise<NotificationPreferencesDto> {
    const row = await this.prisma.notification_preferences.findUnique({
      where: { user_id: userId },
    });
    return row
      ? preferencesDto(row)
      : {
          websocketEnabled: true,
          pushEnabled: true,
          mutedTypes: [],
          timezone: 'Asia/Ho_Chi_Minh',
        };
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Updates the signed-in user’s notification preferences',
  })
  @ApiOkResponse({
    description: 'Updated notification preferences.',
    type: NotificationPreferencesDto,
  })
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const fields = {
      websocket_enabled: dto.websocketEnabled ?? undefined,
      push_enabled: dto.pushEnabled ?? undefined,
      muted_types: dto.mutedTypes ?? undefined,
      timezone: dto.timezone ?? undefined,
    };
    const row = await this.prisma.notification_preferences.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...fields },
      update: { ...fields, updated_at: new Date() },
    });
    return preferencesDto(row);
  }
}
