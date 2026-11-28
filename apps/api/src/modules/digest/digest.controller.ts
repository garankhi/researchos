import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  DigestDeliveryDetailDto,
  DigestDeliveryPageDto,
  DigestPreferencesDto,
  UpdateDigestPreferencesDto,
} from './digest.dto.js';
import { DigestService } from './digest.service.js';

@ApiTags('digest')
@ApiCookieAuth()
@ApiUnauthorizedResponse({
  description: 'A valid session is required.',
})
@ApiForbiddenResponse({
  description: 'Active RESEARCHER access is required.',
})
@Roles('RESEARCHER')
@Controller('digest')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get the caller’s digest preferences' })
  @ApiOkResponse({
    description: 'The caller’s current preferences.',
    type: DigestPreferencesDto,
  })
  getPreferences(
    @CurrentUserId() userId: string,
  ): Promise<DigestPreferencesDto> {
    return this.digest.getPreferences(userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update the caller’s digest preferences' })
  @ApiOkResponse({
    description: 'The saved preferences.',
    type: DigestPreferencesDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid digest preferences.',
  })
  updatePreferences(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateDigestPreferencesDto,
  ): Promise<DigestPreferencesDto> {
    return this.digest.updatePreferences(userId, dto);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List the caller’s digest delivery history' })
  @ApiOkResponse({
    description: 'A page of the caller’s deliveries.',
    type: DigestDeliveryPageDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination parameters.',
  })
  listDeliveries(
    @CurrentUserId() userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<DigestDeliveryPageDto> {
    return this.digest.listDeliveries(userId, query);
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'Get a digest delivery and its items' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID of the digest delivery.',
  })
  @ApiOkResponse({
    description: 'The delivery and its visible items.',
    type: DigestDeliveryDetailDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid delivery ID.',
  })
  @ApiNotFoundResponse({
    description: 'The delivery is unavailable to the caller.',
  })
  getDelivery(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DigestDeliveryDetailDto> {
    return this.digest.getDelivery(userId, id);
  }
}
