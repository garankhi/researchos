import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto.js';
import { FinalizeOnboardingDto } from './dto/finalize-onboarding.dto.js';
import { ProfileInterestResponseDto } from './dto/profile-interest-response.dto.js';
import { ProfilePreviewResponseDto } from './dto/profile-preview-response.dto.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { OnboardingFinalizeService } from './onboarding-finalize.service.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Controller exposing endpoints for researcher profiles.
 *
 * All routes require authentication. Visibility of third-party profiles is
 * derived from the confirmation state: confirmed profiles are public to the
 * university, whereas unconfirmed profiles return 403 to non-owners.
 */
@ApiTags('profiles')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'There is no valid session behind the request.',
})
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly onboardingFinalize: OnboardingFinalizeService,
  ) {}

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
    description: 'The requested researcher profile was not found.',
  })
  @ApiForbiddenResponse({
    description: 'The profile is unconfirmed and the caller is not the owner.',
  })
  @Get(':userId')
  async getProfileById(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.findProfileById(targetUserId, callerId);
  }

  @ApiOperation({
    summary: 'Get the quick information a hover card shows about a researcher',
    description:
      "Returns the researcher's name, their unit, their academic title and degree, their bio and their avatar. The card is a summary — the full profile is served by the profile detail endpoint.",
  })
  @ApiParam({
    name: 'userId',
    description: 'Unique identifier of the target user account (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Researcher profile preview retrieved successfully.',
    type: ProfilePreviewResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @ApiForbiddenResponse({
    description: 'The profile is unconfirmed and the caller is not the owner.',
  })
  @Get(':userId/preview')
  async getPreviewById(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ProfilePreviewResponseDto> {
    return this.profilesService.findPreviewById(targetUserId, callerId);
  }

  @ApiOperation({
    summary: 'List the research interests of a researcher',
    description:
      'Returns the interests of the target researcher, each with the taxonomy path of its topic and its review status.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Unique identifier of the target user account (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'The interests of the target researcher, newest declaration first.',
    type: [ProfileInterestResponseDto],
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @ApiForbiddenResponse({
    description: 'The profile is unconfirmed and the caller is not the owner.',
  })
  @Get(':userId/interests')
  async getInterestsByUserId(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUserId() callerId: string,
  ): Promise<ProfileInterestResponseDto[]> {
    return this.profilesService.findInterestsByUserId(targetUserId, callerId);
  }

  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates editable fields of the caller’s researcher profile (bio, availabilityStatus, googleScholarUrl, scopusAuthorId) and of their account (fullName, departmentUnit, academicTitle, academicDegree). orcidId, email and userType are not editable here.',
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

  @ApiOperation({
    summary: 'Complete the onboarding of the current user',
    description:
      'Finishes the onboarding: writes the profile information the researcher filled in — including the ORCID, which the ordinary profile update refuses — and marks the account as onboarded. Requires at least one ACTIVE research interest, the one mandatory step of the onboarding.',
  })
  @ApiOkResponse({
    description:
      'The onboarding completed. The returned profile carries the new onboardingCompletedAt timestamp.',
    type: ProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'The caller has no ACTIVE research interest, which is the one mandatory step of the onboarding.',
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @Post('me/onboarding')
  async completeOnboarding(
    @CurrentUserId() userId: string,
    @Body() dto: CompleteOnboardingDto,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.completeOnboarding(userId, dto);
  }

  @ApiOperation({
    summary: 'Finalize the onboarding of the current user',
    description:
      'Finishes the onboarding in one write. The wizard is a draft — the researcher picks interests, confirms an OpenAlex author, fills in their information and decides on their works, and nothing reaches the database until this call. The payload carries every answer: the full set of research interests, the confirmed OpenAlex author, the profile information including the ORCID, and the decisions on the works. The interests are reconciled to the set the researcher ended up with, and only the decided works are pulled.',
  })
  @ApiOkResponse({
    description:
      'The onboarding completed. The returned profile carries the new onboardingCompletedAt timestamp.',
    type: ProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'The caller declared no research interest, which is the one mandatory step of the onboarding.',
  })
  @ApiConflictResponse({
    description:
      'The ORCID is already claimed by another researcher profile.',
  })
  @ApiNotFoundResponse({
    description: 'The requested researcher profile was not found.',
  })
  @Post('me/onboarding/finalize')
  async finalizeOnboarding(
    @CurrentUserId() userId: string,
    @Body() dto: FinalizeOnboardingDto,
  ): Promise<ProfileResponseDto> {
    return this.onboardingFinalize.finalize(userId, dto);
  }
}
