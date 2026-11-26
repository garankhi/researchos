import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService, PushPlatform } from '@researchos/database';
import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';

class RegisterPushDeviceDto {
  @ApiProperty({
    description: 'Firebase registration token for the current device.',
  })
  @IsString()
  @Length(1, 1024)
  @Matches(/^\S+$/u)
  token!: string;
  @ApiProperty({
    description: 'Platform that obtained the registration token.',
    enum: PushPlatform,
    enumName: 'PushPlatform',
  })
  @IsEnum(PushPlatform)
  platform!: PushPlatform;
  @ApiProperty({ description: 'Locale used for notifications on this device.' })
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[a-z]{2,4})?$/iu)
  locale!: string;
}

class RegisteredPushDeviceDto {
  @ApiProperty({ description: 'ID of the registered device.', format: 'uuid' })
  id!: string;
}

@ApiTags('notification-devices')
@ApiCookieAuth()
@Controller('notifications/devices')
export class NotificationDevicesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Put()
  @ApiOperation({
    summary: 'Registers or refreshes a push device for the signed-in user',
  })
  @ApiOkResponse({
    description: 'Device registration ID.',
    type: RegisteredPushDeviceDto,
  })
  @ApiConflictResponse({
    description: 'The token is active for another account.',
  })
  async register(
    @CurrentUserId() userId: string,
    @Body() dto: RegisterPushDeviceDto,
  ): Promise<RegisteredPushDeviceDto> {
    const [device] = await this.prisma.$queryRaw<RegisteredPushDeviceDto[]>`
      INSERT INTO push_devices (user_id, token, platform, locale)
      VALUES (${userId}::uuid, ${dto.token}, ${dto.platform}::push_platform, ${dto.locale})
      ON CONFLICT (token) DO UPDATE
        SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, locale = EXCLUDED.locale,
          is_active = true, revoked_at = NULL, updated_at = now()
      WHERE push_devices.user_id = EXCLUDED.user_id OR NOT push_devices.is_active
      RETURNING id
    `;
    if (!device) throw new ConflictException();
    return device;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revokes a push device owned by the signed-in user',
  })
  @ApiParam({
    name: 'id',
    description: 'Registered device ID.',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'The device is revoked.' })
  @ApiNotFoundResponse({
    description: 'The device is unavailable to the caller.',
  })
  async revoke(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const now = new Date();
    const { count } = await this.prisma.push_devices.updateMany({
      where: { id, user_id: userId },
      data: { is_active: false, revoked_at: now, updated_at: now },
    });
    if (!count) throw new NotFoundException();
  }
}
