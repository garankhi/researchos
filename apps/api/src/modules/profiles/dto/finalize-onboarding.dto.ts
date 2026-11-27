import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AvailabilityStatusEnum } from './availability-status.enum.js';
import { OnboardingAffiliationDto } from './onboarding-affiliation.dto.js';
import { UpdateProfileAccountDto } from './update-profile-account.dto.js';

/** The visibility an accepted work is published with. */
export const OnboardingWorkVisibility = {
  PRIVATE: 'PRIVATE',
  FPTU_COMMUNITY: 'FPTU_COMMUNITY',
} as const;

/** One of the two visibilities an accepted work may take. */
export type OnboardingWorkVisibilityValue =
  (typeof OnboardingWorkVisibility)[keyof typeof OnboardingWorkVisibility];

/**
 * One work the researcher decided on, before it is pulled.
 *
 * The decision travels as an OpenAlex work id rather than as a platform
 * candidate id: the candidate row does not exist yet — the pull that
 * creates it is the same write that records the decision, so the id
 * would have nothing to point at.
 */
export class OnboardingWorkDecisionDto {
  @ApiProperty({
    description:
      'The OpenAlex work id, short or canonical form, e.g. W2741809807.',
    example: 'W2741809807',
    maxLength: 60,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'work_id_invalid' })
  @MaxLength(60, { message: 'work_id_too_long' })
  workId: string;

  @ApiProperty({
    description: 'Whether the researcher accepted the work.',
    example: true,
  })
  @IsBoolean({ message: 'work_decision_invalid' })
  accepted: boolean;

  @ApiPropertyOptional({
    description:
      'The visibility an accepted work is published with. Omitted means the private working copy.',
    enum: OnboardingWorkVisibility,
    example: OnboardingWorkVisibility.PRIVATE,
  })
  @IsOptional()
  @IsIn(Object.values(OnboardingWorkVisibility), {
    message: 'work_visibility_invalid',
  })
  visibility?: OnboardingWorkVisibilityValue;
}

/**
 * The payload that finishes the onboarding.
 *
 * ## Why everything travels in one payload
 *
 * The wizard is a draft: the researcher picks interests, confirms an
 * author and decides on works, and nothing is written until they press
 * **Finish**. Every answer therefore travels together, and the server
 * writes them in one go — the account, the profile, the interests and
 * the works with their decisions.
 *
 * ## Why the interests are a full list rather than a delta
 *
 * The wizard owns the whole set while it is open, so the payload states
 * the set the researcher ended up with. The server makes the stored
 * interests match it: the ones that are gone are rejected, the ones that
 * are new are declared. A delta would leave the server guessing what
 * the client meant by "no change".
 *
 * ## Why the works carry OpenAlex ids
 *
 * The candidate rows do not exist until the pull runs, so the decisions
 * travel as OpenAlex work ids. The server pulls the works it is given
 * and applies the decision to each one it created.
 *
 * ## Why the affiliations are a full list too
 *
 * The affiliation timeline is the one part of the OpenAlex record the
 * researcher may correct: the counts, the byline spellings and the
 * topics are OpenAlex's business, but where the researcher was and
 * until when is their own history. The payload therefore states the
 * set the researcher ended up with, exactly like the interests, and the
 * server replaces the stored rows with it.
 */
export class FinalizeOnboardingDto extends UpdateProfileAccountDto {
  @ApiProperty({
    description:
      'The topics the researcher declared as their research interests, by topic id. At least one is required.',
    type: [String],
    minItems: 1,
  })
  @IsArray({ message: 'interests_required' })
  @ArrayMaxSize(50, { message: 'too_many_interests' })
  @IsString({ each: true, message: 'topic_id_invalid' })
  topicIds: string[];

  @ApiPropertyOptional({
    description:
      'The OpenAlex author the researcher confirmed, in short or canonical form. Omitted means the researcher skipped the author step.',
    example: 'A5023888391',
    maxLength: 60,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'author_id_invalid' })
  @MaxLength(60, { message: 'author_id_too_long' })
  openAlexAuthorId?: string;

  @ApiPropertyOptional({
    description:
      'ORCID of the researcher, in the bare 16-digit form with the dashes.',
    example: '0000-0002-1825-0097',
    type: String,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'orcid_id_invalid' })
  @Matches(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, { message: 'orcid_id_invalid' })
  orcidId?: string | null;

  @ApiPropertyOptional({
    description: 'Biographical summary and research statement.',
    example: 'Researcher specializing in distributed software architecture.',
  })
  @IsOptional()
  @IsString({ message: 'bio_invalid' })
  @MaxLength(2000, { message: 'bio_too_long' })
  bio?: string;

  @ApiPropertyOptional({
    description: 'Collaboration availability status of the researcher.',
    enum: AvailabilityStatusEnum,
    example: AvailabilityStatusEnum.OPEN_FOR_COLLABORATION,
  })
  @IsOptional()
  availabilityStatus?: AvailabilityStatusEnum;

  @ApiPropertyOptional({
    description: 'External link to Google Scholar profile.',
    example: 'https://scholar.google.com/citations?user=example',
  })
  @IsOptional()
  @IsString({ message: 'google_scholar_url_invalid' })
  @IsUrl({ require_protocol: true }, { message: 'google_scholar_url_invalid' })
  @MaxLength(500, { message: 'google_scholar_url_too_long' })
  googleScholarUrl?: string;

  @ApiPropertyOptional({
    description: 'Scopus author identifier string.',
    example: '57193294821',
  })
  @IsOptional()
  @IsString({ message: 'scopus_author_id_invalid' })
  @MaxLength(50, { message: 'scopus_author_id_too_long' })
  scopusAuthorId?: string;

  @ApiPropertyOptional({
    description:
      'The works the researcher decided on. Omitted means the researcher decided on none.',
    type: [OnboardingWorkDecisionDto],
  })
  @IsOptional()
  @IsArray({ message: 'works_invalid' })
  @ArrayMaxSize(200, { message: 'too_many_works' })
  @Type(() => OnboardingWorkDecisionDto)
  works?: OnboardingWorkDecisionDto[];

  @ApiPropertyOptional({
    description:
      'The affiliation timeline the researcher corrected, as the set they ended up with. Omitted means the researcher did not edit the timeline, and the affiliations OpenAlex reports are kept as they are. The rows replace the stored ones — the ones that are gone are removed — and the affiliation the researcher is at now is marked as the primary one.',
    type: [OnboardingAffiliationDto],
  })
  @IsOptional()
  @IsArray({ message: 'affiliations_invalid' })
  @ArrayMaxSize(50, { message: 'too_many_affiliations' })
  @Type(() => OnboardingAffiliationDto)
  @ValidateNested({ each: true, message: 'affiliation_invalid' })
  affiliations?: OnboardingAffiliationDto[];
}
