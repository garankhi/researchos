import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Controller exposing endpoints for researcher profiles.
 *
 * All routes require authentication. Visibility of third-party profiles is
 * derived from the confirmation state: confirmed profiles are public to the
 * university, whereas unconfirmed profiles return 404 to non-owners.
 */
@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the researcher profile belonging to the authenticated caller, confirmed or not.',
  })
  @ApiOkResponse({
    description: 'Researcher profile retrieved successfully.',
    type: ProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @Get('me')
  async getMyProfile(
    @CurrentUserId() userId: string,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.findMyProfile(userId);
  }

  @ApiOperation({
    summary: 'Get researcher profile by user ID',
    description:
      'Returns a confirmed researcher profile to any authenticated user, or the unconfirmed profile to its owner.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Unique identifier of the target user account (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Researcher profile retrieved successfully.',
    type: ProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'The requested researcher profile was not found or is unconfirmed.',
  })
  @Get(':userId')
  async getProfileById(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.findProfileById(targetUserId, callerId);
  }

  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates editable fields of the caller’s researcher profile (bio, availabilityStatus, googleScholarUrl, scopusAuthorId).',
  })
  @ApiOkResponse({
    description: 'Researcher profile updated successfully.',
    type: ProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @Patch('me')
  async updateMyProfile(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.updateMyProfile(userId, dto);
  }
}
