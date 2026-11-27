import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { AvailabilityStatusEnum } from './availability-status.enum.js';
import { UpdateProfileAccountDto } from './update-profile-account.dto.js';

/**
 * The payload the onboarding's last step sends.
 *
 * ## Why it is not `UpdateProfileDto`
 *
 * The ordinary profile update deliberately refuses `orcidId`: the ORCID
 * drives the OpenAlex ORCID path, so a researcher who claims an ORCID
 * that belongs to somebody else would pull another person's
 * bibliography. That rule is right for a routine edit — a researcher
 * with a working profile has no reason to change their ORCID.
 *
 * The onboarding is the one moment where the ORCID arrives as a *first*
 * claim, together with the OpenAlex author the researcher confirmed.
 * Two things make it safe here:
 *
 * - the OpenAlex pull resolves the ORCID **scoped to FPT University**,
 *   so a claimed ORCID that belongs to somebody abroad resolves to
 *   nothing and no foreign work is ever pulled through it;
 * - the researcher typed the ORCID themselves, so it is a claim rather
 *   than an attribute someone else asserted about them.
 *
 * ## Why the completion flag travels with the payload
 *
 * The onboarding is finished in one action: the profile is written and
 * the account is marked as onboarded. Splitting it into two requests
 * would let a failure between them leave the researcher half-onboarded —
 * their profile saved, but the gate still sending them back here.
 */
export class CompleteOnboardingDto extends UpdateProfileAccountDto {
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
}
