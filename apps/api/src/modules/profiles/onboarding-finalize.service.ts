import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexCandidatesService } from '../openalex/openalex-candidates.service.js';
import { CandidateVisibility } from '../openalex/dto/accept-candidate.dto.js';
import { OpenAlexPullService } from '../openalex/openalex-pull.service.js';
import { shortAuthorId } from '../openalex/openalex.identity.js';
import { AvailabilityStatusEnum } from './dto/availability-status.enum.js';
import type { FinalizeOnboardingDto } from './dto/finalize-onboarding.dto.js';
import type { ProfileResponseDto } from './dto/profile-response.dto.js';

/**
 * The finalize half of the onboarding.
 *
 * ## What it owns
 *
 * The wizard is a draft. The researcher picks interests, confirms an
 * OpenAlex author, fills in their information and decides on their
 * works — and nothing reaches the database until they press **Finish**.
 * This service is that single write.
 *
 * ## The order of the writes
 *
 * 1. The account fields, on `users`.
 * 2. The profile fields, on `researcher_profiles`, together with the
 *    confirmed OpenAlex author and the completion stamp.
 * 3. The interests, reconciled to the set the researcher ended up with.
 * 4. The decided works, pulled and decided.
 *
 * The first three are one transaction: either the profile is written and
 * the onboarding is complete, or nothing happened. The works are pulled
 * outside it, because a pull reaches OpenAlex and that must not hold a
 * database transaction open.
 *
 * ## Why a rejected interest is not deleted
 *
 * The interest row is the platform's record of what a researcher said
 * and what the platform did with it. A researcher who removes an
 * interest from the wizard gets it `REJECTED` — the row stays, the
 * discovery stops matching on it, and the same researcher can bring it
 * back later.
 */
@Injectable()
export class OnboardingFinalizeService {
  private readonly logger = new Logger(OnboardingFinalizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAlex: OpenAlexPullService,
    private readonly candidates: OpenAlexCandidatesService,
  ) {}

  /**
   * Finishes the onboarding of the current user.
   *
   * The returned profile carries the new `onboardingCompletedAt`
   * timestamp, so the caller can see that the gate is open.
   */
  async finalize(
    userId: string,
    dto: FinalizeOnboardingDto,
  ): Promise<ProfileResponseDto> {
    const topicIds = [...new Set(dto.topicIds)];

    if (topicIds.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.onboardingRequiresInterest,
        HttpStatus.BAD_REQUEST,
      );
    }

    const authorId = shortAuthorId(dto.openAlexAuthorId);

    await this.requireActiveTopics(topicIds);

    const user = await this.prisma.$transaction(async (tx) => {
      await this.writeAccount(tx, userId, dto);
      await this.writeProfile(tx, userId, dto, authorId);
      await this.reconcileInterests(tx, userId, topicIds);

      return tx.users.findUniqueOrThrow({
        where: { id: userId },
        include: { researcher_profiles: true },
      });
    });

    /*
     * The works are pulled outside the transaction. A pull reaches
     * OpenAlex and writes a candidate row per work, and holding a
     * database transaction open across a network call is how a
     * transaction times out.
     */
    await this.applyWorkDecisions(userId, dto, authorId);

    return this.mapToResponse(user);
  }

  /**
   * Writes the account columns the researcher changed.
   *
   * The name, the department and the academic titles live on `users`,
   * not on the profile — an empty payload means no write at all.
   */
  private async writeAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: FinalizeOnboardingDto,
  ): Promise<void> {
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

    if (Object.keys(data).length === 0) {
      return;
    }

    await tx.users.update({ where: { id: userId }, data });
  }

  /**
   * Writes the profile columns the researcher changed.
   *
   * The ORCID is written here rather than through the ordinary profile
   * update: the onboarding is the one moment where it is a *first*
   * claim, typed by the researcher themselves. The unique constraint
   * catches an ORCID that belongs to somebody else.
   */
  private async writeProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: FinalizeOnboardingDto,
    authorId: string | null,
  ): Promise<void> {
    const data: {
      bio?: string | null;
      availability_status?: AvailabilityStatusEnum;
      google_scholar_url?: string | null;
      scopus_author_id?: string | null;
      orcid_id?: string | null;
      openalex_author_id?: string | null;
      onboarding_completed_at?: Date;
    } = {};

    if (dto.bio !== undefined) {
      data.bio = dto.bio;
    }
    if (dto.availabilityStatus !== undefined) {
      data.availability_status = dto.availabilityStatus;
    }
    if (dto.googleScholarUrl !== undefined) {
      data.google_scholar_url = dto.googleScholarUrl;
    }
    if (dto.scopusAuthorId !== undefined) {
      data.scopus_author_id = dto.scopusAuthorId;
    }
    if (dto.orcidId !== undefined && dto.orcidId !== null) {
      data.orcid_id = dto.orcidId;
    }
    if (authorId !== null) {
      data.openalex_author_id = authorId;
    }

    /*
     * The completion stamp is written in the same upsert as the profile
     * fields. It is what the onboarding gate reads, so it has to land
     * with them — a profile without the stamp would send the researcher
     * back to the wizard, and a stamp without the profile would let
     * them past a wizard they never filled in.
     */
    data.onboarding_completed_at = new Date();

    try {
      await tx.researcher_profiles.upsert({
        where: { user_id: userId },
        create: { user_id: userId, ...data },
        update: data,
      });
    } catch (error) {
      /*
       * The ORCID is unique across the profiles. A researcher who
       * claims one that another researcher already holds is refused
       * with a code rather than a raw constraint violation — the
       * claim is wrong, and the researcher has to pick another ORCID
       * or leave it empty.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CodedHttpException(
          domainErrorCodes.profiles.orcidAlreadyClaimed,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * Checks that every declared topic exists and is active.
   *
   * The same rule the ordinary interest declaration follows: an
   * interest on a retired topic is not a valid interest. The check runs
   * before the transaction, so an invalid topic does not roll the whole
   * write back.
   */
  private async requireActiveTopics(topicIds: string[]): Promise<void> {
    const topics = await this.prisma.research_topics.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, is_active: true },
    });

    const byId = new Map(topics.map((topic) => [topic.id, topic]));
    for (const topicId of topicIds) {
      const topic = byId.get(topicId);
      if (!topic) {
        throw new CodedHttpException(
          domainErrorCodes.interests.topicNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      if (!topic.is_active) {
        throw new CodedHttpException(
          domainErrorCodes.interests.topicInactive,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  /**
   * Makes the stored interests match the set the researcher ended up with.
   *
   * The wizard owns the whole set while it is open, so the payload
   * states the final set rather than a delta — the server would
   * otherwise have to guess what "no change" meant.
   *
   * - A topic in the set that has no stored interest is declared.
   * - A stored `ACTIVE` interest whose topic is not in the set is
   *   rejected. The row stays; the discovery stops matching on it.
   * - A stored interest in another status is left alone: a `SUGGESTED`
   *   or `REJECTED` row is the platform's own business, and a
   *   researcher declaring the topic again reactivates it.
   */
  private async reconcileInterests(
    tx: Prisma.TransactionClient,
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    const stored = await tx.research_interests.findMany({
      where: { user_id: userId },
      select: { id: true, topic_id: true, status: true },
    });

    const storedByTopic = new Map(
      stored.map((row) => [row.topic_id, row]),
    );
    const wanted = new Set(topicIds);

    // The topics that gained an interest.
    const toDeclare = topicIds.filter((topicId) => {
      const row = storedByTopic.get(topicId);
      return !row || row.status !== 'ACTIVE';
    });

    // The topics that lost one.
    const toReject = stored.filter(
      (row) => row.status === 'ACTIVE' && !wanted.has(row.topic_id),
    );

    for (const topicId of toDeclare) {
      const row = storedByTopic.get(topicId);
      if (row) {
        // A rejected or suggested interest for a topic the researcher
        // picked again comes back to life.
        await tx.research_interests.update({
          where: { id: row.id },
          data: { status: 'ACTIVE', reviewed_at: new Date() },
        });
        continue;
      }

      await tx.research_interests.create({
        data: {
          user_id: userId,
          topic_id: topicId,
          source_type: 'DECLARED',
          status: 'ACTIVE',
          provenance_tag: 'HUMAN',
          reviewed_at: new Date(),
        },
      });
    }

    for (const row of toReject) {
      await tx.research_interests.update({
        where: { id: row.id },
        data: { status: 'REJECTED', reviewed_at: new Date() },
      });
    }
  }

  /**
   * Pulls the works the researcher decided on and applies the decisions.
   *
   * Only the decided works are pulled. The researcher already looked at
   * the list and picked the ones that are theirs, so importing the rest
   * would leave candidates they never asked for sitting in their queue.
   *
   * A work that could not be pulled — OpenAlex no longer has it — is
   * skipped rather than failing the whole finalize.
   */
  private async applyWorkDecisions(
    userId: string,
    dto: FinalizeOnboardingDto,
    authorId: string | null,
  ): Promise<void> {
    const decisions = dto.works ?? [];
    if (decisions.length === 0) {
      return;
    }

    const pulled = await this.openAlex.pullDecidedWorks(
      userId,
      decisions.map((decision) => decision.workId),
      authorId ?? undefined,
    );

    if (pulled.skipped.length > 0) {
      this.logger.warn(
        `Skipped ${pulled.skipped.length} work(s) that OpenAlex no longer returns: ${pulled.skipped.join(', ')}`,
      );
    }

    for (const decision of decisions) {
      const short = shortAuthorId(decision.workId);
      if (short === null) {
        continue;
      }
      const outputId = pulled.outputIds.get(short);
      if (!outputId) {
        continue;
      }

      if (decision.accepted) {
        await this.candidates.accept(userId, outputId, {
          visibility:
            decision.visibility === 'FPTU_COMMUNITY'
              ? CandidateVisibility.FPTU_COMMUNITY
              : CandidateVisibility.PRIVATE,
        });
        continue;
      }
      await this.candidates.reject(userId, outputId);
    }
  }

  /**
   * Shapes the profile the response carries.
   *
   * The same shape the ordinary profile read returns, so the client
   * treats the finalize response like any other profile.
   */
  private mapToResponse(
    user: Prisma.usersGetPayload<{
      include: { researcher_profiles: true };
    }>,
  ): ProfileResponseDto {
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
      availabilityStatus:
        (profile?.availability_status ??
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
