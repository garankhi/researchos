import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { AvailabilityStatusEnum } from './dto/availability-status.enum.js';
import type { ProfileInterestResponseDto } from './dto/profile-interest-response.dto.js';
import type { ProfileResponseDto } from './dto/profile-response.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

/**
 * The account row, with its optional profile attached.
 *
 * The account is the primary row: every account has one. The profile row
 * is optional — `users.researcher_profiles` is a one-to-one relation that
 * may be absent — so it is joined in rather than assumed.
 */
type UserWithProfile = Prisma.usersGetPayload<{
  include: { researcher_profiles: true };
}>;

/**
 * Service managing researcher profiles.
 *
 * Enforces state-derived visibility: confirmed profiles are public to the
 * university community, while unconfirmed profiles return 403 to non-owners.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the caller's own researcher profile.
   *
   * The account alone is enough to answer this. A user without a
   * `researcher_profiles` row still has a name, an email and a department,
   * so the profile is returned with the profile-only fields left empty
   * rather than refusing the request.
   */
  async findMyProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: { researcher_profiles: true },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToResponse(user);
  }

  /**
   * Retrieves a target user's researcher profile.
   *
   * Non-owners receive 403 if the profile is unconfirmed.
   */
  async findProfileById(
    targetUserId: string,
    callerId: string,
  ): Promise<ProfileResponseDto> {
    const user = await this.prisma.users.findUnique({
      where: { id: targetUserId },
      include: { researcher_profiles: true },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    /*
     * Unconfirmed profiles are visible to the owner only; non-owners are
     * refused with 403 rather than a 404 that would hide the denial.
     *
     * A user without a profile row has not been confirmed either, so the
     * same rule applies to them.
     */
    this.assertProfileReadable(targetUserId, callerId, user.researcher_profiles);

    return this.mapToResponse(user);
  }

  /**
   * Lists a researcher's interests with the taxonomy path of each topic.
   *
   * Visibility mirrors the profile itself: a confirmed profile is readable
   * by any authenticated user, an unconfirmed one only by its owner. The
   * rule lives in `assertProfileReadable` so the profile read and this
   * read can never drift apart.
   */
  async findInterestsByUserId(
    targetUserId: string,
    callerId: string,
  ): Promise<ProfileInterestResponseDto[]> {
    const user = await this.prisma.users.findUnique({
      where: { id: targetUserId },
      include: { researcher_profiles: true },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    this.assertProfileReadable(targetUserId, callerId, user.researcher_profiles);

    const rows = await this.prisma.research_interests.findMany({
      where: { user_id: targetUserId },
      include: {
        research_topics: {
          include: {
            research_subfields: { include: { research_fields: true } },
          },
        },
      },
      orderBy: [{ declared_at: 'desc' }, { id: 'asc' }],
    });

    return rows.map((row) => {
      const topic = row.research_topics;
      const subfield = topic.research_subfields;
      const field = subfield.research_fields;

      return {
        id: row.id,
        userId: row.user_id,
        topicId: row.topic_id,
        status: row.status,
        sourceType: row.source_type,
        provenanceTag: row.provenance_tag,
        evidenceNote: row.evidence_note,
        declaredAt: row.declared_at.toISOString(),
        reviewedAt: row.reviewed_at?.toISOString() ?? null,
        topicPath: {
          topic: { id: topic.id, name: topic.name },
          subfield: { id: subfield.id, name: subfield.name },
          field: { id: field.id, name: field.name },
        },
      };
    });
  }

  /**
   * Whether the caller may read this researcher's profile.
   *
   * A confirmed profile is readable by any authenticated user; an
   * unconfirmed one only by its owner. A non-owner is refused with 403
   * rather than a 404 that would hide the denial.
   *
   * A missing profile row counts as unconfirmed: the account exists, but
   * nobody has confirmed the researcher behind it yet.
   */
  private assertProfileReadable(
    targetUserId: string,
    callerId: string,
    profile: { profile_confirmed_at: Date | null } | null,
  ): void {
    // A missing profile row counts as unconfirmed: the account exists, but
    // nobody has confirmed the researcher behind it yet.
    const confirmed =
      profile !== null && profile.profile_confirmed_at !== null;

    if (targetUserId !== callerId && !confirmed) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Updates editable attributes of the caller's own profile.
   *
   * The payload spans two tables: the profile fields live on
   * `researcher_profiles`, the account fields on `users`. Both writes go
   * through one transaction, so a caller never ends up with a renamed
   * account and an unchanged profile — or the other way round.
   */
  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const account = this.accountData(dto);

    /*
     * The profile row is optional, so it is created on the first write.
     * A caller who has never had a profile row still has to be able to
     * fill one in — refusing the update would leave the profile page
     * permanently read-only for anyone the seed did not provision.
     */
    const profileData = this.profileData(dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(account).length > 0) {
        await tx.users.update({
          where: { id: userId },
          data: account,
        });
      }

      if (Object.keys(profileData).length > 0) {
        await tx.researcher_profiles.upsert({
          where: { user_id: userId },
          create: {
            user_id: userId,
            ...profileData,
          },
          update: profileData,
        });
      }
      return tx.users.findUniqueOrThrow({
        where: { id: userId },
        include: { researcher_profiles: true },
      });
    });

    return this.mapToResponse(updated);
  }

  /**
   * The account columns the caller asked to change.
   *
   * These live on `users`, not on `researcher_profiles`, so they are a
   * separate update rather than part of the profile record. An empty
   * object means the payload carried no account field, and the caller
   * skips the `users` write entirely.
   */
  private accountData(dto: UpdateProfileDto): Prisma.usersUpdateInput {
    const data: Prisma.usersUpdateInput = {};
    if (dto.fullName !== undefined) {
      data.full_name = dto.fullName;
    }
    if (dto.departmentUnit !== undefined) {
      data.department_unit = dto.departmentUnit;
    }
    if (dto.academicTitle !== undefined) {
      data.academic_title = dto.academicTitle?.trim() || null;
    }
    if (dto.academicDegree !== undefined) {
      data.academic_degree = dto.academicDegree?.trim() || null;
    }
    return data;
  }

  /**
   * The profile columns the caller asked to change.
   *
   * These live on `researcher_profiles`. An empty object means the
   * payload carried no profile field, and the caller skips the profile
   * write entirely.
   *
   * The shape is plain rather than a Prisma input type, because the same
   * values are used for the `create` and the `update` of the upsert, and
   * the two Prisma input types do not overlap.
   */
  private profileData(dto: UpdateProfileDto): {
    bio?: string | null;
    availability_status?: AvailabilityStatusEnum;
    google_scholar_url?: string | null;
    scopus_author_id?: string | null;
  } {
    const data: {
      bio?: string | null;
      availability_status?: AvailabilityStatusEnum;
      google_scholar_url?: string | null;
      scopus_author_id?: string | null;
    } = {};
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
    return data;
  }

  /**
   * Merges the account and the profile into one response.
   *
   * The account fields are always present. The profile fields are only
   * there when the researcher has a profile row — an account without one
   * reports the profile-only fields as empty rather than being refused.
   */
  private mapToResponse(user: UserWithProfile): ProfileResponseDto {
    const profile = user.researcher_profiles;

    return {
      userId: user.id,
      fullName: user.full_name,
      email: user.email,
      departmentUnit: user.department_unit,
      academicTitle: user.academic_title,
      academicDegree: user.academic_degree,
      userType: user.user_type,
      bio: profile?.bio ?? null,
      availabilityStatus: (profile?.availability_status ??
        AvailabilityStatusEnum.NOT_AVAILABLE) as AvailabilityStatusEnum,
      orcidId: profile?.orcid_id ?? null,
      googleScholarUrl: profile?.google_scholar_url ?? null,
      scopusAuthorId: profile?.scopus_author_id ?? null,
      avatarStorageKey: profile?.avatar_storage_key ?? null,
      profileConfirmedAt: profile?.profile_confirmed_at?.toISOString() ?? null,
      papersReviewedAt: profile?.papers_reviewed_at?.toISOString() ?? null,
      onboardingCompletedAt:
        profile?.onboarding_completed_at?.toISOString() ?? null,
    };
  }
}
