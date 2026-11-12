import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { AvailabilityStatusEnum } from './dto/availability-status.enum.js';
import type { ProfileResponseDto } from './dto/profile-response.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

type ProfileWithUser = Prisma.researcher_profilesGetPayload<{
  include: { users: true };
}>;

/**
 * Service managing researcher profiles.
 *
 * Enforces state-derived visibility: confirmed profiles are public to the
 * university community, while unconfirmed profiles return 404 to non-owners.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the caller's own researcher profile.
   */
  async findMyProfile(userId: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: userId },
      include: { users: true },
    });

    if (!profile) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToResponse(profile);
  }

  /**
   * Retrieves a target user's researcher profile.
   *
   * Non-owners receive 404 if the profile is unconfirmed.
   */
  async findProfileById(
    targetUserId: string,
    callerId: string,
  ): Promise<ProfileResponseDto> {
    const profile = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: targetUserId },
      include: { users: true },
    });

    if (!profile) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    // Unconfirmed profiles are visible to the owner only; non-owners are
    // refused with 403 rather than a 404 that would hide the denial.
    if (targetUserId !== callerId && profile.profile_confirmed_at === null) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    return this.mapToResponse(profile);
  }

  /**
   * Updates editable attributes of the caller's own profile.
   */
  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: userId },
    });

    if (!existing) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const data: Prisma.researcher_profilesUpdateInput = {};
    if (dto.bio !== undefined) {
      data.bio = dto.bio?.trim() || null;
    }
    if (dto.availabilityStatus !== undefined) {
      data.availability_status = dto.availabilityStatus;
    }
    if (dto.googleScholarUrl !== undefined) {
      data.google_scholar_url = dto.googleScholarUrl?.trim() || null;
    }
    if (dto.scopusAuthorId !== undefined) {
      data.scopus_author_id = dto.scopusAuthorId?.trim() || null;
    }

    const updated = await this.prisma.researcher_profiles.update({
      where: { user_id: userId },
      data,
      include: { users: true },
    });

    return this.mapToResponse(updated);
  }

  private mapToResponse(profile: ProfileWithUser): ProfileResponseDto {
    return {
      userId: profile.user_id,
      fullName: profile.users.full_name,
      email: profile.users.email,
      departmentUnit: profile.users.department_unit,
      academicTitle: profile.users.academic_title,
      academicDegree: profile.users.academic_degree,
      userType: profile.users.user_type,
      bio: profile.bio,
      availabilityStatus: profile.availability_status as AvailabilityStatusEnum,
      orcidId: profile.orcid_id,
      googleScholarUrl: profile.google_scholar_url,
      scopusAuthorId: profile.scopus_author_id,
      avatarStorageKey: profile.avatar_storage_key,
      profileConfirmedAt: profile.profile_confirmed_at?.toISOString() ?? null,
      papersReviewedAt: profile.papers_reviewed_at?.toISOString() ?? null,
      onboardingCompletedAt:
        profile.onboarding_completed_at?.toISOString() ?? null,
    };
  }
}
