import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * The institution types the platform stores.
 *
 * The values mirror the `institution_type` enum of the
 * `researcher_affiliations` table, one for one: the database already
 * carries the vocabulary, so the DTO reads it from the same list rather
 * than inventing a second one that would have to be translated back.
 *
 * OpenAlex writes the same kinds in lower case (`education`,
 * `company`, ...); the OpenAlex record service maps them onto these
 * values when it writes a row.
 */
export const OnboardingInstitutionType = {
  EDUCATION: 'EDUCATION',
  COMPANY: 'COMPANY',
  HEALTHCARE: 'HEALTHCARE',
  NONPROFIT: 'NONPROFIT',
  GOVERNMENT: 'GOVERNMENT',
  FACILITY: 'FACILITY',
  ARCHIVE: 'ARCHIVE',
  OTHER: 'OTHER',
} as const;

/** One of the institution types the platform stores. */
export type OnboardingInstitutionTypeValue =
  (typeof OnboardingInstitutionType)[keyof typeof OnboardingInstitutionType];

/**
 * The earliest year an affiliation may start.
 *
 * The column is a smallint, so it could hold more, but a year before
 * the tenth century is a typo rather than a career, and the platform
 * would rather refuse it than store it.
 */
export const AFFILIATION_MIN_YEAR = 1000;

/**
 * The latest year an affiliation may end.
 *
 * One year past the current one, because a researcher may already have
 * signed a contract for next year — a forward-looking end year is a
 * real answer, while a date in 2200 is not.
 */
export const AFFILIATION_MAX_YEAR = new Date().getFullYear() + 1;

/**
 * One affiliation the researcher edited.
 *
 * ## Why the researcher sends the whole record
 *
 * The affiliation timeline is the one part of the OpenAlex record the
 * researcher is allowed to correct: the counts, the byline spellings and
 * the topics are OpenAlex's business, but "where I was and until when"
 * is the researcher's own history, and OpenAlex regularly gets it
 * wrong — it reports the institution of the latest *authorship*, which
 * for a researcher who has moved is the one they left.
 *
 * So the payload carries the whole row rather than a patch. The
 * server has nothing to look up: the institution id is the key
 * OpenAlex uses, the display name is the researcher's own spelling of
 * it, and the years are the years the researcher says they held. The
 * server writes what it is told rather than trying to reconcile two
 * sources of truth.
 *
 * ## Why the years are range-checked here
 *
 * A year is a number with a plausible range, so the check belongs to
 * the DTO. The *order* of the two years — the end must not precede
 * the start — is a relation between two fields, and a relation is
 * checked by the service.
 */
export class OnboardingAffiliationDto {
  @ApiProperty({
    description:
      'The OpenAlex institution id, e.g. I109689652. It is the key the affiliation is stored under.',
    example: 'I109689652',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'affiliation_institution_id_invalid' })
  @IsNotEmpty({ message: 'affiliation_institution_id_required' })
  @MaxLength(255, { message: 'affiliation_institution_id_too_long' })
  institutionId: string;

  @ApiProperty({
    description: 'The display name of the institution.',
    example: 'FPT University',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'affiliation_name_invalid' })
  @IsNotEmpty({ message: 'affiliation_name_required' })
  @MaxLength(255, { message: 'affiliation_name_too_long' })
  name: string;

  @ApiPropertyOptional({
    description:
      'The ROR id of the institution, when the researcher knows it. Null clears it.',
    example: '05dxps055',
    type: String,
    nullable: true,
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'affiliation_ror_invalid' })
  @MaxLength(255, { message: 'affiliation_ror_too_long' })
  ror?: string | null;

  @ApiPropertyOptional({
    description:
      'The ISO 3166-1 alpha-2 country code of the institution. Null clears it.',
    example: 'VN',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'affiliation_country_code_invalid' })
  @Length(2, 2, { message: 'affiliation_country_code_invalid' })
  countryCode?: string | null;

  @ApiPropertyOptional({
    description: 'The kind of institution. Null clears it.',
    enum: OnboardingInstitutionType,
    example: OnboardingInstitutionType.EDUCATION,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(OnboardingInstitutionType, {
    message: 'affiliation_institution_type_invalid',
  })
  institutionType?: OnboardingInstitutionTypeValue | null;

  @ApiPropertyOptional({
    description:
      'The first year the affiliation held. Null means the start year is unknown.',
    example: 2020,
    type: Number,
    nullable: true,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'affiliation_year_start_invalid' })
  @Min(AFFILIATION_MIN_YEAR, { message: 'affiliation_year_start_invalid' })
  @Max(AFFILIATION_MAX_YEAR, { message: 'affiliation_year_start_invalid' })
  yearStart?: number | null;

  @ApiPropertyOptional({
    description:
      'The last year the affiliation held. Null means the affiliation is still running.',
    example: 2026,
    type: Number,
    nullable: true,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'affiliation_year_end_invalid' })
  @Min(AFFILIATION_MIN_YEAR, { message: 'affiliation_year_end_invalid' })
  @Max(AFFILIATION_MAX_YEAR, { message: 'affiliation_year_end_invalid' })
  yearEnd?: number | null;
}
