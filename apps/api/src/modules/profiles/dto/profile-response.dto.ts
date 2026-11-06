import { ApiProperty } from '@nestjs/swagger';
import { AvailabilityStatusEnum } from './availability-status.enum.js';

/**
 * Representation of a researcher profile.
 *
 * Combines institutional account metadata with academic profile information.
 * Does not expose the internal updated_at timestamp.
 */
export class ProfileResponseDto {
  @ApiProperty({
    description: 'Identifier of the user who owns this profile (UUID).',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
  })
  userId: string;

  @ApiProperty({
    description: 'Full display name of the researcher.',
    example: 'PGS. TS. Nguyễn Văn A',
  })
  fullName: string;

  @ApiProperty({
    description: 'Normalized institutional email address.',
    example: 'nguyenvana@fpt.edu.vn',
  })
  email: string;

  @ApiProperty({
    description: 'Department or administrative unit.',
    example: 'Software Engineering',
  })
  departmentUnit: string;

  @ApiProperty({
    description: 'Academic title when applicable.',
    example: 'PGS',
    type: 'string',
    nullable: true,
  })
  academicTitle: string | null;

  @ApiProperty({
    description: 'Academic degree when applicable.',
    example: 'TS',
    type: 'string',
    nullable: true,
  })
  academicDegree: string | null;

  @ApiProperty({
    description: 'Category classification of the user.',
    example: 'FACULTY',
  })
  userType: string;

  @ApiProperty({
    description: 'Biographical summary and research statement.',
    example: 'Associate professor specializing in distributed systems and AI.',
    type: 'string',
    nullable: true,
  })
  bio: string | null;

  @ApiProperty({
    description: 'Collaboration availability status of the researcher.',
    enum: AvailabilityStatusEnum,
    example: AvailabilityStatusEnum.OPEN_FOR_COLLABORATION,
  })
  availabilityStatus: AvailabilityStatusEnum;

  @ApiProperty({
    description: 'Verified 19-character ORCID identifier.',
    example: '0000-0002-1825-0097',
    type: 'string',
    nullable: true,
  })
  orcidId: string | null;

  @ApiProperty({
    description: 'External link to Google Scholar profile.',
    example: 'https://scholar.google.com/citations?user=example',
    type: 'string',
    nullable: true,
  })
  googleScholarUrl: string | null;

  @ApiProperty({
    description: 'Scopus author identifier string.',
    example: '57193294821',
    type: 'string',
    nullable: true,
  })
  scopusAuthorId: string | null;

  @ApiProperty({
    description: 'Storage key referencing the profile avatar image.',
    example: 'avatars/1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11.png',
    type: 'string',
    nullable: true,
  })
  avatarStorageKey: string | null;

  @ApiProperty({
    description: 'Timestamp when the profile was confirmed by the researcher.',
    example: '2026-11-06T10:00:00.000Z',
    type: 'string',
    nullable: true,
  })
  profileConfirmedAt: string | null;

  @ApiProperty({
    description: 'Timestamp when publication candidate works were reviewed.',
    example: '2026-11-06T10:30:00.000Z',
    type: 'string',
    nullable: true,
  })
  papersReviewedAt: string | null;

  @ApiProperty({
    description: 'Timestamp when onboarding flow was completed.',
    example: '2026-11-06T11:00:00.000Z',
    type: 'string',
    nullable: true,
  })
  onboardingCompletedAt: string | null;
}
