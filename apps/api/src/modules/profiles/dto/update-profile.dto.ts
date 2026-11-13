import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AvailabilityStatusEnum } from './availability-status.enum.js';
import { UpdateProfileAccountDto } from './update-profile-account.dto.js';

/**
 * Payload for updating the caller's own researcher profile.
 *
 * Two groups of fields land here, on two different tables:
 *
 * - The **profile** fields (`bio`, `availabilityStatus`, `googleScholarUrl`,
 *   `scopusAuthorId`) live on `researcher_profiles`.
 * - The **account** fields (`fullName`, `departmentUnit`, `academicTitle`,
 *   `academicDegree`) live on `users` and are inherited from
 *   `UpdateProfileAccountDto`. A researcher can correct their own name and
 *   academic title without an administrator.
 *
 * System-managed attributes (orcidId, profileConfirmedAt, papersReviewedAt,
 * onboardingCompletedAt, lastSyncedAt, llkhLastExportedAt) are not editable
 * here.
 */
export class UpdateProfileDto extends UpdateProfileAccountDto {
  @ApiPropertyOptional({
    description: 'Biographical summary and research statement.',
    example: 'Researcher specializing in distributed software architecture.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Collaboration availability status of the researcher.',
    enum: AvailabilityStatusEnum,
    example: AvailabilityStatusEnum.OPEN_FOR_COLLABORATION,
  })
  @IsOptional()
  @IsEnum(AvailabilityStatusEnum)
  availabilityStatus?: AvailabilityStatusEnum;

  @ApiPropertyOptional({
    description: 'External link to Google Scholar profile.',
    example: 'https://scholar.google.com/citations?user=example',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  googleScholarUrl?: string;

  @ApiPropertyOptional({
    description: 'Scopus author identifier string.',
    example: '57193294821',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  scopusAuthorId?: string;
}
